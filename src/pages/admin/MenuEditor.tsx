import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { ArrowDown, ArrowUp, CalendarPlus, Copy, Eye, EyeOff, Plus, Star, Trash2, X } from 'lucide-react'
import { api } from '../../lib/backend'
import { useAsync } from '../../lib/useAsync'
import { copyDay, copyWeek, createEmptyWeek, loadWeekContent } from '../../lib/data'
import { DAY_NAMES, DAY_SHORT, addDays, formatDate, formatWeekRange, mondayOf, parseISODate, today } from '../../lib/dates'
import { MEAL_NAME, formatINR, isChoice, mealLines } from '../../lib/logic'
import { MEALS, type Dish, type DishCategory, type Meal, type MenuItem, type Pack, type Week } from '../../lib/types'
import { Button, Card, EmptyState, ErrorNote, Input, Modal, PageHeader, PageLoader, Segmented, Select, cx } from '../../components/ui'
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

const weekName = (w: Week) => {
  const thisMon = mondayOf(today())
  if (w.week_start === thisMon) return 'This week'
  if (w.week_start === addDays(thisMon, 7)) return 'Next week'
  if (w.week_start === addDays(thisMon, -7)) return 'Last week'
  return `From ${formatDate(w.week_start)}`
}

type Act = (fn: () => Promise<unknown>, msg?: string) => Promise<void>

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
  const [copyOpen, setCopyOpen] = useState(false)

  if (weeksQ.loading && !weeksQ.data) return <PageLoader />
  if (weeksQ.error) return <ErrorNote message={weeksQ.error} onRetry={weeksQ.reload} />
  const { dishes, selections } = weeksQ.data!
  const dishMap = new Map(dishes.map((d) => [d.id, d]))

  const act: Act = async (fn, msg) => {
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
      subtitle="Add the dishes members can choose for every meal."
      actions={<Button size="sm" onClick={() => setNewOpen(true)}><CalendarPlus className="size-4" /> New week</Button>}
    />
  )
  const newWeek = <NewWeekModal open={newOpen} onClose={() => setNewOpen(false)} weeks={weeks} onCreated={(w) => { setNewOpen(false); weeksQ.reload(); setParams({ week: w.id }) }} />

  if (!week) {
    return (
      <div>
        {header}
        <Card><EmptyState icon={<CalendarPlus className="size-6" />} title="No weeks yet" action={<Button onClick={() => setNewOpen(true)}>Create the first week</Button>}>Create a week, add its dishes, then publish it so members can book.</EmptyState></Card>
        {newWeek}
      </div>
    )
  }

  const items = content.data?.items ?? []
  const packs = content.data?.packs ?? []
  const chose = selections.filter((s) => s.week_id === week.id).length
  const published = week.status === 'published'
  const visibleWeeks = weeks.filter((w) => w.week_start >= addDays(mondayOf(today()), -7))

  return (
    <div className="animate-rise">
      {header}

      {/* Week picker */}
      <div className="no-scrollbar -mx-4 mb-3 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {(visibleWeeks.length ? visibleWeeks : weeks.slice(-4)).map((w) => {
          const on = w.id === week.id
          return (
            <button key={w.id} type="button" onClick={() => setParams({ week: w.id })} aria-pressed={on} className={cx('shrink-0 rounded-xl px-3.5 py-2 text-left ring-1 transition-colors', on ? 'bg-ink text-white ring-ink' : 'bg-paper ring-line hover:bg-sand')}>
              <span className="flex items-center gap-1.5 text-sm font-semibold">
                <span className={cx('size-1.5 rounded-full', w.status === 'published' ? 'bg-[#34c759]' : 'bg-amber')} aria-hidden />
                {weekName(w)}
              </span>
              <span className={cx('block text-[11px]', on ? 'text-white/60' : 'text-muted')}>{formatWeekRange(w.week_start)}</span>
            </button>
          )
        })}
      </div>

      {/* Status */}
      <Card className="mb-5 flex items-center gap-3 p-3.5 sm:p-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{published ? 'Published · members can book it' : 'Draft · members can’t see it yet'}</p>
          <p className="mt-0.5 text-xs text-muted">{chose} member{chose === 1 ? '' : 's'} chose a menu · meals lock 24 h before</p>
        </div>
        <Button size="sm" variant={published ? 'secondary' : 'primary'} onClick={() => updateWeek({ status: published ? 'draft' : 'published' }, published ? 'Week unpublished' : 'Week published')}>
          {published ? <><EyeOff className="size-4" /> Unpublish</> : <><Eye className="size-4" /> Publish</>}
        </Button>
      </Card>

      <Segmented full className="mb-4 sm:inline-grid sm:w-auto" value={tab} onChange={setTab} options={[{ value: 'menu', label: 'Day by day' }, { value: 'packs', label: `Ready-made menus · ${packs.length}` }]} />

      {content.loading && !content.data ? <PageLoader /> : content.error ? <ErrorNote message={content.error} onRetry={content.reload} /> : tab === 'menu' ? (
        <>
          {/* Day picker: 7 columns, never scrolls sideways */}
          <div className="mb-4 grid grid-cols-7 gap-1 rounded-2xl bg-sand p-1" role="tablist" aria-label="Day">
            {DAY_SHORT.map((d, i) => {
              const n = items.filter((it) => it.day === i).length
              return (
                <button key={d} type="button" role="tab" aria-selected={day === i} onClick={() => setDay(i)} className={cx('flex flex-col items-center rounded-xl py-1.5 transition-colors', day === i ? 'bg-paper shadow-sm' : 'hover:bg-paper/50')}>
                  <span className={cx('text-[10px] font-semibold uppercase', day === i ? 'text-brand' : 'text-muted')}>{d}</span>
                  <span className="text-[15px] font-semibold leading-tight tabular">{parseISODate(addDays(week.week_start, i)).getDate()}</span>
                  <span className={cx('mt-0.5 size-1 rounded-full', n ? 'bg-[#34c759]' : 'bg-brand')} aria-label={n ? `${n} lines` : 'empty'} />
                </button>
              )
            })}
          </div>

          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-[17px] font-semibold">{DAY_NAMES[day]} <span className="font-normal text-muted">{formatDate(addDays(week.week_start, day))}</span></h2>
              <p className="text-xs text-muted"><Star className="mr-0.5 inline size-3 fill-turmeric text-turmeric" /> = default dish, served if a member doesn&rsquo;t choose</p>
            </div>
            {items.some((it) => it.day === day) && (
              <Button size="sm" variant="secondary" onClick={() => setCopyOpen(true)}><Copy className="size-4" /> <span className="hidden sm:inline">Copy to other days</span><span className="sm:hidden">Copy</span></Button>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {MEALS.map((meal) => (
              <MealEditor key={meal + day + week.id} weekId={week.id} day={day} meal={meal} lines={mealLines(items, day, meal)} dishes={dishes} dishMap={dishMap} act={act} />
            ))}
          </div>

          <CopyDayModal open={copyOpen} onClose={() => setCopyOpen(false)} from={day} weekStart={week.week_start} onCopy={async (to) => { setCopyOpen(false); toast(`Copying ${DAY_NAMES[day]}…`); await act(() => copyDay(week.id, day, to), `${DAY_NAMES[day]} copied to ${to.length} day${to.length === 1 ? '' : 's'}`) }} />
        </>
      ) : (
        <PacksEditor weekId={week.id} items={items} packs={packs} dishMap={dishMap} act={act} />
      )}

      {newWeek}
    </div>
  )
}

// ---------- One meal of one day ----------

function MealEditor({ weekId, day, meal, lines, dishes, dishMap, act }: { weekId: string; day: number; meal: Meal; lines: MenuItem[]; dishes: Dish[]; dishMap: Map<string, Dish>; act: Act }) {
  async function addLine(label: string) {
    if (!label) return
    const cat = categoryFor(label)
    const first = dishes.find((d) => d.is_active && (!cat || d.category === cat)) ?? dishes.find((d) => d.is_active)
    if (!first) return
    await act(() => api.insert('menu_items', { week_id: weekId, day, meal, label, dish_ids: [first.id], default_dish_id: first.id, position: lines.length }), `${label} added to ${MEAL_NAME[meal].toLowerCase()}`)
  }

  async function move(it: MenuItem, dir: -1 | 1) {
    const other = lines[lines.indexOf(it) + dir]
    if (!other) return
    await act(async () => {
      await api.update('menu_items', it.id, { position: other.position })
      await api.update('menu_items', other.id, { position: it.position === other.position ? it.position + dir : it.position })
    })
  }

  const used = new Set(lines.map((l) => l.label.toLowerCase()))

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-3 border-b border-line px-4 py-3">
        <img src={`/meals/${meal}.png`} alt="" className={cx('size-9 rounded-full', !lines.length && 'opacity-50 grayscale')} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{MEAL_NAME[meal]}</p>
          <p className="text-xs text-muted">{lines.length ? `${lines.length} line${lines.length === 1 ? '' : 's'} · ${lines.reduce((n, l) => n + l.dish_ids.length, 0)} dishes` : 'Not served this day'}</p>
        </div>
      </div>

      <ul className="divide-y divide-line">
        {lines.map((it, idx) => {
          const cat = categoryFor(it.label)
          const options = dishes.filter((d) => d.is_active && !it.dish_ids.includes(d.id))
          const suggested = options.filter((d) => d.category === cat)
          const others = options.filter((d) => d.category !== cat)
          return (
            <li key={it.id} className="px-4 py-3">
              <div className="flex items-center gap-2">
                <input
                  defaultValue={it.label}
                  aria-label="Line name"
                  onBlur={(e) => e.target.value.trim() && e.target.value !== it.label && act(() => api.update('menu_items', it.id, { label: e.target.value.trim() }), 'Renamed')}
                  className="-ml-1.5 h-8 min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-1.5 text-sm font-semibold hover:border-line focus:border-brand focus:bg-paper focus:outline-none"
                />
                <span className={cx('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold', isChoice(it) ? 'bg-sky-50 text-sky' : 'bg-sand text-muted')}>{isChoice(it) ? `Choice of ${it.dish_ids.length}` : 'Fixed'}</span>
                <div className="flex shrink-0">
                  <button type="button" disabled={idx === 0} onClick={() => move(it, -1)} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-sand disabled:opacity-25" aria-label="Move up"><ArrowUp className="size-4" /></button>
                  <button type="button" disabled={idx === lines.length - 1} onClick={() => move(it, 1)} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-sand disabled:opacity-25" aria-label="Move down"><ArrowDown className="size-4" /></button>
                  <button type="button" onClick={() => confirm(`Remove the ${it.label} line from ${MEAL_NAME[meal].toLowerCase()}?`) && act(() => api.remove('menu_items', it.id), 'Line removed')} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-brand-50 hover:text-brand" aria-label="Remove line"><Trash2 className="size-4" /></button>
                </div>
              </div>

              <div className="mt-2 flex flex-wrap gap-1.5">
                {it.dish_ids.map((id) => {
                  const isDefault = it.default_dish_id === id
                  const name = dishMap.get(id)?.name ?? 'Unknown dish'
                  return (
                    <span key={id} className={cx('inline-flex h-8 items-center rounded-full pl-1 pr-1 text-[13px] font-semibold ring-1', isDefault ? 'bg-turmeric-50 ring-turmeric/60' : 'bg-paper ring-line')}>
                      <button
                        type="button"
                        title={isDefault ? 'Default dish' : 'Make default'}
                        aria-label={isDefault ? `${name} is the default` : `Make ${name} the default`}
                        onClick={() => !isDefault && act(() => api.update('menu_items', it.id, { default_dish_id: id }), `${name} is now the default`)}
                        className="grid size-6 place-items-center rounded-full hover:bg-sand"
                      >
                        <Star className={cx('size-3.5', isDefault ? 'fill-turmeric text-turmeric' : 'text-muted/70')} />
                      </button>
                      <span className="px-0.5">{name}</span>
                      {it.dish_ids.length > 1 ? (
                        <button
                          type="button"
                          aria-label={`Remove ${name}`}
                          onClick={() => {
                            const rest = it.dish_ids.filter((x) => x !== id)
                            void act(() => api.update('menu_items', it.id, { dish_ids: rest, default_dish_id: isDefault ? rest[0] : it.default_dish_id }))
                          }}
                          className="grid size-6 place-items-center rounded-full text-muted hover:bg-brand-50 hover:text-brand"
                        >
                          <X className="size-3.5" />
                        </button>
                      ) : <span className="w-1.5" />}
                    </span>
                  )
                })}
                {it.dish_ids.length < 4 && (
                  <label className="relative inline-flex h-8 cursor-pointer items-center gap-1 rounded-full px-3 text-[13px] font-semibold text-brand border border-dashed border-brand/40 hover:bg-brand-50">
                    <Plus className="size-3.5" /> Add dish
                    <select
                      value=""
                      aria-label={`Add a dish to ${it.label}`}
                      onChange={(e) => e.target.value && act(() => api.update('menu_items', it.id, { dish_ids: [...it.dish_ids, e.target.value] }))}
                      className="absolute inset-0 cursor-pointer opacity-0"
                    >
                      <option value="">Add a dish…</option>
                      {suggested.length > 0 && <optgroup label={`${it.label} dishes`}>{suggested.map((d) => <option key={d.id} value={d.id}>{d.name} · {formatINR(d.price)}</option>)}</optgroup>}
                      <optgroup label="All other dishes">{others.map((d) => <option key={d.id} value={d.id}>{d.name} · {formatINR(d.price)}</option>)}</optgroup>
                    </select>
                  </label>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      <div className={cx('px-4 py-3', lines.length > 0 && 'border-t border-line')}>
        <label className="relative flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-xl text-sm font-semibold text-ink/70 border border-dashed border-line hover:bg-sand hover:text-ink">
          <Plus className="size-4" /> {lines.length ? 'Add a line' : `Serve ${MEAL_NAME[meal].toLowerCase()}: add a line`}
          <select value="" aria-label={`Add a line to ${MEAL_NAME[meal]}`} onChange={(e) => void addLine(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0">
            <option value="">Choose a line…</option>
            {LINE_PRESETS.map((p) => <option key={p.label} value={p.label}>{p.label}{used.has(p.label.toLowerCase()) ? ' (another)' : ''}</option>)}
          </select>
        </label>
      </div>
    </Card>
  )
}

// ---------- Copy a day ----------

function CopyDayModal({ open, onClose, from, weekStart, onCopy }: { open: boolean; onClose: () => void; from: number; weekStart: string; onCopy: (to: number[]) => void }) {
  const [to, setTo] = useState<number[]>([])
  useEffect(() => { if (open) setTo([]) }, [open])
  const others = DAY_NAMES.map((_, i) => i).filter((i) => i !== from)
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Copy ${DAY_NAMES[from]} to…`}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button disabled={!to.length} onClick={() => onCopy(to)}>Copy to {to.length || ''} day{to.length === 1 ? '' : 's'}</Button></>}
    >
      <p className="mb-3 text-sm text-muted">The days you pick get {DAY_NAMES[from]}&rsquo;s lines and dishes. Their current dishes are replaced.</p>
      <div className="mb-3 flex gap-2">
        <button type="button" onClick={() => setTo(others)} className="h-8 rounded-full px-3 text-xs font-semibold ring-1 ring-line hover:bg-sand">All days</button>
        <button type="button" onClick={() => setTo(others.filter((i) => i < 5))} className="h-8 rounded-full px-3 text-xs font-semibold ring-1 ring-line hover:bg-sand">Weekdays</button>
        <button type="button" onClick={() => setTo([])} className="h-8 rounded-full px-3 text-xs font-semibold ring-1 ring-line hover:bg-sand">Clear</button>
      </div>
      <div className="divide-y divide-line rounded-xl border border-line">
        {others.map((i) => (
          <label key={i} className="flex cursor-pointer items-center justify-between px-3.5 py-2.5">
            <span className="text-sm font-medium">{DAY_NAMES[i]} <span className="text-muted">{formatDate(addDays(weekStart, i))}</span></span>
            <input type="checkbox" className="size-5 accent-brand" checked={to.includes(i)} onChange={(e) => setTo(e.target.checked ? [...to, i] : to.filter((x) => x !== i))} />
          </label>
        ))}
      </div>
    </Modal>
  )
}

// ---------- Ready-made menus ----------

function PacksEditor({ weekId, items, packs, dishMap, act }: { weekId: string; items: MenuItem[]; packs: Pack[]; dishMap: Map<string, Dish>; act: Act }) {
  const [selId, setSelId] = useState<string | null>(null)
  const choiceLines = items.filter(isChoice).sort((a, b) => a.day - b.day || MEALS.indexOf(a.meal) - MEALS.indexOf(b.meal) || a.position - b.position)
  const pack = packs.find((p) => p.id === selId) ?? packs[0]

  async function addPack() {
    const picks: Record<string, string> = {}
    for (const it of choiceLines) picks[it.id] = it.default_dish_id
    await act(() => api.insert('packs', { week_id: weekId, name: 'New menu', tagline: 'Describe it in a few words', picks, price: 0, meals: ['lunch', 'dinner'], position: packs.length }), 'Menu added')
  }

  if (choiceLines.length === 0) return <Card><EmptyState title="Add some choices first">A ready-made menu picks one dish on every line that has 2 or more options. Add options in Day by day.</EmptyState></Card>

  const lines = pack ? choiceLines.filter((it) => pack.meals.includes(it.meal)) : []

  return (
    <div className="space-y-4">
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
        {packs.map((p) => (
          <button key={p.id} type="button" onClick={() => setSelId(p.id)} aria-pressed={p.id === pack?.id} className={cx('shrink-0 rounded-xl px-3.5 py-2 text-left ring-1 transition-colors', p.id === pack?.id ? 'bg-ink text-white ring-ink' : 'bg-paper ring-line hover:bg-sand')}>
            <span className="block text-sm font-semibold">{p.name}</span>
            <span className={cx('block text-[11px]', p.id === pack?.id ? 'text-white/60' : 'text-muted')}>{p.price ? `${formatINR(p.price)}/week` : 'Not bookable'}</span>
          </button>
        ))}
        <button type="button" onClick={addPack} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold text-brand border border-dashed border-brand/40 hover:bg-brand-50"><Plus className="size-4" /> New menu</button>
      </div>

      {pack && (
        <>
          <Card key={pack.id} className="space-y-3 p-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_1.4fr_140px]">
              <Input label="Name" defaultValue={pack.name} onBlur={(e) => e.target.value.trim() && e.target.value !== pack.name && act(() => api.update('packs', pack.id, { name: e.target.value.trim() }), 'Name saved')} />
              <Input label="Short description" defaultValue={pack.tagline} onBlur={(e) => e.target.value !== pack.tagline && act(() => api.update('packs', pack.id, { tagline: e.target.value }), 'Saved')} />
              <Input label="Price (₹/week)" type="number" inputMode="numeric" min={0} defaultValue={pack.price || ''} placeholder="0 = hidden" onBlur={(e) => Number(e.target.value) !== pack.price && act(() => api.update('packs', pack.id, { price: Math.max(0, Number(e.target.value) || 0) }), 'Price saved')} />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="mb-1.5 text-sm font-semibold">Meals in this menu</p>
                <div className="flex flex-wrap gap-1.5">
                  {MEALS.map((m) => {
                    const on = pack.meals.includes(m)
                    return (
                      <button key={m} type="button" aria-pressed={on} onClick={() => act(() => api.update('packs', pack.id, { meals: on ? pack.meals.filter((x) => x !== m) : MEALS.filter((x) => x === m || pack.meals.includes(x)) }))} className={cx('h-8 rounded-full px-3 text-[13px] font-semibold ring-1 transition-colors', on ? 'bg-brand text-white ring-brand' : 'ring-line hover:bg-sand')}>
                        {MEAL_NAME[m]}
                      </button>
                    )
                  })}
                </div>
              </div>
              <Button size="sm" variant="danger" onClick={() => confirm(`Delete ${pack.name}?`) && act(() => api.remove('packs', pack.id), 'Menu deleted').then(() => setSelId(null))}><Trash2 className="size-4" /> Delete</Button>
            </div>
          </Card>

          <p className="text-sm text-muted">Pick what {pack.name} serves on each line that has options. Fixed lines are always included.</p>
          <div className="grid gap-3 lg:grid-cols-2">
            {DAY_NAMES.map((dn, d) => {
              const dayLines = lines.filter((it) => it.day === d)
              if (!dayLines.length) return null
              return (
                <Card key={dn} className="overflow-hidden">
                  <p className="border-b border-line bg-cream/60 px-4 py-2 text-sm font-semibold">{dn}</p>
                  <ul className="divide-y divide-line">
                    {dayLines.map((it) => {
                      const v = pack.picks[it.id] && it.dish_ids.includes(pack.picks[it.id]) ? pack.picks[it.id] : it.default_dish_id
                      return (
                        <li key={it.id} className="flex items-center gap-3 px-4 py-2">
                          <span className="w-28 shrink-0 text-xs text-muted"><span className="block font-semibold text-ink">{it.label}</span>{MEAL_NAME[it.meal]}</span>
                          <div className="min-w-0 flex-1">
                            <Select aria-label={`${pack.name}: ${dn} ${it.meal} ${it.label}`} value={v} onChange={(e) => act(() => api.update('packs', pack.id, { picks: { ...pack.picks, [it.id]: e.target.value } }))} className="h-10 text-sm">
                              {it.dish_ids.map((id) => <option key={id} value={id}>{dishMap.get(id)?.name}</option>)}
                            </Select>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </Card>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

// ---------- New week ----------

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
      toast(`Week of ${formatWeekRange(monday)} created as a draft`)
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
        <p className="text-sm text-muted">Copying a week is the quickest way: you only change what&rsquo;s different. The new week stays a draft until you publish it.</p>
      </div>
    </Modal>
  )
}
