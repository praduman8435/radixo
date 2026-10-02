import { Link } from 'react-router'
import { Users, UtensilsCrossed, BadgeCheck, Star, Trash2, MessageCircle, ArrowRight, CalendarClock, AlertTriangle } from 'lucide-react'
import { useAsync } from '../../lib/useAsync'
import { loadOps, students, whatsappLink } from '../../lib/admin'
import { addDays, currentMeal, diffDays, formatDate, formatDateTime, formatWeekRange, mondayOf, timeUntil, today } from '../../lib/dates'
import { MEAL_NAME, formatINR, isEligible, isLocked, memberState, paymentLabel, prepSheet } from '../../lib/logic'
import { api } from '../../lib/backend'
import { MEALS, type Meal } from '../../lib/types'
import { Avatar, Badge, Card, ErrorNote, LinkButton, PageHeader, PageLoader, Stat, cx } from '../../components/ui'

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

export default function Overview() {
  const q = useAsync(async () => {
    const ops = await loadOps()
    const t = today()
    const week = ops.weeks.find((w) => w.week_start === mondayOf(t))
    const items = week ? await api.list('menu_items', { eq: { week_id: week.id } }) : []
    const prep = MEALS.map((meal) => prepSheet({ date: t, meal, week, items, selections: ops.selections, subs: ops.subs, pauses: ops.pauses, attendance: ops.attendance, settings: ops.settings }))
    return { ops, prep }
  }, [])

  if (q.loading && !q.data) return <PageLoader />
  if (q.error) return <ErrorNote message={q.error} onRetry={q.reload} />
  const { ops, prep } = q.data!
  const t = today()
  const members = students(ops.profiles)
  const activeToday = members.filter((m) => MEALS.some((ml) => isEligible(m.id, t, ml, ops.subs, ops.pauses)))
  const checked = (meal: Meal) => ops.attendance.filter((a) => a.date === t && a.meal === meal).length
  const pendingPay = ops.payments.filter((p) => p.status === 'pending')
  const pendingPause = ops.pauses.filter((p) => p.status === 'requested')
  const openComplaints = ops.feedback.filter((f) => f.kind !== 'rating' && f.status === 'open')
  const week7 = addDays(t, -7)
  const ratings = ops.feedback.filter((f) => f.rating && f.date >= week7)
  const avgRating = ratings.length ? ratings.reduce((s, f) => s + (f.rating ?? 0), 0) / ratings.length : 0
  const w7 = ops.wastage.filter((w) => w.date >= week7)
  const cooked = w7.reduce((s, w) => s + w.cooked_kg, 0)
  const wastePct = cooked ? (w7.reduce((s, w) => s + w.wasted_kg, 0) / cooked) * 100 : 0
  const name = (id: string) => ops.byId.get(id)?.full_name ?? 'Member'

  // Renewals: plans ending in the next 5 days, or ended in the last 10 days, with nothing booked after.
  const renewals = members
    .map((m) => ({ m, s: memberState(m.id, ops.subs, ops.payments, ops.pauses, t) }))
    .filter(({ s }) => (s.kind === 'active' && s.daysLeft <= 5) || (s.kind === 'expired' && diffDays(s.sub.end_date, t) <= 10))
    .sort((a, b) => ('sub' in a.s && 'sub' in b.s ? (a.s.sub.end_date < b.s.sub.end_date ? -1 : 1) : 0))

  const nextWeek = ops.weeks.find((w) => w.week_start === addDays(mondayOf(t), 7))
  const nextPicked = nextWeek ? new Set(ops.selections.filter((s) => s.week_id === nextWeek.id).map((s) => s.user_id)) : new Set<string>()
  const activeNextWeek = nextWeek ? members.filter((m) => MEALS.some((ml) => isEligible(m.id, nextWeek.week_start, ml, ops.subs, ops.pauses))) : []

  return (
    <div className="animate-rise">
      <PageHeader title="Overview" subtitle={formatDate(t, { weekday: true, year: true })} actions={<LinkButton to="/admin/checkin">Open check-in <ArrowRight className="size-4" /></LinkButton>} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Active members" value={activeToday.length} hint={`${members.length} registered`} icon={<Users className="size-4" />} tone="brand" />
        <Card className="col-span-2 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-muted">
            <span className="grid size-7 place-items-center rounded-lg bg-amber-50 text-amber"><UtensilsCrossed className="size-4" /></span>
            Today&rsquo;s meals · checked in / expected
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2">
            {MEALS.map((meal, i) => (
              <div key={meal} className={cx('rounded-xl p-2.5', meal === currentMeal() ? 'bg-brand-50' : 'bg-sand/60')}>
                <p className={cx('text-xs font-semibold', meal === currentMeal() ? 'text-brand' : 'text-muted')}>{MEAL_NAME[meal]}</p>
                <p className="mt-0.5 font-display text-2xl font-bold tabular leading-none">{checked(meal)}<span className="text-base text-muted"> / {prep[i].expected}</span></p>
                <p className="mt-1 text-[11px] text-muted">{prep[i].members} on plan</p>
              </div>
            ))}
          </div>
        </Card>
        <Stat label="Waiting for you" value={pendingPay.length + pendingPause.length + openComplaints.length} hint={[plural(pendingPay.length, 'payment'), plural(pendingPause.length, 'pause'), plural(openComplaints.length, 'issue')].join(' · ')} icon={<BadgeCheck className="size-4" />} tone="blue" />
        <Stat label="Avg rating, 7 days" value={avgRating ? avgRating.toFixed(1) : '—'} hint={`${ratings.length} ratings`} icon={<Star className="size-4" />} tone="amber" />
        <Stat label="Wastage, 7 days" value={cooked ? `${wastePct.toFixed(1)}%` : '—'} hint={wastePct > 8 ? 'Above the 8% target' : 'Target: 8% or less'} icon={<Trash2 className="size-4" />} tone={wastePct > 8 ? 'red' : 'green'} />
        <Stat
          label="Next week's menu"
          value={nextWeek ? <>{nextPicked.size}<span className="text-lg text-muted"> / {activeNextWeek.length}</span></> : '—'}
          hint={nextWeek ? (isLocked(nextWeek) ? 'Choices closed' : `members chose · ${timeUntil(nextWeek.choice_deadline)}`) : 'Not created yet'}
          icon={<CalendarClock className="size-4" />}
          tone="green"
        />
        <Stat label="Collected, 30 days" value={formatINR(ops.payments.filter((p) => p.status === 'approved' && p.created_at.slice(0, 10) >= addDays(t, -30)).reduce((s, p) => s + p.amount, 0))} hint="Approved payments" icon={<BadgeCheck className="size-4" />} tone="green" />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold">Needs action</h2>
            <LinkButton to="/admin/approvals" variant="ghost" size="sm">Approvals <ArrowRight className="size-4" /></LinkButton>
          </div>
          {pendingPay.length + pendingPause.length + openComplaints.length === 0 ? (
            <p className="mt-4 rounded-xl bg-leaf-50 p-4 text-sm font-medium text-leaf">All clear. Nothing is waiting.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {pendingPay.map((p) => (
                <li key={p.id}>
                  <Link to="/admin/approvals" className="flex items-center gap-3 py-3 hover:opacity-80">
                    <Avatar name={name(p.user_id)} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold">{name(p.user_id)} paid {formatINR(p.amount)}</p>
                      <p className="truncate text-xs text-muted">{paymentLabel(p, ops.plans, ops.packs)} · UTR {p.utr} · {formatDateTime(p.created_at)}</p>
                    </div>
                    <Badge tone="amber">Payment</Badge>
                  </Link>
                </li>
              ))}
              {pendingPause.map((p) => (
                <li key={p.id}>
                  <Link to="/admin/approvals?tab=pauses" className="flex items-center gap-3 py-3 hover:opacity-80">
                    <Avatar name={name(p.user_id)} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold">{name(p.user_id)} wants to pause</p>
                      <p className="truncate text-xs text-muted">{formatDate(p.start_date)} – {formatDate(p.end_date)} · {p.reason || 'No reason given'}</p>
                    </div>
                    <Badge tone="blue">Pause</Badge>
                  </Link>
                </li>
              ))}
              {openComplaints.map((f) => (
                <li key={f.id}>
                  <Link to="/admin/feedback" className="flex items-center gap-3 py-3 hover:opacity-80">
                    <Avatar name={name(f.user_id)} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold">{f.comment}</p>
                      <p className="truncate text-xs text-muted">{name(f.user_id)} · {formatDate(f.date)} {f.meal}</p>
                    </div>
                    <Badge tone={f.kind === 'complaint' ? 'red' : 'neutral'} className="capitalize">{f.kind}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="font-display text-lg font-bold">Renewals to chase</h2>
          <p className="text-sm text-muted">Plans ending within 5 days, or ended in the last 10.</p>
          {renewals.length === 0 ? (
            <p className="mt-4 rounded-xl bg-sand p-4 text-sm text-muted">No renewals due.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {renewals.map(({ m, s }) => {
                const end = 'sub' in s ? s.sub.end_date : t
                const ended = s.kind === 'expired'
                return (
                  <li key={m.id} className="flex items-center gap-3 py-3">
                    <Avatar name={m.full_name} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold">{m.full_name}</p>
                      <p className="flex items-center gap-1 text-xs text-muted">
                        {ended && <AlertTriangle className="size-3.5 text-brand" />}
                        {ended ? `Ended ${formatDate(end)}` : `Ends ${formatDate(end, { weekday: true })}`} · {m.phone}
                      </p>
                    </div>
                    {m.phone && (
                      <a
                        href={whatsappLink(m.phone, `Hi ${m.full_name.split(' ')[0]}, your Radixo plan ${ended ? 'ended' : 'ends'} on ${formatDate(end)}. Renew on the app to keep your seat: ${location.origin}/wallet`)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-leaf px-3 text-sm font-semibold text-white hover:brightness-110"
                      >
                        <MessageCircle className="size-4" /> Remind
                      </a>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
          {nextWeek && <p className="mt-4 border-t border-line pt-3 text-xs text-muted">Menu {formatWeekRange(nextWeek.week_start)}: choices close {formatDateTime(nextWeek.choice_deadline)}.</p>}
        </Card>
      </div>
    </div>
  )
}
