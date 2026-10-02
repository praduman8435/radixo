import { useEffect, useState, type FormEvent } from 'react'
import { useLocation } from 'react-router'
import { LogOut, PauseCircle, Receipt } from 'lucide-react'
import { useAuth } from '../../lib/auth'
import { api } from '../../lib/backend'
import { useAsync } from '../../lib/useAsync'
import { loadMember, requestPause } from '../../lib/data'
import { addDays, formatDate, formatDateTime, today } from '../../lib/dates'
import { formatINR, memberState, pauseDays, paymentLabel, subscriptionOn, validatePause } from '../../lib/logic'
import type { StayType } from '../../lib/types'
import { Badge, Button, Card, EmptyState, ErrorNote, Input, PageLoader, Select } from '../../components/ui'
import { MemberStatus } from '../../components/MemberStatus'
import { useToast } from '../../components/toast'

const STATUS_TONE = { pending: 'amber', approved: 'green', rejected: 'red', requested: 'amber' } as const

/** Plan status, pause, payments and profile details: the lower half of the Profile tab. */
export function AccountSettings() {
  const { profile, signOut, refreshProfile } = useAuth()
  const p = profile!
  const toast = useToast()
  const loc = useLocation()
  const q = useAsync(() => loadMember(p.id), [p.id])

  const [form, setForm] = useState({ full_name: p.full_name, phone: p.phone, year: p.year, stay_type: p.stay_type, area: p.area })
  const [savingProfile, setSavingProfile] = useState(false)
  const [pause, setPause] = useState({ start: addDays(today(), 1), end: addDays(today(), 5), reason: '' })
  const [pauseErr, setPauseErr] = useState('')
  const [pausing, setPausing] = useState(false)

  useEffect(() => {
    if (loc.hash === '#pause' && q.data) document.getElementById('pause')?.scrollIntoView({ behavior: 'smooth' })
  }, [loc.hash, q.data])

  if (q.loading && !q.data) return <PageLoader />
  if (q.error) return <ErrorNote message={q.error} onRetry={q.reload} />
  const { subs, payments, pauses, plans, settings } = q.data!
  const state = memberState(p.id, subs, payments, pauses)

  async function saveProfile(e: FormEvent) {
    e.preventDefault()
    setSavingProfile(true)
    try {
      await api.update('profiles', p.id, { ...form, stay_type: form.stay_type as StayType })
      await refreshProfile()
      toast('Profile saved')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not save', 'error')
    } finally {
      setSavingProfile(false)
    }
  }

  async function submitPause(e: FormEvent) {
    e.preventDefault()
    const sub = subscriptionOn(subs, p.id, pause.start) ?? subscriptionOn(subs, p.id, today())
    const err = validatePause(pause.start, pause.end, sub, settings.min_pause_days)
    if (err) return setPauseErr(err)
    setPausing(true)
    try {
      await requestPause(p.id, sub!.id, pause.start, pause.end, pause.reason)
      toast('Pause requested. Your plan gets extended once approved.')
      setPauseErr('')
      q.reload()
    } catch (er) {
      toast(er instanceof Error ? er.message : 'Could not request', 'error')
    } finally {
      setPausing(false)
    }
  }

  return (
    <div className="animate-rise">
      <h2 className="mb-4 font-script-italic text-[28px] text-maroon">Your account</h2>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <MemberStatus state={state} plans={plans} />

          <Card className="p-5" as="section">
            <h2 id="pause" className="flex scroll-mt-24 items-center gap-2 font-display text-lg font-bold"><PauseCircle className="size-5 text-sky" /> Pause your plan</h2>
            <p className="mt-1 text-sm text-muted">Going home for {settings.min_pause_days}+ days? Pause and your plan is extended by the same number of days.</p>
            {state.kind === 'active' ? (
              <form onSubmit={submitPause} className="mt-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Input label="From" type="date" value={pause.start} min={addDays(today(), 1)} onChange={(e) => setPause({ ...pause, start: e.target.value })} />
                  <Input label="To (inclusive)" type="date" value={pause.end} min={pause.start} onChange={(e) => setPause({ ...pause, end: e.target.value })} />
                </div>
                <Input label="Reason (optional)" value={pause.reason} onChange={(e) => setPause({ ...pause, reason: e.target.value })} placeholder="e.g. Going home for Diwali" error={pauseErr} />
                <Button type="submit" variant="secondary" loading={pausing}>Request pause</Button>
              </form>
            ) : (
              <p className="mt-3 rounded-xl bg-sand p-3 text-sm text-muted">You can pause once you have an active plan.</p>
            )}
            {pauses.length > 0 && (
              <ul className="mt-4 divide-y divide-line border-t border-line">
                {pauses.map((x) => (
                  <li key={x.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                    <span>{formatDate(x.start_date)} – {formatDate(x.end_date)} · {pauseDays(x)} days</span>
                    <Badge tone={STATUS_TONE[x.status]} className="capitalize">{x.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-5" as="section">
            <h2 className="flex items-center gap-2 font-display text-lg font-bold"><Receipt className="size-5 text-leaf" /> Payments</h2>
            {payments.length === 0 ? (
              <EmptyState title="No payments yet" />
            ) : (
              <ul className="mt-3 divide-y divide-line">
                {payments.map((x) => (
                  <li key={x.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-semibold">{paymentLabel(x, plans)}</p>
                      <p className="text-xs text-muted">{formatDateTime(x.created_at)} · {x.method === 'cash' ? 'Cash' : `UTR ${x.utr}`}</p>
                      {x.status === 'rejected' && x.admin_note && <p className="mt-0.5 text-xs text-brand-600">{x.admin_note}</p>}
                    </div>
                    <div className="text-right">
                      <p className="font-semibold tabular">{formatINR(x.amount)}</p>
                      <Badge tone={STATUS_TONE[x.status]} className="capitalize">{x.status === 'pending' ? 'In review' : x.status}</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="p-5" as="section">
            <h2 className="font-display text-lg font-bold">Profile</h2>
            <form onSubmit={saveProfile} className="mt-4 space-y-4">
              <Input label="Full name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
              <Input label="Mobile number" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              <div className="grid grid-cols-2 gap-3">
                <Select label="Year" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })}>
                  {['1st year', '2nd year', '3rd year', '4th year', 'Other'].map((y) => <option key={y}>{y}</option>)}
                </Select>
                <Select label="Stay" value={form.stay_type} onChange={(e) => setForm({ ...form, stay_type: e.target.value as StayType })}>
                  {['PG', 'Hostel', 'Rented flat', 'Day scholar'].map((s) => <option key={s}>{s}</option>)}
                </Select>
              </div>
              <Input label="PG name / area" value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} />
              <Button type="submit" loading={savingProfile}>Save profile</Button>
            </form>
          </Card>
          <Card className="p-5">
            <h2 className="font-display text-lg font-bold">Need help?</h2>
            <p className="mt-1 text-sm text-muted">Talk to the manager at the counter{settings.whatsapp ? <>, or <a className="font-semibold text-brand hover:underline" href={`https://wa.me/${settings.whatsapp}`}>message us on WhatsApp</a></> : ''}.</p>
            <p className="mt-3 text-sm"><span className="font-semibold">Lunch</span> {settings.lunch_time} · <span className="font-semibold">Dinner</span> {settings.dinner_time}</p>
          </Card>
          <Button variant="danger" className="w-full" onClick={() => signOut()}><LogOut className="size-4" /> Sign out</Button>
        </div>
      </div>
    </div>
  )
}
