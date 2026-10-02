import { useEffect, useState, type FormEvent } from 'react'
import { Plus, Pencil } from 'lucide-react'
import { api } from '../../lib/backend'
import { useAsync } from '../../lib/useAsync'
import { loadPlans, loadSettings } from '../../lib/data'
import { formatINR, mealsLabel } from '../../lib/logic'
import type { Plan, Settings } from '../../lib/types'
import { MealToggles } from '../../components/MealToggles'
import { Badge, Button, Card, ErrorNote, Input, Modal, PageHeader, PageLoader } from '../../components/ui'
import { useToast } from '../../components/toast'

const NEW_PLAN: Omit<Plan, 'id'> = { name: '', description: '', price: 0, duration_days: 30, meals: ['lunch', 'dinner'], badge: '', is_active: true, position: 99 }

export default function SettingsPage() {
  const toast = useToast()
  const q = useAsync(async () => ({ settings: await loadSettings(), plans: await loadPlans(false) }), [])
  const [s, setS] = useState<Settings | null>(null)
  const [saving, setSaving] = useState(false)
  const [plan, setPlan] = useState<(Omit<Plan, 'id'> & { id?: string }) | null>(null)
  const [planErr, setPlanErr] = useState('')
  const [planBusy, setPlanBusy] = useState(false)

  useEffect(() => {
    if (q.data) setS(q.data.settings)
  }, [q.data])

  if ((q.loading && !q.data) || !s) return q.error ? <ErrorNote message={q.error} onRetry={q.reload} /> : <PageLoader />
  const plans = q.data!.plans
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS({ ...s, [k]: v })

  async function save(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await api.upsert('settings', { ...s!, whatsapp: s!.whatsapp.replace(/\D/g, '') }, ['id'])
      toast('Settings saved')
      q.reload()
    } catch (er) {
      toast(er instanceof Error ? er.message : 'Could not save', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function savePlan() {
    if (!plan) return
    if (plan.name.trim().length < 3) return setPlanErr('Give the plan a name.')
    if (!(plan.price > 0) || !(plan.duration_days > 0)) return setPlanErr('Price and days must be more than 0.')
    if (plan.meals.length === 0) return setPlanErr('Pick at least one meal.')
    setPlanBusy(true)
    try {
      const { id, ...row } = plan
      if (id) await api.update('plans', id, row)
      else await api.insert('plans', { ...row, position: plans.length })
      toast(id ? 'Plan updated' : 'Plan added')
      setPlan(null)
      q.reload()
    } catch (er) {
      toast(er instanceof Error ? er.message : 'Could not save', 'error')
    } finally {
      setPlanBusy(false)
    }
  }

  return (
    <div className="animate-rise">
      <PageHeader title="Settings" />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <form onSubmit={save} className="space-y-4">
            <h2 className="font-display text-lg font-bold">Payments &amp; contact</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="UPI ID" value={s.upi_id} onChange={(e) => set('upi_id', e.target.value.trim())} placeholder="radixo@okaxis" hint="Students pay to this ID." />
              <Input label="Name on UPI" value={s.upi_name} onChange={(e) => set('upi_name', e.target.value)} />
            </div>
            <Input label="WhatsApp number" value={s.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} placeholder="919800000000" hint="With country code, digits only." />
            <Input label="Address" value={s.address} onChange={(e) => set('address', e.target.value)} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Breakfast timing" value={s.breakfast_time} onChange={(e) => set('breakfast_time', e.target.value)} />
              <Input label="Lunch timing" value={s.lunch_time} onChange={(e) => set('lunch_time', e.target.value)} />
              <Input label="Snacks timing" value={s.snacks_time} onChange={(e) => set('snacks_time', e.target.value)} />
              <Input label="Dinner timing" value={s.dinner_time} onChange={(e) => set('dinner_time', e.target.value)} />
            </div>

            <h2 className="pt-2 font-display text-lg font-bold">Kitchen maths</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <Input label="Default attendance %" type="number" min={10} max={100} value={Math.round(s.attendance_factor * 100)} onChange={(e) => set('attendance_factor', Math.min(100, Math.max(10, Number(e.target.value))) / 100)} hint="Used until 4 weeks of data exist." />
              <Input label="Extra cooked %" type="number" min={0} max={50} value={s.buffer_pct} onChange={(e) => set('buffer_pct', Math.max(0, Number(e.target.value)))} hint="Safety buffer." />
              <Input label="Min pause days" type="number" min={1} max={30} value={s.min_pause_days} onChange={(e) => set('min_pause_days', Math.max(1, Number(e.target.value)))} />
            </div>
            <Button type="submit" loading={saving}>Save settings</Button>
          </form>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold">Plans</h2>
            <Button size="sm" onClick={() => { setPlan({ ...NEW_PLAN }); setPlanErr('') }}><Plus className="size-4" /> Add plan</Button>
          </div>
          <ul className="mt-3 divide-y divide-line">
            {plans.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{p.name} {p.badge && <Badge tone="brand" className="ml-1">{p.badge}</Badge>} {!p.is_active && <Badge tone="red" className="ml-1">Hidden</Badge>}</p>
                  <p className="text-sm text-muted">{formatINR(p.price)} · {p.duration_days} days · {mealsLabel(p.meals)}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => { setPlan({ ...p }); setPlanErr('') }} aria-label={`Edit ${p.name}`}><Pencil className="size-4" /></Button>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">Hide a plan instead of deleting it; past payments still point to it.</p>
        </Card>
      </div>

      <Modal open={!!plan} onClose={() => setPlan(null)} title={plan?.id ? 'Edit plan' : 'Add plan'} footer={<><Button variant="ghost" onClick={() => setPlan(null)}>Cancel</Button><Button onClick={savePlan} loading={planBusy}>Save</Button></>}>
        {plan && (
          <div className="space-y-4">
            <Input label="Name" value={plan.name} onChange={(e) => { setPlan({ ...plan, name: e.target.value }); setPlanErr('') }} error={planErr} />
            <Input label="Description" value={plan.description} onChange={(e) => setPlan({ ...plan, description: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Price (₹, incl. GST)" type="number" min={1} value={plan.price || ''} onChange={(e) => setPlan({ ...plan, price: Number(e.target.value) })} />
              <Input label="Days" type="number" min={1} value={plan.duration_days} onChange={(e) => setPlan({ ...plan, duration_days: Number(e.target.value) })} />
            </div>
            <MealToggles value={plan.meals} onChange={(meals) => setPlan({ ...plan, meals })} />
            <Input label="Badge (optional)" value={plan.badge} onChange={(e) => setPlan({ ...plan, badge: e.target.value })} placeholder="e.g. Best value" />
            <label className="flex items-center gap-3 text-sm font-medium">
              <input type="checkbox" className="size-4 accent-brand" checked={plan.is_active} onChange={(e) => setPlan({ ...plan, is_active: e.target.checked })} />
              Show this plan to students
            </label>
          </div>
        )}
      </Modal>
    </div>
  )
}
