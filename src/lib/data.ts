// Loaders and write actions used across screens.
import { api } from './backend'
import { defaultDeadline, today } from './dates'
import type { BookingSpec, CustomMenu, Meal, MenuItem, Pack, Pause, Payment, Picks, Plan, Selection, Settings, Week } from './types'

export const DEFAULT_SETTINGS: Settings = {
  id: 1, upi_id: '', upi_name: 'Radixo', whatsapp: '', address: '', discount_1m: 5, discount_3m: 8, discount_6m: 12, skip_notice_hours: 24,
  breakfast_time: '7:30 – 9:30 AM', lunch_time: '12:00 – 3:00 PM', snacks_time: '5:00 – 6:00 PM', dinner_time: '7:30 – 10:30 PM',
  attendance_factor: 0.8, buffer_pct: 10, min_pause_days: 4,
}

export async function loadSettings(): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...((await api.get('settings', 1)) ?? {}) }
}

export async function loadPlans(activeOnly = true): Promise<Plan[]> {
  const plans = await api.list('plans', { order: { col: 'position' } })
  return activeOnly ? plans.filter((p) => p.is_active) : plans
}

export async function loadMember(userId: string) {
  const [subs, payments, pauses, plans, settings, wallet] = await Promise.all([
    api.list('subscriptions', { eq: { user_id: userId } }),
    api.list('payments', { eq: { user_id: userId }, order: { col: 'created_at', asc: false } }),
    api.list('pauses', { eq: { user_id: userId }, order: { col: 'created_at', asc: false } }),
    loadPlans(false),
    loadSettings(),
    loadWallet(userId),
  ])
  return { subs, payments, pauses: pauses.filter((p) => p.status === 'approved' || p.status === 'requested'), allPauses: pauses, plans, settings, wallet }
}

export async function loadPublishedWeeks(): Promise<Week[]> {
  return api.list('weeks', { eq: { status: 'published' }, order: { col: 'week_start' } })
}

export async function loadWeekContent(weekId: string): Promise<{ items: MenuItem[]; packs: Pack[] }> {
  const [items, packs] = await Promise.all([
    api.list('menu_items', { eq: { week_id: weekId } }),
    api.list('packs', { eq: { week_id: weekId }, order: { col: 'position' } }),
  ])
  return { items, packs }
}

export async function loadDishMap() {
  const dishes = await api.list('dishes', { order: { col: 'name' } })
  return new Map(dishes.map((d) => [d.id, d]))
}

// ---------- Student actions ----------

export function savePicks(userId: string, weekId: string, mode: Selection['mode'], packId: string | null, picks: Picks, custom: CustomMenu = {}) {
  return api.upsert(
    'selections',
    { user_id: userId, week_id: weekId, mode, pack_id: mode === 'pack' ? packId : null, picks: mode === 'pack' ? picks : {}, custom: mode === 'custom' ? custom : {}, updated_at: new Date().toISOString() },
    ['user_id', 'week_id'],
  )
}

// ---------- Bookings & wallet (prices and credit are computed by the database) ----------

/** Book a menu (or pay a week's extra). The wallet is used first; `utr` is needed only for what's left. */
export function book(spec: BookingSpec, utr = '') {
  return api.rpc<Payment>('book', { p_spec: spec, p_utr: utr })
}

/** Mark "not coming" for a date range; the value of those days goes to the wallet. */
export function markSkip(start: string, end: string, reason = '') {
  return api.rpc<Pause>('mark_skip', { p_start: start, p_end: end, p_reason: reason })
}

export function cancelSkip(id: string) {
  return api.rpc<Pause>('cancel_skip', { p_id: id })
}

export async function loadWallet(userId: string) {
  const txns = await api.list('wallet_txns', { eq: { user_id: userId }, order: { col: 'created_at', asc: false } })
  return { txns, balance: txns.reduce((s, t) => s + t.amount, 0) }
}

// ---------- Admin actions ----------

export function approvePayment(payment: Payment, note = '') {
  return api.rpc<Payment>('approve_payment', { p_id: payment.id, p_note: note })
}

export function rejectPayment(payment: Payment, note: string) {
  return api.rpc<Payment>('reject_payment', { p_id: payment.id, p_note: note })
}

/** Cash at the counter (or any correction): money goes into the student's wallet. */
export function addWalletMoney(userId: string, amount: number, note: string) {
  return api.insert('wallet_txns', { user_id: userId, amount: Math.round(amount), kind: 'admin', note: note || 'Added by the owner', ref_id: null })
}

/** Owner sets the login password for a staff/owner account (their own included). */
export function setTeamPassword(userId: string, password: string) {
  return api.rpc<null>('set_team_password', { p_user: userId, p_password: password })
}

export async function checkIn(userId: string, meal: Meal, date = today()) {
  const existing = await api.list('attendance', { eq: { user_id: userId, date, meal } })
  if (existing.length) return { already: true as const, row: existing[0] }
  return { already: false as const, row: await api.insert('attendance', { user_id: userId, date, meal }) }
}

/** Create a new week by copying another week's menu lines and packs. */
export async function copyWeek(from: Week, weekStart: string) {
  const week = await api.insert('weeks', { week_start: weekStart, status: 'draft', choice_deadline: defaultDeadline(weekStart) })
  const { items, packs } = await loadWeekContent(from.id)
  const idMap = new Map<string, string>()
  for (const it of items) {
    const { id, ...rest } = it
    const created = await api.insert('menu_items', { ...rest, week_id: week.id })
    idMap.set(id, created.id)
  }
  for (const p of packs) {
    const picks: Picks = {}
    for (const [k, v] of Object.entries(p.picks)) if (idMap.has(k)) picks[idMap.get(k)!] = v
    await api.insert('packs', { week_id: week.id, name: p.name, tagline: p.tagline, picks, price: p.price, meals: p.meals, position: p.position })
  }
  return week
}

export async function createEmptyWeek(weekStart: string) {
  return api.insert('weeks', { week_start: weekStart, status: 'draft', choice_deadline: defaultDeadline(weekStart) })
}

