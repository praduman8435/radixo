// Local-time date helpers. Dates are stored as YYYY-MM-DD strings so they never shift across timezones.

export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
export const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function today(): string {
  return toISODate(new Date())
}

export function addDays(s: string, n: number): string {
  const d = parseISODate(s)
  d.setDate(d.getDate() + n)
  return toISODate(d)
}

/** Whole days from a to b (b − a). */
export function diffDays(a: string, b: string): number {
  return Math.round((parseISODate(b).getTime() - parseISODate(a).getTime()) / 86_400_000)
}

/** 0 = Monday … 6 = Sunday */
export function weekdayIndex(s: string): number {
  return (parseISODate(s).getDay() + 6) % 7
}

export function mondayOf(s: string): string {
  return addDays(s, -weekdayIndex(s))
}

export function formatDate(s: string, opts: { weekday?: boolean; year?: boolean } = {}): string {
  const d = parseISODate(s)
  const base = `${d.getDate()} ${MONTHS[d.getMonth()]}`
  const wd = opts.weekday ? `${DAY_SHORT[weekdayIndex(s)]}, ` : ''
  return wd + base + (opts.year ? ` ${d.getFullYear()}` : '')
}

export function formatWeekRange(weekStart: string): string {
  return `${formatDate(weekStart)} – ${formatDate(addDays(weekStart, 6))}`
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  const h = d.getHours()
  const time = `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
  return `${DAY_SHORT[(d.getDay() + 6) % 7]} ${d.getDate()} ${MONTHS[d.getMonth()]}, ${time}`
}

/** Default deadline for a week's picks: the Saturday before it, 8 pm local time. */
export function defaultDeadline(weekStart: string): string {
  const d = parseISODate(addDays(weekStart, -2))
  d.setHours(20, 0, 0, 0)
  return d.toISOString()
}

export function timeUntil(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return 'closed'
  const h = Math.floor(ms / 3_600_000)
  if (h >= 48) return `${Math.floor(h / 24)} days left`
  if (h >= 1) return `${h} h left`
  return `${Math.max(1, Math.floor(ms / 60_000))} min left`
}

/** Which meal is being served now: breakfast till 10:30, lunch till 3:30, snacks till 6:30, then dinner. */
export function currentMeal(): 'breakfast' | 'lunch' | 'snacks' | 'dinner' {
  const d = new Date()
  const m = d.getHours() * 60 + d.getMinutes()
  return m < 630 ? 'breakfast' : m < 930 ? 'lunch' : m < 1110 ? 'snacks' : 'dinner'
}
