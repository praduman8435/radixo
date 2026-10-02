// Business rules, kept free of UI and storage so both backends and every screen agree.
import { addDays, diffDays, today, weekdayIndex } from './dates'
import {
  MEALS, slotKey,
  type Attendance, type CustomMenu, type Dish, type Meal, type MenuItem, type Pack, type Pause, type Payment, type Picks, type Plan,
  type Selection, type Settings, type Subscription, type Week,
} from './types'

export const formatINR = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN')

export const MEAL_NAME: Record<Meal, string> = { breakfast: 'Breakfast', lunch: 'Lunch', snacks: 'Snacks', dinner: 'Dinner' }

/** Options for a meal picker, in service order. */
export const MEAL_OPTIONS = MEALS.map((m) => ({ value: m, label: MEAL_NAME[m] }))

export const coversMeal = (meals: Meal[], meal: Meal) => meals.includes(meal)

/** "Lunch + Dinner", "All meals"… in service order. */
export function mealsLabel(meals: Meal[]) {
  const sorted = MEALS.filter((m) => meals.includes(m))
  if (sorted.length === MEALS.length) return 'All meals'
  if (sorted.length === 0) return 'No meals'
  return sorted.map((m) => MEAL_NAME[m]).join(' + ')
}

export function subscriptionOn(subs: Subscription[], userId: string, date: string) {
  return subs
    .filter((s) => s.user_id === userId && s.status === 'active' && s.start_date <= date && s.end_date >= date)
    .sort((a, b) => (a.end_date < b.end_date ? 1 : -1))[0]
}

export function pauseOn(pauses: Pause[], userId: string, date: string) {
  return pauses.find((p) => p.user_id === userId && p.status === 'approved' && p.start_date <= date && p.end_date >= date)
}

/** Is this member expected (paid, not paused) for this meal on this date? */
export function isEligible(userId: string, date: string, meal: Meal, subs: Subscription[], pauses: Pause[]) {
  return subs.some((s) => s.user_id === userId && s.status === 'active' && s.start_date <= date && s.end_date >= date && coversMeal(s.meals, meal)) && !pauseOn(pauses, userId, date)
}

/** What a subscription is called on screen: its plan, its ready-made menu, or a custom menu. */
export function subLabel(s: Pick<Subscription, 'plan_id' | 'pack_id'>, plans: Plan[], packs: Pack[] = []) {
  if (s.plan_id) return plans.find((p) => p.id === s.plan_id)?.name ?? 'Plan'
  if (s.pack_id) return `${packs.find((p) => p.id === s.pack_id)?.name ?? 'Ready-made'} menu · 1 week`
  return 'Custom menu · 1 week'
}

export const paymentLabel = (p: Pick<Payment, 'plan_id' | 'pack_id'>, plans: Plan[], packs: Pack[] = []) => subLabel(p, plans, packs)

export type MemberState =
  | { kind: 'none' }
  | { kind: 'pending'; payment: Payment }
  | { kind: 'active'; sub: Subscription; daysLeft: number; paused: boolean }
  | { kind: 'upcoming'; sub: Subscription }
  | { kind: 'expired'; sub: Subscription }

export function memberState(userId: string, subs: Subscription[], payments: Payment[], pauses: Pause[], date = today()): MemberState {
  const mine = subs.filter((s) => s.user_id === userId && s.status === 'active')
  const active = subscriptionOn(mine, userId, date)
  if (active) {
    // Back-to-back renewals count as one continuous run.
    let end = active.end_date
    const meals = new Set(active.meals)
    for (;;) {
      const nextSub = mine.find((s) => s.start_date === addDays(end, 1))
      if (!nextSub) break
      end = nextSub.end_date
      nextSub.meals.forEach((m) => meals.add(m))
    }
    return { kind: 'active', sub: { ...active, end_date: end, meals: MEALS.filter((m) => meals.has(m)) }, daysLeft: diffDays(date, end) + 1, paused: !!pauseOn(pauses, userId, date) }
  }
  const pending = payments.find((p) => p.user_id === userId && p.status === 'pending')
  if (pending) return { kind: 'pending', payment: pending }
  const upcoming = mine.filter((s) => s.start_date > date).sort((a, b) => (a.start_date < b.start_date ? -1 : 1))[0]
  if (upcoming) return { kind: 'upcoming', sub: upcoming }
  const last = [...mine].sort((a, b) => (a.end_date < b.end_date ? 1 : -1))[0]
  return last ? { kind: 'expired', sub: last } : { kind: 'none' }
}

/** Dates a new plan should run: right after the member's current one, or from today. */
export function nextSubscriptionDates(subs: Subscription[], userId: string, plan: Plan, from = today()) {
  const lastEnd = subs
    .filter((s) => s.user_id === userId && s.status === 'active' && s.plan_id && s.end_date >= from)
    .reduce<string | null>((m, s) => (!m || s.end_date > m ? s.end_date : m), null)
  const start = lastEnd ? addDays(lastEnd, 1) : from
  return { start_date: start, end_date: addDays(start, plan.duration_days - 1) }
}

/** A menu booked for a week runs that week (from today if the week has already started). */
export function weekBookingDates(week: Pick<Week, 'week_start'>, from = today()) {
  const end = addDays(week.week_start, 6)
  return { start_date: week.week_start > from ? week.week_start : from, end_date: end }
}

/** Does a member already have meals paid for every day of this week? Then menus are included, not charged. */
export function coveredForWeek(subs: Subscription[], userId: string, week: Pick<Week, 'week_start'>) {
  for (let i = 0; i < 7; i++) {
    const d = addDays(week.week_start, i)
    if (d < today()) continue
    if (!subscriptionOn(subs, userId, d)) return false
  }
  return true
}

/** Meals a member's plans cover on every remaining day of a week (what they don't pay extra for). */
export function weekPlanMeals(subs: Subscription[], userId: string, week: Pick<Week, 'week_start'>): Meal[] {
  let meals: Meal[] | null = null
  for (let i = 0; i < 7; i++) {
    const d = addDays(week.week_start, i)
    if (d < today()) continue
    const day = new Set(subs.filter((s) => s.user_id === userId && s.status === 'active' && s.start_date <= d && s.end_date >= d).flatMap((s) => s.meals))
    meals = (meals ?? MEALS).filter((m) => day.has(m))
  }
  return meals ?? []
}

/** What a custom menu costs a member: items in meals their plan already covers are free. */
export function customCharge(custom: CustomMenu, dishes: Map<string, Dish>, coveredMeals: Meal[]) {
  return Object.entries(custom)
    .filter(([k]) => !coveredMeals.some((m) => k.endsWith('-' + m)))
    .flatMap(([, ids]) => ids)
    .reduce((s, id) => s + (dishes.get(id)?.price ?? 0), 0)
}

export function validatePause(start: string, end: string, sub: Subscription | undefined, minDays: number): string | null {
  if (!sub) return 'You need an active plan to pause.'
  if (start <= today()) return 'A pause has to start from tomorrow or later.'
  if (end < start) return 'The end date is before the start date.'
  const days = diffDays(start, end) + 1
  if (days < minDays) return `A pause must be at least ${minDays} days.`
  if (start > sub.end_date) return 'Those dates are after your plan ends.'
  return null
}

export const pauseDays = (p: Pick<Pause, 'start_date' | 'end_date'>) => diffDays(p.start_date, p.end_date) + 1

// ---------- Menu ----------

export const isChoice = (it: MenuItem) => it.dish_ids.length > 1

export function mealLines(items: MenuItem[], day: number, meal: Meal) {
  return items.filter((it) => it.day === day && it.meal === meal).sort((a, b) => a.position - b.position)
}

/** Every dish the kitchen offers for one meal on one day: what a custom menu can choose from. */
export function slotCatalog(items: MenuItem[], day: number, meal: Meal) {
  return [...new Set(mealLines(items, day, meal).flatMap((it) => it.dish_ids))]
}

/** The dish a member gets for a line: their valid pick, else the line's default. */
export function resolveDish(item: MenuItem, picks: Picks | undefined) {
  const p = picks?.[item.id]
  return p && item.dish_ids.includes(p) ? p : item.default_dish_id
}

/** The dishes a member gets for one meal: their custom items, their ready-made menu's picks, or the defaults. */
export function dishesFor(items: MenuItem[], day: number, meal: Meal, sel: Selection | undefined | null) {
  if (sel?.mode === 'custom') return (sel.custom?.[slotKey(day, meal)] ?? []).filter((d) => slotCatalog(items, day, meal).includes(d))
  return mealLines(items, day, meal).map((it) => resolveDish(it, sel?.mode === 'pack' ? sel.picks : undefined))
}

/** Meals that have at least one dish in a custom menu. */
export function customMeals(custom: CustomMenu): Meal[] {
  return MEALS.filter((m) => Object.entries(custom).some(([k, v]) => k.endsWith('-' + m) && v.length > 0))
}

export function customTotal(custom: CustomMenu, dishes: Map<string, Dish>) {
  return Object.values(custom).flat().reduce((s, id) => s + (dishes.get(id)?.price ?? 0), 0)
}

export const customCount = (custom: CustomMenu) => Object.values(custom).reduce((n, v) => n + v.length, 0)

export const isLocked = (week: Week) => new Date(week.choice_deadline).getTime() <= Date.now()

export function weekForDate(weeks: Week[], date: string) {
  return weeks.find((w) => w.week_start <= date && addDays(w.week_start, 6) >= date)
}

/** How many choice lines of a week the picks cover. */
export function pickProgress(items: MenuItem[], picks: Picks) {
  const choices = items.filter(isChoice)
  return { done: choices.filter((it) => picks[it.id] && it.dish_ids.includes(picks[it.id])).length, total: choices.length }
}

// ---------- Kitchen ----------

export interface PrepDish {
  dishId: string
  chosen: number // members who will get this dish
  cook: number // portions to prepare
}
export interface PrepLine {
  item: MenuItem
  dishes: PrepDish[]
}
export interface PrepSheet {
  members: number
  rate: number
  rateSource: 'history' | 'default'
  expected: number
  lines: PrepLine[]
}

/**
 * Expected share of members who actually eat this meal: the average of the last 4 same weekdays
 * that have attendance data, else the default from settings.
 */
export function attendanceRate(date: string, meal: Meal, subs: Subscription[], pauses: Pause[], attendance: Attendance[], fallback: number) {
  const users = [...new Set(subs.map((s) => s.user_id))]
  const rates: number[] = []
  for (let k = 1; k <= 8 && rates.length < 4; k++) {
    const d = addDays(date, -7 * k)
    const eligible = new Set(users.filter((u) => isEligible(u, d, meal, subs, pauses)))
    if (eligible.size === 0) continue
    const came = attendance.filter((a) => a.date === d && a.meal === meal && eligible.has(a.user_id)).length
    if (came > 0) rates.push(came / eligible.size)
  }
  if (rates.length === 0) return { rate: fallback, source: 'default' as const }
  return { rate: rates.reduce((a, b) => a + b, 0) / rates.length, source: 'history' as const }
}

export function prepSheet(args: {
  date: string
  meal: Meal
  week: Week | undefined
  items: MenuItem[]
  selections: Selection[]
  subs: Subscription[]
  pauses: Pause[]
  attendance: Attendance[]
  settings: Settings
}): PrepSheet {
  const { date, meal, week, items, selections, subs, pauses, attendance, settings } = args
  const members = [...new Set(subs.map((s) => s.user_id))].filter((u) => isEligible(u, date, meal, subs, pauses))
  const { rate, source } = attendanceRate(date, meal, subs, pauses, attendance, settings.attendance_factor)
  const factor = rate * (1 + settings.buffer_pct / 100)
  const weekItems = week ? items.filter((i) => i.week_id === week.id) : []
  const day = weekdayIndex(date)
  const lines = mealLines(weekItems, day, meal)
  const selByUser = new Map(selections.filter((s) => week && s.week_id === week.id).map((s) => [s.user_id, s]))
  const counts = new Map<string, number>()
  for (const u of members) for (const d of new Set(dishesFor(weekItems, day, meal, selByUser.get(u)))) counts.set(d, (counts.get(d) ?? 0) + 1)
  // Each dish is listed once, under the first line that offers it.
  const seen = new Set<string>()
  return {
    members: members.length,
    rate,
    rateSource: source,
    expected: Math.round(members.length * rate),
    lines: lines
      .map((item) => ({
        item,
        dishes: item.dish_ids.filter((d) => !seen.has(d) && (seen.add(d), true)).map((dishId) => {
          const chosen = counts.get(dishId) ?? 0
          return { dishId, chosen, cook: chosen === 0 ? 0 : Math.ceil(chosen * factor) }
        }),
      }))
      .filter((l) => l.dishes.length > 0),
  }
}
