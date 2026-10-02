// Loaders and write actions used across screens.
import { api } from './backend'
import { addDays, defaultDeadline, today } from './dates'
import { customMeals, nextSubscriptionDates, pauseDays, weekBookingDates, weekPlanMeals } from './logic'
import type { CustomMenu, Meal, MenuItem, Pack, Pause, Payment, Picks, Plan, Selection, Settings, Subscription, Week } from './types'

export const DEFAULT_SETTINGS: Settings = {
  id: 1, upi_id: '', upi_name: 'Radixo', whatsapp: '', address: '',
  breakfast_time: '7:30 – 9:30 AM', lunch_time: '12:00 – 3:00 PM', snacks_time: '5:00 – 6:00 PM', dinner_time: '7:30 – 10:30 PM',
  attendance_factor: 0.8, buffer_pct: 10, min_pause_days: 4,
}

export async function loadSettings(): Promise<Settings> {
  return (await api.get('settings', 1)) ?? DEFAULT_SETTINGS
}

export async function loadPlans(activeOnly = true): Promise<Plan[]> {
  const plans = await api.list('plans', { order: { col: 'position' } })
  return activeOnly ? plans.filter((p) => p.is_active) : plans
}

export async function loadMember(userId: string) {
  const [subs, payments, pauses, plans, settings] = await Promise.all([
    api.list('subscriptions', { eq: { user_id: userId } }),
    api.list('payments', { eq: { user_id: userId }, order: { col: 'created_at', asc: false } }),
    api.list('pauses', { eq: { user_id: userId }, order: { col: 'created_at', asc: false } }),
    loadPlans(false),
    loadSettings(),
  ])
  return { subs, payments, pauses, plans, settings }
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

/** What a payment is for: a plan, a ready-made menu for its week, or the student's custom menu for a week. */
export type Purchase = { kind: 'plan'; plan: Plan } | { kind: 'pack'; pack: Pack; amount: number } | { kind: 'custom'; weekId: string; amount: number }

export function submitPayment(userId: string, what: Purchase, utr: string) {
  return api.insert('payments', {
    user_id: userId,
    plan_id: what.kind === 'plan' ? what.plan.id : null,
    pack_id: what.kind === 'pack' ? what.pack.id : null,
    week_id: what.kind === 'pack' ? what.pack.week_id : what.kind === 'custom' ? what.weekId : null,
    amount: what.kind === 'plan' ? what.plan.price : what.amount,
    method: 'upi', utr: utr.trim(), status: 'pending', admin_note: '', reviewed_at: null,
  })
}

export function requestPause(userId: string, subId: string, start: string, end: string, reason: string) {
  return api.insert('pauses', { user_id: userId, subscription_id: subId, start_date: start, end_date: end, reason, status: 'requested' })
}

// ---------- Admin actions ----------

/** Approve a payment and start what it paid for: a plan (after any current one) or a week of menu. */
export async function approvePayment(payment: Payment, note = '') {
  if (payment.plan_id) {
    const plan = await api.get('plans', payment.plan_id)
    if (!plan) throw new Error('That plan no longer exists.')
    const subs = await api.list('subscriptions', { eq: { user_id: payment.user_id } })
    const dates = nextSubscriptionDates(subs, payment.user_id, plan)
    await api.insert('subscriptions', { user_id: payment.user_id, plan_id: plan.id, pack_id: null, payment_id: payment.id, ...dates, meals: plan.meals, status: 'active' })
  } else if (payment.week_id) {
    const week = await api.get('weeks', payment.week_id)
    if (!week) throw new Error('That week no longer exists.')
    let meals: Meal[]
    if (payment.pack_id) {
      const pack = await api.get('packs', payment.pack_id)
      if (!pack) throw new Error('That menu no longer exists.')
      meals = pack.meals
      // Booking a ready-made menu also sets it as the student's menu for that week.
      await savePicks(payment.user_id, week.id, 'pack', pack.id, pack.picks)
    } else {
      const sel = (await api.list('selections', { eq: { user_id: payment.user_id, week_id: week.id } }))[0]
      const covered = weekPlanMeals(await api.list('subscriptions', { eq: { user_id: payment.user_id } }), payment.user_id, week)
      const all = sel ? customMeals(sel.custom ?? {}) : []
      meals = all.filter((m) => !covered.includes(m))
      if (meals.length === 0) meals = all
      if (meals.length === 0) throw new Error('The student’s custom menu for that week is empty.')
    }
    await api.insert('subscriptions', { user_id: payment.user_id, plan_id: null, pack_id: payment.pack_id, payment_id: payment.id, ...weekBookingDates(week), meals, status: 'active' })
  }
  return api.update('payments', payment.id, { status: 'approved', admin_note: note, reviewed_at: new Date().toISOString() })
}

export function rejectPayment(payment: Payment, note: string) {
  return api.update('payments', payment.id, { status: 'rejected', admin_note: note, reviewed_at: new Date().toISOString() })
}

/** Record a cash payment at the counter and activate the plan immediately. */
export async function recordCashPayment(userId: string, plan: Plan) {
  const p = await api.insert('payments', {
    user_id: userId, plan_id: plan.id, pack_id: null, week_id: null, amount: plan.price, method: 'cash', utr: '', status: 'pending', admin_note: 'Cash at counter', reviewed_at: null,
  })
  return approvePayment(p, 'Cash at counter')
}

/** Approving a pause pushes the plan's end date out by the paused days. */
export async function approvePause(pause: Pause) {
  const sub = await api.get('subscriptions', pause.subscription_id)
  if (sub) {
    const later = (await api.list('subscriptions', { eq: { user_id: pause.user_id } })).filter((s: Subscription) => s.start_date > sub.end_date && s.status === 'active')
    const n = pauseDays(pause)
    await api.update('subscriptions', sub.id, { end_date: addDays(sub.end_date, n) })
    // Renewals queued after this plan shift too, so they stay back to back.
    for (const s of later) await api.update('subscriptions', s.id, { start_date: addDays(s.start_date, n), end_date: addDays(s.end_date, n) })
  }
  return api.update('pauses', pause.id, { status: 'approved' })
}

export function rejectPause(pause: Pause) {
  return api.update('pauses', pause.id, { status: 'rejected' })
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

