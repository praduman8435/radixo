// Admin-side loaders: one call that gathers what the operations screens need.
import { api } from './backend'
import { addDays, today } from './dates'
import { loadPlans, loadSettings } from './data'
import type { Profile } from './types'

export async function loadOps(opts: { attendanceDays?: number } = {}) {
  const since = addDays(today(), -(opts.attendanceDays ?? 35))
  const [profiles, subs, payments, pauses, plans, settings, weeks, attendance, selections, feedback, wastage, packs, wallet_txns] = await Promise.all([
    api.list('profiles', { order: { col: 'full_name' } }),
    api.list('subscriptions'),
    api.list('payments', { order: { col: 'created_at', asc: false } }),
    api.list('pauses', { order: { col: 'created_at', asc: false } }),
    loadPlans(false),
    loadSettings(),
    api.list('weeks', { order: { col: 'week_start' } }),
    api.list('attendance', { gte: { date: since } }),
    api.list('selections'),
    api.list('feedback', { order: { col: 'created_at', asc: false } }),
    api.list('wastage', { order: { col: 'date', asc: false } }),
    api.list('packs'),
    api.list('wallet_txns', { order: { col: 'created_at', asc: false } }),
  ])
  const byId = new Map(profiles.map((p) => [p.id, p]))
  const walletOf = (uid: string) => wallet_txns.filter((t) => t.user_id === uid).reduce((n, t) => n + t.amount, 0)
  return { profiles, byId, subs, payments, pauses, plans, settings, weeks, attendance, selections, feedback, wastage, packs, wallet_txns, walletOf }
}

export type Ops = Awaited<ReturnType<typeof loadOps>>

export const students = (profiles: Profile[]) => profiles.filter((p) => p.role === 'student')

export function whatsappLink(phone: string, text: string) {
  const digits = phone.replace(/\D/g, '')
  const intl = digits.length === 10 ? `91${digits}` : digits
  return `https://wa.me/${intl}?text=${encodeURIComponent(text)}`
}
