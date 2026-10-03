// Booking rules: durations and discounts, booking dates, weekly carry-over, "not coming" credit.
// supabase/schema.sql implements the money parts (quote, skip credit) the same way, server-side.
import { addDays, diffDays, mondayOf, parseISODate, today, weekdayIndex } from './dates'
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

// ---------- Changing a booked menu ----------

/** Hours before a meal starts after which it can't be changed. */
export const CHANGE_LOCK_HOURS = 48

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

/** A meal is locked once it starts within CHANGE_LOCK_HOURS. */
export function slotLocked(weekStart: string, day: number, meal: Meal, s?: Parameters<typeof mealStart>[2], now = new Date()) {
  return mealStart(addDays(weekStart, day), meal, s).getTime() - now.getTime() < CHANGE_LOCK_HOURS * 3_600_000
}

/** Already paid for a week: the booking's weekly price plus approved extras and menu changes for that week. */
export function weekPaid(subs: Subscription[], payments: Payment[], userId: string, week: Pick<Week, 'id' | 'week_start'>) {
  const changes = payments.filter((p) => p.user_id === userId && p.status === 'approved' && p.week_id === week.id && (p.details?.kind === 'extra' || p.details?.kind === 'change'))
  return weekCredit(subs, userId, week) + changes.reduce((s, p) => s + p.amount + (p.wallet_used ?? 0), 0)
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
