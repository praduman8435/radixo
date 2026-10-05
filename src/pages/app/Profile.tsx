import { useState } from 'react'
import { Link } from 'react-router'
import { Sun, Wallet } from 'lucide-react'
import { useAuth } from '../../lib/auth'
import { api } from '../../lib/backend'
import { useAsync } from '../../lib/useAsync'
import { loadDishMap, loadMember, loadPublishedWeeks, loadWeekContent } from '../../lib/data'
import { DAY_SHORT, addDays, formatDate, mondayOf, today, weekdayIndex } from '../../lib/dates'
import { bookingsOn, effectiveSelection } from '../../lib/booking'
import { MEAL_NAME, dishesFor, formatINR, memberState, subLabel, weekForDate } from '../../lib/logic'
import { MEALS, type Dish } from '../../lib/types'
import { ErrorNote, PageLoader, cx } from '../../components/ui'
import { QR } from '../../components/QR'
import { DishImage } from '../../components/DishImage'
import { AccountSettings } from './Account'

export default function Profile() {
  const { profile } = useAuth()
  const p = profile!
  const t = today()
  const [day, setDay] = useState<number | null>(null)

  const q = useAsync(async () => {
    const [member, weeks, dishes, attendance, selections] = await Promise.all([
      loadMember(p.id), loadPublishedWeeks(), loadDishMap(),
      api.list('attendance', { eq: { user_id: p.id, date: t } }),
      api.list('selections', { eq: { user_id: p.id } }),
    ])
    // Show this week; if nothing is booked in it yet, the next week that is.
    const cands = [weekForDate(weeks, t), weeks.find((w) => w.week_start === addDays(mondayOf(t), 7))].filter((w): w is NonNullable<typeof w> => !!w)
    let pick = null
    for (const week of cands) {
      const content = await loadWeekContent(week.id)
      const saved = selections.find((s) => s.week_id === week.id) ?? null
      const selection = effectiveSelection({ userId: p.id, week, items: content.items, packs: content.packs, selection: saved, subs: member.subs })
      pick = { week, selection, items: content.items }
      if (selection) break
    }
    return { member, dishes, attendance, week: pick?.week, selection: pick?.selection ?? null, items: pick?.items ?? [] }
  }, [p.id, t])

  if (q.loading && !q.data) return <PageLoader />
  if (q.error) return <ErrorNote message={q.error} onRetry={q.reload} />
  const { member, week, dishes, attendance, selection, items } = q.data!
  const state = memberState(p.id, member.subs, member.payments, member.pauses)
  const active = state.kind === 'active' && !state.paused
  const isThisWeek = week?.week_start === mondayOf(t)
  const todayIdx = weekdayIndex(t)
  // Only the meals the member booked for that week (a pack's picks list every meal).
  const booked = new Set(week ? [0, 6].flatMap((i) => bookingsOn(member.subs, p.id, addDays(week.week_start, i))).flatMap((b) => b.meals) : [])
  const names = (d: number, m: (typeof MEALS)[number]) => (booked.size && !booked.has(m) ? [] : dishesFor(items, d, m, selection)).map((id) => dishes.get(id)).filter((x): x is Dish => !!x)
  const todayMeals = isThisWeek && selection ? MEALS.filter((m) => names(todayIdx, m).length > 0) : []
  const d = day ?? (isThisWeek ? todayIdx : 0)
  const dayMeals = selection ? MEALS.filter((m) => names(d, m).length > 0) : []

  const status =
    state.kind === 'active' ? (state.paused ? 'Not coming today' : 'Active')
    : state.kind === 'pending' ? 'Payment being checked'
    : state.kind === 'upcoming' ? `Starts ${formatDate(state.sub.start_date)}`
    : 'No booking'

  return (
    <div className="mx-auto grid max-w-5xl gap-6 pb-10 pt-2 text-white md:grid-cols-[340px_1fr] md:pt-6">
      <div className="space-y-4 md:sticky md:top-24 md:self-start">
        {/* Pass */}
        <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-b from-[#2a1513] to-[#141010] p-5 ring-1 ring-white/10">
          <span className="pointer-events-none absolute -right-16 -top-16 size-52 rounded-full bg-[radial-gradient(circle,rgba(201,52,28,0.35),transparent_65%)]" aria-hidden />
          <div className="relative flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/45">Dining pass</p>
              <p className="mt-1 truncate text-[18px] font-semibold">{p.full_name}</p>
            </div>
            <span className={cx('shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold', active ? 'bg-[#34c759]/15 text-[#5ee07f]' : 'bg-white/10 text-white/65')}>{status}</span>
          </div>
          <div className="relative mx-auto mt-5 w-fit rounded-2xl bg-white p-3">
            <QR value={p.member_code} size={196} label={`Dining pass QR for ${p.member_code}`} className={cx(!active && 'opacity-40')} />
          </div>
          <p className="relative mt-3 text-center text-[22px] font-bold tracking-[0.18em] tabular">{p.member_code}</p>
          <p className="relative mt-1 flex items-center justify-center gap-1.5 text-xs text-white/45"><Sun className="size-3.5" /> Show this at the counter</p>
          {state.kind === 'active' || state.kind === 'upcoming' ? (
            <p className="relative mt-4 rounded-xl bg-black/30 px-3 py-2 text-center text-xs text-white/65">{subLabel(state.sub, member.plans)} · till {formatDate(state.sub.end_date)}</p>
          ) : state.kind !== 'pending' ? (
            <Link to="/menu" className="bg-brand-grad relative mt-4 flex h-10 items-center justify-center rounded-full text-sm font-semibold">Book a menu</Link>
          ) : null}
        </section>

        <Link to="/wallet" className="flex items-center gap-3 rounded-2xl bg-white/[0.04] p-4 ring-1 ring-white/10 transition-colors hover:bg-white/[0.07]">
          <span className="grid size-10 place-items-center rounded-xl bg-white/[0.06]"><Wallet className="size-5 text-white/75" /></span>
          <span className="flex-1">
            <span className="block text-xs text-white/50">Wallet balance</span>
            <span className="block text-lg font-bold tabular">{formatINR(member.wallet.balance)}</span>
          </span>
          <span className="text-sm font-semibold text-white/55">Open →</span>
        </Link>
      </div>

      <div className="min-w-0 space-y-6">
        <section>
          <h2 className="mb-3 text-[17px] font-semibold">Today on your plate</h2>
          {todayMeals.length === 0 ? (
            <p className="rounded-2xl bg-white/[0.04] p-5 text-sm text-white/55 ring-1 ring-white/10">
              {state.kind === 'upcoming' ? `Your booking starts ${formatDate(state.sub.start_date, { weekday: true })}.` : !isThisWeek && selection ? 'Nothing booked for today.' : !week ? 'This week’s menu isn’t out yet.' : selection ? 'Nothing booked for today.' : <>No menu booked yet. <Link to="/menu" className="font-semibold text-white hover:underline">See menus</Link></>}
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {todayMeals.map((m) => (
                <article key={m} className="rounded-2xl bg-white/[0.04] p-4 ring-1 ring-white/10">
                  <div className="flex items-center gap-3">
                    <img src={`/meals/${m}.png`} alt="" className="size-9 rounded-full object-cover" />
                    <p className="flex-1 font-semibold">{MEAL_NAME[m]}</p>
                    {attendance.some((a) => a.meal === m) && <span className="rounded-full bg-[#34c759]/15 px-2 py-0.5 text-[11px] font-semibold text-[#5ee07f]">Eaten</span>}
                  </div>
                  <p className="mt-2.5 text-sm leading-relaxed text-white/65">{names(todayIdx, m).map((d) => d.name).join(' · ')}</p>
                </article>
              ))}
            </div>
          )}
        </section>

        {week && selection && (
          <section>
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-[17px] font-semibold">{isThisWeek ? 'Your week' : `Week of ${formatDate(week.week_start)}`}</h2>
              <Link to="/menu/create" className="text-sm font-semibold text-white/55 hover:text-white">Edit menu →</Link>
            </div>
            <div className="no-scrollbar mb-3 flex gap-1.5 overflow-x-auto">
              {DAY_SHORT.map((n, i) => {
                const date = addDays(week.week_start, i)
                return (
                  <button key={n} type="button" onClick={() => setDay(i)} aria-pressed={d === i} className={cx('h-9 shrink-0 rounded-full px-3.5 text-sm font-semibold transition-colors', d === i ? 'bg-white text-ink' : 'bg-white/[0.06] text-white/70 hover:bg-white/10')}>
                    {date === t ? 'Today' : n} <span className={d === i ? 'text-ink/45' : 'text-white/35'}>{Number(date.slice(8))}</span>
                  </button>
                )
              })}
            </div>
            <div className="divide-y divide-white/[0.06] rounded-2xl bg-white/[0.04] ring-1 ring-white/10">
              {dayMeals.length === 0 ? (
                <p className="p-5 text-sm text-white/55">Nothing booked this day.</p>
              ) : dayMeals.map((m) => (
                <div key={m} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start">
                  <span className="w-24 shrink-0 pt-1 text-sm font-semibold">{MEAL_NAME[m]}</span>
                  <div className="flex flex-1 flex-wrap gap-2">
                    {names(d, m).map((x) => (
                      <span key={x.id} className="inline-flex items-center gap-2 rounded-full bg-white/[0.05] py-1 pl-1 pr-3 text-sm text-white/85 ring-1 ring-white/10"><DishImage dish={x} className="size-6 rounded-full" />{x.name}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <AccountSettings />
      </div>
    </div>
  )
}
