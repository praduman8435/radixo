import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate } from 'react-router'
import { ArrowLeft, Check, Copy, Lock, Plus, Trash2, X } from 'lucide-react'
import { useAuth } from '../../../lib/auth'
import { useAsync } from '../../../lib/useAsync'
import { loadSettings, savePicks } from '../../../lib/data'
import { DAY_NAMES, addDays, formatDate, formatWeekRange, mondayOf, today, weekdayIndex } from '../../../lib/dates'
import { MEAL_NAME, customCharge, customCount, customMeals, customTotal, formatINR, isLocked, mealsLabel, slotCatalog, weekPlanMeals } from '../../../lib/logic'
import { MEALS, slotKey, type CustomMenu, type Dish, type Meal, type MenuItem, type Settings } from '../../../lib/types'
import { EmptyState, ErrorNote, PageLoader, cx } from '../../../components/ui'
import { useToast } from '../../../components/toast'
import { DishImage } from '../../../components/DishImage'
import { draftKey, readDraft, useMenuData } from './useMenuData'
import { useLoginGate } from '../../../components/LoginSheet'

const timesOf = (s: Settings | undefined, m: Meal) => (s ? { breakfast: s.breakfast_time, lunch: s.lunch_time, snacks: s.snacks_time, dinner: s.dinner_time }[m] : '')
const dayCount = (menu: CustomMenu, day: number) => MEALS.reduce((n, m) => n + (menu[slotKey(day, m)]?.length ?? 0), 0)

export default function MenuCreate() {
  const { profile } = useAuth()
  const uid = profile?.role === 'student' ? profile.id : null
  const { requireLogin } = useLoginGate()
  const toast = useToast()
  const nav = useNavigate()
  const q = useMenuData(uid)
  const settings = useAsync(() => loadSettings(), [])
  const [pendingSave, setPendingSave] = useState(false)
  const [menu, setMenu] = useState<CustomMenu>({})
  const [ready, setReady] = useState(false)
  const [day, setDay] = useState(0)
  const [dir, setDir] = useState<1 | -1>(1)
  const [picker, setPicker] = useState<Meal | null>(null)
  const [saving, setSaving] = useState(false)
  const touchX = useRef<number | null>(null)

  // Start from the saved custom menu, else an unsaved draft on this phone, else empty.
  useEffect(() => {
    const d = q.data
    if (!d?.week || ready) return
    const saved = d.selection?.mode === 'custom' ? d.selection.custom : null
    setMenu(readDraft(d.week.id) ?? saved ?? {})
    setDay(d.week.week_start === mondayOf(today()) ? weekdayIndex(today()) : 0)
    setReady(true)
  }, [q.data, ready])

  useEffect(() => {
    const w = q.data?.week
    if (!ready || !w) return
    try {
      localStorage.setItem(draftKey(w.id), JSON.stringify(menu))
    } catch {
      /* private mode: the draft just isn't kept */
    }
  }, [menu, ready, q.data?.week])

  const dishes = q.data?.dishes
  const planMeals = useMemo(() => (q.data?.week && q.data.member && uid ? weekPlanMeals(q.data.member.subs, uid, q.data.week) : []), [q.data, uid])
  const charge = useMemo(() => (dishes ? customCharge(menu, dishes, planMeals) : 0), [menu, dishes, planMeals])
  const total = useMemo(() => (dishes ? customTotal(menu, dishes) : 0), [menu, dishes])

  // A guest tapped Save: once they've logged in (and their plan data reloaded), save straight away.
  useEffect(() => {
    if (pendingSave && uid && q.data?.member && !q.loading) {
      setPendingSave(false)
      void save()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingSave, uid, q.data, q.loading])

  if (q.loading && !q.data) return <PageLoader />
  if (q.error) return <ErrorNote message={q.error} onRetry={q.reload} />
  const { week, items } = q.data!
  if (!week) return <EmptyState title="No menu published yet" />
  if (isLocked(week)) {
    return (
      <EmptyState icon={<Lock className="size-6" />} title="Choices for this week are closed" action={<Link to="/menu/view/mine" className="font-semibold text-brand">See your menu</Link>}>
        The kitchen has started buying for {formatWeekRange(week.week_start)}. Next week opens on Thursday.
      </EmptyState>
    )
  }

  const covered = planMeals.length > 0
  const count = customCount(menu)
  const daysFilled = DAY_NAMES.filter((_, i) => dayCount(menu, i) > 0).length
  const date = addDays(week.week_start, day)

  const changeDay = (d: number) => {
    if (d < 0 || d > 6 || d === day) return
    setDir(d > day ? 1 : -1)
    setDay(d)
  }
  const toggle = (meal: Meal, dishId: string) => {
    const key = slotKey(day, meal)
    setMenu((m) => {
      const cur = m[key] ?? []
      const next = cur.includes(dishId) ? cur.filter((x) => x !== dishId) : [...cur, dishId]
      const out = { ...m, [key]: next }
      if (next.length === 0) delete out[key]
      return out
    })
  }
  const clearDay = () => setMenu((m) => Object.fromEntries(Object.entries(m).filter(([k]) => !k.startsWith(`${day}-`))))

  /** Copy today's dishes to the other days, wherever the kitchen serves the same dish that day. */
  function copyToWeek() {
    let copied = 0
    setMenu((m) => {
      const out: CustomMenu = { ...m }
      for (let d = 0; d < 7; d++) {
        if (d === day) continue
        for (const meal of MEALS) {
          const src = m[slotKey(day, meal)] ?? []
          if (!src.length) continue
          const offered = slotCatalog(items, d, meal)
          const ids = src.filter((id) => offered.includes(id))
          if (ids.length) {
            out[slotKey(d, meal)] = ids
            copied++
          }
        }
      }
      return out
    })
    setTimeout(() => toast(copied ? 'Copied to the other days where those dishes are served' : 'Those dishes aren’t served on other days', copied ? 'success' : 'error'), 0)
  }

  async function save() {
    if (customCount(menu) === 0) return toast('Add at least one dish first.', 'error')
    if (!uid) return requireLogin('Log in to save your menu. Your picks are kept.', () => setPendingSave(true))
    setSaving(true)
    try {
      await savePicks(uid, week!.id, 'custom', null, {}, menu)
      try { localStorage.removeItem(draftKey(week!.id)) } catch { /* ignore */ }
      if (charge === 0) {
        toast(`Your menu for ${formatWeekRange(week!.week_start)} is saved`)
        nav('/menu/view/mine')
      } else {
        nav(`/wallet?custom=${week!.id}`)
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not save', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="-mx-4 -mt-4 min-h-[calc(100dvh-64px)] bg-[#0f0b0a] pb-32 text-white sm:-mx-6">
      {/* Intro + progress */}
      <section className="mx-auto max-w-3xl px-4 pt-5 sm:px-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-turmeric">Week of {formatWeekRange(week.week_start)}</p>
        <h1 className="mt-1 font-display text-[24px] font-bold leading-tight sm:text-[30px]">Build your own menu</h1>
        <p className="mt-1 text-sm text-white/50">Pick a day, then add dishes to each meal. You pay only for what you add.</p>
        <div className="mt-4 grid grid-cols-3 gap-2 rounded-2xl bg-white/[0.04] p-3 text-center ring-1 ring-white/10">
          <div><p className="text-lg font-bold tabular">{daysFilled}<span className="text-sm font-medium text-white/50">/7</span></p><p className="text-[11px] text-white/50">days planned</p></div>
          <div className="border-x border-white/10"><p className="text-lg font-bold tabular">{count}</p><p className="text-[11px] text-white/50">dishes added</p></div>
          <div><p className="text-lg font-bold tabular">{formatINR(total)}</p><p className="text-[11px] text-white/50">week total</p></div>
        </div>
      </section>

      {/* Day picker */}
      <div className="sticky top-16 z-20 mt-4 bg-[#0f0b0a]/90 px-3 py-3 backdrop-blur sm:top-[72px] sm:px-6">
        <div className="mx-auto grid max-w-3xl grid-cols-7 gap-1 rounded-2xl bg-white/[0.05] p-1 ring-1 ring-white/10" role="tablist" aria-label="Day">
          {DAY_NAMES.map((n, i) => {
            const d = addDays(week.week_start, i)
            const on = i === day
            const filled = dayCount(menu, i) > 0
            return (
              <button key={n} type="button" role="tab" aria-selected={on} onClick={() => changeDay(i)} className={cx('relative flex flex-col items-center rounded-xl py-2 transition-all duration-200', on ? 'bg-brand-grad text-white shadow-[0_6px_14px_-6px_rgba(222,59,44,0.8)]' : 'text-white/85 hover:bg-white/[0.07]')}>
                <span className={cx('text-[10px] font-semibold uppercase tracking-wide', on ? 'text-white/80' : 'text-white/50')}>{n.slice(0, 3)}</span>
                <span className="text-[16px] font-bold leading-tight tabular">{Number(d.slice(8))}</span>
                <span className={cx('absolute bottom-1 size-1 rounded-full', filled ? (on ? 'bg-white' : 'bg-leaf') : 'bg-transparent')} aria-label={filled ? 'has dishes' : undefined} />
              </button>
            )
          })}
        </div>
      </div>

      {/* Selected day */}
      <section
        className="mx-auto max-w-3xl px-4 pt-3 sm:px-6"
        onTouchStart={(e) => { touchX.current = e.touches[0].clientX }}
        onTouchEnd={(e) => {
          if (touchX.current === null) return
          const dx = e.changedTouches[0].clientX - touchX.current
          touchX.current = null
          if (Math.abs(dx) > 60) changeDay(day + (dx < 0 ? 1 : -1))
        }}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-[22px] font-bold leading-tight">{date === today() ? 'Today' : DAY_NAMES[day]}</h2>
            <p className="text-xs text-white/50">{formatDate(date, { weekday: date === today() })}</p>
          </div>
          {dayCount(menu, day) > 0 && (
            <div className="flex gap-1.5">
              <button type="button" onClick={copyToWeek} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-white/[0.06] px-3 text-xs font-semibold ring-1 ring-white/10 hover:bg-white/10"><Copy className="size-3.5" /> Copy to week</button>
              <button type="button" onClick={clearDay} className="grid size-8 place-items-center rounded-full bg-white/[0.06] text-white/50 ring-1 ring-white/10 hover:text-white" aria-label="Clear this day"><Trash2 className="size-3.5" /></button>
            </div>
          )}
        </div>

        <div key={day} className={cx('space-y-3', dir > 0 ? 'day-in-right' : 'day-in-left')}>
          {MEALS.map((meal) => {
            const offered = slotCatalog(items, day, meal)
            const chosen = (menu[slotKey(day, meal)] ?? []).map((id) => dishes!.get(id)).filter((x): x is Dish => !!x)
            const sub = chosen.reduce((s, d) => s + d.price, 0)
            const inPlan = planMeals.includes(meal)
            return (
              <article key={meal} className={cx('overflow-hidden rounded-2xl bg-white/[0.04] ring-1 ring-white/10', offered.length ? '' : 'opacity-60')}>
                <header className="flex items-center gap-3 px-4 py-3">
                  <img src={`/meals/${meal}.png`} alt="" className="size-10 rounded-full" />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 font-semibold">{MEAL_NAME[meal]} {inPlan && <span className="rounded-full bg-[#34c759]/15 px-2 py-0.5 text-[10px] font-semibold text-[#34c759]">In your plan</span>}</p>
                    <p className="text-xs text-white/50">{offered.length ? timesOf(settings.data, meal) : 'Not served this day'}</p>
                  </div>
                  {offered.length > 0 && (
                    chosen.length ? (
                      <span className="text-sm font-semibold tabular text-white/70">{formatINR(sub)}</span>
                    ) : (
                      <button type="button" onClick={() => setPicker(meal)} className="inline-flex h-9 items-center gap-1 rounded-full bg-white px-3.5 text-sm font-semibold text-ink hover:bg-white/90"><Plus className="size-4" /> Add</button>
                    )
                  )}
                </header>
                {chosen.length > 0 && (
                  <>
                    <ul className="divide-y divide-white/10 border-t border-white/10">
                      {chosen.map((d) => (
                        <li key={d.id} className="flex items-center gap-3 px-4 py-2.5">
                          <DishImage dish={d} className="size-10 shrink-0 rounded-xl" />
                          <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{d.name}</span>
                          <span className="text-sm text-white/50 tabular">{formatINR(d.price)}</span>
                          <button type="button" onClick={() => toggle(meal, d.id)} className="grid size-7 place-items-center rounded-full text-white/50 hover:bg-white/10 hover:text-white" aria-label={`Remove ${d.name}`}><X className="size-4" /></button>
                        </li>
                      ))}
                    </ul>
                    <button type="button" onClick={() => setPicker(meal)} className="flex w-full items-center justify-center gap-1.5 border-t border-white/10 py-2.5 text-sm font-semibold text-[#ff8a7a] hover:bg-white/[0.04]"><Plus className="size-4" /> Add more</button>
                  </>
                )}
              </article>
            )
          })}
        </div>
        <p className="mt-5 text-center text-xs text-white/50">Swipe left or right to change the day · your picks are saved on this phone</p>
      </section>

      {/* Bottom bar */}
      <div className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-[#120d0c]/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <p className="flex items-baseline gap-1">
              <span className="font-display text-[22px] font-bold tabular">{formatINR(charge)}</span>
              <span className="text-xs text-white/50">{covered ? (charge ? 'extra this week' : 'included in your plan') : '/ week'}</span>
            </p>
            <p className="truncate text-xs text-white/50">{count ? `${count} dish${count === 1 ? '' : 'es'} · ${mealsLabel(customMeals(menu))}` : 'Add dishes to get started'}</p>
          </div>
          <button type="button" onClick={save} disabled={saving || count === 0} className="bg-brand-grad inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full px-5 text-[15px] font-semibold text-white shadow-[0_10px_24px_-10px_rgba(222,59,44,0.8)] transition hover:brightness-110 active:scale-[0.98] disabled:opacity-50">
            {saving ? 'Saving…' : charge > 0 ? `Continue · ${formatINR(charge)}` : 'Save menu'}
          </button>
        </div>
      </div>

      {picker && dishes && (
        <ItemPicker
          day={day}
          meal={picker}
          items={items}
          dishes={dishes}
          menu={menu}
          onMeal={setPicker}
          onToggle={(id) => toggle(picker, id)}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  )
}

/** Full-screen dish picker for one day: meal tabs on top, photo cards with a round add button. */
function ItemPicker({ day, meal, items, dishes, menu, onMeal, onToggle, onClose }: {
  day: number; meal: Meal; items: MenuItem[]; dishes: Map<string, Dish>; menu: CustomMenu
  onMeal: (m: Meal) => void; onToggle: (dishId: string) => void; onClose: () => void
}) {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const catalog = slotCatalog(items, day, meal).map((id) => dishes.get(id)).filter((d): d is Dish => !!d && d.is_active)
  const chosen = menu[slotKey(day, meal)] ?? []
  const dayItems = MEALS.flatMap((m) => menu[slotKey(day, m)] ?? [])
  const dayTotal = dayItems.reduce((s, id) => s + (dishes.get(id)?.price ?? 0), 0)

  return createPortal(
    <div className="sheet-up fixed inset-0 z-50 flex flex-col bg-[#0f0b0a] text-white" role="dialog" aria-modal="true" aria-label={`Add dishes for ${DAY_NAMES[day]}`}>
      <header className="border-b border-white/10 bg-[#141010] px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))]">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <button type="button" onClick={onClose} className="grid size-9 shrink-0 place-items-center rounded-full bg-white/10 text-white hover:bg-white/15" aria-label="Back"><ArrowLeft className="size-[18px]" strokeWidth={2.4} /></button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[16px] font-semibold">Add to {MEAL_NAME[meal]}</p>
            <p className="text-xs text-white/50">{DAY_NAMES[day]}</p>
          </div>
        </div>
        <div className="no-scrollbar mx-auto mt-3 flex max-w-3xl gap-2 overflow-x-auto" role="tablist" aria-label="Meal">
          {MEALS.map((m) => {
            const on = m === meal
            const n = (menu[slotKey(day, m)] ?? []).length
            const served = slotCatalog(items, day, m).length > 0
            return (
              <button key={m} type="button" role="tab" aria-selected={on} onClick={() => onMeal(m)} disabled={!served} className={cx('flex h-10 shrink-0 items-center gap-2 rounded-full pl-1 pr-3.5 text-sm font-semibold transition-colors disabled:opacity-35', on ? 'bg-white text-ink' : 'bg-white/[0.06] text-white/75 hover:bg-white/10')}>
                <img src={`/meals/${m}.png`} alt="" className="size-8 rounded-full" />
                {MEAL_NAME[m]}
                {n > 0 && <span className={cx('grid size-5 place-items-center rounded-full text-[11px] font-bold', on ? 'bg-ink text-white' : 'bg-leaf text-white')}>{n}</span>}
              </button>
            )
          })}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto grid max-w-3xl grid-cols-2 gap-3 p-4 pb-28 sm:grid-cols-3">
          {catalog.length === 0 ? (
            <div className="col-span-full"><EmptyState title={`No ${MEAL_NAME[meal].toLowerCase()} on ${DAY_NAMES[day]}`}>Pick another meal above.</EmptyState></div>
          ) : (
            catalog.map((d) => {
              const added = chosen.includes(d.id)
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => onToggle(d.id)}
                  aria-pressed={added}
                  className={cx('group overflow-hidden rounded-2xl bg-white/[0.05] text-left ring-1 transition active:scale-[0.98]', added ? 'ring-2 ring-brand' : 'ring-white/10 hover:ring-white/25')}
                >
                  <div className="relative">
                    <DishImage dish={d} className="aspect-[4/3] w-full" />
                    {d.is_premium && <span className="absolute left-2 top-2 rounded-full bg-turmeric px-2 py-0.5 text-[10px] font-bold uppercase text-ink">Special</span>}
                    <span className={cx('absolute bottom-2 right-2 grid size-9 place-items-center rounded-full shadow-md transition', added ? 'bg-leaf text-white' : 'bg-white text-ink group-hover:bg-brand group-hover:text-white')}>
                      {added ? <Check className="size-5" strokeWidth={3} /> : <Plus className="size-5" strokeWidth={2.6} />}
                    </span>
                  </div>
                  <div className="px-3 pb-3 pt-2">
                    <p className="truncate text-[15px] font-semibold">{d.name}</p>
                    <p className="mt-0.5 text-sm text-white/50 tabular">{formatINR(d.price)}</p>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>

      <footer className="pb-safe fixed inset-x-0 bottom-0 border-t border-white/10 bg-[#120d0c]/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className="font-display text-[20px] font-bold tabular">{formatINR(dayTotal)}</p>
            <p className="text-xs text-white/50">{dayItems.length} dish{dayItems.length === 1 ? '' : 'es'} on {DAY_NAMES[day]}</p>
          </div>
          <button type="button" onClick={onClose} className="bg-brand-grad inline-flex h-11 items-center rounded-full px-6 text-[15px] font-semibold text-white shadow-[0_10px_24px_-10px_rgba(222,59,44,0.8)]">Done</button>
        </div>
      </footer>
    </div>,
    document.body,
  )
}
