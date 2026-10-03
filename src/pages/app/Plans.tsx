import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { ArrowRight, CalendarDays, CalendarX2, Check, Copy, Hourglass, PartyPopper, Smartphone, Wallet as WalletIcon } from 'lucide-react'
import { useAuth } from '../../lib/auth'
import { api } from '../../lib/backend'
import { useAsync } from '../../lib/useAsync'
import { book, changeMenu, loadDishMap, loadMember, loadSettings } from '../../lib/data'
import { addDays, formatDate, formatDateTime, today } from '../../lib/dates'
import { DURATIONS, bookingDates, bookingStart, bookingTotal, choiceSlots, coveredKeys, valueOver, customMealsOf, customValue, discountFor, effectiveSelection, weekCredit, weekPaid } from '../../lib/booking'
import { MEAL_NAME, formatINR, mealsLabel, paymentLabel, subLabel } from '../../lib/logic'
import { MEALS, type BookingSpec, type Meal, type MealMode, type MenuChoice } from '../../lib/types'
import { ErrorNote, PageLoader, cx } from '../../components/ui'
import { QR } from '../../components/QR'
import { useToast } from '../../components/toast'
import { LoginFlow } from '../../components/LoginSheet'
import { MealModePicker } from '../../components/MealModePicker'
import { changeKey, draftKey, readDraft } from './menu/useMenuData'

const PACK_PHOTOS = ['/photos/thali-classic.jpg', '/photos/thali-fullday.jpg', '/photos/thali-protein.jpg', '/photos/thali-light.jpg']

const Panel = ({ children, className }: { children: ReactNode; className?: string }) => <div className={cx('rounded-2xl bg-white/[0.04] ring-1 ring-white/10', className)}>{children}</div>

export default function Plans() {
  const [params] = useSearchParams()
  const packId = params.get('pack')
  const customWeek = params.get('custom')
  const extraWeek = params.get('extra')
  const changeWeek = params.get('change')
  return (
    <div className="-mx-4 -mt-4 min-h-[calc(100dvh-64px)] bg-[#0f0b0a] px-4 pb-16 pt-6 text-white sm:-mx-6 sm:px-6">
      <div className="mx-auto max-w-3xl">
        {changeWeek ? <ChangeCheckout weekId={changeWeek} /> : packId || customWeek || extraWeek ? <Checkout packId={packId} customWeek={customWeek} extraWeek={extraWeek} /> : <WalletHome />}
      </div>
    </div>
  )
}

// ---------- Paying for a menu change ----------

function readChange(weekId: string): MenuChoice | null {
  try {
    const raw = localStorage.getItem(changeKey(weekId))
    return raw ? (JSON.parse(raw) as MenuChoice) : null
  } catch {
    return null
  }
}

function ChangeDone({ applied }: { applied: boolean }) {
  return (
    <Panel className="animate-rise mx-auto max-w-lg p-8 text-center">
      <span className="mx-auto grid size-14 place-items-center rounded-full bg-[#34c759]/15 text-[#34c759]">{applied ? <Check className="size-7" /> : <Hourglass className="size-7" />}</span>
      <h1 className="mt-4 text-[22px] font-bold">{applied ? 'Menu updated' : 'Payment sent for checking'}</h1>
      <p className="mt-2 text-sm text-white/60">{applied ? 'Your new menu is saved.' : 'Your new menu applies as soon as we confirm the payment, usually within a few hours.'}</p>
      <div className="mt-6 flex justify-center gap-2">
        <Link to="/profile" className="bg-brand-grad inline-flex h-10 items-center rounded-full px-5 text-sm font-semibold">My pass</Link>
        <Link to="/menu/create" className="inline-flex h-10 items-center rounded-full bg-white/[0.07] px-5 text-sm font-semibold ring-1 ring-white/10">Back to menu</Link>
      </div>
    </Panel>
  )
}

function ChangeCheckout({ weekId }: { weekId: string }) {
  const { profile } = useAuth()
  const uid = profile?.role === 'student' && profile.full_name ? profile.id : null
  const [utr, setUtr] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<{ applied: boolean } | null>(null)
  const q = useAsync(async () => {
    const [settings, dishes, member, week, packs, items, saved] = await Promise.all([
      loadSettings(), loadDishMap(), uid ? loadMember(uid) : Promise.resolve(null), api.get('weeks', weekId), api.list('packs', { eq: { week_id: weekId } }),
      api.list('menu_items', { eq: { week_id: weekId } }), uid ? api.list('selections', { eq: { user_id: uid, week_id: weekId } }) : Promise.resolve([]),
    ])
    return { settings, dishes, member, week, packs, items, saved: saved[0] ?? null }
  }, [uid, weekId])

  if (q.loading && !q.data) return <PageLoader />
  const choice = readChange(weekId)
  if (done) return <ChangeDone applied={done.applied} />
  if (!uid) return <Panel className="p-5"><LoginFlow dark compact hideLogo reason="Log in to finish your menu change." /></Panel>
  if (!q.data?.week || !q.data.member || !choice) return <Empty title="Nothing to pay">Your menu change wasn’t found. Make it again from the menu.</Empty>
  const { settings, dishes, member, week, packs } = q.data
  const items = q.data.items
  const newSlots = choiceSlots(items, packs, choice)
  const current = choiceSlots(items, packs, effectiveSelection({ userId: uid, week, items, packs, selection: q.data.saved, subs: member.subs }))
  const covered = coveredKeys(member.subs, uid, week)
  const value = valueOver(newSlots, covered, dishes)
  const paid = Math.max(weekPaid(member.subs, member.payments, uid, week, dishes), valueOver(current, covered, dishes))
  const extra = Math.max(0, value - paid)
  const walletUsed = Math.min(Math.max(member.wallet.balance, 0), extra)
  const due = extra - walletUsed
  const upi = `upi://pay?pa=${encodeURIComponent(settings.upi_id)}&pn=${encodeURIComponent(settings.upi_name)}&am=${due}&cu=INR&tn=${encodeURIComponent(`Radixo change ${profile?.member_code ?? ''}`)}`

  async function submit(e?: FormEvent) {
    e?.preventDefault()
    const clean = utr.replace(/\s/g, '')
    if (due > 0 && !/^\d{12}$/.test(clean)) return setErr('Enter the 12-digit UPI reference (UTR) from your payment app.')
    setBusy(true)
    setErr('')
    try {
      const r = await changeMenu(weekId, choice!, due > 0 ? clean : '')
      try { localStorage.removeItem(changeKey(weekId)); localStorage.removeItem(draftKey(weekId)) } catch { /* ignore */ }
      setDone({ applied: r.applied })
    } catch (er) {
      const m = er instanceof Error ? er.message : 'Could not save'
      setErr(/utr/i.test(m) ? 'This UPI reference was already used. Check the number.' : m)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="animate-rise">
      <Link to={`/menu/create?week=${weekId}`} className="text-sm font-semibold text-white/55 hover:text-white">← Back to menu</Link>
      <h1 className="mt-3 text-[26px] font-bold leading-tight">Pay for your menu change</h1>
      <p className="mt-1 text-sm text-white/55">Week of {formatDate(week.week_start)}. Your new menu is saved once this is paid.</p>
      <Panel className="mt-5 space-y-2 p-4 text-sm">
        <Row label="New menu for the week" value={formatINR(value)} />
        <Row label="Your current menu" value={`− ${formatINR(paid)}`} />
        {walletUsed > 0 && <Row label="From your wallet" value={`− ${formatINR(walletUsed)}`} accent />}
        <div className="flex items-baseline justify-between border-t border-white/10 pt-3">
          <span className="font-semibold">To pay</span>
          <span className="text-[24px] font-bold tabular">{formatINR(due)}</span>
        </div>
        <p className="pt-1 text-xs text-white/45">Cheaper changes are free but not refunded. Meals within 24 hours can’t change.</p>
      </Panel>
      <Panel className="mt-4 overflow-hidden">
        {extra === 0 ? (
          <div className="p-4"><button type="button" onClick={() => submit()} disabled={busy} className="bg-brand-grad h-11 w-full rounded-full text-[15px] font-semibold disabled:opacity-60">{busy ? 'Saving…' : 'Save changes'}</button></div>
        ) : due === 0 ? (
          <div className="p-4">
            {err && <p className="mb-3 text-sm text-[#ff8a7a]" role="alert">{err}</p>}
            <button type="button" onClick={() => submit()} disabled={busy} className="bg-brand-grad h-11 w-full rounded-full text-[15px] font-semibold disabled:opacity-60">{busy ? 'Saving…' : 'Confirm · paid from wallet'}</button>
          </div>
        ) : (
          <form onSubmit={submit} className="p-4">
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
              <div className="rounded-2xl bg-white p-2">{settings.upi_id ? <QR value={upi} size={150} label={`UPI QR to pay ${formatINR(due)}`} /> : <p className="w-36 p-4 text-center text-xs text-ink/60">UPI not set up yet. Pay at the counter.</p>}</div>
              <ol className="flex-1 space-y-2 text-sm text-white/75">
                <li>1. Scan or open your UPI app and pay <b className="text-white">{formatINR(due)}</b></li>
                <li>2. Copy the 12-digit UPI reference (UTR)</li>
                <li>3. Paste it below</li>
              </ol>
            </div>
            <div className={cx('mt-4 flex h-12 items-center rounded-xl bg-white/[0.06] px-4 ring-1 focus-within:ring-2 focus-within:ring-brand', err ? 'ring-brand' : 'ring-white/12')}>
              <input inputMode="numeric" value={utr} onChange={(e) => { setUtr(e.target.value); setErr('') }} placeholder="12-digit UPI reference" aria-label="UPI reference" className="h-full flex-1 bg-transparent text-[16px] font-semibold tracking-wide outline-none placeholder:font-normal placeholder:text-white/30 focus-visible:outline-none" />
            </div>
            {err && <p className="mt-2 text-sm text-[#ff8a7a]" role="alert">{err}</p>}
            <button type="submit" disabled={busy} className="bg-brand-grad mt-3 h-11 w-full rounded-full text-[15px] font-semibold disabled:opacity-60">{busy ? 'Sending…' : `Submit payment · ${formatINR(due)}`}</button>
          </form>
        )}
      </Panel>
    </div>
  )
}

// ---------- Checkout ----------

function Checkout({ packId, customWeek, extraWeek }: { packId: string | null; customWeek: string | null; extraWeek: string | null }) {
  const { profile, refreshProfile } = useAuth()
  const uid = profile?.role === 'student' && profile.full_name ? profile.id : null
  const toast = useToast()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const [from, setFrom] = useState<string | null>(null)
  const [weeks, setWeeks] = useState<number>(() => ([1, 4, 13, 26].includes(Number(params.get('weeks'))) ? Number(params.get('weeks')) : 4))
  const [utr, setUtr] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<{ pending: boolean } | null>(null)
  const [mode, setMode] = useState<MealMode>(profile?.meal_mode ?? 'dine')
  const [address, setAddress] = useState(profile?.address ?? '')
  const [addrErr, setAddrErr] = useState('')

  const q = useAsync(async () => {
    const [settings, dishes, member] = await Promise.all([loadSettings(), loadDishMap(), uid ? loadMember(uid) : Promise.resolve(null)])
    const first = packId ? await api.get('packs', packId) : null
    const packs = first ? await api.list('packs', { eq: { week_id: first.week_id } }) : []
    const weekId = first?.week_id ?? customWeek ?? extraWeek
    const week = weekId ? await api.get('weeks', weekId) : null
    const sel = week && uid ? (await api.list('selections', { eq: { user_id: uid, week_id: week.id } }))[0] ?? null : null
    const photoIdx = first ? Math.max(0, packs.filter((p) => p.price > 0).findIndex((p) => p.id === first.id)) : 0
    return { settings, dishes, member, pack: first, packs, week, sel, photoIdx }
  }, [uid, packId, customWeek, extraWeek])

  if (q.loading && !q.data) return <PageLoader />
  const d = q.data
  if (!d?.week) return <Empty title="This booking isn’t available" />
  const { settings, dishes, member, pack, packs, week, sel } = d
  const subs = member?.subs ?? []
  const balance = member?.wallet.balance ?? 0

  const isExtra = !!extraWeek
  const custom = sel?.mode === 'custom' ? sel.custom : readDraft(week.id) ?? {}
  const weekly = pack ? pack.price : customValue(custom, dishes)
  const meals: Meal[] = pack ? pack.meals : customMealsOf(custom)
  const title = pack ? pack.name : 'My Menu'
  const photo = pack ? PACK_PHOTOS[d.photoIdx % PACK_PHOTOS.length] : '/photos/served.jpg'
  const credit = uid ? weekCredit(subs, uid, week, dishes) : 0
  const selValue = sel?.mode === 'pack' ? packs.find((p) => p.id === sel.pack_id)?.price ?? 0 : customValue(custom, dishes)
  const extraDue = Math.max(0, selValue - credit)
  const disc = isExtra ? 0 : discountFor(weeks, settings)
  const total = isExtra ? extraDue : bookingTotal(weekly, weeks, disc)
  const gross = weekly * weeks
  const walletUsed = Math.min(Math.max(balance, 0), total)
  const due = total - walletUsed
  // Starts at the next meal 24 h+ away (after any current booking) unless a later day is picked; runs 7 × weeks days.
  const earliest = bookingStart(subs, uid ?? '', settings)
  const slot = bookingStart(subs, uid ?? '', settings, from)
  const dates = bookingDates(slot, weeks)
  const start = dates.start_date
  const end = dates.end_date
  const lastMeal = slot.meal === 'breakfast' ? null : MEALS[MEALS.indexOf(slot.meal) - 1]
  const startOptions = [earliest.date, ...[1, 2, 3, 4, 5, 6].map((i) => addDays(earliest.date, i))]
  const spec: BookingSpec = isExtra ? { kind: 'extra', week_id: week.id } : pack ? { kind: 'pack', pack_id: pack.id, weeks, start_date: start } : { kind: 'custom', week_id: week.id, weeks, start_date: start }

  if (done) {
    return (
      <Panel className="animate-rise mx-auto max-w-lg p-8 text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-[#34c759]/15 text-[#34c759]">{done.pending ? <Hourglass className="size-7" /> : <PartyPopper className="size-7" />}</span>
        <h1 className="mt-4 text-[22px] font-bold">{done.pending ? 'Payment sent for checking' : 'You’re booked!'}</h1>
        <p className="mt-2 text-sm text-white/60">{done.pending ? 'We’ll match your UPI reference and confirm, usually within a few hours.' : isExtra ? 'Paid from your wallet.' : `${title} · ${formatDate(start)} – ${formatDate(end)}`}</p>
        <div className="mt-6 flex justify-center gap-2">
          <Link to="/profile" className="bg-brand-grad inline-flex h-10 items-center rounded-full px-5 text-sm font-semibold">My pass</Link>
          <Link to="/wallet" className="inline-flex h-10 items-center rounded-full bg-white/[0.07] px-5 text-sm font-semibold ring-1 ring-white/10">Wallet</Link>
        </div>
      </Panel>
    )
  }

  async function submit(e?: FormEvent) {
    e?.preventDefault()
    const clean = utr.replace(/\s/g, '')
    if (mode === 'tiffin' && address.trim().length < 6) return setAddrErr('Add where we should deliver your tiffin.')
    if (due > 0 && !/^\d{12}$/.test(clean)) return setErr('Enter the 12-digit UPI reference (UTR) from your payment app.')
    setBusy(true)
    setErr('')
    try {
      if (uid && (mode !== profile?.meal_mode || address.trim() !== profile?.address)) {
        await api.update('profiles', uid, { meal_mode: mode, address: address.trim() })
        await refreshProfile()
      }
      const pay = await book(spec, due > 0 ? clean : '')
      setDone({ pending: pay.status === 'pending' })
    } catch (er) {
      const m = er instanceof Error ? er.message : 'Could not book'
      if (/utr/i.test(m)) setErr('This UPI reference was already used. Check the number.')
      else if (/save your menu/i.test(m)) { toast('Save your menu first', 'error'); nav('/menu/create') }
      else setErr(m)
    } finally {
      setBusy(false)
    }
  }

  const upi = `upi://pay?pa=${encodeURIComponent(settings.upi_id)}&pn=${encodeURIComponent(settings.upi_name)}&am=${due}&cu=INR&tn=${encodeURIComponent(`Radixo ${profile?.member_code ?? ''}`)}`

  return (
    <div className="animate-rise">
      <Link to={isExtra ? '/menu' : pack ? `/menu/view/${pack.id}` : '/menu/create'} className="text-sm font-semibold text-white/55 hover:text-white">← Back to menu</Link>
      <h1 className="mt-3 text-[26px] font-bold leading-tight">{isExtra ? 'Pay the extra' : 'Book your menu'}</h1>

      <Panel className="mt-5 flex items-center gap-4 p-3">
        <img src={photo} alt="" className="size-16 shrink-0 rounded-xl object-cover" />
        <div className="min-w-0 flex-1">
          <p className="font-script text-[26px] leading-none">{title}</p>
          <p className="mt-1 truncate text-sm text-white/55">{meals.length ? mealsLabel(meals) : 'No dishes yet'} · {formatINR(isExtra ? selValue : weekly)} a week</p>
        </div>
      </Panel>

      {isExtra ? (
        <Panel className="mt-4 space-y-2 p-4 text-sm">
          <Row label="This week’s menu" value={formatINR(selValue)} />
          <Row label="Already in your booking" value={`− ${formatINR(credit)}`} />
          <p className="pt-1 text-xs text-white/45">Weeks that cost less than your booking don&rsquo;t change the price.</p>
        </Panel>
      ) : (
        <>
          <p className="mb-2 mt-6 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">Start from</p>
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="radiogroup" aria-label="Start day">
            {startOptions.map((dte, i) => {
              const on = dte === start
              return (
                <button key={dte} type="button" role="radio" aria-checked={on} onClick={() => setFrom(i === 0 ? null : dte)} className={cx('shrink-0 rounded-xl px-3.5 py-2 text-left ring-1 transition', on ? 'bg-brand/15 ring-2 ring-brand' : 'bg-white/[0.04] ring-white/10 hover:bg-white/[0.07]')}>
                  <span className="block text-sm font-semibold">{dte === today() ? 'Today' : dte === addDays(today(), 1) ? 'Tomorrow' : formatDate(dte, { weekday: true })}</span>
                  <span className="block text-[11px] text-white/50">{i === 0 && earliest.meal !== 'breakfast' ? `from ${MEAL_NAME[earliest.meal].toLowerCase()}` : 'from breakfast'}</span>
                </button>
              )
            })}
          </div>

          <p className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">How long?</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Duration">
            {DURATIONS.map((o) => {
              const dd = discountFor(o.weeks, settings)
              const t = bookingTotal(weekly, o.weeks, dd)
              const on = weeks === o.weeks
              return (
                <button key={o.weeks} type="button" role="radio" aria-checked={on} onClick={() => setWeeks(o.weeks)} className={cx('relative rounded-2xl p-3 text-left ring-1 transition', on ? 'bg-brand/15 ring-2 ring-brand' : 'bg-white/[0.04] ring-white/10 hover:bg-white/[0.07]')}>
                  {dd > 0 && <span className="absolute right-2 top-2 rounded-full bg-[#34c759]/15 px-1.5 py-0.5 text-[10px] font-bold text-[#34c759]">−{dd}%</span>}
                  <p className="text-sm font-semibold">{o.label}</p>
                  <p className="mt-1 text-lg font-bold tabular">{formatINR(t)}</p>
                  <p className="text-[11px] text-white/45">{formatINR(t / o.weeks)}/week</p>
                </button>
              )
            })}
          </div>
          <Panel className="mt-4 space-y-2 p-4 text-sm">
            <p className="flex items-center gap-2 pb-1 text-white/70"><CalendarDays className="size-4 shrink-0" /> {formatDate(start, { weekday: true })}{slot.meal !== 'breakfast' ? ` ${MEAL_NAME[slot.meal].toLowerCase()}` : ''} → {formatDate(end, { weekday: true, year: true })}{lastMeal ? ` ${MEAL_NAME[lastMeal].toLowerCase()}` : ''}</p>
            <Row label={`${formatINR(weekly)} × ${weeks} week${weeks > 1 ? 's' : ''}`} value={formatINR(gross)} />
            {disc > 0 && <Row label={`${disc}% off`} value={`− ${formatINR(gross - total)}`} accent />}
            <p className="pt-1 text-xs text-white/45">Exactly 7 days of meals per week booked. Your menu carries over each week; change any meal up to 24 hours before it and pay only if the new menu costs more.</p>
          </Panel>
        </>
      )}

      {uid && !isExtra && (
        <>
          <p className="mb-2 mt-6 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">How do you want your meals?</p>
          <MealModePicker mode={mode} address={address} onMode={(m) => { setMode(m); setAddrErr('') }} onAddress={(v) => { setAddress(v); setAddrErr('') }} error={addrErr} />
        </>
      )}

      <Panel className="mt-4 overflow-hidden">
        <div className="space-y-2 p-4 text-sm">
          <Row label="Total" value={formatINR(total)} />
          {walletUsed > 0 && <Row label="From your wallet" value={`− ${formatINR(walletUsed)}`} accent />}
          <div className="flex items-baseline justify-between border-t border-white/10 pt-3">
            <span className="font-semibold">To pay</span>
            <span className="text-[24px] font-bold tabular">{formatINR(due)}</span>
          </div>
        </div>

        {!uid ? (
          <div className="border-t border-white/10 bg-black/20 p-5"><LoginFlow dark compact hideLogo reason="Log in so we can book this for you." /></div>
        ) : total <= 0 ? (
          <p className="border-t border-white/10 p-4 text-sm text-white/60">Nothing to pay{isExtra ? ': this week is covered by your booking.' : '.'}</p>
        ) : due === 0 ? (
          <div className="border-t border-white/10 p-4">
            {err && <p className="mb-3 text-sm text-[#ff8a7a]" role="alert">{err}</p>}
            <button type="button" onClick={() => submit()} disabled={busy} className="bg-brand-grad h-11 w-full rounded-full text-[15px] font-semibold disabled:opacity-60">{busy ? 'Booking…' : 'Confirm · paid from wallet'}</button>
          </div>
        ) : (
          <form onSubmit={submit} className="border-t border-white/10 p-4">
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
              <div className="rounded-2xl bg-white p-2">{settings.upi_id ? <QR value={upi} size={150} label={`UPI QR to pay ${formatINR(due)}`} /> : <p className="w-36 p-4 text-center text-xs text-ink/60">UPI not set up yet. Pay at the counter.</p>}</div>
              <ol className="flex-1 space-y-2 text-sm text-white/75">
                <li>1. Scan or open your UPI app and pay <b className="text-white">{formatINR(due)}</b></li>
                <li>2. Copy the 12-digit UPI reference (UTR)</li>
                <li>3. Paste it below</li>
                {settings.upi_id && (
                  <li className="flex flex-wrap gap-2 pt-1">
                    <a href={upi} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-3 text-sm font-semibold text-ink sm:hidden"><Smartphone className="size-4" /> Open UPI app</a>
                    <button type="button" onClick={() => navigator.clipboard?.writeText(settings.upi_id).then(() => toast('UPI ID copied'))} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white/[0.07] px-3 text-sm font-semibold ring-1 ring-white/10"><Copy className="size-4" /> {settings.upi_id}</button>
                  </li>
                )}
              </ol>
            </div>
            <div className={cx('mt-4 flex h-12 items-center rounded-xl bg-white/[0.06] px-4 ring-1 focus-within:ring-2 focus-within:ring-brand', err ? 'ring-brand' : 'ring-white/12')}>
              <input inputMode="numeric" value={utr} onChange={(e) => { setUtr(e.target.value); setErr('') }} placeholder="12-digit UPI reference" aria-label="UPI reference" className="h-full flex-1 bg-transparent text-[16px] font-semibold tracking-wide outline-none placeholder:font-normal placeholder:text-white/30 focus-visible:outline-none" />
            </div>
            {err && <p className="mt-2 text-sm text-[#ff8a7a]" role="alert">{err}</p>}
            <button type="submit" disabled={busy} className="bg-brand-grad mt-3 h-11 w-full rounded-full text-[15px] font-semibold disabled:opacity-60">{busy ? 'Sending…' : `Submit payment · ${formatINR(due)}`}</button>
          </form>
        )}
      </Panel>
    </div>
  )
}

const Row = ({ label, value, accent }: { label: string; value: string; accent?: boolean }) => (
  <div className="flex items-baseline justify-between gap-3">
    <span className="text-white/60">{label}</span>
    <span className={cx('font-semibold tabular', accent && 'text-[#34c759]')}>{value}</span>
  </div>
)

const Empty = ({ title, children }: { title: string; children?: ReactNode }) => (
  <Panel className="p-8 text-center">
    <p className="text-lg font-semibold">{title}</p>
    {children && <div className="mt-1 text-sm text-white/55">{children}</div>}
    <Link to="/menu" className="bg-brand-grad mt-5 inline-flex h-10 items-center gap-1.5 rounded-full px-5 text-sm font-semibold">See menus <ArrowRight className="size-4" /></Link>
  </Panel>
)

// ---------- Wallet home ----------

function WalletHome() {
  const { profile } = useAuth()
  const uid = profile?.role === 'student' && profile.full_name ? profile.id : null
  const q = useAsync(async () => (uid ? loadMember(uid) : null), [uid])

  if (!uid) {
    return (
      <>
        <h1 className="text-[26px] font-bold">Wallet</h1>
        <p className="mt-1 text-sm text-white/55">Your bookings, payments and money back for days you skip.</p>
        <Panel className="mt-6 p-5"><LoginFlow dark compact hideLogo reason="Log in to see your wallet and bookings." /></Panel>
        <HowItWorks />
      </>
    )
  }
  if (q.error) return <ErrorNote message={q.error} onRetry={q.reload} />
  if (!q.data) return <PageLoader />
  const m = q.data
  const t = today()
  const bookings = m.subs.filter((s) => s.status === 'active').sort((a, b) => (a.start_date < b.start_date ? 1 : -1))
  const pending = m.payments.filter((p) => p.status === 'pending')

  return (
    <>
      <h1 className="text-[26px] font-bold">Wallet</h1>

      <div className="relative mt-5 overflow-hidden rounded-[24px] bg-gradient-to-br from-[#2a1513] to-[#140d0c] p-5 ring-1 ring-white/10">
        <span className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-[radial-gradient(circle,rgba(201,52,28,0.4),transparent_65%)]" aria-hidden />
        <p className="flex items-center gap-2 text-sm text-white/60"><WalletIcon className="size-4" /> Balance</p>
        <p className="mt-1 text-[38px] font-bold leading-none tabular">{formatINR(m.wallet.balance)}</p>
        <p className="mt-2 max-w-sm text-xs text-white/50">Money back from days you marked &ldquo;not coming&rdquo;. It&rsquo;s used automatically on your next booking.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link to="/menu" className="bg-brand-grad inline-flex h-10 items-center rounded-full px-4 text-sm font-semibold">Book a menu</Link>
          <Link to="/profile#not-coming" className="inline-flex h-10 items-center gap-1.5 rounded-full bg-white/[0.07] px-4 text-sm font-semibold ring-1 ring-white/10"><CalendarX2 className="size-4" /> Not coming?</Link>
        </div>
      </div>

      {pending.length > 0 && (
        <Panel className="mt-4 space-y-2 p-4">
          {pending.map((p) => (
            <p key={p.id} className="flex items-center gap-2 text-sm"><Hourglass className="size-4 shrink-0 text-turmeric" /> <span className="flex-1">{paymentLabel(p, m.plans)}: {formatINR(p.amount)} being checked</span></p>
          ))}
        </Panel>
      )}

      <h2 className="mb-3 mt-8 text-[17px] font-semibold">Your bookings</h2>
      {bookings.length === 0 ? (
        <Panel className="p-5 text-sm text-white/60">No bookings yet. Pick a ready-made menu or build your own, then book it for a week or longer.</Panel>
      ) : (
        <div className="space-y-2">
          {bookings.map((b) => {
            const status = b.end_date < t ? 'Ended' : b.start_date > t ? `Starts ${formatDate(b.start_date)}` : 'Active'
            return (
              <Panel key={b.id} className="flex items-center gap-3 p-3">
                <span className={cx('grid size-10 shrink-0 place-items-center rounded-xl', status === 'Active' ? 'bg-[#34c759]/15 text-[#34c759]' : 'bg-white/[0.06] text-white/60')}>{status === 'Active' ? <Check className="size-5" /> : <CalendarDays className="size-5" />}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{subLabel(b, m.plans)}</p>
                  <p className="truncate text-xs text-white/50">{formatDate(b.start_date)} – {formatDate(b.end_date)} · {MEALS.filter((x) => b.meals.includes(x)).map((x) => MEAL_NAME[x]).join(', ')}</p>
                </div>
                <span className={cx('shrink-0 text-xs font-semibold', status === 'Active' ? 'text-[#34c759]' : 'text-white/50')}>{status}</span>
              </Panel>
            )
          })}
        </div>
      )}

      <h2 className="mb-3 mt-8 text-[17px] font-semibold">Wallet history</h2>
      {m.wallet.txns.length === 0 ? (
        <Panel className="p-5 text-sm text-white/60">Nothing yet.</Panel>
      ) : (
        <Panel className="divide-y divide-white/[0.06]">
          {m.wallet.txns.map((x) => (
            <div key={x.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <div className="min-w-0">
                <p className="truncate">{x.note || x.kind}</p>
                <p className="text-xs text-white/40">{formatDateTime(x.created_at)}</p>
              </div>
              <span className={cx('shrink-0 font-semibold tabular', x.amount >= 0 ? 'text-[#34c759]' : 'text-white/70')}>{x.amount >= 0 ? '+' : '−'} {formatINR(Math.abs(x.amount))}</span>
            </div>
          ))}
        </Panel>
      )}
      <HowItWorks />
    </>
  )
}

function HowItWorks() {
  return (
    <div className="mt-10 grid gap-3 sm:grid-cols-3">
      {[
        ['Pick your menu', 'Ready-made or your own. Eat 4 days a week or 7, your call.'],
        ['Book it', '1 week, 1 month (5% off), 3 months (8% off) or 6 months (12% off).'],
        ['Going home?', 'Mark the days 24 hours ahead and their value comes back to your wallet.'],
      ].map(([h, b], i) => (
        <Panel key={h} className="p-4">
          <p className="text-xs font-semibold text-turmeric">0{i + 1}</p>
          <p className="mt-1 font-semibold">{h}</p>
          <p className="mt-1 text-sm text-white/55">{b}</p>
        </Panel>
      ))}
    </div>
  )
}
