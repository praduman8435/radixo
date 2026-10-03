import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { Check, X, Inbox, WalletCards } from 'lucide-react'
import { useAsync } from '../../lib/useAsync'
import { loadOps, students } from '../../lib/admin'
import { addWalletMoney, approvePayment, rejectPayment } from '../../lib/data'
import { formatDate, formatDateTime, today } from '../../lib/dates'
import { formatINR, pauseDays, paymentLabel } from '../../lib/logic'
import type { Payment } from '../../lib/types'
import { Avatar, Badge, Button, Card, EmptyState, ErrorNote, Input, Modal, PageHeader, PageLoader, Segmented, Select } from '../../components/ui'
import { useToast } from '../../components/toast'

type Tab = 'payments' | 'skips'
type Filter = 'pending' | 'done'

export default function Approvals() {
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) || 'payments'
  const [filter, setFilter] = useState<Filter>('pending')
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

  const payments = ops.payments.filter((p) => (filter === 'pending' ? p.status === 'pending' : p.status !== 'pending'))
  const waiting = ops.payments.filter((p) => p.status === 'pending').length
  const skips = ops.pauses.filter((p) => p.status === 'approved' && (filter === 'pending' ? p.end_date >= today() : p.end_date < today()))

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

  return (
    <div className="animate-rise">
      <PageHeader
        title="Approvals"
        subtitle="Match each UTR against your bank or UPI app before approving."
        actions={<Button variant="secondary" onClick={() => setWalletOpen(true)}><WalletCards className="size-4" /> Add to wallet</Button>}
      />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Segmented
          value={tab}
          onChange={(v) => setParams({ tab: v })}
          options={[
            { value: 'payments', label: `Payments${waiting ? ` (${waiting})` : ''}` },
            { value: 'skips', label: 'Not coming' },
          ]}
        />
        <Segmented size="sm" value={filter} onChange={setFilter} options={[{ value: 'pending', label: tab === 'payments' ? 'Waiting' : 'Upcoming' }, { value: 'done', label: tab === 'payments' ? 'History' : 'Past' }]} />
      </div>

      {tab === 'payments' ? (
        payments.length === 0 ? (
          <Card><EmptyState icon={<Inbox className="size-6" />} title={filter === 'pending' ? 'No payments waiting' : 'No history yet'} /></Card>
        ) : (
          <ul className="space-y-3">
            {payments.map((p) => {
              const d = p.details
              const isExtra = d?.kind === 'extra'
              return (
                <li key={p.id}>
                  <Card className="flex flex-wrap items-center gap-4 p-4">
                    <Avatar name={name(p.user_id)} className="size-11" />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{name(p.user_id)} <span className="font-mono text-sm text-muted">{code(p.user_id)}</span></p>
                      <p className="text-sm text-muted">{paymentLabel(p, ops.plans, ops.packs)} · {formatDateTime(p.created_at)}</p>
                      <p className="mt-1 text-sm">
                        {p.method === 'wallet' ? 'Paid from wallet' : p.method === 'cash' ? 'Cash' : <>UTR <span className="font-mono font-semibold">{p.utr}</span></>}
                        {p.wallet_used > 0 && p.method !== 'wallet' && <span className="text-muted"> · {formatINR(p.wallet_used)} from wallet</span>}
                      </p>
                      {p.status === 'pending' && d?.start_date && d.end_date && !isExtra && <p className="mt-1 text-xs text-muted">If approved: runs {formatDate(d.start_date)} – {formatDate(d.end_date)}{d.discount_pct ? ` · ${d.discount_pct}% off` : ''}</p>}
                      {p.status === 'pending' && isExtra && <p className="mt-1 text-xs text-muted">Extra for a costlier menu in a week they already booked</p>}
                      {p.status === 'pending' && d?.kind === 'change' && <p className="mt-1 text-xs text-muted">Menu change: their new menu applies when you approve{p.wallet_used > 0 ? '' : ''}</p>}
                      {p.status === 'rejected' && p.wallet_used > 0 && <p className="mt-1 text-xs text-muted">{formatINR(p.wallet_used)} went back to their wallet</p>}
                      {p.admin_note && p.status !== 'pending' && <p className="mt-1 text-xs text-muted">Note: {p.admin_note}</p>}
                    </div>
                    <div className="text-right">
                      <p className="font-display text-2xl font-bold tabular">{formatINR(p.amount)}</p>
                      {p.status === 'pending' ? <p className="text-xs text-muted">to check in UPI</p> : <Badge tone={p.status === 'approved' ? 'green' : 'red'} className="capitalize">{p.status}</Badge>}
                    </div>
                    {p.status === 'pending' && (
                      <div className="flex w-full gap-2 sm:w-auto">
                        <Button variant="danger" className="flex-1 sm:flex-none" onClick={() => { setRejecting(p); setNote('') }} disabled={busy === p.id}><X className="size-4" /> Reject</Button>
                        <Button variant="success" className="flex-1 sm:flex-none" loading={busy === p.id} onClick={() => run(p.id, () => approvePayment(p), isExtra ? 'Approved' : d?.kind === 'change' ? `${name(p.user_id)}'s new menu is live` : `${name(p.user_id)}'s booking is confirmed`)}><Check className="size-4" /> Approve</Button>
                      </div>
                    )}
                  </Card>
                </li>
              )
            })}
          </ul>
        )
      ) : skips.length === 0 ? (
        <Card><EmptyState icon={<Inbox className="size-6" />} title={filter === 'pending' ? 'Nobody is away' : 'Nothing yet'}>Students mark these themselves at least {ops.settings.skip_notice_hours} hours ahead. The value goes to their wallet.</EmptyState></Card>
      ) : (
        <ul className="space-y-3">
          {skips.map((p) => (
            <li key={p.id}>
              <Card className="flex flex-wrap items-center gap-4 p-4">
                <Avatar name={name(p.user_id)} className="size-11" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{name(p.user_id)} <span className="font-mono text-sm text-muted">{code(p.user_id)}</span></p>
                  <p className="text-sm">{formatDate(p.start_date, { weekday: true })}{p.end_date > p.start_date ? ` – ${formatDate(p.end_date, { weekday: true })}` : ''} · <span className="font-semibold">{pauseDays(p)} day{pauseDays(p) === 1 ? '' : 's'}</span></p>
                  <p className="text-sm text-muted">{p.reason || 'No reason given'}</p>
                </div>
                <div className="text-right">
                  <p className="font-display text-xl font-bold tabular">{formatINR(p.credit)}</p>
                  <p className="text-xs text-muted">to wallet</p>
                </div>
              </Card>
            </li>
          ))}
        </ul>
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
        <p className="mb-3 text-sm text-muted">The student sees this note in their payment history.{rejecting && rejecting.wallet_used > 0 ? ` The ${formatINR(rejecting.wallet_used)} they used from their wallet goes back.` : ''}</p>
        <Input label="Reason" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. UTR not found in our account" />
      </Modal>

      <WalletModal open={walletOpen} onClose={() => setWalletOpen(false)} ops={ops} onDone={() => { setWalletOpen(false); q.reload() }} />
    </div>
  )
}

/** Cash at the counter, a refund or a correction: the money goes into the student's wallet and pays for their next booking. */
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
