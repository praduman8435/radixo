// Booking rules: durations and discounts, booking dates, weekly carry-over, "not coming" credit.
// supabase/schema.sql implements the money parts (quote, skip credit) the same way, server-side.
import { addDays, diffDays, parseISODate, today, weekdayIndex } from './dates'
import { mealLines, slotCatalog } from './logic'
import { MEALS, slotKey, type CustomMenu, type Dish, type Meal, type MenuItem, type Pack, type Payment, type Selection, type Settings, type Subscription, type Week } from './types'

export const DURATIONS = [
  { weeks: 1, label: '1 week', short: '1 wk' },
  { weeks: 4, label: '1 month', short: '1 mo' },
  { weeks: 13, label: '3 months', short: '3 mo' },
  { weeks: 26, label: '6 months', short: '6 mo' },
] as const

export function discountFor(weeks: number, s: Pick<Settings, 'discount_1m' | 'discount_3m' | 'discount_6m'>) {
  if (weeks >= 26) return s.discount_6m
  if (weeks >= 13) return s.discount_3m
  if (weeks >= 4) return s.discount_1m
  return 0
}

export const bookingTotal = (weekly: number, weeks: number, discount: number) => Math.round((weekly * weeks * (100 - discount)) / 100)
export const weeklyNet = (s: Pick<Subscription, 'weekly_price' | 'discount_pct'>) => (s.weekly_price * (100 - s.discount_pct)) / 100

export const customValue = (custom: CustomMenu, dishes: Map<string, Dish> | Record<string, Dish>) => {
  const get = (id: string) => (dishes instanceof Map ? dishes.get(id) : dishes[id])
  return Object.values(custom).flat().reduce((s, id) => s + (get(id)?.price ?? 0), 0)
}

export const customMealsOf = (custom: CustomMenu): Meal[] => MEALS.filter((m) => Object.entries(custom).some(([k, v]) => k.endsWith('-' + m) && v.length > 0))

/** Hours before a meal after which it can't be booked or changed. */
export const LOCK_HOURS = 24
export const CHANGE_LOCK_HOURS = LOCK_HOURS

// ---------- Meal slots ----------
// A slot is one meal on one date. Comparing "date#index" strings orders slots in time.

export type Slot = { date: string; meal: Meal }
const mealIdx = (m: Meal) => MEALS.indexOf(m)
const slotKeyOf = (date: string, meal: Meal) => `${date}#${mealIdx(meal)}`

/** The first meal slot a booking does NOT cover (exclusive end). */
export function bookingEnd(b: Pick<Subscription, 'start_meal' | 'end_date'>): Slot {
  const m = b.start_meal ?? 'breakfast'
  return m === 'breakfast' ? { date: addDays(b.end_date, 1), meal: 'breakfast' } : { date: b.end_date, meal: m }
}

/** Does a booking's time span include this meal slot (ignoring which meals it includes)? */
export function spans(b: Subscription, date: string, meal: Meal) {
  if (b.status !== 'active') return false
  const k = slotKeyOf(date, meal)
  const end = bookingEnd(b)
  return k >= slotKeyOf(b.start_date, b.start_meal ?? 'breakfast') && k < slotKeyOf(end.date, end.meal)
}

/** Is this meal on this date part of the booking (in its time span and one of its meals)? */
export const covers = (b: Subscription, date: string, meal: Meal) => b.meals.includes(meal) && spans(b, date, meal)

/** For a booking starting at a slot and running `weeks` weeks: its start_date, start_meal and end_date. */
export function bookingDates(start: Slot, weeks: number) {
  const endExclusive = addDays(start.date, weeks * 7)
  return { start_date: start.date, start_meal: start.meal, end_date: start.meal === 'breakfast' ? addDays(endExclusive, -1) : endExclusive }
}

/** Bookings that touch a date. */
export const bookingsOn = (subs: Subscription[], userId: string, date: string) =>
  subs.filter((s) => s.user_id === userId && s.status === 'active' && s.start_date <= date && s.end_date >= date)

/** Bookings that touch any day of a week. */
export const bookingsInWeek = (subs: Subscription[], userId: string, week: Pick<Week, 'week_start'>) =>
  subs.filter((s) => s.user_id === userId && s.status === 'active' && s.start_date <= addDays(week.week_start, 6) && s.end_date >= week.week_start)

/** The first meal that can still be booked or changed: at least LOCK_HOURS away. */
export function firstOpenSlot(s?: Parameters<typeof mealStart>[2] | null, now = new Date()): Slot {
  for (let i = 0; i < 4; i++) {
    const date = addDays(today(), i)
    for (const meal of MEALS) if (mealStart(date, meal, s).getTime() - now.getTime() >= LOCK_HOURS * 3_600_000) return { date, meal }
  }
  return { date: addDays(today(), 2), meal: 'breakfast' }
}

/** Where a new booking starts: the first open meal, after the member's current bookings, or a later chosen day. */
export function bookingStart(subs: Subscription[], userId: string, settings?: Parameters<typeof mealStart>[2] | null, from?: string | null): Slot {
  let start = firstOpenSlot(settings)
  for (const b of subs) {
    if (b.user_id !== userId || b.status !== 'active') continue
    const end = bookingEnd(b)
    if (slotKeyOf(end.date, end.meal) > slotKeyOf(start.date, start.meal)) start = end
  }
  if (from && from > start.date) start = { date: from, meal: 'breakfast' }
  return start
}

/** Is any of this week's meals still open to book? */
export function weekOpen(week: Pick<Week, 'week_start'>, s?: Parameters<typeof mealStart>[2] | null) {
  return firstOpenSlot(s).date <= addDays(week.week_start, 6)
}

/** Meals of a week ("day-meal" keys) inside any of the member's bookings' time spans. */
export function coveredKeys(subs: Subscription[], userId: string, week: Pick<Week, 'week_start'>) {
  const out = new Set<string>()
  const mine = bookingsInWeek(subs, userId, week)
  for (let d = 0; d < 7; d++) for (const m of MEALS) if (mine.some((b) => spans(b, addDays(week.week_start, d), m))) out.add(slotKey(d, m))
  return out
}

/** Value of a menu over some slots only. */
export const valueOver = (menu: CustomMenu, keys: Set<string>, dishes: Map<string, Dish> | Record<string, Dish>) =>
  customValue(Object.fromEntries(Object.entries(menu).filter(([k]) => keys.has(k))), dishes)

/** Menu value of one meal slot of a booking (before discount). */
function slotGross(b: Subscription, day: number, meal: Meal, dishes: Map<string, Dish> | Record<string, Dish>) {
  if (!b.meals.includes(meal)) return 0
  if (b.source !== 'custom') return b.weekly_price / (7 * Math.max(1, b.meals.length))
  return customValue({ x: b.template?.[slotKey(day, meal)] ?? [] }, dishes)
}

/** Value already paid for a week (before discount), counting only the booked meals that fall in it. */
export function weekCredit(subs: Subscription[], userId: string, week: Pick<Week, 'week_start'>, dishes: Map<string, Dish> | Record<string, Dish> = new Map()) {
  let total = 0
  for (const b of bookingsInWeek(subs, userId, week))
    for (let d = 0; d < 7; d++) for (const m of MEALS) if (spans(b, addDays(week.week_start, d), m)) total += slotGross(b, d, m, dishes)
  return Math.round(total)
}

/** Carry a custom template into another week: keep dishes still served; else the kitchen's default for that meal. */
export function carryTemplate(template: CustomMenu, items: MenuItem[]): CustomMenu {
  const out: CustomMenu = {}
  for (const [key, ids] of Object.entries(template)) {
    if (!ids.length) continue
    const [d, meal] = key.split('-') as [string, Meal]
    const day = Number(d)
    const offered = slotCatalog(items, day, meal)
    if (!offered.length) continue
    const kept = ids.filter((id) => offered.includes(id))
    out[key] = kept.length ? kept : mealLines(items, day, meal).map((l) => l.default_dish_id).slice(0, Math.max(1, ids.length))
  }
  return out
}

/** The menu a member actually gets in a week: their saved choice, else what their booking carries over. */
export function effectiveSelection(args: { userId: string; week: Week; items: MenuItem[]; packs: Pack[]; selection: Selection | null | undefined; subs: Subscription[] }): Selection | null {
  const { userId, week, items, packs, selection, subs } = args
  if (selection) return selection
  const b = bookingsInWeek(subs, userId, week).filter((x) => x.source !== 'plan').sort((x, y) => (x.created_at < y.created_at ? 1 : -1))[0]
  if (!b) return null
  const base = { id: '', user_id: userId, week_id: week.id, updated_at: '' }
  if (b.source === 'pack') {
    const pack = packs.find((p) => p.week_id === week.id && p.name === b.pack_name)
    return pack ? { ...base, mode: 'pack', pack_id: pack.id, picks: pack.picks, custom: {} } : null
  }
  return { ...base, mode: 'custom', pack_id: null, picks: {}, custom: carryTemplate(b.template ?? {}, items) }
}

// ---------- Not coming ----------

/** Can a "not coming" range start on this date? It must be at least `hours` before the day starts. */
export function skipAllowed(start: string, hours: number, now = new Date()) {
  return parseISODate(start).getTime() - now.getTime() >= hours * 3_600_000
}

/** Value of one day of a booking, after discount: only the meals it covers that day. */
export function dayValue(b: Subscription, date: string, dishes: Map<string, Dish>) {
  const wd = weekdayIndex(date)
  const gross = MEALS.filter((m) => covers(b, date, m)).reduce((t, m) => t + slotGross(b, wd, m, dishes), 0)
  return (gross * (100 - b.discount_pct)) / 100
}

/** Credit for not coming on [start, end]: the value of every booked day in the range not already skipped. */
export function skipCredit(subs: Subscription[], userId: string, start: string, end: string, dishes: Map<string, Dish>, skippedDays: Set<string> = new Set()) {
  let total = 0
  let days = 0
  for (let i = 0; i <= diffDays(start, end); i++) {
    const d = addDays(start, i)
    if (skippedDays.has(d)) continue
    const v = bookingsOn(subs, userId, d).filter((x) => x.source !== 'plan').reduce((t, b) => t + dayValue(b, d, dishes), 0)
    if (v > 0) { total += v; days++ }
  }
  return { credit: Math.round(total), days }
}

export const isUpcoming = (date: string) => date > today()

// ---------- Changing a booked menu ----------

const DEFAULT_START: Record<Meal, [number, number]> = { breakfast: [7, 30], lunch: [12, 0], snacks: [17, 0], dinner: [19, 30] }

/** When a meal starts, from timings like "12:00 – 3:00 PM" (same rule as radixo_meal_start in SQL). */
export function mealStart(date: string, meal: Meal, s?: Pick<Settings, 'breakfast_time' | 'lunch_time' | 'snacks_time' | 'dinner_time'> | null) {
  const t = s ? { breakfast: s.breakfast_time, lunch: s.lunch_time, snacks: s.snacks_time, dinner: s.dinner_time }[meal] : ''
  const [a = '', b = ''] = (t ?? '').replace(/[–—]/g, '-').split('-')
  const m = a.match(/(\d{1,2}):(\d{2})/)
  const [h, min] = m ? [Number(m[1]), Number(m[2])] : DEFAULT_START[meal]
  const pm = m ? /pm/i.test(a) || (!/am/i.test(a) && /pm/i.test(b)) : false
  const hour = m ? (h % 12) + (pm ? 12 : 0) : h
  const d = parseISODate(date)
  d.setHours(hour, min, 0, 0)
  return d
}

/** A meal is locked once it starts within LOCK_HOURS. */
export function slotLocked(weekStart: string, day: number, meal: Meal, s?: Parameters<typeof mealStart>[2], now = new Date()) {
  return mealStart(addDays(weekStart, day), meal, s).getTime() - now.getTime() < LOCK_HOURS * 3_600_000
}

/** Already paid for a week: the booking's weekly price plus approved extras and menu changes for that week. */
export function weekPaid(subs: Subscription[], payments: Payment[], userId: string, week: Pick<Week, 'id' | 'week_start'>, dishes: Map<string, Dish> | Record<string, Dish> = new Map()) {
  const changes = payments.filter((p) => p.user_id === userId && p.status === 'approved' && p.week_id === week.id && (p.details?.kind === 'extra' || p.details?.kind === 'change'))
  return weekCredit(subs, userId, week, dishes) + changes.reduce((s, p) => s + p.amount + (p.wallet_used ?? 0), 0)
}

/** A menu choice as plain slots {"day-meal": dish ids}, to compare and to edit dish by dish. */
export function choiceSlots(items: MenuItem[], packs: Pack[], sel: Pick<Selection, 'mode' | 'pack_id' | 'picks' | 'custom'> | null | undefined): CustomMenu {
  if (!sel) return {}
  if (sel.mode === 'custom') return Object.fromEntries(Object.entries(sel.custom ?? {}).filter(([, v]) => v.length))
  const pack = packs.find((p) => p.id === sel.pack_id)
  const out: CustomMenu = {}
  for (let day = 0; day < 7; day++) {
    for (const meal of MEALS) {
      if (pack && !pack.meals.includes(meal)) continue
      const ids = mealLines(items, day, meal).map((it) => (sel.picks?.[it.id] && it.dish_ids.includes(sel.picks[it.id]) ? sel.picks[it.id] : it.default_dish_id))
      if (ids.length) out[slotKey(day, meal)] = ids
    }
  }
  return out
}

/** Slots that differ between two menus. */
export function changedSlots(a: CustomMenu, b: CustomMenu) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  const norm = (v: string[] | undefined) => [...(v ?? [])].sort().join(',')
  return [...keys].filter((k) => norm(a[k]) !== norm(b[k]))
}
