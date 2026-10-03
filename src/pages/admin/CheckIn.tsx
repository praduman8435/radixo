import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Camera, CheckCircle2, Search, XCircle, AlertCircle, Check, X, Package } from 'lucide-react'
import { api } from '../../lib/backend'
import { useAsync } from '../../lib/useAsync'
import { loadOps, students } from '../../lib/admin'
import { checkIn, loadDishMap } from '../../lib/data'
import { effectiveSelection } from '../../lib/booking'
import { canUseCamera, startScanner } from '../../lib/qrScanner'
import { currentMeal, formatDate, mondayOf, today, weekdayIndex } from '../../lib/dates'
import { MEAL_NAME, MEAL_OPTIONS, dishesFor, isEligible, mealsLabel, pauseOn, prepSheet, subscriptionOn } from '../../lib/logic'
import type { Meal, Profile } from '../../lib/types'
import { Avatar, Button, Card, ErrorNote, PageHeader, PageLoader, Segmented, cx } from '../../components/ui'
import { useToast } from '../../components/toast'

type ScanResult =
  | { kind: 'ok'; p: Profile; dishes: string[] }
  | { kind: 'refused'; p: Profile; reason: string; dishes: string[]; already: boolean }
  | { kind: 'unknown'; code: string }

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
    const [items, dishMap] = await Promise.all([week ? api.list('menu_items', { eq: { week_id: week.id } }) : Promise.resolve([]), loadDishMap()])
    return { ops, week, items, dishMap }
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

  /** What this member gets for the selected meal today: their own menu, ready-made picks, or the defaults. */
  function plate(p: Profile): string[] {
    const { week, items, dishMap } = q.data!
    if (!week) return []
    const saved = o.selections.find((x) => x.user_id === p.id && x.week_id === week.id)
    const sel = effectiveSelection({ userId: p.id, week, items, packs: o.packs.filter((x) => x.week_id === week.id), selection: saved, subs: o.subs })
    return dishesFor(items, weekdayIndex(t), meal, sel).map((id) => dishMap.get(id)?.name).filter((x): x is string => !!x)
  }

  function status(p: Profile): { ok: boolean; done: boolean; reason: string } {
    const done = todays.some((a) => a.user_id === p.id)
    if (done) {
      const at = todays.find((a) => a.user_id === p.id)
      return { ok: false, done, reason: `Already had ${meal}${at ? ` at ${new Date(at.created_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}` : ''}` }
    }
    const sub = subscriptionOn(o.subs, p.id, t)
    if (!sub) return { ok: false, done, reason: 'No booking for today' }
    if (pauseOn(o.pauses, p.id, t)) return { ok: false, done, reason: 'Marked “not coming” today' }
    if (!isEligible(p.id, t, meal, o.subs, o.pauses)) return { ok: false, done, reason: `${MEAL_NAME[meal]} isn’t in their booking (${mealsLabel(sub.meals)})` }
    return { ok: true, done, reason: `Booked till ${formatDate(sub.end_date)}` }
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

  /** A scanned pass: check in if allowed, and say clearly what happened. */
  async function onScan(code: string): Promise<ScanResult> {
    const p = students(o.profiles).find((x) => x.member_code.toLowerCase() === code.trim().toLowerCase())
    if (!p) return { kind: 'unknown', code }
    const st = status(p)
    const dishes = plate(p)
    if (!st.ok) return { kind: 'refused', p, reason: st.reason, dishes, already: st.done }
    try {
      const r = await checkIn(p.id, meal, t)
      q.reload()
      if (r.already) return { kind: 'refused', p, reason: `Already had ${meal}`, dishes, already: true }
      return { kind: 'ok', p, dishes }
    } catch (e) {
      return { kind: 'refused', p, reason: e instanceof Error ? e.message : 'Could not check in', dishes, already: false }
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
          <button type="button" onClick={() => setScanning(true)} disabled={!canUseCamera()} className="bg-brand-grad flex h-16 w-full items-center justify-center gap-3 rounded-2xl text-lg font-bold text-white shadow-[0_14px_28px_-14px_rgba(222,59,44,0.8)] transition active:scale-[0.99] disabled:opacity-50">
            <Camera className="size-6" /> Scan QR pass
          </button>
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
            </div>
            <p className="mt-2 text-xs text-muted">No QR? Type the code, phone or name. Press Enter to check in.</p>
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
                      <p className="text-sm text-muted"><span className="font-mono font-semibold text-ink">{p.member_code}</span> · {p.phone}{p.meal_mode === 'tiffin' && <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber">Tiffin</span>}</p>
                      {plate(p).length > 0 && <p className="mt-0.5 truncate text-sm text-ink/80">{plate(p).join(' · ')}</p>}
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
              <p className="text-xs text-muted">expected · {eligibleCount} booked today</p>
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

      {scanning && <Scanner meal={meal} count={todays.length} expected={expected} onClose={() => setScanning(false)} onScan={onScan} />}
    </div>
  )
}

const AUTO_NEXT_MS = 2500

/** Full-screen scanner: camera, then a big green/red result, then straight back to the camera. */
function Scanner({ meal, count, expected, onClose, onScan }: { meal: Meal; count: number; expected: number; onClose: () => void; onScan: (code: string) => Promise<ScanResult> }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [err, setErr] = useState('')
  const [result, setResult] = useState<ScanResult | null>(null)
  const busy = useRef(false)
  const last = useRef<{ code: string; at: number } | null>(null)
  const onScanRef = useRef(onScan)
  onScanRef.current = onScan

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    let stop: (() => void) | null = null
    let alive = true
    if (!videoRef.current) return
    startScanner(videoRef.current, async (code) => {
      // One result at a time; ignore the same pass held up again within a few seconds.
      if (busy.current) return
      if (last.current && last.current.code === code && Date.now() - last.current.at < 4000) return
      busy.current = true
      last.current = { code, at: Date.now() }
      const r = await onScanRef.current(code)
      try { navigator.vibrate?.(r.kind === 'ok' ? 90 : [70, 60, 70, 60, 70]) } catch { /* not supported */ }
      setResult(r)
    })
      .then((s) => { if (alive) stop = s; else s() })
      .catch(() => { if (alive) setErr('Camera not available. Allow camera access in your browser settings, or type the code instead.') })
    return () => {
      alive = false
      stop?.()
      document.body.style.overflow = prev
    }
  }, [])

  const next = () => {
    setResult(null)
    busy.current = false
  }

  // Successful scans move on by themselves; refusals wait for a tap so staff read the reason.
  useEffect(() => {
    if (result?.kind !== 'ok') return
    const id = window.setTimeout(next, AUTO_NEXT_MS)
    return () => clearTimeout(id)
  }, [result])

  const ok = result?.kind === 'ok'
  return createPortal(
    <div className="fixed inset-0 z-[80] flex flex-col bg-black text-white" role="dialog" aria-modal="true" aria-label="Scan meal pass">
      <div className="flex items-center justify-between px-4 pb-3 pt-[max(14px,env(safe-area-inset-top))]">
        <div>
          <p className="text-[17px] font-bold">{MEAL_NAME[meal]}</p>
          <p className="text-xs text-white/60 tabular">{count} of {expected} served</p>
        </div>
        <button type="button" onClick={onClose} className="grid size-11 place-items-center rounded-full bg-white/15" aria-label="Close scanner"><X className="size-6" /></button>
      </div>

      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} className="absolute inset-0 size-full object-cover" muted playsInline />
        {err ? (
          <p className="absolute inset-x-6 top-1/3 rounded-2xl bg-black/80 p-5 text-center text-[15px]">{err}</p>
        ) : (
          <>
            <div className="pointer-events-none absolute left-1/2 top-1/2 aspect-square w-[68%] max-w-[320px] -translate-x-1/2 -translate-y-1/2 rounded-[28px] shadow-[0_0_0_9999px_rgba(0,0,0,0.55)] ring-4 ring-white/90" aria-hidden />
            <p className="absolute inset-x-0 bottom-8 text-center text-[15px] font-semibold text-white/90">Point at the student&rsquo;s QR pass</p>
          </>
        )}

        {result && (
          <div className={cx('absolute inset-0 flex flex-col animate-rise', ok ? 'bg-[#11823b]' : 'bg-[#c42b1c]')} onClick={ok ? next : undefined}>
            <div className="flex flex-1 flex-col items-center overflow-y-auto px-6 pt-8 text-center">
              <span className="grid size-24 shrink-0 place-items-center rounded-full bg-white/20">
                {ok ? <Check className="size-14" strokeWidth={3.2} /> : <X className="size-14" strokeWidth={3.2} />}
              </span>
              {result.kind === 'unknown' ? (
                <>
                  <p className="mt-5 text-[30px] font-extrabold leading-tight">Not a Radixo pass</p>
                  <p className="mt-2 text-lg text-white/85">Ask for their member code or phone number.</p>
                </>
              ) : (
                <>
                  <p className="mt-4 text-[13px] font-bold uppercase tracking-[0.18em] text-white/80">{ok ? 'Checked in' : 'Don’t serve'}</p>
                  <p className="mt-1 text-[30px] font-extrabold leading-tight">{result.p.full_name}</p>
                  <p className="mt-1 flex items-center justify-center gap-2 text-[15px] text-white/85">
                    <span className="font-mono font-semibold">{result.p.member_code}</span>
                    {result.p.meal_mode === 'tiffin' && <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-0.5 text-xs font-bold text-ink"><Package className="size-3.5" /> Tiffin</span>}
                  </p>
                  {result.kind === 'refused' && <p className="mt-5 rounded-2xl bg-black/20 px-5 py-3 text-xl font-bold">{result.reason}</p>}
                  {ok && result.dishes.length > 0 && (
                    <div className="mt-6 w-full max-w-sm rounded-2xl bg-black/20 p-4 text-left">
                      <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-white/75">{result.p.meal_mode === 'tiffin' ? 'Pack' : 'Serve'}</p>
                      <ul className="mt-2 space-y-1.5">
                        {result.dishes.map((d) => <li key={d} className="text-[22px] font-bold leading-snug">{d}</li>)}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-3">
              <button type="button" onClick={(e) => { e.stopPropagation(); next() }} className="relative h-14 w-full overflow-hidden rounded-2xl bg-white text-lg font-bold text-ink">
                {ok && <span className="absolute inset-y-0 left-0 bg-black/10" style={{ animation: `quote-progress ${AUTO_NEXT_MS}ms linear forwards` }} aria-hidden />}
                <span className="relative">Next student</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
