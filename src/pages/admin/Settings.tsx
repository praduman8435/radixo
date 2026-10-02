import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../../lib/backend'
import { useAsync } from '../../lib/useAsync'
import { loadSettings } from '../../lib/data'
import { bookingTotal } from '../../lib/booking'
import { formatINR } from '../../lib/logic'
import type { Settings } from '../../lib/types'
import { Button, Card, ErrorNote, Input, PageHeader, PageLoader } from '../../components/ui'
import { useToast } from '../../components/toast'

const pct = (v: string) => Math.min(50, Math.max(0, Math.round(Number(v) || 0)))

export default function SettingsPage() {
  const toast = useToast()
  const q = useAsync(() => loadSettings(), [])
  const [s, setS] = useState<Settings | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (q.data) setS(q.data)
  }, [q.data])

  if ((q.loading && !q.data) || !s) return q.error ? <ErrorNote message={q.error} onRetry={q.reload} /> : <PageLoader />
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

  return (
    <form onSubmit={save} className="animate-rise">
      <PageHeader title="Settings" actions={<Button type="submit" loading={saving}>Save settings</Button>} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="space-y-4 p-5">
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
        </Card>

        <div className="space-y-5">
          <Card className="space-y-4 p-5">
            <div>
              <h2 className="font-display text-lg font-bold">Booking discounts</h2>
              <p className="mt-1 text-sm text-muted">Students book any menu for 1 week, 1 month, 3 months or 6 months. Longer bookings get this much off.</p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Input label="1 month %" type="number" min={0} max={50} value={s.discount_1m} onChange={(e) => set('discount_1m', pct(e.target.value))} />
              <Input label="3 months %" type="number" min={0} max={50} value={s.discount_3m} onChange={(e) => set('discount_3m', pct(e.target.value))} />
              <Input label="6 months %" type="number" min={0} max={50} value={s.discount_6m} onChange={(e) => set('discount_6m', pct(e.target.value))} />
            </div>
            <p className="rounded-xl bg-sand px-3 py-2 text-xs text-muted">
              A ₹999/week menu: {formatINR(999)} · 1 month {formatINR(bookingTotal(999, 4, s.discount_1m))} · 3 months {formatINR(bookingTotal(999, 13, s.discount_3m))} · 6 months {formatINR(bookingTotal(999, 26, s.discount_6m))}
            </p>
            <Input label="“Not coming” notice (hours)" type="number" min={0} max={96} value={s.skip_notice_hours} onChange={(e) => set('skip_notice_hours', Math.min(96, Math.max(0, Math.round(Number(e.target.value) || 0))))} hint="Counted back from midnight of the first day away. The value of those meals goes to the student’s wallet." />
          </Card>

          <Card className="space-y-4 p-5">
            <h2 className="font-display text-lg font-bold">Kitchen maths</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Default attendance %" type="number" min={10} max={100} value={Math.round(s.attendance_factor * 100)} onChange={(e) => set('attendance_factor', Math.min(100, Math.max(10, Number(e.target.value))) / 100)} hint="Used until 4 weeks of data exist." />
              <Input label="Extra cooked %" type="number" min={0} max={50} value={s.buffer_pct} onChange={(e) => set('buffer_pct', Math.max(0, Number(e.target.value)))} hint="Safety buffer." />
            </div>
          </Card>
        </div>
      </div>
    </form>
  )
}
