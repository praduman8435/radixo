import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { CalendarX2, LogOut, Undo2 } from 'lucide-react'
import { useAuth } from '../../lib/auth'
import { api } from '../../lib/backend'
import { useAsync } from '../../lib/useAsync'
import { cancelSkip, loadDishMap, loadMember, markSkip } from '../../lib/data'
import { addDays, diffDays, formatDate, today } from '../../lib/dates'
import { skipAllowed, skipCredit } from '../../lib/booking'
import { formatINR, paymentLabel } from '../../lib/logic'
import { STAY_LABEL, type StayType } from '../../lib/types'
import { cx } from '../../components/ui'
import { useToast } from '../../components/toast'
import { MealModePicker } from '../../components/MealModePicker'

const Panel = ({ children, className, id }: { children: ReactNode; className?: string; id?: string }) => <section id={id} className={cx('scroll-mt-24 rounded-2xl bg-white/[0.04] p-5 ring-1 ring-white/10', className)}>{children}</section>
const field = 'h-11 w-full rounded-xl bg-white/[0.06] px-4 text-[15px] text-white outline-none ring-1 ring-white/12 placeholder:text-white/30 focus:ring-2 focus:ring-brand focus-visible:outline-none [color-scheme:dark]'
const label = 'mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-white/45'

/** Not coming, payments and profile details: the lower half of the Profile page. */
export function AccountSettings() {
  const { profile, signOut, refreshProfile } = useAuth()
  const p = profile!
  const toast = useToast()
  const loc = useLocation()
  const q = useAsync(async () => {
    const [member, dishes] = await Promise.all([loadMember(p.id), loadDishMap()])
    return { member, dishes }
  }, [p.id])

  const [form, setForm] = useState({ full_name: p.full_name, phone: p.phone, year: p.year, stay_type: p.stay_type, area: p.area, meal_mode: p.meal_mode ?? 'dine', address: p.address ?? '' })
  const [savingProfile, setSavingProfile] = useState(false)
  const [skip, setSkip] = useState({ start: addDays(today(), 2), end: addDays(today(), 3), reason: '' })
  const [skipErr, setSkipErr] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    if (loc.hash === '#not-coming' && q.data) document.getElementById('not-coming')?.scrollIntoView({ behavior: 'smooth' })
  }, [loc.hash, q.data])

  const preview = useMemo(() => {
    if (!q.data || !skip.start || !skip.end || skip.end < skip.start || diffDays(skip.start, skip.end) > 60) return null
    const skipped = new Set<string>()
    for (const x of q.data.member.pauses.filter((x) => x.status === 'approved')) for (let i = 0; i <= diffDays(x.start_date, x.end_date); i++) skipped.add(addDays(x.start_date, i))
    return skipCredit(q.data.member.subs, p.id, skip.start, skip.end, q.data.dishes, skipped)
  }, [q.data, skip.start, skip.end, p.id])

  if (!q.data) return null
  const { member } = q.data
  const { subs, payments, pauses, plans, settings } = member
  const hasBooking = subs.some((s) => s.status === 'active' && s.end_date >= today())
  const notice = settings.skip_notice_hours
  let earliest = addDays(today(), 1)
  while (!skipAllowed(earliest, notice)) earliest = addDays(earliest, 1)
  const skips = pauses.filter((x) => x.status === 'approved').sort((a, b) => (a.start_date < b.start_date ? 1 : -1))

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

  async function submitSkip(e: FormEvent) {
    e.preventDefault()
    if (skip.end < skip.start) return setSkipErr('The end date is before the start date.')
    if (!skipAllowed(skip.start, notice)) return setSkipErr(`Mark it at least ${notice} hours before the day starts. The earliest you can pick is ${formatDate(earliest, { weekday: true })}.`)
    if (!preview || preview.credit <= 0) return setSkipErr('You have no booked meals on those days.')
    setBusy('skip')
    try {
      const r = await markSkip(skip.start, skip.end, skip.reason)
      toast(`${formatINR(r.credit)} added to your wallet`)
      setSkipErr('')
      q.reload()
    } catch (er) {
      setSkipErr(er instanceof Error ? er.message : 'Could not save')
    } finally {
      setBusy(null)
    }
  }

  async function undo(id: string) {
    setBusy(id)
    try {
      await cancelSkip(id)
      toast('Done. You’re coming those days.')
      q.reload()
    } catch (er) {
      toast(er instanceof Error ? er.message : 'Could not undo', 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4 text-white">
      <Panel id="not-coming">
        <h2 className="flex items-center gap-2 text-[17px] font-semibold"><CalendarX2 className="size-5 text-white/70" /> Not coming?</h2>
        <p className="mt-1 text-sm text-white/55">Away for a few days? Mark them at least {notice} hours before. Their value goes to your wallet and is used on your next booking.</p>
        {hasBooking ? (
          <form onSubmit={submitSkip} className="mt-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><label className={label} htmlFor="skip-from">From</label><input id="skip-from" type="date" className={field} value={skip.start} min={earliest} onChange={(e) => { setSkip({ ...skip, start: e.target.value, end: e.target.value > skip.end ? e.target.value : skip.end }); setSkipErr('') }} /></div>
              <div><label className={label} htmlFor="skip-to">To</label><input id="skip-to" type="date" className={field} value={skip.end} min={skip.start} onChange={(e) => { setSkip({ ...skip, end: e.target.value }); setSkipErr('') }} /></div>
            </div>
            <input className={field} value={skip.reason} onChange={(e) => setSkip({ ...skip, reason: e.target.value })} placeholder="Reason (optional), e.g. travelling for Diwali" aria-label="Reason" />
            <div className="flex items-center justify-between gap-3 rounded-xl bg-black/20 px-4 py-3">
              <span className="text-sm text-white/60">{preview && preview.days > 0 ? `${preview.days} booked day${preview.days === 1 ? '' : 's'} · back to wallet` : 'No booked meals on these days'}</span>
              <span className="text-lg font-bold tabular text-[#34c759]">+ {formatINR(preview?.credit ?? 0)}</span>
            </div>
            {skipErr && <p className="text-sm text-[#ff8a7a]" role="alert">{skipErr}</p>}
            <button type="submit" disabled={busy === 'skip'} className="bg-brand-grad h-11 w-full rounded-full text-[15px] font-semibold disabled:opacity-60">{busy === 'skip' ? 'Saving…' : 'Mark not coming'}</button>
          </form>
        ) : (
          <p className="mt-4 rounded-xl bg-black/20 p-4 text-sm text-white/55">You can mark days once you have a booking. <Link to="/menu" className="font-semibold text-white underline-offset-2 hover:underline">See menus</Link></p>
        )}
        {skips.length > 0 && (
          <ul className="mt-5 divide-y divide-white/[0.06] border-t border-white/10">
            {skips.map((x) => (
              <li key={x.id} className="flex items-center gap-3 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{formatDate(x.start_date, { weekday: true })}{x.end_date > x.start_date ? ` – ${formatDate(x.end_date, { weekday: true })}` : ''}</p>
                  <p className="truncate text-xs text-white/45">{x.reason || 'Not coming'} · +{formatINR(x.credit)} to wallet</p>
                </div>
                {skipAllowed(x.start_date, notice) && (
                  <button type="button" onClick={() => undo(x.id)} disabled={busy === x.id} className="inline-flex h-8 items-center gap-1 rounded-full bg-white/[0.07] px-3 text-xs font-semibold ring-1 ring-white/10 hover:bg-white/10"><Undo2 className="size-3.5" /> Undo</button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel>
        <div className="flex items-center justify-between">
          <h2 className="text-[17px] font-semibold">Payments</h2>
          <Link to="/wallet" className="text-sm font-semibold text-white/60 hover:text-white">Wallet →</Link>
        </div>
        {payments.length === 0 ? (
          <p className="mt-3 text-sm text-white/50">No payments yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-white/[0.06]">
            {payments.slice(0, 8).map((x) => (
              <li key={x.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{paymentLabel(x, plans)}</p>
                  <p className="text-xs text-white/45">{formatDate(x.created_at.slice(0, 10))} · {x.method === 'wallet' ? 'Wallet' : x.method === 'cash' ? 'Cash' : `UTR ${x.utr}`}{(x.wallet_used ?? 0) > 0 && x.method !== 'wallet' ? ` + ${formatINR(x.wallet_used)} wallet` : ''}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-semibold tabular">{formatINR(x.amount + (x.wallet_used ?? 0))}</p>
                  <p className={cx('text-xs font-semibold', x.status === 'approved' ? 'text-[#34c759]' : x.status === 'pending' ? 'text-turmeric' : 'text-[#ff8a7a]')}>{x.status === 'pending' ? 'Being checked' : x.status === 'approved' ? 'Paid' : 'Rejected'}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel>
        <h2 className="text-[17px] font-semibold">Your details</h2>
        <form onSubmit={saveProfile} className="mt-4 space-y-3">
          <div><label className={label} htmlFor="pf-name">Name</label><input id="pf-name" className={field} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
          <div><label className={label} htmlFor="pf-phone">Mobile</label><input id="pf-phone" className={cx(field, 'opacity-60')} value={form.phone} readOnly /></div>
          <div>
            <p className={label}>Where you stay</p>
            <div className="flex flex-wrap gap-2">
              {(['PG', 'Hostel', 'Rented flat', 'Day scholar'] as StayType[]).map((st) => (
                <button key={st} type="button" aria-pressed={form.stay_type === st} onClick={() => setForm({ ...form, stay_type: st })} className={cx('h-9 rounded-full px-3.5 text-sm font-semibold transition-colors', form.stay_type === st ? 'bg-brand text-white' : 'bg-white/[0.06] text-white/75 ring-1 ring-white/12 hover:bg-white/10')}>{STAY_LABEL[st]}</button>
              ))}
            </div>
          </div>
          <div><label className={label} htmlFor="pf-area">PG name / area</label><input id="pf-area" className={field} value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} /></div>
          <div>
            <p className={label}>How you get your meals</p>
            <MealModePicker mode={form.meal_mode} address={form.address} onMode={(m) => setForm({ ...form, meal_mode: m })} onAddress={(v) => setForm({ ...form, address: v })} />
          </div>
          <button type="submit" disabled={savingProfile} className="h-10 rounded-full bg-white px-5 text-sm font-semibold text-ink disabled:opacity-60">{savingProfile ? 'Saving…' : 'Save details'}</button>
        </form>
      </Panel>

      <button type="button" onClick={() => signOut()} className="flex h-11 w-full items-center justify-center gap-2 rounded-full text-sm font-semibold text-white/55 ring-1 ring-white/10 hover:bg-white/[0.04] hover:text-white"><LogOut className="size-4" /> Log out</button>
    </div>
  )
}
