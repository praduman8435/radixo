import { api } from '../../../lib/backend'
import { useAsync } from '../../../lib/useAsync'
import { loadDishMap, loadMember, loadPublishedWeeks, loadWeekContent } from '../../../lib/data'
import { addDays, mondayOf, today } from '../../../lib/dates'
import { isLocked } from '../../../lib/logic'
import type { CustomMenu, MenuItem, Pack, Selection, Week } from '../../../lib/types'

/** The week students should be choosing for: the next open week, else this week. */
export function pickWeek(weeks: Week[], requested?: string | null) {
  const visible = weeks.filter((w) => addDays(w.week_start, 6) >= today())
  return (
    visible.find((w) => w.id === requested) ??
    visible.find((w) => !isLocked(w) && w.week_start > mondayOf(today())) ??
    visible.find((w) => !isLocked(w)) ??
    visible.find((w) => w.week_start === mondayOf(today())) ??
    visible[0]
  )
}

/** Everything the menu screens need for one week, plus the student's own data when logged in (uid). */
export function useMenuData(uid: string | null, weekParam?: string | null) {
  return useAsync(async () => {
    const [weeks, dishes, member] = await Promise.all([loadPublishedWeeks(), loadDishMap(), uid ? loadMember(uid) : Promise.resolve(null)])
    const week = pickWeek(weeks, weekParam)
    if (!week) return { week: undefined, weeks, dishes, member, items: [] as MenuItem[], packs: [] as Pack[], selection: null }
    const [{ items, packs }, sel] = await Promise.all([loadWeekContent(week.id), uid ? api.list('selections', { eq: { user_id: uid, week_id: week.id } }) : Promise.resolve([] as Selection[])])
    return { week, weeks, dishes, member, items, packs, selection: sel[0] ?? null }
  }, [uid, weekParam])
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
