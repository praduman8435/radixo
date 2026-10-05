import { useState } from 'react'
import { CalendarDays, Info, Package, Phone, Printer } from 'lucide-react'
import { api } from '../../lib/backend'
import { useAsync } from '../../lib/useAsync'
import { loadOps } from '../../lib/admin'
import { loadDishMap } from '../../lib/data'
import { addDays, currentMeal, formatDate, today, weekdayIndex } from '../../lib/dates'
import { dishesFor, isChoice, isEligible, prepSheet, weekForDate, MEAL_NAME, MEAL_OPTIONS } from '../../lib/logic'
import { effectiveSelection } from '../../lib/booking'
import { formatPhone } from '../../lib/phone'
import type { Meal } from '../../lib/types'
import { Card, EmptyState, ErrorNote, PageHeader, PageLoader, Segmented, cx } from '../../components/ui'
import { DishImage } from '../../components/DishImage'

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
  const sheet = prepSheet({ date, meal, week, items, selections: ops.selections, subs: ops.subs, pauses: ops.pauses, attendance: ops.attendance, settings: ops.settings, packs: ops.packs })
  const totalCook = sheet.lines.reduce((n, l) => n + l.dishes.reduce((m, d) => m + d.cook, 0), 0)

  // Tiffins to pack: members on tiffin booked for this meal, with what goes in each box.
  const tiffins = week
    ? ops.profiles
        .filter((p) => p.role === 'student' && p.meal_mode === 'tiffin' && isEligible(p.id, date, meal, ops.subs, ops.pauses))
        .map((p) => {
          const saved = ops.selections.find((x) => x.user_id === p.id && x.week_id === week.id)
          const sel = effectiveSelection({ userId: p.id, week, items, packs: ops.packs.filter((x) => x.week_id === week.id), selection: saved, subs: ops.subs })
          return { p, dishNames: dishesFor(items, weekdayIndex(date), meal, sel).map((id) => dishes.get(id)?.name).filter(Boolean) as string[] }
        })
        .filter((t) => t.dishNames.length)
    : []

  const dayChip = (d: string, label: string) => (
    <button type="button" onClick={() => setDate(d)} aria-pressed={date === d} className={cx('h-9 rounded-full px-4 text-sm font-semibold transition-colors', date === d ? 'bg-ink text-white' : 'bg-paper text-ink/75 ring-1 ring-line hover:bg-sand')}>{label}</button>
  )

  return (
    <div className="animate-rise">
      <PageHeader
        title="Kitchen prep"
        subtitle="What to cook, from bookings and past attendance."
        actions={<button type="button" onClick={() => window.print()} className="no-print grid size-10 place-items-center rounded-xl bg-paper ring-1 ring-line hover:bg-sand" aria-label="Print"><Printer className="size-[18px]" /></button>}
      />

      {/* Pick the day and meal */}
      <div className="no-print mb-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {dayChip(today(), 'Today')}
          {dayChip(addDays(today(), 1), 'Tomorrow')}
          <label className={cx('relative inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold ring-1', date !== today() && date !== addDays(today(), 1) ? 'bg-ink text-white ring-ink' : 'bg-paper text-ink/75 ring-line')}>
            <CalendarDays className="size-4" />
            {date !== today() && date !== addDays(today(), 1) ? formatDate(date, { weekday: true }) : 'Pick a day'}
            <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Date" />
          </label>
        </div>
        <Segmented full value={meal} onChange={setMeal} options={MEAL_OPTIONS} />
      </div>

      <h2 className="mb-3 hidden text-2xl font-semibold print:block">Radixo prep · {formatDate(date, { weekday: true })} · {MEAL_NAME[meal]}</h2>

      {/* The headline: how much to cook */}
      <Card className="mb-5 overflow-hidden">
        <div className="flex items-end justify-between gap-4 p-4 sm:p-5">
          <div>
            <p className="text-sm font-medium text-muted">{MEAL_NAME[meal]} · {formatDate(date, { weekday: true })}</p>
            <p className="mt-1 text-[34px] font-semibold leading-none tracking-tight tabular">{sheet.expected}<span className="ml-2 text-base font-medium text-muted">expected to eat</span></p>
          </div>
          {totalCook > 0 && <p className="text-right text-sm text-muted"><span className="block text-xl font-semibold text-ink tabular">{totalCook}</span>portions, all dishes</p>}
        </div>
        <div className="grid grid-cols-3 divide-x divide-line border-t border-line bg-cream/60 text-center">
          <div className="px-2 py-2.5"><p className="text-[15px] font-semibold tabular">{sheet.members}</p><p className="text-[11px] text-muted">booked</p></div>
          <div className="px-2 py-2.5"><p className="text-[15px] font-semibold tabular">{Math.round(sheet.rate * 100)}%</p><p className="text-[11px] text-muted">{sheet.rateSource === 'history' ? 'usually come' : 'default rate'}</p></div>
          <div className="px-2 py-2.5"><p className="text-[15px] font-semibold tabular">+{ops.settings.buffer_pct}%</p><p className="text-[11px] text-muted">extra buffer</p></div>
        </div>
      </Card>

      {!week ? (
        <Card><EmptyState title="No menu for this date">Create the week in Weekly menu first.</EmptyState></Card>
      ) : sheet.lines.length === 0 ? (
        <Card><EmptyState title={`No ${MEAL_NAME[meal].toLowerCase()} on this day`} /></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {sheet.lines.map(({ item, dishes: ds }) => (
            <Card key={item.id} className="overflow-hidden">
              <div className="flex items-center justify-between gap-2 border-b border-line bg-cream/60 px-4 py-2">
                <p className="text-sm font-semibold">{item.label}</p>
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">{isChoice(item) ? `${ds.length} options` : 'Fixed'}</span>
              </div>
              <ul className="divide-y divide-line">
                {ds.map((d) => {
                  const dish = dishes.get(d.dishId)
                  return (
                    <li key={d.dishId} className={cx('flex items-center gap-3 px-4 py-3', d.cook === 0 && 'opacity-50')}>
                      {dish && <DishImage dish={dish} className="size-10 shrink-0 rounded-lg" />}
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{dish?.name}</p>
                        <p className="text-xs text-muted">{d.chosen} chose{item.default_dish_id === d.dishId && isChoice(item) ? ' · default' : ''}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[26px] font-semibold leading-none tabular">{d.cook}</p>
                        <p className="text-[11px] text-muted">cook</p>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </Card>
          ))}
        </div>
      )}

      {tiffins.length > 0 && (
        <section className="mt-6">
          <div className="mb-3 flex items-center gap-2">
            <Package className="size-[18px] text-brand" />
            <h3 className="text-[17px] font-semibold">Tiffins to pack · {tiffins.length}</h3>
          </div>
          <p className="mb-3 text-sm text-muted">Already counted in the portions above. No delivery charge.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {tiffins.map(({ p, dishNames }) => (
              <Card key={p.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{p.full_name} <span className="font-mono text-xs font-normal text-muted">{p.member_code}</span></p>
                    <p className={cx('mt-0.5 text-sm', p.address ? 'text-ink/80' : 'text-brand')}>{p.address || 'No address yet'}</p>
                  </div>
                  {p.phone && <a href={`tel:${p.phone}`} className="grid size-9 shrink-0 place-items-center rounded-full bg-sand text-ink/70 hover:bg-line" aria-label={`Call ${formatPhone(p.phone)}`}><Phone className="size-4" /></a>}
                </div>
                <p className="mt-2 rounded-lg bg-cream px-3 py-2 text-sm text-ink/80">{dishNames.join(' · ')}</p>
              </Card>
            ))}
          </div>
        </section>
      )}

      <p className="mt-5 flex items-start gap-2 text-sm text-muted">
        <Info className="mt-0.5 size-4 shrink-0" />
        Members who didn&rsquo;t choose get the default dish. Rotis are made fresh at the counter, so cook them to demand.
      </p>
    </div>
  )
}
