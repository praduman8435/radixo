import { api } from '../../../lib/backend'
import { useAsync } from '../../../lib/useAsync'
import { loadDishMap, loadMember, loadPublishedWeeks, loadSettings, loadWeekContent } from '../../../lib/data'
import { addDays, today } from '../../../lib/dates'
import { bookingsInWeek, effectiveSelection, firstOpenSlot, weekOpen, weekPaid } from '../../../lib/booking'
import type { CustomMenu, MenuChoice, MenuItem, Pack, Selection, Settings, Subscription, Week } from '../../../lib/types'

/**
 * The week to show: the one asked for, else (for a member) the first week they're booked in that still has open
 * meals, else the week holding the next meal that can be booked (24 h+ away), else the next published week.
 */
export function pickWeek(weeks: Week[], requested?: string | null, settings?: Settings | null, member?: { userId: string; subs: Subscription[] } | null) {
  const visible = weeks.filter((w) => addDays(w.week_start, 6) >= today())
  const open = visible.filter((w) => weekOpen(w, settings))
  const first = firstOpenSlot(settings).date
  return (
    visible.find((w) => w.id === requested) ??
    (member ? open.find((w) => bookingsInWeek(member.subs, member.userId, w).length > 0) : undefined) ??
    open.find((w) => w.week_start <= first && addDays(w.week_start, 6) >= first) ??
    open[0] ??
    visible[visible.length - 1]
  )
}

/** Everything the menu screens need for one week, plus the student's own data when logged in (uid). */
export function useMenuData(uid: string | null, weekParam?: string | null) {
  return useAsync(async () => {
    const [weeks, dishes, settings, member] = await Promise.all([loadPublishedWeeks(), loadDishMap(), loadSettings(), uid ? loadMember(uid) : Promise.resolve(null)])
    const week = pickWeek(weeks, weekParam, settings, uid && member ? { userId: uid, subs: member.subs } : null)
    const empty = { week: undefined, weeks, dishes, settings, member, items: [] as MenuItem[], packs: [] as Pack[], selection: null, saved: null, credit: 0, booked: false, pendingChange: null, following: null }
    if (!week) return empty
    // The next published week too: a 7-day booking that starts mid-week runs into it.
    const nextWeek = weeks.find((w) => w.week_start === addDays(week.week_start, 7)) ?? null
    const [{ items, packs }, sel, nextContent] = await Promise.all([
      loadWeekContent(week.id),
      uid ? api.list('selections', { eq: { user_id: uid, week_id: week.id } }) : Promise.resolve([] as Selection[]),
      nextWeek ? loadWeekContent(nextWeek.id) : Promise.resolve(null),
    ])
    const saved = sel[0] ?? null
    // A booking carries its menu into weeks the student hasn't edited yet.
    const selection = uid && member ? effectiveSelection({ userId: uid, week, items, packs, selection: saved, subs: member.subs }) : saved
    // Booked in this week: changes are allowed until 24 h before each meal; `credit` is what's already paid for it.
    const booked = !!(uid && member && bookingsInWeek(member.subs, uid, week).length > 0)
    const credit = uid && member ? weekPaid(member.subs, member.payments, uid, week, dishes) : 0
    const pendingChange = member?.payments.find((p) => p.week_id === week.id && p.status === 'pending' && p.details?.kind === 'change') ?? null
    const following = nextWeek && nextContent ? { week: nextWeek, items: nextContent.items } : null
    return { week, weeks, dishes, settings, member, items, packs, selection, saved, credit, booked, pendingChange, following }
  }, [uid, weekParam])
}

/** A menu change waiting to be paid at checkout (/wallet?change=week). */
export const changeKey = (weekId: string) => `radixo-change-${weekId}`
export function stashChange(weekId: string, choice: MenuChoice) {
  try { localStorage.setItem(changeKey(weekId), JSON.stringify(choice)) } catch { /* private mode */ }
}

/** Unsaved custom menus live on the phone per week, so guests keep their picks through login. */
export const draftKey = (weekId: string) => `radixo-draft-${weekId}`
export function readDraft(weekId: string): CustomMenu | null {
  try {
    const raw = localStorage.getItem(draftKey(weekId))
    return raw ? (JSON.parse(raw) as CustomMenu) : null
  } catch {
    return null
  }
}
