import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { Check, X, Banknote, Inbox } from 'lucide-react'
import { useAsync } from '../../lib/useAsync'
import { loadOps, students } from '../../lib/admin'
import { approvePause, approvePayment, recordCashPayment, rejectPause, rejectPayment } from '../../lib/data'
import { formatDate, formatDateTime } from '../../lib/dates'
import { formatINR, nextSubscriptionDates, pauseDays, paymentLabel, weekBookingDates } from '../../lib/logic'
import type { Payment, Pause } from '../../lib/types'
import { Avatar, Badge, Button, Card, EmptyState, ErrorNote, Input, Modal, PageHeader, PageLoader, Segmented, Select } from '../../components/ui'
import { useToast } from '../../components/toast'

type Tab = 'payments' | 'pauses'
type Filter = 'pending' | 'done'

export default function Approvals() {
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) || 'payments'
  const [filter, setFilter] = useState<Filter>('pending')
  const [busy, setBusy] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState<Payment | null>(null)
  const [note, setNote] = useState('')
  const [cashOpen, setCashOpen] = useState(false)
  const q = useAsync(() => loadOps(), [])

  if (q.loading && !q.data) return <PageLoader />
  if (q.error) return <ErrorNote message={q.error} onRetry={q.reload} />
  const ops = q.data!
  const plan = (id: string) => ops.plans.find((p) => p.id === id)
  const name = (id: string) => ops.byId.get(id)?.full_name ?? 'Member'
  const code = (id: string) => ops.byId.get(id)?.member_code ?? ''

  const payments = ops.payments.filter((p) => (filter === 'pending' ? p.status === 'pending' : p.status !== 'pending'))
  const pauses = ops.pauses.filter((p) => (filter === 'pending' ? p.status === 'requested' : p.status !== 'requested'))

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
        actions={<Button variant="secondary" onClick={() => setCashOpen(true)}><Banknote className="size-4" /> Record cash payment</Button>}
      />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Segmented
          value={tab}
          onChange={(v) => setParams({ tab: v })}
          options={[
            { value: 'payments', label: `Payments${ops.payments.some((p) => p.status === 'pending') ? ` (${ops.payments.filter((p) => p.status === 'pending').length})` : ''}` },
            { value: 'pauses', label: `Pauses${ops.pauses.some((p) => p.status === 'requested') ? ` (${ops.pauses.filter((p) => p.status === 'requested').length})` : ''}` },
          ]}
        />
        <Segmented size="sm" value={filter} onChange={setFilter} options={[{ value: 'pending', label: 'Waiting' }, { value: 'done', label: 'History' }]} />
      </div>

      {tab === 'payments' ? (
        payments.length === 0 ? (
          <Card><EmptyState icon={<Inbox className="size-6" />} title={filter === 'pending' ? 'No payments waiting' : 'No history yet'} /></Card>
        ) : (
          <ul className="space-y-3">
            {payments.map((p) => {
              const pl = p.plan_id ? plan(p.plan_id) : undefined
              const wk = p.week_id ? ops.weeks.find((w) => w.id === p.week_id) : undefined
              const dates = pl ? nextSubscriptionDates(ops.subs, p.user_id, pl) : wk ? weekBookingDates(wk) : null
              return (
                <li key={p.id}>
                  <Card className="flex flex-wrap items-center gap-4 p-4">
                    <Avatar name={name(p.user_id)} className="size-11" />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{name(p.user_id)} <span className="font-mono text-sm text-muted">{code(p.user_id)}</span></p>
                      <p className="text-sm text-muted">{paymentLabel(p, ops.plans, ops.packs)} · {formatDateTime(p.created_at)}</p>
                      <p className="mt-1 text-sm">{p.method === 'cash' ? 'Cash' : <>UTR <span className="font-mono font-semibold">{p.utr}</span></>}</p>
                      {p.status === 'pending' && dates && <p className="mt-1 text-xs text-muted">If approved: {formatDate(dates.start_date)} – {formatDate(dates.end_date)}</p>}
                      {p.admin_note && p.status !== 'pending' && <p className="mt-1 text-xs text-muted">Note: {p.admin_note}</p>}
                    </div>
                    <div className="text-right">
                      <p className="font-display text-2xl font-bold tabular">{formatINR(p.amount)}</p>
                      {p.status !== 'pending' && <Badge tone={p.status === 'approved' ? 'green' : 'red'} className="capitalize">{p.status}</Badge>}
                    </div>
                    {p.status === 'pending' && (
                      <div className="flex w-full gap-2 sm:w-auto">
                        <Button variant="danger" className="flex-1 sm:flex-none" onClick={() => { setRejecting(p); setNote('') }} disabled={busy === p.id}><X className="size-4" /> Reject</Button>
                        <Button variant="success" className="flex-1 sm:flex-none" loading={busy === p.id} onClick={() => run(p.id, () => approvePayment(p), `${name(p.user_id)}'s ${pl ? 'plan' : 'menu'} is active`)}><Check className="size-4" /> Approve</Button>
                      </div>
                    )}
                  </Card>
                </li>
              )
            })}
          </ul>
        )
      ) : pauses.length === 0 ? (
        <Card><EmptyState icon={<Inbox className="size-6" />} title={filter === 'pending' ? 'No pause requests' : 'No history yet'} /></Card>
      ) : (
        <ul className="space-y-3">
          {pauses.map((p: Pause) => (
            <li key={p.id}>
              <Card className="flex flex-wrap items-center gap-4 p-4">
                <Avatar name={name(p.user_id)} className="size-11" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{name(p.user_id)} <span className="font-mono text-sm text-muted">{code(p.user_id)}</span></p>
                  <p className="text-sm">{formatDate(p.start_date, { weekday: true })} – {formatDate(p.end_date, { weekday: true })} · <span className="font-semibold">{pauseDays(p)} days</span></p>
                  <p className="text-sm text-muted">{p.reason || 'No reason given'}</p>
                </div>
                {p.status === 'requested' ? (
                  <div className="flex w-full gap-2 sm:w-auto">
                    <Button variant="danger" className="flex-1 sm:flex-none" disabled={busy === p.id} onClick={() => run(p.id, () => rejectPause(p), 'Pause rejected')}><X className="size-4" /> Reject</Button>
                    <Button variant="success" className="flex-1 sm:flex-none" loading={busy === p.id} onClick={() => run(p.id, () => approvePause(p), `Approved; plan extended by ${pauseDays(p)} days`)}><Check className="size-4" /> Approve</Button>
                  </div>
                ) : (
                  <Badge tone={p.status === 'approved' ? 'green' : 'red'} className="capitalize">{p.status}</Badge>
                )}
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
        <p className="mb-3 text-sm text-muted">The student sees this note in their payment history.</p>
        <Input label="Reason" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. UTR not found in our account" />
      </Modal>

      <CashModal open={cashOpen} onClose={() => setCashOpen(false)} ops={ops} onDone={() => { setCashOpen(false); q.reload() }} />
    </div>
  )
}

function CashModal({ open, onClose, ops, onDone }: { open: boolean; onClose: () => void; ops: Awaited<ReturnType<typeof loadOps>>; onDone: () => void }) {
  const toast = useToast()
  const members = students(ops.profiles)
  const active = ops.plans.filter((p) => p.is_active)
  const [userId, setUserId] = useState('')
  const [planId, setPlanId] = useState(active[0]?.id ?? '')
  const [busy, setBusy] = useState(false)
  const plan = active.find((p) => p.id === planId)

  async function save() {
    if (!userId || !plan) return
    setBusy(true)
    try {
      await recordCashPayment(userId, plan)
      toast('Cash payment recorded and plan activated')
      onDone()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not save', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Record cash payment" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={busy} disabled={!userId || !plan} onClick={save}>Save & activate</Button></>}>
      <div className="space-y-4">
        <Select label="Member" value={userId} onChange={(e) => setUserId(e.target.value)}>
          <option value="">Choose a member…</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.full_name} · {m.member_code}</option>)}
        </Select>
        <Select label="Plan" value={planId} onChange={(e) => setPlanId(e.target.value)}>
          {active.map((p) => <option key={p.id} value={p.id}>{p.name} · {formatINR(p.price)}</option>)}
        </Select>
        {userId && plan && (() => { const d = nextSubscriptionDates(ops.subs, userId, plan); return <p className="text-sm text-muted">Plan runs {formatDate(d.start_date)} – {formatDate(d.end_date)}.</p> })()}
      </div>
    </Modal>
  )
}
