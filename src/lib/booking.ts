// Booking rules: durations and discounts, booking dates, weekly carry-over, "not coming" credit.
// supabase/schema.sql implements the money parts (quote, skip credit) the same way, server-side.
import { addDays, diffDays, mondayOf, parseISODate, today, weekdayIndex } from './dates'
import { mealLines, slotCatalog } from './logic'
import { MEALS, slotKey, type CustomMenu, type Dish, type Meal, type MenuItem, type Pack, type Selection, type Settings, type Subscription, type Week } from './types'

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

/** Bookings that cover a date. */
export const bookingsOn = (subs: Subscription[], userId: string, date: string) =>
  subs.filter((s) => s.user_id === userId && s.status === 'active' && s.start_date <= date && s.end_date >= date)

/** A new booking starts on the chosen week's Monday, or the Monday after the member's last booking ends. */
export function bookingStart(subs: Subscription[], userId: string, weekStart: string) {
  const lastEnd = subs.filter((s) => s.user_id === userId && s.status === 'active' && s.end_date >= weekStart).reduce<string | null>((m, s) => (!m || s.end_date > m ? s.end_date : m), null)
  return lastEnd ? mondayOf(addDays(lastEnd, 7)) : weekStart
}

/** Value already paid for a week (menu price, before discount): edits up to this are free. */
export function weekCredit(subs: Subscription[], userId: string, week: Pick<Week, 'week_start'>) {
  return bookingsOn(subs, userId, week.week_start).reduce((s, b) => s + b.weekly_price, 0)
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
  const b = bookingsOn(subs, userId, week.week_start).find((x) => x.source !== 'plan') ?? bookingsOn(subs, userId, addDays(week.week_start, 6)).find((x) => x.source !== 'plan')
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

/** Value of one day of a booking: pack = a seventh of the week; custom = that day's share of the template. */
export function dayValue(b: Subscription, date: string, dishes: Map<string, Dish>) {
  const net = weeklyNet(b)
  if (b.source !== 'custom') return net / 7
  const wd = weekdayIndex(date)
  const weekTotal = customValue(b.template ?? {}, dishes)
  if (!weekTotal) return 0
  const dayTotal = MEALS.reduce((s, m) => s + (b.template?.[slotKey(wd, m)] ?? []).reduce((t, id) => t + (dishes.get(id)?.price ?? 0), 0), 0)
  return (net * dayTotal) / weekTotal
}

/** Credit for not coming on [start, end]: the value of every booked day in the range not already skipped. */
export function skipCredit(subs: Subscription[], userId: string, start: string, end: string, dishes: Map<string, Dish>, skippedDays: Set<string> = new Set()) {
  let total = 0
  let days = 0
  for (let i = 0; i <= diffDays(start, end); i++) {
    const d = addDays(start, i)
    if (skippedDays.has(d)) continue
    const b = bookingsOn(subs, userId, d).find((x) => x.source !== 'plan')
    if (!b) continue
    const v = dayValue(b, d, dishes)
    if (v > 0) { total += v; days++ }
  }
  return { credit: Math.round(total), days }
}

export const isUpcoming = (date: string) => date > today()
