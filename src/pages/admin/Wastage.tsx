import { useState, type FormEvent } from 'react'
import { api } from '../../lib/backend'
import { useAsync } from '../../lib/useAsync'
import { MEAL_NAME, MEAL_OPTIONS } from '../../lib/logic'
import { addDays, currentMeal, formatDate, today } from '../../lib/dates'
import type { Meal } from '../../lib/types'
import { Button, Card, EmptyState, ErrorNote, Input, PageHeader, PageLoader, Segmented, Stat, cx } from '../../components/ui'
import { useToast } from '../../components/toast'

const TARGET = 8 // % of cooked food

export default function Wastage() {
  const toast = useToast()
  const q = useAsync(() => api.list('wastage', { gte: { date: addDays(today(), -30) }, order: { col: 'date', asc: false } }), [])
  const [f, setF] = useState({ date: today(), meal: currentMeal() as Meal, cooked: '', wasted: '', notes: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  if (q.loading && !q.data) return <PageLoader />
  if (q.error) return <ErrorNote message={q.error} onRetry={q.reload} />
  const rows = q.data!

  async function submit(e: FormEvent) {
    e.preventDefault()
    const cooked = Number(f.cooked)
    const wasted = Number(f.wasted)
    if (!(cooked > 0)) return setErr('Enter how much was cooked, in kg.')
    if (!(wasted >= 0) || wasted > cooked) return setErr('Wasted must be between 0 and the cooked amount.')
    setBusy(true)
    try {
      await api.upsert('wastage', { date: f.date, meal: f.meal, cooked_kg: cooked, wasted_kg: wasted, notes: f.notes.trim() }, ['date', 'meal'])
      toast(`Logged ${f.meal} on ${formatDate(f.date)}`)
      setF({ ...f, cooked: '', wasted: '', notes: '' })
      setErr('')
      q.reload()
    } catch (er) {
      toast(er instanceof Error ? er.message : 'Could not save', 'error')
    } finally {
      setBusy(false)
    }
  }

  const sum = (from: string) => {
    const r = rows.filter((w) => w.date >= from)
    const c = r.reduce((s, w) => s + w.cooked_kg, 0)
    return c ? (r.reduce((s, w) => s + w.wasted_kg, 0) / c) * 100 : null
  }
  const w7 = sum(addDays(today(), -7))
  const w30 = sum(addDays(today(), -30))

  return (
    <div className="animate-rise">
      <PageHeader title="Wastage" subtitle={`Weigh leftovers after every service. Target: ${TARGET}% or less of what was cooked.`} />
      <div className="grid gap-5 lg:grid-cols-[1fr_1.3fr]">
        <div className="min-w-0 space-y-4">
          <Card className="p-4 sm:p-5">
            <form onSubmit={submit} className="space-y-4">
              <Input label="Date" type="date" value={f.date} max={today()} onChange={(e) => setF({ ...f, date: e.target.value })} />
              <Segmented full value={f.meal} onChange={(meal) => setF({ ...f, meal })} options={MEAL_OPTIONS} />
              <div className="grid grid-cols-2 gap-3">
                <Input label="Cooked (kg)" inputMode="decimal" value={f.cooked} onChange={(e) => setF({ ...f, cooked: e.target.value })} placeholder="e.g. 42" />
                <Input label="Wasted (kg)" inputMode="decimal" value={f.wasted} onChange={(e) => setF({ ...f, wasted: e.target.value })} placeholder="e.g. 2.5" />
              </div>
              <Input label="Notes (optional)" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="e.g. Rice left over, rain kept people away" error={err} />
              <Button type="submit" loading={busy} className="w-full">Save entry</Button>
              <p className="text-xs text-muted">Saving the same date and meal again replaces that entry.</p>
            </form>
          </Card>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Last 7 days" value={w7 === null ? '—' : `${w7.toFixed(1)}%`} tone={w7 !== null && w7 > TARGET ? 'red' : 'green'} />
            <Stat label="Last 30 days" value={w30 === null ? '—' : `${w30.toFixed(1)}%`} tone={w30 !== null && w30 > TARGET ? 'red' : 'green'} />
          </div>
        </div>

        <Card className="p-5">
          <h2 className="font-display text-lg font-bold">Recent services</h2>
          {rows.length === 0 ? <EmptyState title="No entries yet" /> : (
            <ul className="mt-3 space-y-2.5">
              {rows.slice(0, 28).map((w) => {
                const pct = (w.wasted_kg / w.cooked_kg) * 100
                const over = pct > TARGET
                return (
                  <li key={w.id} className="grid grid-cols-[96px_1fr_56px] items-center gap-3 text-sm">
                    <span className="text-muted">{formatDate(w.date)} · {MEAL_NAME[w.meal].slice(0, 1)}</span>
                    <div className="relative h-6 overflow-hidden rounded-lg bg-sand" title={`${w.wasted_kg} kg of ${w.cooked_kg} kg${w.notes ? ` · ${w.notes}` : ''}`}>
                      <div className={cx('h-full rounded-lg', over ? 'bg-brand/70' : 'bg-leaf/60')} style={{ width: `${Math.min(100, (pct / 20) * 100)}%` }} />
                      <div className="absolute inset-y-0 border-l-2 border-dashed border-ink/30" style={{ left: `${(TARGET / 20) * 100}%` }} aria-hidden />
                      <span className="absolute inset-y-0 right-2 flex items-center text-xs text-muted tabular">{w.wasted_kg} / {w.cooked_kg} kg</span>
                    </div>
                    <span className={cx('text-right font-semibold tabular', over ? 'text-brand' : 'text-leaf')}>{pct.toFixed(1)}%</span>
                  </li>
                )
              })}
            </ul>
          )}
          <p className="mt-4 text-xs text-muted">B = breakfast, L = lunch, S = snacks, D = dinner. Bar scale 0–20%; the dashed line is the {TARGET}% target.</p>
        </Card>
      </div>
    </div>
  )
}
