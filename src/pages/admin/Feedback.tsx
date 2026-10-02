import { useState } from 'react'
import { Star, CheckCircle2, Inbox } from 'lucide-react'
import { api } from '../../lib/backend'
import { useAsync } from '../../lib/useAsync'
import { loadOps } from '../../lib/admin'
import { addDays, formatDate, today } from '../../lib/dates'
import { MEALS, type Feedback, type Meal } from '../../lib/types'
import { MEAL_NAME } from '../../lib/logic'
import { Avatar, Badge, Button, Card, EmptyState, ErrorNote, PageHeader, PageLoader, Segmented, Stat } from '../../components/ui'
import { useToast } from '../../components/toast'

type Filter = 'open' | 'complaints' | 'ratings' | 'all'

export default function AdminFeedback() {
  const toast = useToast()
  const q = useAsync(() => loadOps(), [])
  const [filter, setFilter] = useState<Filter>('open')
  const [replies, setReplies] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)

  if (q.loading && !q.data) return <PageLoader />
  if (q.error) return <ErrorNote message={q.error} onRetry={q.reload} />
  const ops = q.data!
  const all = ops.feedback
  const shown = all.filter((f) =>
    filter === 'open' ? f.kind !== 'rating' && f.status === 'open' : filter === 'complaints' ? f.kind !== 'rating' : filter === 'ratings' ? f.kind === 'rating' : true,
  )
  const since = addDays(today(), -14)
  const avg = (meal?: Meal) => {
    const r = all.filter((f) => f.rating && (!meal || f.meal === meal) && f.date >= since)
    return r.length ? { v: r.reduce((s, f) => s + (f.rating ?? 0), 0) / r.length, n: r.length } : null
  }
  const overall = avg()
  const lowest = MEALS.map((m) => ({ m, a: avg(m) })).filter((x) => x.a).sort((a, b) => a.a!.v - b.a!.v)[0]

  async function resolve(f: Feedback) {
    setBusy(f.id)
    try {
      await api.update('feedback', f.id, { status: 'resolved', admin_reply: (replies[f.id] ?? '').trim() })
      toast('Marked resolved')
      q.reload()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not save', 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="animate-rise">
      <PageHeader title="Feedback" subtitle="Reply to every complaint within 24 hours; students see your reply in the app." />
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Rating, 14 days" value={overall ? overall.v.toFixed(1) : '—'} hint={overall ? `${overall.n} ratings` : 'No ratings yet'} icon={<Star className="size-4" />} tone="amber" />
        <Stat label="Weakest meal" value={lowest ? MEAL_NAME[lowest.m] : '—'} hint={lowest ? `${lowest.a!.v.toFixed(1)} from ${lowest.a!.n} ratings` : 'No ratings yet'} icon={<Star className="size-4" />} tone="red" />
        <Stat label="Open issues" value={all.filter((f) => f.kind !== 'rating' && f.status === 'open').length} hint="complaints + suggestions" icon={<Inbox className="size-4" />} tone="red" />
      </div>
      <Segmented size="sm" className="mb-4" value={filter} onChange={setFilter} options={[{ value: 'open', label: 'Open' }, { value: 'complaints', label: 'Complaints & ideas' }, { value: 'ratings', label: 'Ratings' }, { value: 'all', label: 'All' }]} />

      {shown.length === 0 ? <Card><EmptyState icon={<CheckCircle2 className="size-6" />} title="Nothing here" /></Card> : (
        <ul className="space-y-3">
          {shown.map((f) => {
            const who = ops.byId.get(f.user_id)
            return (
              <li key={f.id}>
                <Card className="p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <Avatar name={who?.full_name ?? ''} className="size-9" />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{who?.full_name ?? 'Member'}</p>
                      <p className="text-xs text-muted">{formatDate(f.date, { weekday: true })} · <span className="capitalize">{f.meal}</span></p>
                    </div>
                    {f.rating && <span className="flex items-center gap-1 font-bold"><Star className="size-4 fill-turmeric text-turmeric" /> {f.rating}</span>}
                    <Badge tone={f.kind === 'complaint' ? 'red' : f.kind === 'suggestion' ? 'blue' : 'neutral'} className="capitalize">{f.kind}</Badge>
                    {f.kind !== 'rating' && <Badge tone={f.status === 'open' ? 'amber' : 'green'} className="capitalize">{f.status}</Badge>}
                  </div>
                  {f.comment && <p className="mt-3 text-[15px]">{f.comment}</p>}
                  {f.admin_reply && <p className="mt-3 rounded-xl bg-leaf-50 p-3 text-sm text-leaf"><span className="font-semibold">Your reply:</span> {f.admin_reply}</p>}
                  {f.kind !== 'rating' && f.status === 'open' && (
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <input
                        value={replies[f.id] ?? ''}
                        onChange={(e) => setReplies({ ...replies, [f.id]: e.target.value })}
                        placeholder="Reply to the student (what you changed)"
                        aria-label="Reply"
                        className="h-10 flex-1 rounded-xl border border-line bg-paper px-3 text-sm focus:border-brand focus:outline-none"
                      />
                      <Button size="sm" className="h-10" loading={busy === f.id} onClick={() => resolve(f)}>Reply &amp; resolve</Button>
                    </div>
                  )}
                </Card>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
