import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { Check, Copy, Inbox, WalletCards, X } from 'lucide-react'
import { useAsync } from '../../lib/useAsync'
import { loadOps, students } from '../../lib/admin'
import { addWalletMoney, approvePayment, rejectPayment } from '../../lib/data'
import { formatDate, formatDateTime, today } from '../../lib/dates'
import { formatINR, pauseDays, paymentLabel } from '../../lib/logic'
import type { Payment } from '../../lib/types'
import { Avatar, Badge, Button, Card, EmptyState, ErrorNote, Input, Modal, PageHeader, PageLoader, Segmented, Select, cx } from '../../components/ui'
import { useToast } from '../../components/toast'

type Tab = 'waiting' | 'history' | 'away'

export default function Approvals() {
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const raw = params.get('tab')
  const tab: Tab = raw === 'history' || raw === 'away' ? raw : raw === 'skips' ? 'away' : 'waiting'
  const [busy, setBusy] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState<Payment | null>(null)
  const [note, setNote] = useState('')
  const [walletOpen, setWalletOpen] = useState(false)
  const q = useAsync(() => loadOps(), [])

  if (q.loading && !q.data) return <PageLoader />
  if (q.error) return <ErrorNote message={q.error} onRetry={q.reload} />
  const ops = q.data!
  const name = (id: string) => ops.byId.get(id)?.full_name ?? 'Member'
  const code = (id: string) => ops.byId.get(id)?.member_code ?? ''

  const waiting = ops.payments.filter((p) => p.status === 'pending')
  const history = ops.payments.filter((p) => p.status !== 'pending').slice(0, 60)
  const away = ops.pauses.filter((p) => p.status === 'approved').sort((a, b) => (a.start_date < b.start_date ? -1 : 1))
  const upcoming = away.filter((p) => p.end_date >= today())
  const past = away.filter((p) => p.end_date < today()).reverse().slice(0, 30)
  const toCheck = waiting.reduce((n, p) => n + p.amount, 0)

  async function run(id: string, fn: () => Promise<unknown>, msg: string) {
    setBusy(id)
    try {
      await fn()
      toast(msg)
      q.reload()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Something went wrong', 'error')
    } finally {
      setBusy(null)
    }
  }

  const copy = (utr: string) => navigator.clipboard?.writeText(utr).then(() => toast('UTR copied'), () => {})

  const paymentCard = (p: Payment) => {
    const d = p.details
    const kind = d?.kind === 'change' ? 'Menu change' : d?.kind === 'extra' ? 'Extra' : 'Booking'
    return (
      <li key={p.id}>
        <Card className="p-4">
          <div className="flex items-start gap-3">
            <Avatar name={name(p.user_id)} className="size-10 text-xs" />
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{name(p.user_id)} <span className="font-mono text-xs font-normal text-muted">{code(p.user_id)}</span></p>
                  <p className="truncate text-sm text-muted">{paymentLabel(p, ops.plans, ops.packs)}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[22px] font-semibold leading-none tabular">{formatINR(p.amount)}</p>
                  {p.status !== 'pending' && <Badge tone={p.status === 'approved' ? 'green' : 'red'} className="mt-1 capitalize">{p.status}</Badge>}
                </div>
              </div>

              <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
                {p.method === 'upi' ? (
                  <button type="button" onClick={() => copy(p.utr)} className="inline-flex items-center gap-1.5 rounded-lg bg-sand px-2 py-1 font-mono text-[13px] font-semibold hover:bg-line/60" title="Copy UTR">
                    UTR {p.utr} <Copy className="size-3.5 text-muted" />
                  </button>
                ) : <span className="rounded-lg bg-sand px-2 py-1 text-[13px] font-semibold">{p.method === 'wallet' ? 'Paid from wallet' : 'Cash'}</span>}
                <span className="text-xs text-muted">{kind} · {formatDateTime(p.created_at)}</span>
              </div>
              {p.wallet_used > 0 && p.method !== 'wallet' && <p className="mt-1.5 text-xs text-muted">+ {formatINR(p.wallet_used)} from their wallet{p.status === 'rejected' ? ' (refunded)' : ''}</p>}
              {p.status === 'pending' && d?.start_date && d.end_date && d.kind !== 'change' && d.kind !== 'extra' && <p className="mt-1.5 text-xs text-muted">If approved: runs {formatDate(d.start_date)} – {formatDate(d.end_date)}{d.discount_pct ? ` · ${d.discount_pct}% off` : ''}</p>}
              {p.status === 'pending' && d?.kind === 'change' && <p className="mt-1.5 text-xs text-muted">Their new menu goes live when you approve.</p>}
              {p.admin_note && p.status !== 'pending' && <p className="mt-1.5 text-xs text-muted">Note: {p.admin_note}</p>}
            </div>
          </div>
          {p.status === 'pending' && (
            <div className="mt-3.5 grid grid-cols-2 gap-2 sm:ml-[52px] sm:flex sm:justify-end">
              <Button variant="danger" onClick={() => { setRejecting(p); setNote('') }} disabled={busy === p.id}><X className="size-4" /> Reject</Button>
              <Button variant="success" loading={busy === p.id} onClick={() => run(p.id, () => approvePayment(p), d?.kind === 'change' ? `${name(p.user_id)}'s new menu is live` : `${name(p.user_id)}'s booking is confirmed`)}><Check className="size-4" /> Approve</Button>
            </div>
          )}
        </Card>
      </li>
    )
  }

  const awayRow = (p: (typeof away)[number]) => (
    <li key={p.id} className="flex items-center gap-3 px-4 py-3">
      <Avatar name={name(p.user_id)} className="size-9 text-xs" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{name(p.user_id)}</p>
        <p className="truncate text-xs text-muted">{formatDate(p.start_date, { weekday: true })}{p.end_date > p.start_date ? ` – ${formatDate(p.end_date, { weekday: true })}` : ''} · {pauseDays(p)} day{pauseDays(p) === 1 ? '' : 's'}{p.reason ? ` · ${p.reason}` : ''}</p>
      </div>
      <p className="shrink-0 text-right text-sm font-semibold tabular">{formatINR(p.credit)}<span className="block text-[11px] font-normal text-muted">to wallet</span></p>
    </li>
  )

  return (
    <div className="animate-rise">
      <PageHeader
        title="Approvals"
        subtitle="Check each UTR in your UPI app, then approve."
        actions={<Button variant="secondary" onClick={() => setWalletOpen(true)} aria-label="Add to wallet"><WalletCards className="size-4" /><span className="hidden sm:inline">Add to wallet</span></Button>}
      />

      <Segmented
        full
        className="mb-4 sm:inline-grid sm:w-auto"
        value={tab}
        onChange={(v) => setParams({ tab: v }, { replace: true })}
        options={[
          { value: 'waiting', label: <span>Waiting{waiting.length ? <span className="ml-1.5 rounded-full bg-brand px-1.5 py-px text-[11px] text-white">{waiting.length}</span> : null}</span> },
          { value: 'history', label: 'History' },
          { value: 'away', label: `Not coming${upcoming.length ? ` · ${upcoming.length}` : ''}` },
        ]}
      />

      {tab === 'waiting' && (
        waiting.length === 0 ? (
          <Card><EmptyState icon={<Inbox className="size-6" />} title="All caught up">New payments show here as members book.</EmptyState></Card>
        ) : (
          <>
            <p className="mb-3 text-sm text-muted"><span className="font-semibold text-ink">{waiting.length} payment{waiting.length === 1 ? '' : 's'}</span> · {formatINR(toCheck)} to find in your UPI app</p>
            <ul className="space-y-3">{waiting.map(paymentCard)}</ul>
          </>
        )
      )}

      {tab === 'history' && (history.length === 0 ? <Card><EmptyState icon={<Inbox className="size-6" />} title="No history yet" /></Card> : <ul className="space-y-3">{history.map(paymentCard)}</ul>)}

      {tab === 'away' && (
        <div className="space-y-5">
          <p className="text-sm text-muted">Members mark these themselves, at least {ops.settings.skip_notice_hours} hours ahead. The meals&rsquo; value goes to their wallet, and the kitchen counts are already lower.</p>
          <section>
            <h3 className="mb-2 text-sm font-semibold">Coming up</h3>
            {upcoming.length === 0 ? <Card className="p-4 text-sm text-muted">Nobody is away.</Card> : <Card className="divide-y divide-line overflow-hidden"><ul className="divide-y divide-line">{upcoming.map(awayRow)}</ul></Card>}
          </section>
          {past.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-semibold text-muted">Past</h3>
              <Card className="overflow-hidden opacity-80"><ul className="divide-y divide-line">{past.map(awayRow)}</ul></Card>
            </section>
          )}
        </div>
      )}

      <Modal
        open={!!rejecting}
        onClose={() => setRejecting(null)}
        title="Reject payment"
        footer={<>
          <Button variant="ghost" onClick={() => setRejecting(null)}>Cancel</Button>
          <Button variant="danger" loading={busy === rejecting?.id} onClick={() => rejecting && run(rejecting.id, () => rejectPayment(rejecting, note || 'Payment not found'), 'Payment rejected').then(() => setRejecting(null))}>Reject</Button>
        </>}
      >
        <p className="mb-3 text-sm text-muted">The member sees this note in their payments.{rejecting && rejecting.wallet_used > 0 ? ` The ${formatINR(rejecting.wallet_used)} they used from their wallet goes back.` : ''}</p>
        <div className="mb-3 flex flex-wrap gap-2">
          {['UTR not found in our account', 'Amount doesn’t match', 'Duplicate payment'].map((r) => (
            <button key={r} type="button" onClick={() => setNote(r)} className={cx('h-8 rounded-full px-3 text-xs font-semibold ring-1', note === r ? 'bg-ink text-white ring-ink' : 'ring-line hover:bg-sand')}>{r}</button>
          ))}
        </div>
        <Input label="Reason" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. UTR not found in our account" />
      </Modal>

      <WalletModal open={walletOpen} onClose={() => setWalletOpen(false)} ops={ops} onDone={() => { setWalletOpen(false); q.reload() }} />
    </div>
  )
}

/** Cash at the counter, a refund or a correction: the money goes into the member's wallet and pays for their next booking. */
export function WalletModal({ open, onClose, ops, onDone, userId: fixedUser }: { open: boolean; onClose: () => void; ops: Awaited<ReturnType<typeof loadOps>>; onDone: () => void; userId?: string }) {
  const toast = useToast()
  const members = students(ops.profiles)
  const [userId, setUserId] = useState(fixedUser ?? '')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('Cash at the counter')
  const [busy, setBusy] = useState(false)
  const uid = fixedUser ?? userId
  const n = Math.round(Number(amount))

  async function save() {
    if (!uid || !n) return
    setBusy(true)
    try {
      await addWalletMoney(uid, n, note)
      toast(`${n > 0 ? 'Added' : 'Removed'} ${formatINR(Math.abs(n))}`)
      setAmount('')
      onDone()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not save', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add to wallet" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={busy} disabled={!uid || !n} onClick={save}>Save</Button></>}>
      <div className="space-y-4">
        {!fixedUser && (
          <Select label="Member" value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">Choose a member…</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.full_name} · {m.member_code}</option>)}
          </Select>
        )}
        <Input label="Amount (₹)" type="number" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 3400" hint="Use a minus sign to take money out." />
        <Input label="Note" value={note} onChange={(e) => setNote(e.target.value)} />
        {uid && <p className="text-sm text-muted">Balance now {formatINR(ops.walletOf(uid))}{n ? ` → ${formatINR(ops.walletOf(uid) + n)}` : ''}. It pays for their next booking automatically.</p>}
      </div>
    </Modal>
  )
}
