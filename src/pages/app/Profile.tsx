import { useState } from 'react'
import { CheckCircle2, Sun } from 'lucide-react'
import { useAuth } from '../../lib/auth'
import { api } from '../../lib/backend'
import { useAsync } from '../../lib/useAsync'
import { loadDishMap, loadMember, loadPublishedWeeks, loadWeekContent } from '../../lib/data'
import { addDays, mondayOf, today, weekdayIndex } from '../../lib/dates'
import { MEAL_NAME, customMeals, dishesFor, memberState, weekForDate } from '../../lib/logic'
import { MEALS, type Meal } from '../../lib/types'
import { Avatar, ErrorNote, PageLoader, cx } from '../../components/ui'
import { QR } from '../../components/QR'
import { DayHeader, DayPills, MealRows, darkPaper } from '../../components/menu'
import { AccountSettings } from './Account'

export default function Profile() {
  const { profile } = useAuth()
  const p = profile!
  const t = today()
  const [day, setDay] = useState(weekdayIndex(t))

  const q = useAsync(async () => {
    const [member, weeks, dishes, attendance, selections] = await Promise.all([
      loadMember(p.id), loadPublishedWeeks(), loadDishMap(),
      api.list('attendance', { eq: { user_id: p.id, date: t } }),
      api.list('selections', { eq: { user_id: p.id } }),
    ])
    const week = weekForDate(weeks, t) ?? weeks.find((w) => w.week_start === addDays(mondayOf(t), 7))
    const content = week ? await loadWeekContent(week.id) : { items: [], packs: [] }
    return { member, week, dishes, attendance, selection: selections.find((s) => s.week_id === week?.id) ?? null, ...content }
  }, [p.id, t])

  if (q.loading && !q.data) return <PageLoader />
  if (q.error) return <ErrorNote message={q.error} onRetry={q.reload} />
  const { member, week, dishes, attendance, selection, items, packs } = q.data!
  const state = memberState(p.id, member.subs, member.payments, member.pauses)
  const active = state.kind === 'active' && !state.paused
  const myMeals: Meal[] = state.kind === 'active' ? state.sub.meals : selection?.mode === 'custom' ? customMeals(selection.custom) : selection?.mode === 'pack' ? packs.find((x) => x.id === selection.pack_id)?.meals ?? [] : []
  const todayIdx = weekdayIndex(t)
  const isThisWeek = week?.week_start === mondayOf(t)
  const plateMeals = (myMeals.length ? myMeals : MEALS).filter((m) => isThisWeek && dishesFor(items, todayIdx, m, selection).length > 0)
  const weekMeals = myMeals.length ? myMeals : MEALS.filter((m) => items.some((it) => it.meal === m))

  return (
    <div className="-mx-4 -mt-4 sm:-mx-6 md:mx-auto md:mt-6 md:max-w-3xl md:overflow-hidden md:rounded-[28px]">
      {/* QR pass */}
      <section className="bg-gradient-to-b from-white to-[#cfcfcf] px-6 pb-8 pt-12">
        <div className="relative mx-auto max-w-[300px]">
          <div className="absolute -top-11 left-1/2 z-10 -translate-x-1/2 rounded-full border-[5px] border-maroon bg-white p-1 shadow-[0_8px_16px_-8px_rgba(0,0,0,0.6)]">
            <Avatar name={p.full_name} className="size-[74px] bg-turmeric-50 text-2xl" />
          </div>
          <div className="animate-rise rounded-[28px] bg-gradient-to-b from-[#b8261b] to-[#3a0805] p-[7px] shadow-[0_16px_28px_-14px_rgba(0,0,0,0.7)]">
            <div className="flex flex-col items-center rounded-[22px] bg-white px-6 pb-5 pt-12">
              <QR value={p.member_code} size={200} label={`Meal pass QR for ${p.member_code}`} className={cx(!active && 'opacity-40')} />
              <p className="mt-3 font-display text-[28px] font-bold tracking-[0.12em]">{p.member_code}</p>
              <p className="text-sm font-semibold text-muted">{p.full_name}</p>
            </div>
          </div>
        </div>
        <div className={cx('mx-auto mt-6 flex max-w-sm items-center justify-center gap-2 rounded-2xl px-5 py-2.5 font-display text-[19px] font-bold text-white shadow-[0_8px_16px_-8px_rgba(0,0,0,0.6)]', active ? 'bg-brand-grad' : 'bg-ink/80')}>
          {active ? <><CheckCircle2 className="size-5" /> Scan QR to get the meal</> : state.kind === 'active' ? 'Your plan is paused today' : 'No active plan: get one in Wallet'}
        </div>
        <p className="mt-3 flex items-center justify-center gap-1.5 text-xs font-medium text-ink/60"><Sun className="size-3.5" /> Turn your brightness up at the counter</p>
      </section>

      {/* Today's plate */}
      <section className="bg-[#dcdcdc] px-4 pb-8 pt-6">
        <h2 className="text-center font-script-italic text-[30px] text-maroon">What&rsquo;s on your plate today?</h2>
        {plateMeals.length === 0 ? (
          <p className="mt-4 rounded-2xl bg-white/70 p-4 text-center text-sm text-muted">{isThisWeek ? 'Nothing on your plan today.' : 'This week’s menu isn’t published yet.'}</p>
        ) : (
          <div className={cx('mt-4 grid gap-1.5 overflow-hidden rounded-[22px] shadow-[0_14px_26px_-16px_rgba(0,0,0,0.7)]', plateMeals.length === 1 ? 'grid-cols-1' : 'grid-cols-2')}>
            {plateMeals.map((m) => {
              const came = attendance.some((a) => a.meal === m)
              return (
                <div key={m} className="flex flex-col" style={darkPaper}>
                  <div className="bg-brand-grad flex items-center justify-center gap-2 py-2.5">
                    <h3 className="font-banner text-[24px] leading-none text-white">{MEAL_NAME[m]}</h3>
                    {came && <CheckCircle2 className="size-5 text-white" aria-label="Checked in" />}
                  </div>
                  <ul className="flex-1 space-y-3 px-5 py-4">
                    {dishesFor(items, todayIdx, m, selection).map((d) => <li key={d} className="font-display text-[19px] font-semibold text-white">{dishes.get(d)?.name}</li>)}
                  </ul>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* This week */}
      {week && (
        <section className="pb-2" style={darkPaper}>
          <div className="relative -mt-1 rounded-t-[22px] border-x-2 border-t-[3px] border-maroon bg-black py-3 text-center">
            <h2 className="font-script-italic text-[26px] text-white">Your menu of the week</h2>
          </div>
          <div className="bg-[#dcdcdc] px-4 py-6">
            <DayPills value={day} onChange={setDay} />
          </div>
          <div className="animate-rise" key={day}>
            <DayHeader day={day} />
            <MealRows meals={weekMeals.length ? weekMeals : MEALS} render={(m) => dishesFor(items, day, m, selection).map((d) => dishes.get(d)?.name).filter(Boolean).join(' + ')} empty="Not included" />
          </div>
          <div className="relative flex justify-end overflow-hidden">
            <div className="pointer-events-none absolute bottom-10 right-20 size-56 rounded-full bg-[#ff7a1a]/20 blur-3xl" aria-hidden />
            <img src="/menu/chef-flame.jpg" alt="" className="relative w-[70%] max-w-xs mix-blend-lighten" />
          </div>
        </section>
      )}

      <section className="px-4 pt-8">
        <AccountSettings />
      </section>
    </div>
  )
}
