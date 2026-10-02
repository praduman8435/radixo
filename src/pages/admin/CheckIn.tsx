import { useEffect, useMemo, useRef, useState } from 'react'
import { Camera, CheckCircle2, Search, XCircle, AlertCircle } from 'lucide-react'
import { api } from '../../lib/backend'
import { useAsync } from '../../lib/useAsync'
import { loadOps, students } from '../../lib/admin'
import { checkIn } from '../../lib/data'
import { currentMeal, formatDate, mondayOf, today } from '../../lib/dates'
import { MEAL_NAME, MEAL_OPTIONS, isEligible, mealsLabel, pauseOn, prepSheet, subscriptionOn } from '../../lib/logic'
import type { Meal, Profile } from '../../lib/types'
import { Avatar, Button, Card, ErrorNote, Modal, PageHeader, PageLoader, Segmented, cx } from '../../components/ui'
import { useToast } from '../../components/toast'

// BarcodeDetector is not in the TS DOM lib yet.
interface Detector { detect(src: CanvasImageSource): Promise<{ rawValue: string }[]> }
declare global { interface Window { BarcodeDetector?: new (o: { formats: string[] }) => Detector } }

export default function CheckIn() {
  const toast = useToast()
  const [meal, setMeal] = useState<Meal>(currentMeal())
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const t = today()

  const q = useAsync(async () => {
    const ops = await loadOps({ attendanceDays: 35 })
    const week = ops.weeks.find((w) => w.week_start === mondayOf(t))
    const items = week ? await api.list('menu_items', { eq: { week_id: week.id } }) : []
    return { ops, week, items }
  }, [t])

  const ops = q.data?.ops
  const todays = useMemo(() => (ops ? ops.attendance.filter((a) => a.date === t && a.meal === meal) : []), [ops, t, meal])
  const expected = useMemo(() => {
    if (!q.data) return 0
    const { ops: o, week, items } = q.data
    return prepSheet({ date: t, meal, week, items, selections: o.selections, subs: o.subs, pauses: o.pauses, attendance: o.attendance, settings: o.settings, packs: o.packs }).expected
  }, [q.data, t, meal])

  const matches = useMemo(() => {
    if (!ops) return []
    const s = query.trim().toLowerCase()
    if (s.length < 2) return []
    return students(ops.profiles)
      .filter((p) => p.member_code.toLowerCase() === s || p.member_code.toLowerCase().includes(s) || (s.length >= 4 && /^\d+$/.test(s) && p.phone.endsWith(s)) || p.full_name.toLowerCase().includes(s))
      .slice(0, 6)
  }, [ops, query])

  useEffect(() => inputRef.current?.focus(), [])

  if (q.loading && !q.data) return <PageLoader />
  if (q.error) return <ErrorNote message={q.error} onRetry={q.reload} />
  const o = ops!

  function status(p: Profile): { ok: boolean; done: boolean; reason: string } {
    const done = todays.some((a) => a.user_id === p.id)
    if (done) return { ok: false, done, reason: `Already checked in for ${meal}` }
    const sub = subscriptionOn(o.subs, p.id, t)
    if (!sub) return { ok: false, done, reason: 'No active plan' }
    if (pauseOn(o.pauses, p.id, t)) return { ok: false, done, reason: 'Plan is paused today' }
    if (!isEligible(p.id, t, meal, o.subs, o.pauses)) return { ok: false, done, reason: `${MEAL_NAME[meal]} isn’t included (${mealsLabel(sub.meals)})` }
    return { ok: true, done, reason: `Plan till ${formatDate(sub.end_date)}` }
  }

  async function doCheckIn(p: Profile) {
    setBusy(p.id)
    try {
      const r = await checkIn(p.id, meal, t)
      toast(r.already ? `${p.full_name} was already checked in` : `${p.full_name} checked in for ${meal}`, r.already ? 'error' : 'success')
      setQuery('')
      q.reload()
      inputRef.current?.focus()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not check in', 'error')
    } finally {
      setBusy(null)
    }
  }

  function onEnter() {
    if (matches.length === 1 && status(matches[0]).ok) void doCheckIn(matches[0])
  }

  function onScan(code: string) {
    setScanning(false)
    const p = students(o.profiles).find((x) => x.member_code.toLowerCase() === code.trim().toLowerCase())
    if (!p) return toast(`No member with code ${code}`, 'error')
    const st = status(p)
    if (st.ok) void doCheckIn(p)
    else {
      setQuery(p.member_code)
      toast(`${p.full_name}: ${st.reason}`, 'error')
    }
  }

  const eligibleCount = students(o.profiles).filter((p) => isEligible(p.id, t, meal, o.subs, o.pauses)).length

  return (
    <div className="animate-rise">
      <PageHeader
        title="Check-in"
        subtitle={formatDate(t, { weekday: true })}
        actions={<Segmented size="sm" value={meal} onChange={setMeal} options={MEAL_OPTIONS} />}
      />

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          <Card className="p-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-muted" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && onEnter()}
                  placeholder="Code, phone or name"
                  aria-label="Find member"
                  className="h-14 w-full rounded-2xl border border-line bg-cream pl-11 pr-4 text-lg font-semibold placeholder:font-normal placeholder:text-muted/70 focus:border-brand focus:outline-none focus:ring-3 focus:ring-brand/15"
                />
              </div>
              {typeof window !== 'undefined' && window.BarcodeDetector && (
                <Button variant="secondary" className="h-14 px-4" onClick={() => setScanning(true)} aria-label="Scan QR pass"><Camera className="size-5" /></Button>
              )}
            </div>
            <p className="mt-2 text-xs text-muted">Press Enter to check in when exactly one eligible member matches.</p>
          </Card>

          {query.trim().length >= 2 && matches.length === 0 && <Card className="p-6 text-center text-sm text-muted">No member found for &ldquo;{query}&rdquo;.</Card>}

          <ul className="space-y-3">
            {matches.map((p) => {
              const st = status(p)
              return (
                <li key={p.id}>
                  <Card className={cx('flex items-center gap-4 p-4', st.ok ? 'ring-2 ring-leaf/30' : st.done ? 'ring-2 ring-turmeric/40' : 'ring-2 ring-brand/20')}>
                    <Avatar name={p.full_name} className="size-12 text-base" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-display text-lg font-bold">{p.full_name}</p>
                      <p className="text-sm text-muted"><span className="font-mono font-semibold text-ink">{p.member_code}</span> · {p.phone}</p>
                      <p className={cx('mt-1 flex items-center gap-1 text-sm font-semibold', st.ok ? 'text-leaf' : st.done ? 'text-amber' : 'text-brand')}>
                        {st.ok ? <CheckCircle2 className="size-4" /> : st.done ? <AlertCircle className="size-4" /> : <XCircle className="size-4" />} {st.reason}
                      </p>
                    </div>
                    <Button variant={st.ok ? 'success' : 'secondary'} size="lg" disabled={!st.ok} loading={busy === p.id} onClick={() => doCheckIn(p)}>
                      {st.done ? 'Done' : 'Check in'}
                    </Button>
                  </Card>
                </li>
              )
            })}
          </ul>
        </div>

        <Card className="p-5">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-muted">{MEAL_NAME[meal]} so far</p>
              <p className="font-display text-4xl font-extrabold tabular">{todays.length}<span className="text-xl text-muted"> / {expected}</span></p>
              <p className="text-xs text-muted">expected · {eligibleCount} members on plan</p>
            </div>
          </div>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-sand" aria-hidden>
            <div className="h-full rounded-full bg-leaf transition-all" style={{ width: `${Math.min(100, expected ? (todays.length / expected) * 100 : 0)}%` }} />
          </div>
          <h3 className="mt-5 text-sm font-semibold">Recent</h3>
          {todays.length === 0 ? (
            <p className="mt-2 text-sm text-muted">No check-ins yet for {meal}.</p>
          ) : (
            <ul className="mt-2 max-h-96 divide-y divide-line overflow-y-auto">
              {[...todays].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, 30).map((a) => {
                const p = o.byId.get(a.user_id)
                return (
                  <li key={a.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="truncate font-semibold">{p?.full_name ?? 'Member'}</span>
                    <span className="shrink-0 text-muted tabular">{new Date(a.created_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</span>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>

      <ScanModal open={scanning} onClose={() => setScanning(false)} onCode={onScan} />
    </div>
  )
}

function ScanModal({ open, onClose, onCode }: { open: boolean; onClose: () => void; onCode: (c: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!open || !window.BarcodeDetector) return
    let stream: MediaStream | null = null
    let timer = 0
    let alive = true
    const detector = new window.BarcodeDetector({ formats: ['qr_code'] })
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then((s) => {
        stream = s
        if (!videoRef.current) return
        videoRef.current.srcObject = s
        void videoRef.current.play()
        const tick = async () => {
          if (!alive || !videoRef.current) return
          try {
            const codes = await detector.detect(videoRef.current)
            if (codes[0]?.rawValue) return onCode(codes[0].rawValue)
          } catch { /* frame not ready */ }
          timer = window.setTimeout(tick, 300)
        }
        void tick()
      })
      .catch(() => setErr('Camera not available. Allow camera access, or type the code.'))
    return () => {
      alive = false
      clearTimeout(timer)
      stream?.getTracks().forEach((tr) => tr.stop())
    }
  }, [open, onCode])

  return (
    <Modal open={open} onClose={onClose} title="Scan meal pass">
      {err ? <p className="text-sm text-brand-600">{err}</p> : <video ref={videoRef} className="aspect-square w-full rounded-2xl bg-ink object-cover" muted playsInline />}
      <p className="mt-3 text-sm text-muted">Point the camera at the student&rsquo;s QR pass.</p>
    </Modal>
  )
}
