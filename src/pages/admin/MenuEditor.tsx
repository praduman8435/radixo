import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { ArrowDown, ArrowUp, CalendarPlus, Eye, EyeOff, Plus, Star, Trash2, X } from 'lucide-react'
import { api } from '../../lib/backend'
import { useAsync } from '../../lib/useAsync'
import { copyWeek, createEmptyWeek, loadWeekContent } from '../../lib/data'
import { DAY_NAMES, DAY_SHORT, addDays, formatDateTime, formatWeekRange, mondayOf, parseISODate, today } from '../../lib/dates'
import { MEAL_NAME, isChoice, mealLines } from '../../lib/logic'
import { MEALS, type Dish, type DishCategory, type Meal, type MenuItem, type Pack, type Week } from '../../lib/types'
import { Badge, Button, Card, EmptyState, ErrorNote, Input, Modal, PageHeader, PageLoader, Segmented, Select, cx } from '../../components/ui'
import { useToast } from '../../components/toast'

const LINE_PRESETS: { label: string; category: DishCategory }[] = [
  { label: 'Breakfast', category: 'breakfast' },
  { label: 'Snack', category: 'snack' },
  { label: 'Drink', category: 'drink' },
  { label: 'Dal', category: 'dal' },
  { label: 'Sabzi', category: 'sabzi' },
  { label: 'Special', category: 'special' },
  { label: 'Roti', category: 'bread' },
  { label: 'Rice', category: 'rice' },
  { label: 'Side', category: 'side' },
  { label: 'Sweet', category: 'sweet' },
]
const categoryFor = (label: string) => LINE_PRESETS.find((p) => p.label.toLowerCase() === label.toLowerCase())?.category

const toLocalInput = (iso: string) => {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function MenuEditor() {
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const weeksQ = useAsync(async () => {
    const [weeks, dishes, selections] = await Promise.all([api.list('weeks', { order: { col: 'week_start' } }), api.list('dishes', { order: { col: 'name' } }), api.list('selections')])
    return { weeks, dishes, selections }
  }, [])
  const weeks = weeksQ.data?.weeks ?? []
  const weekId = params.get('week') ?? (weeks.find((w) => w.week_start === addDays(mondayOf(today()), 7)) ?? weeks.find((w) => w.week_start === mondayOf(today())) ?? weeks.at(-1))?.id
  const week = weeks.find((w) => w.id === weekId)
  const content = useAsync(async () => (weekId ? loadWeekContent(weekId) : null), [weekId])

  const [tab, setTab] = useState<'menu' | 'packs'>('menu')
  const [day, setDay] = useState(0)
  const [newOpen, setNewOpen] = useState(false)
  const [deadline, setDeadline] = useState('')

  useEffect(() => {
    if (week) setDeadline(toLocalInput(week.choice_deadline))
  }, [week])

  if (weeksQ.loading && !weeksQ.data) return <PageLoader />
  if (weeksQ.error) return <ErrorNote message={weeksQ.error} onRetry={weeksQ.reload} />
  const { dishes, selections } = weeksQ.data!
  const dishMap = new Map(dishes.map((d) => [d.id, d]))

  async function act(fn: () => Promise<unknown>, msg?: string) {
    try {
      await fn()
      if (msg) toast(msg)
      content.reload()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Something went wrong', 'error')
    }
  }

  async function updateWeek(patch: Partial<Week>, msg: string) {
    if (!week) return
    try {
      await api.update('weeks', week.id, patch)
      toast(msg)
      weeksQ.reload()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not save', 'error')
    }
  }

  const header = (
    <PageHeader
      title="Weekly menu"
      subtitle="Set the options for every meal. Students pick one dish per choice line."
      actions={<Button onClick={() => setNewOpen(true)}><CalendarPlus className="size-4" /> New week</Button>}
    />
  )

  if (!week) {
    return (
      <div>
        {header}
        <Card><EmptyState icon={<CalendarPlus className="size-6" />} title="No weeks yet" action={<Button onClick={() => setNewOpen(true)}>Create the first week</Button>}>Create a week, add its menu, then publish it so students can choose.</EmptyState></Card>
        <NewWeekModal open={newOpen} onClose={() => setNewOpen(false)} weeks={weeks} onCreated={(w) => { setNewOpen(false); weeksQ.reload(); setParams({ week: w.id }) }} />
      </div>
    )
  }

  const items = content.data?.items ?? []
  const packs = content.data?.packs ?? []
  const chose = selections.filter((s) => s.week_id === week.id).length

  return (
    <div className="animate-rise">
      {header}

      <div className="mb-4 -mx-4 overflow-x-auto px-4">
        <Segmented
          value={week.id}
          onChange={(id) => setParams({ week: id })}
          options={weeks.slice(-6).map((w) => ({ value: w.id, label: <span className="flex items-center gap-1.5">{formatWeekRange(w.week_start)}{w.status === 'draft' && <span className="size-1.5 rounded-full bg-amber" aria-label="draft" />}</span> }))}
        />
      </div>

      <Card className="mb-5 flex flex-wrap items-end gap-4 p-4">
        <div>
          <p className="text-sm font-semibold text-muted">Status</p>
          <div className="mt-1 flex items-center gap-2">
            {week.status === 'published' ? <Badge tone="green">Published</Badge> : <Badge tone="amber">Draft: students can&rsquo;t see it</Badge>}
            <Button size="sm" variant={week.status === 'published' ? 'secondary' : 'primary'} onClick={() => updateWeek({ status: week.status === 'published' ? 'draft' : 'published' }, week.status === 'published' ? 'Week unpublished' : 'Week published')}>
              {week.status === 'published' ? <><EyeOff className="size-4" /> Unpublish</> : <><Eye className="size-4" /> Publish</>}
            </Button>
          </div>
        </div>
        <div className="w-60">
          <Input
            label="Choices close"
            type="datetime-local"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            onBlur={() => deadline && new Date(deadline).toISOString() !== week.choice_deadline && updateWeek({ choice_deadline: new Date(deadline).toISOString() }, `Choices close ${formatDateTime(new Date(deadline).toISOString())}`)}
          />
        </div>
        <p className="text-sm text-muted"><span className="font-semibold text-ink">{chose}</span> members have chosen for this week.</p>
      </Card>

      <Segmented className="mb-4" value={tab} onChange={setTab} options={[{ value: 'menu', label: 'Day by day' }, { value: 'packs', label: `Ready-made menus (${packs.length})` }]} />

      {content.loading && !content.data ? <PageLoader /> : content.error ? <ErrorNote message={content.error} onRetry={content.reload} /> : tab === 'menu' ? (
        <>
          <div className="-mx-4 mb-4 overflow-x-auto px-4">
            <div className="flex gap-2" role="tablist">
              {DAY_SHORT.map((d, i) => (
                <button key={d} type="button" role="tab" aria-selected={day === i} onClick={() => setDay(i)} className={cx('flex min-w-[64px] flex-col items-center rounded-2xl border px-3 py-2', day === i ? 'border-ink bg-ink text-white' : 'border-line bg-paper hover:border-muted/50')}>
                  <span className={cx('text-xs font-semibold', day === i ? 'text-white/70' : 'text-muted')}>{d}</span>
                  <span className="font-display text-lg font-bold">{parseISODate(addDays(week.week_start, i)).getDate()}</span>
                  <span className={cx('text-[10px] font-semibold', day === i ? 'text-white/70' : 'text-muted')}>{items.filter((it) => it.day === i).length} lines</span>
                </button>
              ))}
            </div>
          </div>
          <h2 className="mb-3 font-display text-xl font-bold">{DAY_NAMES[day]}</h2>
          <div className="grid gap-4 lg:grid-cols-2">
            {MEALS.map((meal) => (
              <MealEditor key={meal + day} weekId={week.id} day={day} meal={meal} lines={mealLines(items, day, meal)} dishes={dishes} dishMap={dishMap} act={act} />
            ))}
          </div>
        </>
      ) : (
        <PacksEditor weekId={week.id} items={items} packs={packs} dishMap={dishMap} act={act} />
      )}

      <NewWeekModal open={newOpen} onClose={() => setNewOpen(false)} weeks={weeks} onCreated={(w) => { setNewOpen(false); weeksQ.reload(); setParams({ week: w.id }) }} />
    </div>
  )
}

type Act = (fn: () => Promise<unknown>, msg?: string) => Promise<void>

function MealEditor({ weekId, day, meal, lines, dishes, dishMap, act }: { weekId: string; day: number; meal: Meal; lines: MenuItem[]; dishes: Dish[]; dishMap: Map<string, Dish>; act: Act }) {
  const [adding, setAdding] = useState('')

  async function addLine(label: string) {
    const cat = categoryFor(label)
    const first = dishes.find((d) => d.is_active && (!cat || d.category === cat)) ?? dishes.find((d) => d.is_active)
    if (!first) return
    await act(() => api.insert('menu_items', { week_id: weekId, day, meal, label, dish_ids: [first.id], default_dish_id: first.id, position: lines.length }), `${label} line added`)
    setAdding('')
  }

  async function move(it: MenuItem, dir: -1 | 1) {
    const j = lines.indexOf(it) + dir
    const other = lines[j]
    if (!other) return
    await act(async () => {
      await api.update('menu_items', it.id, { position: other.position })
      await api.update('menu_items', other.id, { position: it.position === other.position ? it.position + dir : it.position })
    })
  }

  return (
    <Card className="p-4 sm:p-5">
      <p className="font-display text-lg font-bold">{MEAL_NAME[meal]}</p>
      <div className="mt-3 space-y-3">
        {lines.length === 0 && <p className="rounded-xl bg-sand p-3 text-sm text-muted">Not served this day. Add a line to offer {MEAL_NAME[meal].toLowerCase()}.</p>}
        {lines.map((it, idx) => {
          const cat = categoryFor(it.label)
          const options = dishes.filter((d) => d.is_active && !it.dish_ids.includes(d.id)).sort((a, b) => Number(b.category === cat) - Number(a.category === cat) || a.name.localeCompare(b.name))
          return (
            <div key={it.id} className="rounded-2xl border border-line p-3">
              <div className="flex items-center gap-2">
                <input
                  defaultValue={it.label}
                  aria-label="Line name"
                  onBlur={(e) => e.target.value.trim() && e.target.value !== it.label && act(() => api.update('menu_items', it.id, { label: e.target.value.trim() }))}
                  className="h-8 w-32 rounded-lg border border-transparent bg-transparent px-2 text-sm font-bold hover:border-line focus:border-brand focus:outline-none"
                />
                {isChoice(it) ? <Badge tone="blue">Choice of {it.dish_ids.length}</Badge> : <Badge>Fixed</Badge>}
                <div className="ml-auto flex">
                  <button type="button" disabled={idx === 0} onClick={() => move(it, -1)} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-sand disabled:opacity-30" aria-label="Move up"><ArrowUp className="size-4" /></button>
                  <button type="button" disabled={idx === lines.length - 1} onClick={() => move(it, 1)} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-sand disabled:opacity-30" aria-label="Move down"><ArrowDown className="size-4" /></button>
                  <button type="button" onClick={() => confirm(`Remove the ${it.label} line?`) && act(() => api.remove('menu_items', it.id), 'Line removed')} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-brand-50 hover:text-brand" aria-label="Remove line"><Trash2 className="size-4" /></button>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {it.dish_ids.map((id) => {
                  const isDefault = it.default_dish_id === id
                  return (
                    <span key={id} className={cx('inline-flex items-center gap-1 rounded-xl border py-1 pl-1.5 pr-1 text-sm font-semibold', isDefault ? 'border-turmeric bg-turmeric-50' : 'border-line bg-paper')}>
                      <button
                        type="button"
                        title={isDefault ? 'Default dish' : 'Make default'}
                        aria-label={isDefault ? 'Default dish' : `Make ${dishMap.get(id)?.name} the default`}
                        onClick={() => !isDefault && act(() => api.update('menu_items', it.id, { default_dish_id: id }))}
                        className="grid size-6 place-items-center rounded-lg hover:bg-sand"
                      >
                        <Star className={cx('size-3.5', isDefault ? 'fill-turmeric text-turmeric' : 'text-muted')} />
                      </button>
                      {dishMap.get(id)?.name ?? 'Unknown dish'}
                      {it.dish_ids.length > 1 && (
                        <button
                          type="button"
                          aria-label={`Remove ${dishMap.get(id)?.name}`}
                          onClick={() => {
                            const rest = it.dish_ids.filter((x) => x !== id)
                            void act(() => api.update('menu_items', it.id, { dish_ids: rest, default_dish_id: isDefault ? rest[0] : it.default_dish_id }))
                          }}
                          className="grid size-6 place-items-center rounded-lg text-muted hover:bg-brand-50 hover:text-brand"
                        >
                          <X className="size-3.5" />
                        </button>
                      )}
                    </span>
                  )
                })}
                {it.dish_ids.length < 4 && (
                  <select
                    value=""
                    aria-label="Add an option"
                    onChange={(e) => e.target.value && act(() => api.update('menu_items', it.id, { dish_ids: [...it.dish_ids, e.target.value] }))}
                    className="h-8 rounded-xl border border-dashed border-muted/50 bg-transparent px-2 text-sm font-semibold text-muted hover:border-brand hover:text-brand focus:outline-none"
                  >
                    <option value="">+ Add option</option>
                    {options.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Select aria-label="New line" value={adding} onChange={(e) => setAdding(e.target.value)} className="h-9 w-40 text-sm">
          <option value="">Add a line…</option>
          {LINE_PRESETS.map((p) => <option key={p.label} value={p.label}>{p.label}</option>)}
        </Select>
        <Button size="sm" variant="secondary" disabled={!adding} onClick={() => addLine(adding)}><Plus className="size-4" /> Add</Button>
      </div>
      <p className="mt-2 text-xs text-muted">★ = default dish, served to members who don&rsquo;t choose. Up to 4 options per line.</p>
    </Card>
  )
}

function PacksEditor({ weekId, items, packs, dishMap, act }: { weekId: string; items: MenuItem[]; packs: Pack[]; dishMap: Map<string, Dish>; act: Act }) {
  const choiceLines = items.filter(isChoice).sort((a, b) => a.day - b.day || MEALS.indexOf(a.meal) - MEALS.indexOf(b.meal) || a.position - b.position)

  async function addPack() {
    const picks: Record<string, string> = {}
    for (const it of choiceLines) picks[it.id] = it.default_dish_id
    await act(() => api.insert('packs', { week_id: weekId, name: 'New menu', tagline: 'Describe it in a few words', picks, price: 0, meals: ['lunch', 'dinner'], position: packs.length }), 'Menu added')
  }

  if (choiceLines.length === 0) return <Card><EmptyState title="Add some choice lines first">Ready-made menus pick one dish on every line that has 2+ options.</EmptyState></Card>

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">Each column is a ready-made menu. Set a weekly price to let students book it on its own; pick the meals it covers.</p>
        <Button size="sm" onClick={addPack}><Plus className="size-4" /> Add menu</Button>
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-sand/70">
            <tr>
              <th className="sticky left-0 bg-sand px-3 py-3 text-xs font-semibold uppercase tracking-wide text-muted">Line</th>
              {packs.map((p) => (
                <th key={p.id} className="min-w-48 px-3 py-2 align-top">
                  <div className="flex items-center gap-1">
                    <input defaultValue={p.name} aria-label="Menu name" onBlur={(e) => e.target.value.trim() && e.target.value !== p.name && act(() => api.update('packs', p.id, { name: e.target.value.trim() }))} className="h-8 w-full rounded-lg border border-transparent bg-transparent px-1.5 font-display text-base font-bold hover:border-line focus:border-brand focus:bg-paper focus:outline-none" />
                    <button type="button" onClick={() => confirm(`Delete ${p.name}?`) && act(() => api.remove('packs', p.id), 'Menu deleted')} className="grid size-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-brand-50 hover:text-brand" aria-label={`Delete ${p.name}`}><Trash2 className="size-4" /></button>
                  </div>
                  <input defaultValue={p.tagline} aria-label="Tagline" onBlur={(e) => e.target.value !== p.tagline && act(() => api.update('packs', p.id, { tagline: e.target.value }))} className="h-7 w-full rounded-lg border border-transparent bg-transparent px-1.5 text-xs font-medium text-muted hover:border-line focus:border-brand focus:bg-paper focus:outline-none" />
                  <label className="mt-1 flex items-center gap-1.5 px-1.5 text-xs font-semibold text-muted">
                    ₹/week
                    <input type="number" min={0} defaultValue={p.price || ''} placeholder="0 = not bookable" aria-label={`${p.name} weekly price`} onBlur={(e) => Number(e.target.value) !== p.price && act(() => api.update('packs', p.id, { price: Math.max(0, Number(e.target.value) || 0) }), 'Price saved')} className="h-7 w-24 rounded-lg border border-line bg-paper px-2 text-sm font-semibold text-ink focus:border-brand focus:outline-none" />
                  </label>
                  <div className="mt-1.5 flex flex-wrap gap-1 px-1.5">
                    {MEALS.map((m) => {
                      const on = p.meals.includes(m)
                      return (
                        <button key={m} type="button" aria-pressed={on} onClick={() => act(() => api.update('packs', p.id, { meals: on ? p.meals.filter((x) => x !== m) : MEALS.filter((x) => x === m || p.meals.includes(x)) }))} className={cx('rounded-md border px-1.5 py-0.5 text-[11px] font-bold', on ? 'border-brand bg-brand-50 text-brand' : 'border-line text-muted')}>
                          {MEAL_NAME[m].slice(0, 5)}
                        </button>
                      )
                    })}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {choiceLines.map((it) => (
              <tr key={it.id}>
                <td className="sticky left-0 bg-paper px-3 py-2 font-semibold whitespace-nowrap">{DAY_SHORT[it.day]} · <span className="capitalize">{it.meal}</span> · {it.label}</td>
                {packs.map((p) => {
                  const v = p.picks[it.id] && it.dish_ids.includes(p.picks[it.id]) ? p.picks[it.id] : it.default_dish_id
                  return (
                    <td key={p.id} className="px-3 py-1.5">
                      <select value={v} aria-label={`${p.name}: ${DAY_SHORT[it.day]} ${it.meal} ${it.label}`} onChange={(e) => act(() => api.update('packs', p.id, { picks: { ...p.picks, [it.id]: e.target.value } }))} className="h-9 w-full rounded-lg border border-line bg-paper px-2 text-sm focus:border-brand focus:outline-none">
                        {it.dish_ids.map((id) => <option key={id} value={id}>{dishMap.get(id)?.name}</option>)}
                      </select>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

function NewWeekModal({ open, onClose, weeks, onCreated }: { open: boolean; onClose: () => void; weeks: Week[]; onCreated: (w: Week) => void }) {
  const toast = useToast()
  const latest = weeks.at(-1)
  const suggested = latest ? addDays(latest.week_start, 7) : addDays(mondayOf(today()), 7)
  const [start, setStart] = useState(suggested)
  const [from, setFrom] = useState(latest?.id ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (open) {
      setStart(suggested)
      setFrom(latest?.id ?? '')
      setErr('')
    }
  }, [open, suggested, latest?.id])

  async function create() {
    const monday = mondayOf(start)
    if (weeks.some((w) => w.week_start === monday)) return setErr('That week already exists.')
    setBusy(true)
    try {
      const src = weeks.find((w) => w.id === from)
      const w = src ? await copyWeek(src, monday) : await createEmptyWeek(monday)
      toast(`Week ${formatWeekRange(monday)} created as a draft`)
      onCreated(w)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not create', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New week" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={create}>Create draft</Button></>}>
      <div className="space-y-4">
        <Input label="Week starting (Monday)" type="date" value={start} onChange={(e) => { setStart(e.target.value); setErr('') }} hint={`Week of ${formatWeekRange(mondayOf(start))}`} error={err} />
        <Select label="Start from" value={from} onChange={(e) => setFrom(e.target.value)}>
          <option value="">An empty menu</option>
          {[...weeks].reverse().map((w) => <option key={w.id} value={w.id}>Copy of {formatWeekRange(w.week_start)}</option>)}
        </Select>
        <p className="text-sm text-muted">The new week starts as a draft. Edit it, then publish by Thursday so students can choose.</p>
      </div>
    </Modal>
  )
}
