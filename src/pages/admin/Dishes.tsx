import { useState } from 'react'
import { Plus, Search, Pencil } from 'lucide-react'
import { api } from '../../lib/backend'
import { useAsync } from '../../lib/useAsync'
import type { Dish, DishCategory } from '../../lib/types'
import { Badge, Button, Card, EmptyState, ErrorNote, Input, Modal, PageHeader, PageLoader, Segmented, Select, cx } from '../../components/ui'
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

  return (
    <div className="animate-rise">
      <PageHeader title="Dishes" subtitle={`${dishes.filter((d) => d.is_active).length} active dishes in your library`} actions={<Button onClick={() => { setEditing({ ...EMPTY }); setErr('') }}><Plus className="size-4" /> Add dish</Button>} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search dishes" aria-label="Search dishes" className="h-10 w-full rounded-xl border border-line bg-paper pl-9 pr-3 text-sm focus:border-brand focus:outline-none" />
        </div>
        <div className="overflow-x-auto"><Segmented size="sm" value={cat} onChange={setCat} options={[{ value: 'all', label: 'All' }, ...CATEGORIES]} /></div>
      </div>

      {shown.length === 0 ? <Card><EmptyState title="No dishes found" /></Card> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((d) => (
            <button key={d.id} type="button" onClick={() => { setEditing({ ...d }); setErr('') }} className={cx('group overflow-hidden rounded-2xl border border-line/70 bg-paper p-4 text-left shadow-card transition-colors hover:border-muted/40', !d.is_active && 'opacity-60')}>
              <DishImage dish={d} className="-mx-4 -mt-4 mb-3 h-28 w-[calc(100%+2rem)] rounded-t-2xl" />
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold">{d.name} <span className="ml-1 font-normal text-muted tabular">{formatINR(d.price)}</span></p>
                <Pencil className="size-4 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
              <p className="mt-0.5 text-sm text-muted">{d.description || '—'}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge>{CATEGORIES.find((c) => c.value === d.category)?.label}</Badge>
                {d.is_premium && <Badge tone="amber">Special</Badge>}
                {!d.is_active && <Badge tone="red">Off</Badge>}
                {used.has(d.id) && <Badge tone="green">On a menu</Badge>}
              </div>
            </button>
          ))}
        </div>
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
            <Input label="Name" value={editing.name} onChange={(e) => { setEditing({ ...editing, name: e.target.value }); setErr('') }} error={err} autoFocus />
            <Select label="Category" value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value as DishCategory })}>
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </Select>
            <Input label="Short description" value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} placeholder="Shown to students under the dish name" />
            <div className="grid grid-cols-[120px_1fr] gap-3">
              <Input label="Price (₹/serving)" type="number" min={1} value={editing.price || ''} onChange={(e) => setEditing({ ...editing, price: Number(e.target.value) })} hint="Adds up in custom menus." />
              <Input label="Photo URL (optional)" value={editing.image_url} onChange={(e) => setEditing({ ...editing, image_url: e.target.value })} placeholder="/dishes/paneer.jpg or https://…" hint="Shown on the dish card." />
            </div>
            {editing.name && <div className="flex items-center gap-3"><DishImage dish={editing} className="h-16 w-20 rounded-xl" /><span className="text-sm text-muted">Card preview</span></div>}
            <label className="flex items-center gap-3 text-sm font-medium">
              <input type="checkbox" className="size-4 accent-brand" checked={editing.is_premium} onChange={(e) => setEditing({ ...editing, is_premium: e.target.checked })} />
              Special dish (paneer, sweets): one portion per meal
            </label>
            <label className="flex items-center gap-3 text-sm font-medium">
              <input type="checkbox" className="size-4 accent-brand" checked={editing.is_active} onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })} />
              Active (can be added to menus)
            </label>
          </div>
        )}
      </Modal>
    </div>
  )
}
