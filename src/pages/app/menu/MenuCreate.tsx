import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate } from 'react-router'
import { Check, Lock, Plus, X } from 'lucide-react'
import { useAuth } from '../../../lib/auth'
import { savePicks } from '../../../lib/data'
import { DAY_NAMES, formatWeekRange } from '../../../lib/dates'
import { MEAL_NAME, customCharge, customCount, customMeals, formatINR, isLocked, mealsLabel, slotCatalog, weekPlanMeals } from '../../../lib/logic'
import { MEALS, slotKey, type CustomMenu, type Dish, type Meal, type MenuItem } from '../../../lib/types'
import { EmptyState, ErrorNote, PageLoader, cx } from '../../../components/ui'
import { useToast } from '../../../components/toast'
import { DishImage } from '../../../components/DishImage'
import { DayHeader, MealRows, TotalBar, darkPaper } from '../../../components/menu'
import { draftKey, readDraft, useMenuData } from './useMenuData'
import { useLoginGate } from '../../../components/LoginSheet'

export default function MenuCreate() {
  const { profile } = useAuth()
  const uid = profile?.role === 'student' ? profile.id : null
  const { requireLogin } = useLoginGate()
  const [pendingSave, setPendingSave] = useState(false)
  const toast = useToast()
  const nav = useNavigate()
  const q = useMenuData(uid)
  const [menu, setMenu] = useState<CustomMenu>({})
  const [ready, setReady] = useState(false)
  const [picker, setPicker] = useState<{ day: number; meal: Meal } | null>(null)
  const [saving, setSaving] = useState(false)

  // Start from the saved custom menu, else an unsaved draft on this phone, else empty.
  useEffect(() => {
    const d = q.data
    if (!d?.week || ready) return
    const saved = d.selection?.mode === 'custom' ? d.selection.custom : null
    setMenu(readDraft(d.week.id) ?? saved ?? {})
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

  // A guest tapped Done: once they've logged in (and their plan data reloaded), save straight away.
  useEffect(() => {
    if (pendingSave && uid && q.data?.member && !q.loading) {
      setPendingSave(false)
      void done()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingSave, uid, q.data, q.loading])
  // What the student pays: everything if they have no plan, else only the meals their plan doesn't include.
  const charge = useMemo(() => (dishes ? customCharge(menu, dishes, planMeals) : 0), [menu, dishes, planMeals])
  const extraMeals = customMeals(menu).filter((m) => !planMeals.includes(m))

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
  const toggle = (day: number, meal: Meal, dishId: string) => {
    const key = slotKey(day, meal)
    setMenu((m) => {
      const cur = m[key] ?? []
      const next = cur.includes(dishId) ? cur.filter((x) => x !== dishId) : [...cur, dishId]
      const out = { ...m, [key]: next }
      if (next.length === 0) delete out[key]
      return out
    })
  }

  async function done() {
    if (customCount(menu) === 0) return toast('Add at least one item first.', 'error')
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
    <div className="-mx-4 -mt-4 sm:-mx-6 md:mx-auto md:mt-6 md:max-w-3xl md:overflow-hidden md:rounded-[28px] pb-28" style={darkPaper}>
      <p className="px-4 py-3 text-center text-sm font-semibold text-white/70">Week of {formatWeekRange(week.week_start)} · tap Add to fill each day</p>
      {DAY_NAMES.map((_, day) => (
        <section key={day} aria-label={DAY_NAMES[day]}>
          <DayHeader day={day}>
            <button
              type="button"
              onClick={() => setPicker({ day, meal: MEALS.find((m) => slotCatalog(items, day, m).length) ?? 'lunch' })}
              className="flex items-center gap-2 rounded-xl border-2 border-white/85 bg-gradient-to-b from-[#7d1710] to-[#3f0704] px-4 py-1 font-display text-[17px] font-bold text-white shadow-[0_4px_10px_-4px_rgba(0,0,0,0.6)] transition hover:brightness-125"
            >
              Add <span className="grid size-6 place-items-center rounded-full bg-white text-maroon"><Plus className="size-4" strokeWidth={3} /></span>
            </button>
          </DayHeader>
          <MealRows
            meals={MEALS}
            empty=""
            render={(meal) => {
              const ids = menu[slotKey(day, meal)] ?? []
              if (!ids.length) {
                return slotCatalog(items, day, meal).length ? (
                  <button type="button" onClick={() => setPicker({ day, meal })} className="text-sm font-medium text-white/40 hover:text-white/80">+ add {MEAL_NAME[meal].toLowerCase()}</button>
                ) : <span className="text-sm text-white/25">not served</span>
              }
              return (
                <span className="flex flex-wrap justify-center gap-1.5">
                  {ids.map((id) => (
                    <button key={id} type="button" onClick={() => toggle(day, meal, id)} className="group inline-flex items-center gap-1 rounded-full bg-white/10 py-0.5 pl-2.5 pr-1.5 text-[14px] text-white ring-1 ring-white/15 hover:bg-brand/40" aria-label={`Remove ${dishes!.get(id)?.name}`}>
                      {dishes!.get(id)?.name}
                      <X className="size-3.5 opacity-60 group-hover:opacity-100" />
                    </button>
                  ))}
                </span>
              )
            }}
          />
        </section>
      ))}

      <TotalBar amount={charge} label={covered ? (charge ? 'Extra to pay' : 'Total Budget') : 'Total Budget'} note={covered ? (charge ? `for ${mealsLabel(extraMeals)} · not in your plan` : '(included in your plan)') : '(for 1 week)'}>
        <button type="button" onClick={done} disabled={saving} className="bg-brand-grad shadow-brand rounded-full px-5 py-1.5 font-script-italic text-[18px] text-white hover:brightness-110 active:scale-95 disabled:opacity-60">
          {saving ? 'Saving…' : 'Done'}
        </button>
      </TotalBar>

      {picker && dishes && (
        <ItemPicker
          day={picker.day}
          meal={picker.meal}
          items={items}
          dishes={dishes}
          menu={menu}
          onMeal={(meal) => setPicker({ ...picker, meal })}
          onToggle={(id) => toggle(picker.day, picker.meal, id)}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  )
}

/** Full-screen "Select items to add in the menu" for one day. */
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
    <div className="animate-rise fixed inset-0 z-50 flex flex-col bg-white" role="dialog" aria-modal="true" aria-label={`Select items for ${DAY_NAMES[day]}`}>
      <header className="flex items-center gap-3 border-b-[3px] border-maroon px-3 pb-3 pt-[max(12px,env(safe-area-inset-top))]">
        <button type="button" onClick={onClose} className="grid size-10 shrink-0 place-items-center rounded-full border-[2.5px] border-ink hover:bg-sand" aria-label="Close"><X className="size-5" strokeWidth={2.6} /></button>
        <div className="min-w-0 flex-1 rounded-2xl border-[2.5px] border-maroon px-3 py-1.5 text-center shadow-[0_4px_10px_-6px_rgba(0,0,0,0.5)]">
          <p className="truncate font-display text-[18px] font-bold leading-tight">Select items to add in the menu</p>
          <p className="text-xs font-semibold text-maroon">{DAY_NAMES[day]}</p>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav className="w-[92px] shrink-0 overflow-y-auto border-r-2 border-maroon/80 py-3" aria-label="Meals">
          {MEALS.map((m) => {
            const on = m === meal
            const n = (menu[slotKey(day, m)] ?? []).length
            const served = slotCatalog(items, day, m).length > 0
            return (
              <button key={m} type="button" onClick={() => onMeal(m)} disabled={!served} aria-current={on} className={cx('relative flex w-full flex-col items-center gap-1.5 px-1.5 py-3 transition', on ? 'bg-brand-grad text-white' : 'text-ink', !served && 'opacity-35')}>
                <img src={`/meals/${m}.png`} alt="" className={cx('size-14 rounded-full shadow-md transition', on && 'scale-105 ring-2 ring-white')} />
                <span className={cx('rounded-md px-1.5 py-0.5 font-display text-[13px] font-bold shadow-sm', on ? 'bg-maroon text-white' : 'bg-white')}>{MEAL_NAME[m]}</span>
                {n > 0 && <span className="absolute right-2 top-2 grid size-5 place-items-center rounded-full bg-leaf text-[11px] font-bold text-white">{n}</span>}
              </button>
            )
          })}
        </nav>

        <div className="min-w-0 flex-1 overflow-y-auto p-3 pb-28">
          {catalog.length === 0 ? (
            <EmptyState title={`No ${MEAL_NAME[meal].toLowerCase()} on ${DAY_NAMES[day]}`}>Pick another meal on the left.</EmptyState>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {catalog.map((d) => {
                const added = chosen.includes(d.id)
                return (
                  <div key={d.id} className={cx('overflow-hidden rounded-2xl bg-white shadow-[0_8px_18px_-10px_rgba(0,0,0,0.45)] ring-1 transition', added ? 'ring-2 ring-brand' : 'ring-line/70')}>
                    <div className="relative">
                      <DishImage dish={d} className="aspect-[4/3] w-full" />
                      {d.is_premium && <span className="absolute left-2 top-2 rounded-full bg-turmeric px-2 py-0.5 text-[10px] font-bold uppercase text-ink">Special</span>}
                      <span className="absolute bottom-2 right-2 rounded-full bg-black/65 px-2 py-0.5 text-xs font-bold text-white backdrop-blur">{formatINR(d.price)}</span>
                    </div>
                    <div className="px-2 pb-3 pt-2 text-center">
                      <p className="truncate font-display text-[17px] font-bold">{d.name}</p>
                      <button
                        type="button"
                        onClick={() => onToggle(d.id)}
                        aria-pressed={added}
                        className={cx('mx-auto mt-2 flex h-9 w-28 items-center justify-center gap-1 rounded-xl border-[2.5px] font-script-italic text-[18px] transition active:scale-95', added ? 'border-leaf bg-leaf text-white' : 'border-maroon text-ink hover:bg-brand-50')}
                      >
                        {added ? <><Check className="size-4" strokeWidth={3} /> Added</> : 'Add'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <footer className="pb-safe fixed inset-x-0 bottom-0 px-2">
        <div className="mx-auto flex max-w-md items-center justify-between rounded-t-[22px] border-x-2 border-t-[3px] border-maroon bg-white px-6 py-3 shadow-[0_-12px_24px_-14px_rgba(0,0,0,0.6)]">
          <div>
            <p className="font-script-italic text-[15px] text-ink/70">{dayItems.length} item{dayItems.length === 1 ? '' : 's'} added · {DAY_NAMES[day].slice(0, 3)}</p>
            <p className="font-display text-2xl font-bold tabular">₹ {dayTotal.toFixed(2)}</p>
          </div>
          <button type="button" onClick={onClose} className="bg-brand-grad shadow-brand rounded-full px-7 py-2 font-banner text-[20px] text-white hover:brightness-110">Done</button>
        </div>
      </footer>
    </div>,
    document.body,
  )
}
