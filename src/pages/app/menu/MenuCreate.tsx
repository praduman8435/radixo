import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate } from 'react-router'
import { ArrowRight, Check, Copy, Lock, Plus, X } from 'lucide-react'
import { useAuth } from '../../../lib/auth'
import { useAsync } from '../../../lib/useAsync'
import { loadSettings, savePicks } from '../../../lib/data'
import { DAY_NAMES, addDays, formatDate, formatWeekRange, mondayOf, today, weekdayIndex } from '../../../lib/dates'
import { MEAL_NAME, customCount, customTotal, formatINR, isLocked, mealLines, slotCatalog } from '../../../lib/logic'
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
  const credit = q.data?.credit ?? 0 // already paid for this week by a booking
  const total = useMemo(() => (dishes ? customTotal(menu, dishes) : 0), [menu, dishes])
  const charge = credit > 0 ? Math.max(0, total - credit) : total

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

  const covered = credit > 0
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
      if (!covered) nav(`/wallet?custom=${week!.id}`)
      else if (charge > 0) nav(`/wallet?extra=${week!.id}`)
      else {
        toast(`Your menu for ${formatWeekRange(week!.week_start)} is saved`)
        nav('/menu/view/mine')
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not save', 'error')
    } finally {
      setSaving(false)
    }
  }

  const setMeal = (meal: Meal, ids: string[]) => setMenu((m) => ({ ...m, [slotKey(day, meal)]: ids }))
  const served = MEALS.filter((meal) => slotCatalog(items, day, meal).length > 0)
  const dayIds = MEALS.flatMap((m) => menu[slotKey(day, m)] ?? [])
  const dayTotal = dayIds.reduce((s, id) => s + (dishes!.get(id)?.price ?? 0), 0)

  return (
    <div className="-mx-4 -mt-4 min-h-[calc(100dvh-64px)] bg-[#0f0b0a] pb-28 text-white sm:-mx-6">
      <div className="mx-auto hidden max-w-2xl px-6 pt-8 md:block">
        <h1 className="text-[26px] font-semibold tracking-tight">Build your own menu</h1>
        <p className="mt-1 text-sm text-white/50">Pick only what you eat. You pay for exactly what&rsquo;s on your plate.</p>
      </div>

      {/* Week bar: stays on top while you scroll */}
      <div className="sticky top-16 z-20 border-b border-white/[0.06] bg-[#0f0b0a] sm:top-[72px] md:mt-4">
        <div className="mx-auto max-w-2xl px-4 pb-3 pt-3 sm:px-6">
          <div className="mb-2.5 flex items-center justify-between gap-3 text-xs text-white/50">
            <span className="truncate">Week of {formatWeekRange(week.week_start)}</span>
            <span className="flex shrink-0 items-center gap-2">
              <span className="tabular">{daysFilled}/7 days</span>
              <span className="h-1 w-12 overflow-hidden rounded-full bg-white/10" aria-hidden>
                <span className="block h-full rounded-full bg-[#34c759] transition-all duration-500" style={{ width: `${(daysFilled / 7) * 100}%` }} />
              </span>
            </span>
          </div>
          <div className="grid grid-cols-7 gap-1" role="tablist" aria-label="Day">
            {DAY_NAMES.map((n, i) => {
              const d = addDays(week.week_start, i)
              const on = i === day
              const filled = dayCount(menu, i) > 0
              return (
                <button key={n} type="button" role="tab" aria-selected={on} aria-label={`${n}${filled ? ', has dishes' : ''}`} onClick={() => changeDay(i)} className={cx('flex h-12 flex-col items-center justify-center rounded-xl transition-colors', on ? 'bg-white text-ink' : 'text-white/75 hover:bg-white/[0.06]')}>
                  <span className={cx('text-[10px] font-semibold uppercase', on ? 'text-ink/55' : 'text-white/40')}>{n.slice(0, 3)}</span>
                  <span className="text-[15px] font-semibold leading-tight tabular">{Number(d.slice(8))}</span>
                  <span className={cx('mt-0.5 size-1 rounded-full', filled ? (on ? 'bg-ink' : 'bg-[#34c759]') : 'bg-transparent')} />
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Selected day */}
      <section
        className="mx-auto max-w-2xl px-4 sm:px-6"
        onTouchStart={(e) => { touchX.current = e.touches[0].clientX }}
        onTouchEnd={(e) => {
          if (touchX.current === null) return
          const dx = e.changedTouches[0].clientX - touchX.current
          touchX.current = null
          if (Math.abs(dx) > 60) changeDay(day + (dx < 0 ? 1 : -1))
        }}
      >
        <div className="flex items-center justify-between gap-3 py-4">
          <div className="min-w-0">
            <h2 className="text-[16px] font-semibold">{date === today() ? 'Today' : DAY_NAMES[day]} <span className="font-normal text-white/45">{formatDate(date)}</span></h2>
            <p className="mt-0.5 text-xs text-white/45">{dayIds.length ? `${dayIds.length} dish${dayIds.length === 1 ? '' : 'es'} · ${formatINR(dayTotal)}` : 'Nothing added yet'}</p>
          </div>
          {dayIds.length > 0 && (
            <button type="button" onClick={copyToWeek} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-white/70 ring-1 ring-white/12 transition hover:bg-white/[0.06] hover:text-white"><Copy className="size-3.5" /> Copy to all days</button>
          )}
        </div>

        <div key={day} className={dir > 0 ? 'day-in-right' : 'day-in-left'}>
          {served.length === 0 ? (
            <p className="rounded-2xl bg-white/[0.04] p-6 text-center text-sm text-white/50">The kitchen isn&rsquo;t serving on {DAY_NAMES[day]}.</p>
          ) : (
            <div className="divide-y divide-white/[0.06] overflow-hidden rounded-2xl bg-white/[0.035] ring-1 ring-white/[0.08]">
              {served.map((meal) => {
                const chosen = (menu[slotKey(day, meal)] ?? []).map((id) => dishes!.get(id)).filter((x): x is Dish => !!x)
                const sub = chosen.reduce((s, d) => s + d.price, 0)
                return (
                  <div key={meal} className="px-3.5 py-3">
                    <div className="flex items-center gap-3">
                      <img src={`/meals/${meal}.png`} alt="" className={cx('size-9 shrink-0 rounded-full transition', !chosen.length && 'opacity-60 grayscale-[40%]')} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[14px] font-semibold leading-tight">{MEAL_NAME[meal]}</p>
                        <p className="mt-0.5 truncate text-[11px] text-white/40">{timesOf(settings.data, meal)}</p>
                      </div>
                      {chosen.length > 0 && <span className="text-[13px] font-semibold tabular text-white/75">{formatINR(sub)}</span>}
                      <button type="button" onClick={() => setPicker(meal)} className={cx('inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-xs font-semibold transition', chosen.length ? 'text-white/70 ring-1 ring-white/12 hover:bg-white/[0.06] hover:text-white' : 'bg-white text-ink hover:bg-white/90')}>
                        {chosen.length ? 'Edit' : <><Plus className="size-3.5" strokeWidth={2.6} /> Add</>}
                      </button>
                    </div>
                    {chosen.length > 0 && (
                      <ul className="mt-2.5 flex flex-wrap gap-1.5 pl-12">
                        {chosen.map((d) => (
                          <li key={d.id} className="inline-flex h-7 items-center gap-0.5 rounded-full bg-white/[0.06] pl-2.5 pr-1 text-[12.5px] text-white/85 ring-1 ring-white/[0.06]">
                            {d.name}
                            <button type="button" onClick={() => toggle(meal, d.id)} className="grid size-5 place-items-center rounded-full text-white/35 transition hover:bg-white/10 hover:text-white" aria-label={`Remove ${d.name}`}><X className="size-3" strokeWidth={2.6} /></button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          <div className="mt-3 flex items-center justify-between gap-3 text-xs">
            <span className="text-white/35">{count === 0 ? 'Skip any meal you don’t eat.' : 'Swipe to change day'}</span>
            {day < 6 && (
              <button type="button" onClick={() => changeDay(day + 1)} className="inline-flex h-8 items-center gap-1 rounded-full px-2 font-semibold text-white/65 transition hover:text-white">
                {DAY_NAMES[day + 1]} <ArrowRight className="size-3.5" />
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Bottom bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-[#120d0c]/95 backdrop-blur" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-2.5 sm:px-6">
          <div className="min-w-0 flex-1">
            <p className="flex items-baseline gap-1">
              <span className="text-[19px] font-bold tabular">{formatINR(charge)}</span>
              <span className="truncate text-xs text-white/45">{covered ? (charge ? 'extra this week' : 'in your booking') : '/ week'}</span>
            </p>
            <p className="truncate text-[11px] text-white/45">{count ? `${count} dish${count === 1 ? '' : 'es'} · ${daysFilled} day${daysFilled === 1 ? '' : 's'}` : 'Add dishes to start'}</p>
          </div>
          <button type="button" onClick={save} disabled={saving || count === 0} className="bg-brand-grad inline-flex h-11 shrink-0 items-center rounded-full px-5 text-[14px] font-semibold text-white transition hover:brightness-110 active:scale-[0.98] disabled:opacity-40">
            {saving ? 'Saving…' : covered ? (charge > 0 ? `Pay ${formatINR(charge)}` : 'Save menu') : 'Save & book'}
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
          onSet={(ids) => setMeal(picker, ids)}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  )
}

/** Bottom sheet to pick one day's dishes: meal tabs, dishes grouped by the kitchen's lines, and a one-tap kitchen's pick. */
function ItemPicker({ day, meal, items, dishes, menu, onMeal, onToggle, onSet, onClose }: {
  day: number; meal: Meal; items: MenuItem[]; dishes: Map<string, Dish>; menu: CustomMenu
  onMeal: (m: Meal) => void; onToggle: (dishId: string) => void; onSet: (ids: string[]) => void; onClose: () => void
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

  const chosen = menu[slotKey(day, meal)] ?? []
  const seen = new Set<string>()
  const lines = mealLines(items, day, meal)
    .map((it) => ({ label: it.label, choice: it.dish_ids.length > 1, dishes: it.dish_ids.filter((id) => !seen.has(id) && seen.add(id)).map((id) => dishes.get(id)).filter((d): d is Dish => !!d && d.is_active) }))
    .filter((l) => l.dishes.length)
  // The kitchen's pick: each main line's default (extras like sides and sweets stay optional).
  const picks = mealLines(items, day, meal).filter((it) => !['Side', 'Extras', 'Sweet'].includes(it.label)).map((it) => it.default_dish_id).filter((id, i, a) => a.indexOf(id) === i && dishes.get(id)?.is_active)
  const picksTotal = picks.reduce((s, id) => s + (dishes.get(id)?.price ?? 0), 0)
  const sub = chosen.reduce((s, id) => s + (dishes.get(id)?.price ?? 0), 0)

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={`${MEAL_NAME[meal]} on ${DAY_NAMES[day]}`}>
      <button type="button" className="absolute inset-0 bg-black/65 backdrop-blur-[2px]" onClick={onClose} aria-label="Close" />
      <div className="sheet-up relative flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-[24px] bg-[#151010] text-white ring-1 ring-white/10 sm:max-h-[85vh] sm:rounded-[24px]">
        <div className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-white/15 sm:hidden" aria-hidden />
        <header className="shrink-0 px-4 pb-3 pt-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[16px] font-semibold">{DAY_NAMES[day]}</p>
              <p className="text-xs text-white/45">Tap a dish to add or remove it</p>
            </div>
            <button type="button" onClick={onClose} className="grid size-8 shrink-0 place-items-center rounded-full bg-white/[0.07] text-white/80 hover:bg-white/15" aria-label="Close"><X className="size-4" /></button>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-1 rounded-xl bg-white/[0.05] p-1" role="tablist" aria-label="Meal">
            {MEALS.map((m) => {
              const on = m === meal
              const n = (menu[slotKey(day, m)] ?? []).length
              const open = slotCatalog(items, day, m).length > 0
              return (
                <button key={m} type="button" role="tab" aria-selected={on} onClick={() => onMeal(m)} disabled={!open} className={cx('relative h-8 rounded-lg text-[12.5px] font-semibold transition-colors disabled:opacity-30', on ? 'bg-white text-ink' : 'text-white/65 hover:text-white')}>
                  {MEAL_NAME[m]}
                  {n > 0 && <span className={cx('absolute right-1 top-1 size-1.5 rounded-full', on ? 'bg-brand' : 'bg-[#34c759]')} aria-label={`${n} added`} />}
                </button>
              )
            })}
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
          {lines.length === 0 ? (
            <p className="py-10 text-center text-sm text-white/50">No {MEAL_NAME[meal].toLowerCase()} on {DAY_NAMES[day]}.</p>
          ) : (
            <>
              {chosen.length === 0 && picks.length > 0 && (
                <button type="button" onClick={() => onSet(picks)} className="mb-4 flex w-full items-center gap-3 rounded-xl bg-[#ff7a5c]/[0.08] px-3.5 py-3 text-left ring-1 ring-[#ff7a5c]/25 transition hover:bg-[#ff7a5c]/[0.12]">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold">Kitchen&rsquo;s pick · {formatINR(picksTotal)}</span>
                    <span className="block truncate text-[12px] text-white/55">{picks.map((id) => dishes.get(id)?.name).join(', ')}</span>
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-[#ff9a80]">Add all</span>
                </button>
              )}
              <div className="space-y-4">
                {lines.map((l, i) => (
                  <div key={`${l.label}-${i}`}>
                    <p className="mb-1.5 flex items-baseline justify-between px-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/40">
                      {l.label}
                      {l.choice && <span className="text-[11px] font-normal normal-case tracking-normal text-white/30">Pick any</span>}
                    </p>
                    <ul className="divide-y divide-white/[0.05] overflow-hidden rounded-xl bg-white/[0.04] ring-1 ring-white/[0.07]">
                      {l.dishes.map((d) => {
                        const added = chosen.includes(d.id)
                        return (
                          <li key={d.id}>
                            <button type="button" onClick={() => onToggle(d.id)} aria-pressed={added} className={cx('flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors', added ? 'bg-white/[0.05]' : 'hover:bg-white/[0.03]')}>
                              <DishImage dish={d} className="size-10 shrink-0 rounded-lg" />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[14px] font-medium">{d.name}</span>
                                <span className="block text-[12px] text-white/45 tabular">{formatINR(d.price)}{d.is_premium ? ' · Chef’s special' : ''}</span>
                              </span>
                              <span className={cx('grid size-6 shrink-0 place-items-center rounded-full transition', added ? 'bg-brand text-white' : 'text-transparent ring-1 ring-inset ring-white/25')}>
                                <Check className="size-3.5" strokeWidth={3} />
                              </span>
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <footer className="shrink-0 border-t border-white/10 px-4 pt-3" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
          {chosen.length ? (
            <button type="button" onClick={onClose} className="bg-brand-grad flex h-11 w-full items-center justify-between rounded-full px-5 text-[14px] font-semibold">
              <span>Done</span>
              <span className="tabular text-white/85">{chosen.length} added · {formatINR(sub)}</span>
            </button>
          ) : (
            <button type="button" onClick={onClose} className="h-11 w-full rounded-full bg-white/[0.07] text-[14px] font-semibold text-white/75 ring-1 ring-white/10 transition hover:bg-white/10">Skip for now</button>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  )
}
