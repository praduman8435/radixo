import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import { Check, Copy, Hourglass, Smartphone, ArrowLeft, PartyPopper } from 'lucide-react'
import { useAuth } from '../../lib/auth'
import { useAsync } from '../../lib/useAsync'
import { api } from '../../lib/backend'
import { loadDishMap, loadMember, loadPlans, loadSettings, submitPayment, type Purchase } from '../../lib/data'
import { LoginFlow } from '../../components/LoginSheet'
import { formatDate, formatWeekRange } from '../../lib/dates'
import { customCharge, formatINR, mealsLabel, memberState, nextSubscriptionDates, weekBookingDates, weekPlanMeals } from '../../lib/logic'
import type { Plan } from '../../lib/types'
import { Badge, Button, Card, ErrorNote, Input, LinkButton, PageHeader, PageLoader, cx } from '../../components/ui'
import { QR } from '../../components/QR'
import { useToast } from '../../components/toast'

export default function Plans() {
  const { profile } = useAuth()
  const uid = profile?.role === 'student' ? profile.id : null
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const packId = params.get('pack')
  const customWeek = params.get('custom')
  const q = useAsync(async () => {
    // Guests see plans and prices; their own subscriptions/payments load once they log in.
    const member = uid ? await loadMember(uid) : { subs: [], payments: [], pauses: [], plans: await loadPlans(false), settings: await loadSettings() }
    // A menu booking from the Menu tab arrives as ?pack=<id> or ?custom=<week id>.
    const pack = packId ? await api.get('packs', packId) : null
    const weekId = pack?.week_id ?? customWeek
    const week = weekId ? await api.get('weeks', weekId) : null
    let customAmount = 0
    if (customWeek && week && uid) {
      const [sel, dishes] = await Promise.all([api.list('selections', { eq: { user_id: uid, week_id: week.id } }), loadDishMap()])
      customAmount = sel[0]?.mode === 'custom' ? customCharge(sel[0].custom, dishes, weekPlanMeals(member.subs, uid, week)) : 0
    }
    return { ...member, pack, week, customAmount }
  }, [uid, packId, customWeek])
  const [selected, setSelected] = useState<Plan | null>(null)
  const [utr, setUtr] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  if (q.loading && !q.data) return <PageLoader />
  if (q.error) return <ErrorNote message={q.error} onRetry={q.reload} />
  const { subs, payments, pauses, plans, settings, pack, week, customAmount } = q.data!
  const state = uid ? memberState(uid, subs, payments, pauses) : ({ kind: 'none' } as const)

  type Checkout = { name: string; amount: number; purchase: Purchase; start: string; end: string }
  let checkout: Checkout | null = null
  if (selected) {
    const d = nextSubscriptionDates(subs, uid ?? '', selected)
    checkout = { name: selected.name, amount: selected.price, purchase: { kind: 'plan', plan: selected }, start: d.start_date, end: d.end_date }
  } else if (pack && week && pack.price > 0) {
    const d = weekBookingDates(week)
    checkout = { name: `${pack.name} menu`, amount: pack.price, purchase: { kind: 'pack', pack, amount: pack.price }, start: d.start_date, end: d.end_date }
  } else if (customWeek && week && customAmount > 0) {
    const d = weekBookingDates(week)
    checkout = { name: `Your menu · ${formatWeekRange(week.week_start)}`, amount: customAmount, purchase: { kind: 'custom', weekId: week.id, amount: customAmount }, start: d.start_date, end: d.end_date }
  }
  const leaveCheckout = () => { setSelected(null); setParams({}) }
  const active = plans.filter((p) => p.is_active)
  const pending = payments.find((p) => p.status === 'pending')

  if (done && checkout) {
    return (
      <Card className="mx-auto max-w-lg p-8 text-center animate-rise">
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-leaf-50 text-leaf"><PartyPopper className="size-7" /></span>
        <h1 className="mt-4 font-display text-2xl font-bold">Payment submitted</h1>
        <p className="mt-2 text-muted">We&rsquo;ll match your UPI reference and activate <span className="font-semibold text-ink">{checkout.name}</span>, usually within a few hours.</p>
        <div className="mt-6 flex justify-center gap-2">
          <LinkButton to="/">Back to home</LinkButton>
          <LinkButton to="/menu" variant="secondary">Choose my menu</LinkButton>
        </div>
      </Card>
    )
  }

  if (checkout) {
    const co = checkout
    const upi = `upi://pay?pa=${encodeURIComponent(settings.upi_id)}&pn=${encodeURIComponent(settings.upi_name)}&am=${co.amount}&cu=INR&tn=${encodeURIComponent(`Radixo ${profile?.member_code ?? ''}`)}`
    async function submit(e: FormEvent) {
      e.preventDefault()
      const clean = utr.replace(/\s/g, '')
      if (!/^\d{12}$/.test(clean)) {
        setErr('Enter the 12-digit UPI reference (UTR) from your payment app.')
        return
      }
      setBusy(true)
      try {
        await submitPayment(uid!, co.purchase, clean)
        setDone(true)
      } catch (e2) {
        const m = e2 instanceof Error ? e2.message : ''
        if (m.includes('utr')) setErr('This UPI reference was already submitted. Check the number and try again.')
        else toast(m || 'Could not submit', 'error')
      } finally {
        setBusy(false)
      }
    }
    return (
      <div className="mx-auto max-w-2xl animate-rise">
        <button type="button" onClick={leaveCheckout} className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink"><ArrowLeft className="size-4" /> {selected ? 'All plans' : 'Back'}</button>
        <PageHeader title={`Pay ${formatINR(co.amount)}`} subtitle={`${co.name} · ${formatDate(co.start)} – ${formatDate(co.end)}`} />
        <Card className="overflow-hidden">
          <div className="grid gap-6 p-5 sm:grid-cols-[auto_1fr] sm:p-6">
            <div className="mx-auto rounded-2xl border border-line bg-white p-3">
              {settings.upi_id ? <QR value={upi} size={190} label={`UPI QR code to pay ${formatINR(co.amount)}`} /> : <p className="w-48 p-6 text-center text-sm text-muted">UPI ID not set up yet. Pay at the counter.</p>}
            </div>
            <ol className="space-y-4 text-[15px]">
              <li className="flex gap-3">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand text-sm font-bold text-white">1</span>
                <div>
                  <p className="font-semibold">Pay with any UPI app</p>
                  <p className="text-sm text-muted">Scan the QR, or tap the button on your phone.</p>
                  {settings.upi_id && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <a href={upi} className={cx('inline-flex h-9 items-center gap-1.5 rounded-lg bg-ink px-3 text-sm font-semibold text-white sm:hidden')}><Smartphone className="size-4" /> Open UPI app</a>
                      <button
                        type="button"
                        onClick={() => navigator.clipboard?.writeText(settings.upi_id).then(() => toast('UPI ID copied'))}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-sm font-semibold hover:bg-sand"
                      >
                        <Copy className="size-4" /> {settings.upi_id}
                      </button>
                    </div>
                  )}
                </div>
              </li>
              <li className="flex gap-3">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand text-sm font-bold text-white">2</span>
                <div>
                  <p className="font-semibold">Copy the UPI reference</p>
                  <p className="text-sm text-muted">It&rsquo;s the 12-digit &ldquo;UTR&rdquo; or &ldquo;UPI Ref No.&rdquo; on the success screen.</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand text-sm font-bold text-white">3</span>
                <p className="font-semibold">Paste it below and submit</p>
              </li>
            </ol>
          </div>
          {!uid ? (
            <div className="border-t border-line bg-cream/60 p-5 sm:p-6"><LoginFlow compact reason="Log in so we can link this payment to you." /></div>
          ) : (
          <form onSubmit={submit} className="flex flex-col gap-3 border-t border-line bg-cream/60 p-5 sm:flex-row sm:items-start sm:p-6">
            <div className="flex-1">
              <Input
                aria-label="UPI reference number"
                inputMode="numeric"
                placeholder="12-digit UPI reference (UTR)"
                value={utr}
                onChange={(e) => { setUtr(e.target.value); setErr('') }}
                error={err}
                label="UPI reference"
              />
            </div>
            <Button type="submit" loading={busy} className="sm:mt-7">Submit payment</Button>
          </form>
          )}
        </Card>
        <p className="mt-3 text-center text-xs text-muted">Paying cash? Pay at the counter and the manager will activate your plan.</p>
      </div>
    )
  }

  return (
    <div className="animate-rise">
      <PageHeader title="Plans" subtitle="Fixed price, GST included. Your menu choice never changes the price." />
      {pending && (
        <div className="mb-5 flex items-start gap-3 rounded-2xl bg-amber-50 p-4 text-sm text-amber">
          <Hourglass className="mt-0.5 size-5 shrink-0" />
          <p><span className="font-semibold">Payment under review:</span> {formatINR(pending.amount)} · UTR {pending.utr || '—'}. You can still buy another plan; it would start after the current one.</p>
        </div>
      )}
      {state.kind === 'active' && (
        <p className="mb-5 rounded-2xl bg-leaf-50 p-4 text-sm font-medium text-leaf">Your plan runs till {formatDate(state.sub.end_date, { weekday: true })}. A new plan starts the day after, so there&rsquo;s no gap.</p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {active.map((p) => {
          const meals = p.duration_days * Math.max(1, p.meals.length)
          return (
            <Card key={p.id} className={cx('flex flex-col p-5', p.badge && 'ring-2 ring-brand/20')}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-muted">{mealsLabel(p.meals)} · {p.duration_days} days</span>
                {p.badge && <Badge tone="brand">{p.badge}</Badge>}
              </div>
              <p className="mt-2 font-display text-xl font-bold">{p.name}</p>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-display text-4xl font-extrabold tabular">{formatINR(p.price)}</span>
                <span className="text-sm text-muted">≈ {formatINR(p.price / meals)}/meal</span>
              </div>
              <p className="mt-2 flex-1 text-sm text-muted">{p.description}</p>
              <ul className="mt-4 space-y-1.5 text-sm">
                {['Unlimited roti, rice, dal, sabzi', 'Pick your dishes every week', ...(p.duration_days >= 28 ? [`Pause for trips of ${settings.min_pause_days}+ days`] : [])].map((f) => (
                  <li key={f} className="flex items-center gap-2"><Check className="size-4 text-leaf" strokeWidth={3} /> {f}</li>
                ))}
              </ul>
              <Button className="mt-5" variant={p.badge ? 'primary' : 'secondary'} onClick={() => { setSelected(p); setUtr(''); setErr('') }}>Choose {p.duration_days === 7 ? 'trial' : 'plan'}</Button>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
