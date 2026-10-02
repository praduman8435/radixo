import { useState } from 'react'
import { Printer, Info } from 'lucide-react'
import { api } from '../../lib/backend'
import { useAsync } from '../../lib/useAsync'
import { loadOps } from '../../lib/admin'
import { loadDishMap } from '../../lib/data'
import { addDays, currentMeal, formatDate, today } from '../../lib/dates'
import { isChoice, prepSheet, weekForDate, MEAL_OPTIONS } from '../../lib/logic'
import type { Meal } from '../../lib/types'
import { Badge, Button, Card, EmptyState, ErrorNote, Input, PageHeader, PageLoader, Segmented } from '../../components/ui'

export default function Prep() {
  const [date, setDate] = useState(() => (new Date().getHours() >= 21 ? addDays(today(), 1) : today()))
  const [meal, setMeal] = useState<Meal>(currentMeal())

  const q = useAsync(async () => {
    const [ops, dishes] = await Promise.all([loadOps({ attendanceDays: 60 }), loadDishMap()])
    const week = weekForDate(ops.weeks, date)
    const items = week ? await api.list('menu_items', { eq: { week_id: week.id } }) : []
    return { ops, dishes, week, items }
  }, [date])

  if (q.loading && !q.data) return <PageLoader />
  if (q.error) return <ErrorNote message={q.error} onRetry={q.reload} />
  const { ops, dishes, week, items } = q.data!
  const sheet = prepSheet({ date, meal, week, items, selections: ops.selections, subs: ops.subs, pauses: ops.pauses, attendance: ops.attendance, settings: ops.settings })
  const chose = week ? new Set(ops.selections.filter((s) => s.week_id === week.id).map((s) => s.user_id)) : new Set<string>()

  return (
    <div className="animate-rise">
      <PageHeader
        title="Kitchen prep"
        subtitle="Portions to cook, from members' picks and past attendance."
        actions={<Button variant="secondary" onClick={() => window.print()} className="no-print"><Printer className="size-4" /> Print</Button>}
      />

      <div className="no-print mb-5 flex flex-wrap items-end gap-3">
        <div className="w-44"><Input label="Date" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} /></div>
        <Segmented value={meal} onChange={setMeal} options={MEAL_OPTIONS} />
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={() => setDate(today())}>Today</Button>
          <Button variant="ghost" size="sm" onClick={() => setDate(addDays(today(), 1))}>Tomorrow</Button>
        </div>
      </div>

      <h2 className="mb-3 hidden font-display text-2xl font-bold print:block">Radixo prep · {formatDate(date, { weekday: true })} · {meal}</h2>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-4"><p className="text-sm text-muted">Members on plan</p><p className="font-display text-3xl font-bold tabular">{sheet.members}</p></Card>
        <Card className="p-4"><p className="text-sm text-muted">Expected to eat</p><p className="font-display text-3xl font-bold tabular">{sheet.expected}</p></Card>
        <Card className="p-4">
          <p className="text-sm text-muted">Attendance rate</p>
          <p className="font-display text-3xl font-bold tabular">{Math.round(sheet.rate * 100)}%</p>
          <p className="text-xs text-muted">{sheet.rateSource === 'history' ? 'avg of last 4 same days' : 'default from settings'}</p>
        </Card>
        <Card className="p-4"><p className="text-sm text-muted">Buffer</p><p className="font-display text-3xl font-bold tabular">+{ops.settings.buffer_pct}%</p></Card>
      </div>

      {!week ? (
        <Card><EmptyState title="No menu for this date">Create the week in Weekly menu first.</EmptyState></Card>
      ) : sheet.lines.length === 0 ? (
        <Card><EmptyState title={`No ${meal} lines on this day`} /></Card>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-left text-[15px]">
            <thead className="bg-sand/70 text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-semibold">Line</th>
                <th className="px-4 py-3 font-semibold">Dish</th>
                <th className="px-4 py-3 text-right font-semibold">Members</th>
                <th className="px-4 py-3 text-right font-semibold">Cook (portions)</th>
              </tr>
            </thead>
            <tbody>
              {sheet.lines.map(({ item, dishes: ds }) =>
                ds.map((d, i) => (
                  <tr key={item.id + d.dishId} className={i === 0 ? 'border-t border-line' : ''}>
                    {i === 0 && <td rowSpan={ds.length} className="px-4 py-3 align-top font-semibold text-muted">{item.label}{isChoice(item) && <Badge tone="blue" className="ml-2">choice</Badge>}</td>}
                    <td className="px-4 py-3 font-semibold">{dishes.get(d.dishId)?.name}{item.default_dish_id === d.dishId && isChoice(item) && <span className="ml-1.5 text-xs font-medium text-muted">default</span>}</td>
                    <td className="px-4 py-3 text-right tabular text-muted">{d.chosen}</td>
                    <td className="px-4 py-3 text-right font-display text-xl font-bold tabular">{d.cook}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </Card>
      )}

      <p className="mt-4 flex items-start gap-2 text-sm text-muted">
        <Info className="mt-0.5 size-4 shrink-0" />
        Members who didn&rsquo;t choose get the default dish. {chose.size} members chose this week. Rotis are made fresh at the counter, so cook them to demand.
      </p>
    </div>
  )
}
