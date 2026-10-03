// Demo versions of the server functions in supabase/migrations/002_bookings_wallet.sql (same rules, in memory).
import { addDays, diffDays, formatDate } from '../dates'
import { bookingDates, bookingStart, bookingTotal, changedSlots, coveredKeys, valueOver, choiceSlots, customMealsOf, customValue, dayValue, discountFor, effectiveSelection, skipAllowed, slotLocked, weekPaid } from '../booking'
import { DAY_NAMES } from '../dates'
import type { CustomMenu, Dish, Meal, MenuChoice, Payment, Pause, Subscription, Tables, TableName, Week } from '../types'

interface BookingQuote {
  kind: 'pack' | 'custom'; week_id: string; source: 'pack' | 'custom'; pack_id: string | null; pack_name: string; template: CustomMenu; meals: Meal[]
  weeks: number; weekly_price: number; discount_pct: number; start_date: string; start_meal: Meal; end_date: string; total: number; label: string
}
interface ExtraQuote { kind: 'extra'; week_id: string; total: number; label: string }

type DB = { tables: { [K in TableName]: Tables[K][] }; session: string | null; users: { id: string; email: string; password: string }[] }

const uuid = () => crypto.randomUUID()
const now = () => new Date().toISOString()
const durationLabel = (w: number) => ({ 1: '1 week', 4: '1 month', 13: '3 months', 26: '6 months' } as Record<number, string>)[w] ?? `${w} weeks`

function quote(db: DB, uid: string, spec: Record<string, unknown>): BookingQuote | ExtraQuote {
  const t = db.tables
  const s = t.settings[0]
  const dishes = Object.fromEntries(t.dishes.map((d) => [d.id, d])) as Record<string, Dish>
  const kind = String(spec.kind)
  const weeks = Math.min(26, Math.max(1, Number(spec.weeks ?? 1)))
  let week: Week | undefined, weekly: number, meals: Meal[], template: CustomMenu = {}, source: 'pack' | 'custom', name = '', packId: string | null = null
  if (kind === 'pack') {
    const pk = t.packs.find((p) => p.id === spec.pack_id)
    if (!pk || pk.price <= 0) throw new Error('This menu can’t be booked')
    week = t.weeks.find((w) => w.id === pk.week_id && w.status === 'published')
    weekly = pk.price; meals = pk.meals; source = 'pack'; name = pk.name; packId = pk.id
  } else if (kind === 'custom' || kind === 'extra') {
    week = t.weeks.find((w) => w.id === spec.week_id && w.status === 'published')
    const sel = t.selections.find((x) => x.user_id === uid && x.week_id === week?.id)
    if (!sel) throw new Error('Save your menu first')
    if (kind === 'extra') {
      const value = sel.mode === 'pack' ? t.packs.find((p) => p.id === sel.pack_id)?.price ?? 0 : customValue(sel.custom, dishes)
      const credit = t.subscriptions.filter((b) => b.user_id === uid && b.status === 'active' && b.start_date <= week!.week_start && b.end_date >= week!.week_start).reduce((a, b) => a + b.weekly_price, 0)
      return { kind: 'extra', week_id: week!.id, total: Math.max(0, value - credit), label: `Extra for week of ${formatDate(week!.week_start)}` }
    }
    weekly = customValue(sel.custom, dishes)
    if (weekly <= 0) throw new Error('Add some dishes first')
    template = sel.custom; source = 'custom'; name = 'My Menu'; meals = customMealsOf(sel.custom)
  } else throw new Error('Unknown booking')
  if (!week) throw new Error('That week isn’t open')
  const disc = discountFor(weeks, s)
  // Starts at the first meal 24 h+ away, after any current booking, or on a later chosen day; runs 7 × weeks days.
  const dates = bookingDates(bookingStart(t.subscriptions, uid, s, typeof spec.start_date === 'string' ? spec.start_date : null), weeks)
  return {
    kind: kind as 'pack' | 'custom', week_id: week.id, source, pack_id: packId, pack_name: name, template, meals, weeks, weekly_price: weekly, discount_pct: disc,
    ...dates, total: bookingTotal(weekly, weeks, disc), label: `${name} · ${durationLabel(weeks)}`,
  }
}

const balance = (db: DB, uid: string) => db.tables.wallet_txns.filter((x) => x.user_id === uid).reduce((a, x) => a + x.amount, 0)

function createBooking(db: DB, uid: string, q: BookingQuote | ExtraQuote, paymentId: string) {
  if (q.kind === 'extra') return
  const sub: Subscription = {
    id: uuid(), user_id: uid, plan_id: null, pack_id: q.pack_id, payment_id: paymentId, start_date: q.start_date, start_meal: q.start_meal, end_date: q.end_date, meals: q.meals,
    status: 'active', source: q.source, pack_name: q.pack_name, template: q.template, weeks: q.weeks, weekly_price: q.weekly_price, discount_pct: q.discount_pct, created_at: now(),
  }
  db.tables.subscriptions.push(sub)
  if (q.source === 'pack') {
    const pk = db.tables.packs.find((p) => p.id === q.pack_id)!
    const i = db.tables.selections.findIndex((x) => x.user_id === uid && x.week_id === pk.week_id)
    const row = { id: i >= 0 ? db.tables.selections[i].id : uuid(), user_id: uid, week_id: pk.week_id, mode: 'pack' as const, pack_id: pk.id, picks: pk.picks, custom: {}, updated_at: now() }
    if (i >= 0) db.tables.selections[i] = row
    else db.tables.selections.push(row)
  }
}

function applySelection(db: DB, uid: string, weekId: string, sel: MenuChoice) {
  const t = db.tables
  const i = t.selections.findIndex((x) => x.user_id === uid && x.week_id === weekId)
  const row = { id: i >= 0 ? t.selections[i].id : uuid(), user_id: uid, week_id: weekId, mode: sel.mode, pack_id: sel.pack_id, picks: sel.picks ?? {}, custom: sel.custom ?? {}, updated_at: now() }
  if (i >= 0) t.selections[i] = row
  else t.selections.push(row)
}

const isAdmin = (db: DB) => db.tables.profiles.find((p) => p.id === db.session)?.role === 'admin'

export function runLocalRpc(db: DB, fn: string, args: Record<string, unknown>): unknown {
  const uid = db.session
  if (!uid) throw new Error('Log in first')
  const t = db.tables
  const s = t.settings[0]

  if (fn === 'book') {
    const q = quote(db, uid, args.p_spec as Record<string, unknown>)
    if (q.total <= 0) throw new Error('Nothing to pay')
    const used = Math.min(Math.max(balance(db, uid), 0), q.total)
    const due = q.total - used
    const utr = String(args.p_utr ?? '').trim()
    if (due > 0 && !/^\d{12}$/.test(utr)) throw new Error('Enter the 12-digit UPI reference')
    if (due > 0 && t.payments.some((p) => p.utr === utr)) throw new Error('duplicate key value violates unique constraint "payments_utr_unique"')
    const pay: Payment = {
      id: uuid(), user_id: uid, plan_id: null, pack_id: q.kind === 'extra' ? null : q.pack_id, week_id: q.week_id, amount: due, wallet_used: used,
      method: due === 0 ? 'wallet' : 'upi', utr: due === 0 ? '' : utr, status: due === 0 ? 'approved' : 'pending', admin_note: due === 0 ? 'Paid from wallet' : '',
      details: q as Payment['details'], created_at: now(), reviewed_at: due === 0 ? now() : null,
    }
    t.payments.push(pay)
    if (used > 0) t.wallet_txns.push({ id: uuid(), user_id: uid, amount: -used, kind: 'payment', note: q.label, ref_id: pay.id, created_at: now() })
    if (due === 0) createBooking(db, uid, q, pay.id)
    return pay
  }

  if (fn === 'approve_payment' || fn === 'reject_payment') {
    if (!isAdmin(db)) throw new Error('Only the owner can review payments')
    const pay = t.payments.find((p) => p.id === args.p_id && p.status === 'pending')
    if (!pay) throw new Error('Payment not found or already reviewed')
    if (fn === 'approve_payment') {
      if (pay.details && (pay.details.kind === 'pack' || pay.details.kind === 'custom')) createBooking(db, pay.user_id, pay.details as unknown as BookingQuote, pay.id)
      if (pay.details?.kind === 'change' && pay.details.sel && pay.week_id) applySelection(db, pay.user_id, pay.week_id, pay.details.sel)
      Object.assign(pay, { status: 'approved', admin_note: String(args.p_note ?? ''), reviewed_at: now() })
    } else {
      if (pay.wallet_used > 0) t.wallet_txns.push({ id: uuid(), user_id: pay.user_id, amount: pay.wallet_used, kind: 'refund', note: 'Payment rejected', ref_id: pay.id, created_at: now() })
      Object.assign(pay, { status: 'rejected', admin_note: String(args.p_note || 'Payment not found'), reviewed_at: now() })
    }
    return pay
  }

  if (fn === 'mark_skip') {
    const start = String(args.p_start), end = String(args.p_end)
    if (end < start) throw new Error('The end date is before the start date')
    if (diffDays(start, end) > 60) throw new Error('Mark at most 60 days at a time')
    if (!skipAllowed(start, s.skip_notice_hours)) throw new Error(`Mark it at least ${s.skip_notice_hours} hours before the day starts`)
    const dishes = new Map(t.dishes.map((d) => [d.id, d]))
    let credit = 0
    let first: string | null = null
    for (let i = 0; i <= diffDays(start, end); i++) {
      const d = addDays(start, i)
      if (t.pauses.some((p) => p.user_id === uid && p.status === 'approved' && p.start_date <= d && p.end_date >= d)) continue
      // A day can be split between two bookings (one ends at lunch, the next starts): count each one's meals.
      for (const b of t.subscriptions.filter((x) => x.user_id === uid && x.status === 'active' && x.source !== 'plan' && x.start_date <= d && x.end_date >= d)) {
        const v = dayValue(b, d, dishes)
        if (v > 0) { credit += v; first ??= b.id }
      }
    }
    if (!first || Math.round(credit) <= 0) throw new Error('You have no booked meals on those days')
    const r: Pause = { id: uuid(), user_id: uid, subscription_id: first, credit: Math.round(credit), start_date: start, end_date: end, reason: String(args.p_reason ?? ''), status: 'approved', created_at: now() }
    t.pauses.push(r)
    t.wallet_txns.push({ id: uuid(), user_id: uid, amount: r.credit, kind: 'skip', note: `Not coming ${formatDate(start)}${end > start ? ` – ${formatDate(end)}` : ''}`, ref_id: r.id, created_at: now() })
    return r
  }

  if (fn === 'cancel_skip') {
    const r = t.pauses.find((p) => p.id === args.p_id && p.user_id === uid && p.status === 'approved')
    if (!r) throw new Error('Not found')
    if (!skipAllowed(r.start_date, s.skip_notice_hours)) throw new Error('It’s too late to undo this one')
    r.status = 'cancelled'
    t.wallet_txns.push({ id: uuid(), user_id: uid, amount: -r.credit, kind: 'skip_cancelled', note: 'Coming after all', ref_id: r.id, created_at: now() })
    return r
  }

  if (fn === 'change_menu') {
    const week = t.weeks.find((w) => w.id === args.p_week && w.status === 'published')
    if (!week) throw new Error('That week isn’t open')
    if (!t.subscriptions.some((b) => b.user_id === uid && b.status === 'active' && b.start_date <= addDays(week.week_start, 6) && b.end_date >= week.week_start)) throw new Error('Book a menu for this week first')
    const sel = args.p_sel as MenuChoice
    const dishes = Object.fromEntries(t.dishes.map((d) => [d.id, d])) as Record<string, Dish>
    const items = t.menu_items.filter((i) => i.week_id === week.id)
    const packs = t.packs.filter((p) => p.week_id === week.id)
    const saved = t.selections.find((x) => x.user_id === uid && x.week_id === week.id)
    const oldSlots = choiceSlots(items, packs, effectiveSelection({ userId: uid, week, items, packs, selection: saved, subs: t.subscriptions }))
    const newSlots = choiceSlots(items, packs, sel)
    if (!Object.keys(newSlots).length) throw new Error('Add some dishes first')
    for (const [k, ids] of Object.entries(newSlots)) {
      const [d, m] = k.split('-')
      const offered = items.filter((i) => i.day === Number(d) && i.meal === m).flatMap((i) => i.dish_ids)
      if (ids.some((id) => !offered.includes(id))) throw new Error('Some dishes aren’t on that day’s menu')
    }
    for (const k of changedSlots(oldSlots, newSlots)) {
      const [d, m] = k.split('-')
      if (slotLocked(week.week_start, Number(d), m as Meal, s)) throw new Error(`Meals starting within 24 hours can’t be changed (${m[0].toUpperCase() + m.slice(1)} on ${DAY_NAMES[Number(d)].slice(0, 3)})`)
    }
    if (sel.mode === 'pack' && !packs.some((p) => p.id === sel.pack_id)) throw new Error('That menu isn’t available')
    // Only meals inside the booking count: the new menu's value there, against what's paid or the current menu's value.
    const covered = coveredKeys(t.subscriptions, uid, week)
    const value = valueOver(newSlots, covered, dishes)
    // Pay only the difference from the menu they have now (a ready-made menu can be worth more than its price).
    const extra = Math.max(0, value - Math.max(weekPaid(t.subscriptions, t.payments, uid, week, dishes), valueOver(oldSlots, covered, dishes)))
    if (t.payments.some((p) => p.user_id === uid && p.week_id === week.id && p.status === 'pending' && p.details?.kind === 'change')) throw new Error('Your last menu change is waiting for its payment check. You can change again once it’s confirmed.')
    if (extra === 0) { applySelection(db, uid, week.id, sel); return { applied: true, extra: 0 } }
    const used = Math.min(Math.max(balance(db, uid), 0), extra)
    const due = extra - used
    const utr = String(args.p_utr ?? '').trim()
    if (due > 0 && !/^\d{12}$/.test(utr)) throw new Error('Enter the 12-digit UPI reference')
    if (due > 0 && t.payments.some((p) => p.utr === utr)) throw new Error('duplicate key value violates unique constraint "payments_utr_unique"')
    const label = `Menu change · week of ${formatDate(week.week_start)}`
    const pay: Payment = {
      id: uuid(), user_id: uid, plan_id: null, pack_id: null, week_id: week.id, amount: due, wallet_used: used, method: due === 0 ? 'wallet' : 'upi', utr: due === 0 ? '' : utr,
      status: due === 0 ? 'approved' : 'pending', admin_note: due === 0 ? 'Paid from wallet' : '', details: { kind: 'change', week_id: week.id, sel, total: extra, label } as Payment['details'],
      created_at: now(), reviewed_at: due === 0 ? now() : null,
    }
    t.payments.push(pay)
    if (used > 0) t.wallet_txns.push({ id: uuid(), user_id: uid, amount: -used, kind: 'payment', note: label, ref_id: pay.id, created_at: now() })
    if (due === 0) applySelection(db, uid, week.id, sel)
    return { applied: due === 0, extra, payment: pay }
  }

  if (fn === 'set_team_password') {
    if (!isAdmin(db)) throw new Error('Only the owner can set team passwords')
    const pw = String(args.p_password ?? '')
    if (pw.length < 8) throw new Error('Use at least 8 characters')
    const prof = t.profiles.find((p) => p.id === args.p_user)
    if (!prof) throw new Error('Member not found')
    if (prof.role === 'student') throw new Error('Make them staff first, then set a password')
    const u = db.users.find((x) => x.id === prof.id)
    if (u) u.password = pw
    return null
  }

  throw new Error(`Unknown function ${fn}`)
}
