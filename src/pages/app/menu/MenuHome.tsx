import { useCallback, useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { Plus, Check, Clock3, Eye, Lock, RotateCcw, X } from 'lucide-react'
import { useAuth } from '../../../lib/auth'
import { savePicks } from '../../../lib/data'
import { formatDateTime, formatWeekRange, mondayOf, timeUntil, today, weekdayIndex } from '../../../lib/dates'
import { MEAL_NAME, customCount, customMeals, customTotal, dishesFor, formatINR, isLocked, mealsLabel } from '../../../lib/logic'
import { MEALS, type Dish, type Meal, type MenuItem, type Pack, type Selection } from '../../../lib/types'
import { EmptyState, ErrorNote, PageLoader, cx } from '../../../components/ui'
import { useToast } from '../../../components/toast'
import { useLoginGate } from '../../../components/LoginSheet'
import { readDraft, useMenuData } from './useMenuData'

const PACK_PHOTOS = ['/photos/thali-classic.jpg', '/photos/thali-fullday.jpg', '/photos/thali-protein.jpg', '/photos/thali-light.jpg']
const SWIPE_AT = 110 // px of drag that counts as a swipe

type Card =
  | { kind: 'mine'; key: string; title: string; photo: string; price: number; meals: Meal[]; sel: Selection; due: number }
  | { kind: 'pack'; key: string; title: string; photo: string; price: number; meals: Meal[]; pack: Pack; sel: Selection }
  | { kind: 'create'; key: string }

/** A short look at one day of a menu: "Lunch · Rajma, Aloo gobhi, Roti". */
function Preview({ items, sel, meals, dishes, day }: { items: MenuItem[]; sel: Selection; meals: Meal[]; dishes: Map<string, Dish>; day: number }) {
  const rows = MEALS.filter((m) => meals.includes(m))
    .map((m) => ({ m, names: dishesFor(items, day, m, sel).map((d) => dishes.get(d)?.name).filter(Boolean) as string[] }))
    .filter((r) => r.names.length)
  return (
    <ul className="space-y-1.5">
      {rows.slice(0, rows.length > 3 ? 2 : 3).map(({ m, names }) => (
        <li key={m} className="flex gap-2 text-[13px] leading-snug">
          <span className="w-[70px] shrink-0 font-semibold text-white">{MEAL_NAME[m]}</span>
          <span className="line-clamp-1 text-white/60">{names.join(', ')}</span>
        </li>
      ))}
      {rows.length > 3 && <li className="text-xs text-white/40">+ {rows.length - 2} more meals</li>}
    </ul>
  )
}

export default function MenuHome() {
  const { profile } = useAuth()
  const uid = profile?.role === 'student' ? profile.id : null
  const toast = useToast()
  const nav = useNavigate()
  const { requireLogin } = useLoginGate()
  const q = useMenuData(uid)

  const [idx, setIdx] = useState(0)
  const [drag, setDrag] = useState({ x: 0, y: 0, active: false })
  const [fly, setFly] = useState<0 | 1 | -1>(0)
  const [busy, setBusy] = useState(false)
  const start = useRef<{ x: number; y: number } | null>(null)

  const data = q.data
  const week = data?.week
  const locked = week ? isLocked(week) : true
  const credit = data?.credit ?? 0
  const booked = credit > 0 // this week is already paid for by a booking
  const thisWeek = !!week && week.week_start === mondayOf(today())
  const previewDay = thisWeek ? weekdayIndex(today()) : 0

  const cards: Card[] = []
  if (data && week) {
    const custom = data.selection?.mode === 'custom' ? data.selection.custom : readDraft(week.id)
    if (custom && customCount(custom) > 0) {
      const sel: Selection = { id: '', user_id: uid ?? '', week_id: week.id, mode: 'custom', pack_id: null, picks: {}, custom, updated_at: '' }
      const total = customTotal(custom, data.dishes)
      cards.push({ kind: 'mine', key: 'mine', title: 'My Menu', photo: '/photos/served.jpg', price: total, meals: customMeals(custom), sel, due: booked ? Math.max(0, total - credit) : total })
    }
    data.packs.filter((p) => p.price > 0).forEach((p, i) =>
      cards.push({ kind: 'pack', key: p.id, title: p.name, photo: PACK_PHOTOS[i % PACK_PHOTOS.length], price: p.price, meals: p.meals, pack: p, sel: { id: '', user_id: '', week_id: week.id, mode: 'pack', pack_id: p.id, picks: p.picks, custom: {}, updated_at: '' } }),
    )
    cards.push({ kind: 'create', key: 'create' })
  }
  const done = idx >= cards.length
  const top = cards[idx]

  const isMine = (c: Card) => c.kind === 'pack' && data?.selection?.mode === 'pack' && data.selection.pack_id === c.pack.id

  /** Swipe right / ✓: choose (free within a plan), book (pay for the week), or open the builder. */
  const accept = useCallback(async (c: Card) => {
    if (!week) return
    if (c.kind === 'create') return nav('/menu/create')
    if (c.kind === 'mine') {
      if (locked) return nav('/menu/view/mine')
      if (!data?.saved || data.saved.mode !== 'custom') return nav('/menu/create') // still a draft: save it first
      if (!booked) return nav(`/wallet?custom=${week.id}`)
      return c.due > 0 ? nav(`/wallet?extra=${week.id}`) : nav('/menu/view/mine')
    }
    if (locked) return nav(`/menu/view/${c.pack.id}`)
    if (!booked) return nav(`/wallet?pack=${c.pack.id}`)
    // Already booked this week: switch menus; pay only if this one costs more.
    const save = async () => {
      setBusy(true)
      try {
        await savePicks(uid!, week.id, 'pack', c.pack.id, c.pack.picks)
        if (c.pack.price > credit) nav(`/wallet?extra=${week.id}`)
        else toast(`${c.title} is your menu for ${formatWeekRange(week.week_start)}`)
        q.reload()
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Could not save', 'error')
      } finally {
        setBusy(false)
      }
    }
    if (!uid) requireLogin('Log in to choose this menu.', () => void save())
    else await save()
  }, [week, locked, booked, credit, data, uid, nav, toast, q, requireLogin])

  /** Animate the top card off screen, then move to the next (and act on a right swipe). */
  const swipe = useCallback((dir: 1 | -1) => {
    const c = cards[idx]
    if (!c || fly) return
    setFly(dir)
    window.setTimeout(() => {
      setFly(0)
      setDrag({ x: 0, y: 0, active: false })
      setIdx((i) => i + 1)
      if (dir === 1) void accept(c)
    }, 260)
  }, [cards, idx, fly, accept])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input,textarea,select')) return
      if (e.key === 'ArrowRight') swipe(1)
      if (e.key === 'ArrowLeft') swipe(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [swipe])

  if (q.loading && !q.data) return <PageLoader />
  if (q.error) return <ErrorNote message={q.error} onRetry={q.reload} />
  if (!week || !data) return <EmptyState title="No menu published yet">The kitchen publishes each week&rsquo;s menu by Thursday.</EmptyState>

  const onDown = (e: RPointerEvent) => {
    if ((e.target as HTMLElement).closest('a,button')) return
    start.current = { x: e.clientX, y: e.clientY }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    setDrag({ x: 0, y: 0, active: true })
  }
  const onMove = (e: RPointerEvent) => {
    if (!start.current) return
    setDrag({ x: e.clientX - start.current.x, y: (e.clientY - start.current.y) * 0.3, active: true })
  }
  const onUp = () => {
    if (!start.current) return
    start.current = null
    if (drag.x > SWIPE_AT) swipe(1)
    else if (drag.x < -SWIPE_AT) swipe(-1)
    else setDrag({ x: 0, y: 0, active: false })
  }

  const acceptLabel = (c: Card) => {
    if (c.kind === 'create') return 'Build'
    if (c.kind === 'mine') return locked ? 'View' : !booked ? 'Book' : c.due > 0 ? `Pay ${formatINR(c.due)}` : 'View'
    if (locked) return 'View'
    if (isMine(c)) return 'Selected'
    return booked ? (c.pack.price > credit ? `Switch · +${formatINR(c.pack.price - credit)}` : 'Choose') : 'Book'
  }

  const dx = fly ? fly * 640 : drag.x
  const like = Math.max(0, Math.min(1, dx / SWIPE_AT))
  const nope = Math.max(0, Math.min(1, -dx / SWIPE_AT))

  return (
    <div className="-mx-4 -mb-16 -mt-4 min-h-[calc(100dvh-64px)] bg-[#0f0b0a] text-white sm:-mx-6">
      {/* Header band */}
      <section className="relative overflow-hidden bg-[#120d0c] px-4 pb-24 pt-8 text-white sm:px-6">
        <img src="/menu/chef-lineart.jpg" alt="" className="pointer-events-none absolute -right-16 bottom-0 w-[340px] opacity-25 [mask-image:linear-gradient(to_left,black_40%,transparent)] sm:right-0 sm:w-[460px] sm:opacity-40" aria-hidden />
        <div className="relative mx-auto max-w-6xl">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs font-medium text-white/75">
            {locked ? <><Lock className="size-3.5" /> Choices closed for this week</> : <><Clock3 className="size-3.5" /> Choose by {formatDateTime(week.choice_deadline)} · {timeUntil(week.choice_deadline)}</>}
          </p>
          <h1 className="mt-4 font-display text-[30px] font-bold leading-tight sm:text-[40px]">Menus for {formatWeekRange(week.week_start)}</h1>
          <p className="mt-2 max-w-md text-[15px] text-white/60">Swipe through this week&rsquo;s menus. Swipe right to book one, left to see the next, or build your own.</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link to="/menu/create" className="bg-brand-grad inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold shadow-[0_10px_24px_-10px_rgba(222,59,44,0.8)]">
              {data.selection?.mode === 'custom' ? 'Edit my menu' : 'Build your own'}
            </Link>
            {booked && <span className="inline-flex h-10 items-center rounded-full bg-white/[0.06] px-4 text-sm text-white/75 ring-1 ring-white/10">This week is booked · switch menus freely</span>}
          </div>
        </div>
      </section>

      {/* Deck */}
      <section className="relative mx-auto -mt-16 max-w-6xl px-4 pb-16 sm:px-6">
        <div className="mx-auto w-full max-w-[370px]">
          <div className="relative h-[500px] select-none" aria-roledescription="carousel" aria-label="Menus">
            {done ? (
              <div className="animate-rise absolute inset-0 flex flex-col overflow-hidden rounded-[28px] bg-[#141010] text-white shadow-[0_30px_60px_-28px_rgba(0,0,0,0.85)] ring-1 ring-white/10">
                <span className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-[radial-gradient(circle,rgba(201,52,28,0.35),transparent_65%)]" aria-hidden />
                <div className="relative px-6 pt-7">
                  <p className="text-[20px] font-bold leading-tight">That&rsquo;s every menu this week</p>
                  <p className="mt-1 text-sm text-white/55">Tap one to look again, or make your own.</p>
                </div>
                <ul className="relative mt-5 flex-1 space-y-2 overflow-y-auto px-4">
                  {cards.flatMap((c) => (c.kind === 'create' ? [] : [c])).map((c) => (
                    <li key={c.key}>
                      <button type="button" onClick={() => setIdx(cards.indexOf(c))} className="flex w-full items-center gap-3 rounded-2xl bg-white/[0.04] p-2 pr-3 text-left ring-1 ring-white/[0.07] transition hover:bg-white/[0.08]">
                        <img src={c.photo} alt="" className="size-12 shrink-0 rounded-xl object-cover" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">{c.title}</span>
                          <span className="block truncate text-xs text-white/45">{mealsLabel(c.meals)}</span>
                        </span>
                        <span className="text-sm font-semibold tabular text-white/80">{formatINR(c.price)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="relative grid grid-cols-[auto_1fr] gap-2 border-t border-white/10 p-4">
                  <button type="button" onClick={() => setIdx(0)} className="inline-flex h-11 items-center gap-1.5 whitespace-nowrap rounded-full bg-white/[0.07] px-4 text-sm font-semibold text-white/85 ring-1 ring-white/10 hover:bg-white/10"><RotateCcw className="size-4" /> Again</button>
                  <Link to="/menu/create" className="bg-brand-grad inline-flex h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-4 text-sm font-semibold text-white shadow-[0_10px_24px_-10px_rgba(222,59,44,0.8)]">Build your own</Link>
                </div>
              </div>
            ) : (
              cards.slice(idx, idx + 3).reverse().map((c) => {
                const depth = cards.indexOf(c) - idx // 0 = top
                const isTop = depth === 0
                const style = isTop
                  ? { transform: `translate(${dx}px, ${fly ? -40 : drag.y}px) rotate(${dx / 18}deg)`, transition: drag.active && !fly ? 'none' : 'transform 0.28s cubic-bezier(0.2,0.8,0.2,1)' }
                  : { transform: `translateY(${depth * 14}px) scale(${1 - depth * 0.05})`, transition: 'transform 0.3s ease', opacity: depth === 2 ? 0.6 : 1 }
                return (
                  <article
                    key={c.key}
                    style={style}
                    onPointerDown={isTop ? onDown : undefined}
                    onPointerMove={isTop ? onMove : undefined}
                    onPointerUp={isTop ? onUp : undefined}
                    onPointerCancel={isTop ? onUp : undefined}
                    className={cx('absolute inset-0 flex touch-pan-y flex-col overflow-hidden rounded-[28px] bg-[#141010] text-white shadow-[0_30px_60px_-28px_rgba(0,0,0,0.85)] ring-1 ring-black/5', isTop && 'cursor-grab active:cursor-grabbing')}
                    aria-hidden={!isTop}
                  >
                    {c.kind === 'create' ? (
                      <>
                        <div className="relative h-[280px] shrink-0 overflow-hidden bg-[#09080d]">
                          <img src="/menu/chef-lineart.jpg" alt="" draggable={false} className="size-full object-cover object-top" />
                          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#141010] to-transparent" />
                        </div>
                        <div className="flex flex-1 flex-col px-6 pb-6">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-turmeric">Your way</p>
                          <h3 className="mt-1 font-script text-[36px] leading-none">Create your own</h3>
                          <p className="mt-3 text-sm leading-relaxed text-white/60">Pick dishes for every meal, day by day. You pay only for what you add.</p>
                          <p className="mt-auto text-xs text-white/40">Swipe right or tap the wand to start</p>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="relative h-[220px] shrink-0 overflow-hidden">
                          <img src={c.photo} alt="" draggable={false} className="size-full object-cover" />
                          <div className="absolute inset-0 bg-gradient-to-t from-[#141010] via-[#141010]/10 to-transparent" />
                          <span className="absolute left-4 top-4 rounded-full bg-black/55 px-3 py-1 text-xs font-semibold backdrop-blur">{c.kind === 'mine' ? 'Your menu' : '7 days'}</span>
                          <span className="absolute right-4 top-4 rounded-full bg-white px-3 py-1 text-sm font-bold text-ink shadow">{formatINR(c.price)}<span className="text-xs font-medium text-muted"> /week</span></span>
                        </div>
                        <div className="-mt-6 flex flex-1 flex-col px-6 pb-6">
                          <h3 className="relative font-script text-[38px] leading-none">{c.title}</h3>
                          <p className="mt-2 line-clamp-1 text-sm text-white/60">{c.kind === 'pack' ? c.pack.tagline : `${customCount(c.sel.custom)} dish${customCount(c.sel.custom) === 1 ? '' : 'es'} you picked`}</p>
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {MEALS.filter((m) => c.meals.includes(m)).map((m) => <span key={m} className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold">{MEAL_NAME[m]}</span>)}
                            {c.kind === 'pack' && <span className="rounded-full px-1 py-0.5 text-[11px] text-white/45">≈ {formatINR(c.price / (7 * Math.max(1, c.meals.length)))} a meal</span>}
                          </div>
                          <div className="mt-4 border-t border-white/10 pt-3">
                            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">{thisWeek ? 'Today' : 'Monday'} on this menu</p>
                            <Preview items={data.items} sel={c.sel} meals={c.meals} dishes={data.dishes} day={previewDay} />
                          </div>
                          <div className="mt-auto flex items-center justify-between border-t border-white/10 pt-3 text-xs">
                            {(c.kind === 'pack' && isMine(c)) || (c.kind === 'mine' && booked && c.due === 0) ? (
                              <span className="flex items-center gap-1.5 font-semibold text-[#34c759]"><Check className="size-4" /> {c.kind === 'mine' ? 'Included in your booking' : 'Your menu this week'}</span>
                            ) : (
                              <span className="text-white/45">7 days · {mealsLabel(c.meals).toLowerCase()}</span>
                            )}
                            <span className="font-semibold text-white/70">Swipe → {acceptLabel(c).toLowerCase()}</span>
                          </div>
                        </div>
                      </>
                    )}

                    {isTop && (
                      <>
                        <span className="pointer-events-none absolute left-5 top-24 -rotate-12 rounded-lg border-[3px] border-[#34c759] bg-black/30 px-3 py-1 text-xl font-black uppercase tracking-wider text-[#34c759]" style={{ opacity: like }}>{acceptLabel(c)}</span>
                        <span className="pointer-events-none absolute right-5 top-24 rotate-12 rounded-lg border-[3px] border-white bg-black/30 px-3 py-1 text-xl font-black uppercase tracking-wider text-white" style={{ opacity: nope }}>Next</span>
                      </>
                    )}
                  </article>
                )
              })
            )}
          </div>

          {/* Actions */}
          {!done && top && (
            <div className="mt-6 flex items-center justify-center gap-4">
              <button type="button" onClick={() => swipe(-1)} aria-label="Next menu" className="grid size-14 place-items-center rounded-full bg-white/[0.07] text-white ring-1 ring-white/15 transition hover:scale-105 hover:bg-white/10 active:scale-95">
                <X className="size-6" strokeWidth={2.6} />
              </button>
              {top.kind !== 'create' ? (
                <Link to={top.kind === 'mine' ? '/menu/view/mine' : `/menu/view/${top.pack.id}`} aria-label="See the full menu" className="grid size-11 place-items-center rounded-full bg-white/[0.07] text-white/75 ring-1 ring-white/15 transition hover:scale-105 hover:bg-white/10 active:scale-95">
                  <Eye className="size-5" />
                </Link>
              ) : <span className="size-11" aria-hidden />}
              <button type="button" disabled={busy || (top.kind === 'pack' && isMine(top))} onClick={() => swipe(1)} aria-label={acceptLabel(top)} className="bg-brand-grad grid size-14 place-items-center rounded-full text-white shadow-[0_14px_28px_-12px_rgba(222,59,44,0.9)] transition hover:scale-105 active:scale-95 disabled:opacity-50">
                {top.kind === 'create' ? <Plus className="size-7" strokeWidth={2.6} /> : <Check className="size-7" strokeWidth={2.8} />}
              </button>
            </div>
          )}
          {!done && top && <p className="mt-3 text-center text-xs text-white/45">{acceptLabel(top)} · swipe or use the buttons · {idx + 1} of {cards.length}</p>}

          {/* Jump to any card */}
          <div className="no-scrollbar mt-8 flex gap-2 overflow-x-auto sm:justify-center">
            {cards.map((c, i) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setIdx(i)}
                aria-label={c.kind === 'create' ? 'Create your own' : c.title}
                aria-current={i === idx}
                className={cx('flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors', i === idx ? 'border-white bg-white text-ink' : 'border-white/15 bg-white/[0.04] text-white/70 hover:text-white')}
              >
                {c.kind === 'create' ? 'Create your own' : c.title}
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
