import { useState } from 'react'
import { Plus, Search, Pencil } from 'lucide-react'
import { api } from '../../lib/backend'
import { useAsync } from '../../lib/useAsync'
import type { Dish, DishCategory } from '../../lib/types'
import { Badge, Button, Card, EmptyState, ErrorNote, Input, Modal, PageHeader, PageLoader, Select, cx } from '../../components/ui'
import { useToast } from '../../components/toast'
import { DishImage } from '../../components/DishImage'
import { formatINR } from '../../lib/logic'

export const CATEGORIES: { value: DishCategory; label: string }[] = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'snack', label: 'Snack' },
  { value: 'drink', label: 'Drink' },
  { value: 'dal', label: 'Dal' },
  { value: 'sabzi', label: 'Sabzi' },
  { value: 'special', label: 'Special' },
  { value: 'bread', label: 'Roti / bread' },
  { value: 'rice', label: 'Rice' },
  { value: 'side', label: 'Side' },
  { value: 'sweet', label: 'Sweet' },
]

const EMPTY: Omit<Dish, 'id' | 'created_at'> = { name: '', category: 'sabzi', description: '', price: 0, image_url: '', is_premium: false, is_active: true }

export default function Dishes() {
  const toast = useToast()
  const q = useAsync(async () => {
    const [dishes, items] = await Promise.all([api.list('dishes', { order: { col: 'name' } }), api.list('menu_items')])
    const used = new Set(items.flatMap((i) => i.dish_ids))
    return { dishes, used }
  }, [])
  const [cat, setCat] = useState<DishCategory | 'all'>('all')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<(Partial<Dish> & typeof EMPTY) | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  if (q.loading && !q.data) return <PageLoader />
  if (q.error) return <ErrorNote message={q.error} onRetry={q.reload} />
  const { dishes, used } = q.data!
  const shown = dishes.filter((d) => (cat === 'all' || d.category === cat) && d.name.toLowerCase().includes(search.trim().toLowerCase()))

  async function save() {
    if (!editing) return
    const name = editing.name.trim()
    if (name.length < 2) return setErr('Give the dish a name.')
    if (dishes.some((d) => d.name.toLowerCase() === name.toLowerCase() && d.id !== editing.id)) return setErr('A dish with this name already exists.')
    setBusy(true)
    try {
      if (!(editing.price > 0)) return setErr('Set a price per serving.')
      const row = { name, category: editing.category, description: editing.description.trim(), price: editing.price, image_url: editing.image_url.trim(), is_premium: editing.is_premium, is_active: editing.is_active }
      if (editing.id) await api.update('dishes', editing.id, row)
      else await api.insert('dishes', row)
      toast(editing.id ? 'Dish updated' : 'Dish added')
      setEditing(null)
      q.reload()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not save', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function remove(d: Dish) {
    if (used.has(d.id)) return toast('This dish is on a menu. Turn it off instead of deleting.', 'error')
    if (!confirm(`Delete ${d.name}?`)) return
    await api.remove('dishes', d.id)
    setEditing(null)
    q.reload()
  }

  const counts = new Map<string, number>()
  for (const d of dishes) counts.set(d.category, (counts.get(d.category) ?? 0) + 1)
  const open = (d?: Dish) => { setEditing(d ? { ...d } : { ...EMPTY, category: cat === 'all' ? EMPTY.category : cat }); setErr('') }

  return (
    <div className="animate-rise">
      <PageHeader
        title="Dishes"
        subtitle={`${dishes.filter((d) => d.is_active).length} active · tap a dish to edit`}
        actions={<Button size="sm" onClick={() => open()}><Plus className="size-4" /> Add dish</Button>}
      />
      <div className="mb-4 space-y-3">
        <div className="relative sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search dishes" aria-label="Search dishes" className="h-11 w-full rounded-xl border border-line bg-paper pl-10 pr-3 text-[15px] focus:border-brand focus:outline-none" />
        </div>
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
          {[{ value: 'all' as const, label: 'All', n: dishes.length }, ...CATEGORIES.map((c) => ({ ...c, n: counts.get(c.value) ?? 0 }))].map((c) => (
            <button key={c.value} type="button" onClick={() => setCat(c.value)} aria-pressed={cat === c.value} className={cx('inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition-colors', cat === c.value ? 'bg-ink text-white' : 'bg-paper text-ink/75 ring-1 ring-line hover:bg-sand')}>
              {c.label}<span className={cx('text-xs tabular', cat === c.value ? 'text-white/60' : 'text-muted')}>{c.n}</span>
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? <Card><EmptyState title="No dishes found" action={<Button size="sm" onClick={() => open()}><Plus className="size-4" /> Add dish</Button>} /></Card> : (
        <>
          {/* Phones: a compact list */}
          <Card className="divide-y divide-line overflow-hidden sm:hidden">
            {shown.map((d) => (
              <button key={d.id} type="button" onClick={() => open(d)} className={cx('flex w-full items-center gap-3 px-3 py-2.5 text-left active:bg-sand', !d.is_active && 'opacity-55')}>
                <DishImage dish={d} className="size-12 shrink-0 rounded-xl" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{d.name}</span>
                  <span className="block truncate text-xs text-muted">{CATEGORIES.find((c) => c.value === d.category)?.label}{d.is_premium ? ' · Special' : ''}{!d.is_active ? ' · Off' : used.has(d.id) ? ' · On a menu' : ''}</span>
                </span>
                <span className="text-[15px] font-semibold tabular">{formatINR(d.price)}</span>
                <Pencil className="size-4 shrink-0 text-muted" />
              </button>
            ))}
          </Card>

          {/* Larger screens: cards */}
          <div className="hidden gap-3 sm:grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {shown.map((d) => (
              <button key={d.id} type="button" onClick={() => open(d)} className={cx('group overflow-hidden rounded-2xl border border-line/70 bg-paper text-left shadow-card transition hover:-translate-y-0.5 hover:shadow-pop', !d.is_active && 'opacity-55')}>
                <DishImage dish={d} className="aspect-[16/10] w-full" />
                <div className="p-3.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate font-semibold">{d.name}</p>
                    <span className="shrink-0 font-semibold tabular">{formatINR(d.price)}</span>
                  </div>
                  <p className="mt-0.5 line-clamp-1 text-sm text-muted">{d.description || '—'}</p>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    <Badge>{CATEGORIES.find((c) => c.value === d.category)?.label}</Badge>
                    {d.is_premium && <Badge tone="amber">Special</Badge>}
                    {!d.is_active ? <Badge tone="red">Off</Badge> : used.has(d.id) && <Badge tone="green">On a menu</Badge>}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'Edit dish' : 'Add dish'}
        footer={<>
          {editing?.id && <Button variant="danger" className="mr-auto" onClick={() => remove(editing as Dish)}>Delete</Button>}
          <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
          <Button onClick={save} loading={busy}>Save</Button>
        </>}
      >
        {editing && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <DishImage dish={{ name: editing.name || 'New dish', category: editing.category, image_url: editing.image_url }} className="size-16 shrink-0 rounded-2xl" />
              <div className="min-w-0 flex-1"><Input label="Name" value={editing.name} onChange={(e) => { setEditing({ ...editing, name: e.target.value }); setErr('') }} error={err} autoFocus={!editing.id} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Select label="Category" value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value as DishCategory })}>
                {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </Select>
              <Input label="Price (₹ per serving)" type="number" inputMode="numeric" min={1} value={editing.price || ''} onChange={(e) => setEditing({ ...editing, price: Number(e.target.value) })} />
            </div>
            <Input label="Short description" value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} placeholder="Shown to students under the dish name" />
            <Input label="Photo link (optional)" value={editing.image_url} onChange={(e) => setEditing({ ...editing, image_url: e.target.value })} placeholder="/dishes/paneer.jpg or https://…" hint="Leave empty to show an illustrated tile." />
            <div className="divide-y divide-line rounded-xl border border-line">
              <label className="flex cursor-pointer items-center justify-between gap-3 px-3.5 py-3">
                <span><span className="block text-sm font-semibold">Show on menus</span><span className="block text-xs text-muted">Turn off instead of deleting a dish you no longer cook</span></span>
                <input type="checkbox" className="size-5 accent-brand" checked={editing.is_active} onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })} />
              </label>
              <label className="flex cursor-pointer items-center justify-between gap-3 px-3.5 py-3">
                <span><span className="block text-sm font-semibold">Special dish</span><span className="block text-xs text-muted">Paneer, sweets: marked as special for students</span></span>
                <input type="checkbox" className="size-5 accent-brand" checked={editing.is_premium} onChange={(e) => setEditing({ ...editing, is_premium: e.target.checked })} />
              </label>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
