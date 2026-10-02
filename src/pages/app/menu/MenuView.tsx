import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ArrowLeft, Check, Lock, Pencil } from 'lucide-react'
import { useAuth } from '../../../lib/auth'
import { useAsync } from '../../../lib/useAsync'
import { loadSettings, savePicks } from '../../../lib/data'
import { DAY_NAMES, addDays, formatDate, formatWeekRange, mondayOf, today, weekdayIndex } from '../../../lib/dates'
import { MEAL_NAME, customCharge, customCount, customMeals, customTotal, dishesFor, formatINR, isLocked, mealsLabel, weekPlanMeals } from '../../../lib/logic'
import { MEALS, type Dish, type Meal, type Selection, type Settings } from '../../../lib/types'
import { EmptyState, ErrorNote, PageLoader, cx } from '../../../components/ui'
import { DishImage } from '../../../components/DishImage'
import { useToast } from '../../../components/toast'
import { useLoginGate } from '../../../components/LoginSheet'
import { readDraft, useMenuData } from './useMenuData'
import { darkPaper } from '../../../components/menu'

const PACK_PHOTOS = ['/photos/thali-classic.jpg', '/photos/thali-fullday.jpg', '/photos/thali-protein.jpg', '/photos/thali-light.jpg']
const timesOf = (s: Settings | undefined, m: Meal) => (s ? { breakfast: s.breakfast_time, lunch: s.lunch_time, snacks: s.snacks_time, dinner: s.dinner_time }[m] : '')

/** One menu in detail: a ready-made menu (by id) or the student's own menu ("mine"). */
export default function MenuView() {
  const { id } = useParams()
  const { profile } = useAuth()
  const uid = profile?.role === 'student' ? profile.id : null
  const nav = useNavigate()
  const toast = useToast()
  const { requireLogin } = useLoginGate()
  const q = useMenuData(uid)
  const settings = useAsync(() => loadSettings(), [])
  const [day, setDay] = useState(0)
  const [dir, setDir] = useState<1 | -1>(1)
  const [busy, setBusy] = useState(false)
  const touchX = useRef<number | null>(null)

  useEffect(() => {
    const w = q.data?.week
    if (w) setDay(w.week_start === mondayOf(today()) ? weekdayIndex(today()) : 0)
  }, [q.data?.week])

  if (q.loading && !q.data) return <PageLoader />
  if (q.error) return <ErrorNote message={q.error} onRetry={q.reload} />
  const { week, items, packs, dishes, selection, member } = q.data!
  if (!week) return <EmptyState title="No menu published yet" />

  const bookable = packs.filter((p) => p.price > 0)
  const pack = id && id !== 'mine' ? packs.find((p) => p.id === id) : undefined
  if (id !== 'mine' && !pack) return <EmptyState title="This menu isn’t available" action={<Link to="/menu" className="font-semibold text-brand">Back to menus</Link>} />

  const weekId: string = week.id
  const draft = readDraft(weekId)
  const sel: Selection | null = pack
    ? { id: '', user_id: uid ?? '', week_id: weekId, mode: 'pack', pack_id: pack.id, picks: pack.picks, custom: {}, updated_at: '' }
    : selection ?? (draft ? { id: '', user_id: '', week_id: weekId, mode: 'custom', pack_id: null, picks: {}, custom: draft, updated_at: '' } : null)
  const mineIsPack = !pack && sel?.mode === 'pack' ? packs.find((p) => p.id === sel.pack_id) : undefined
  const meals = pack ? pack.meals : sel?.mode === 'custom' ? customMeals(sel.custom) : mineIsPack ? mineIsPack.meals : MEALS.filter((m) => items.some((it) => it.meal === m))
  const price = pack ? pack.price : sel?.mode === 'custom' ? customTotal(sel.custom, dishes) : mineIsPack?.price ?? 0
  const planMeals = member && uid ? weekPlanMeals(member.subs, uid, week) : []
  const covered = planMeals.length > 0 && meals.every((m) => planMeals.includes(m))
  const due = !pack && sel?.mode === 'custom' ? customCharge(sel.custom, dishes, planMeals) : covered ? 0 : price
  const locked = isLocked(week)
  const selected = !!pack && selection?.mode === 'pack' && selection.pack_id === pack.id
  const photoPack = pack ?? mineIsPack
  const photo = photoPack ? PACK_PHOTOS[Math.max(0, bookable.indexOf(photoPack)) % PACK_PHOTOS.length] : '/photos/served.jpg'
  const title = pack?.name ?? (sel?.mode === 'custom' ? 'My Menu' : mineIsPack?.name ?? 'This week')
  const subtitle = pack?.tagline ?? (sel?.mode === 'custom' ? `${customCount(sel.custom)} dishes you picked for the week` : mineIsPack ? 'Your menu this week' : 'The kitchen’s favourites. You haven’t chosen yet.')
  const date = addDays(week.week_start, day)
  const dayMeals = MEALS.filter((m) => meals.includes(m))

  const changeDay = (d: number) => {
    if (d < 0 || d > 6 || d === day) return
    setDir(d > day ? 1 : -1)
    setDay(d)
  }

  async function act() {
    if (!week) return
    if (locked) return nav('/menu')
    if (!pack) {
      if (sel?.mode === 'custom' && due > 0) return nav(`/wallet?custom=${week.id}`)
      return nav('/menu/create')
    }
    if (!covered) return nav(`/wallet?pack=${pack.id}`)
    const p = pack
    const save = async () => {
      setBusy(true)
      try {
        await savePicks(uid!, week.id, 'pack', p.id, p.picks)
        toast(`${p.name} is your menu for ${formatWeekRange(week.week_start)}`)
        q.reload()
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Could not save', 'error')
      } finally {
        setBusy(false)
      }
    }
    if (!uid) requireLogin('Log in to choose this menu.', () => void save())
    else await save()
  }

  const action = locked
    ? { label: 'Back to menus', icon: null }
    : pack
      ? selected ? { label: 'Your menu', icon: <Check className="size-4" /> } : covered ? { label: 'Choose this menu', icon: <Check className="size-4" /> } : { label: 'Book this week', icon: null }
      : sel?.mode === 'custom' && due > 0 ? { label: `Pay ${formatINR(due)}`, icon: null } : { label: sel?.mode === 'custom' ? 'Edit menu' : 'Build my menu', icon: <Pencil className="size-4" /> }

  return (
    <div className="-mx-4 -mt-4 min-h-[calc(100dvh-64px)] bg-[#0f0b0a] pb-32 text-white sm:-mx-6">
      {/* Hero: dark brand background, photo as its own card, text on solid dark */}
      <section className="relative overflow-hidden bg-[#120d0c] text-white" style={darkPaper}>
        <div className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full bg-[radial-gradient(circle,rgba(201,52,28,0.35),transparent_65%)]" aria-hidden />
        <div className="relative mx-auto grid max-w-3xl gap-5 px-5 pb-7 pt-5 sm:grid-cols-[1fr_1.1fr] sm:items-center sm:gap-8 sm:px-6 sm:py-10">
          <div className="relative overflow-hidden rounded-[22px] shadow-[0_24px_48px_-24px_rgba(0,0,0,0.9)] ring-1 ring-white/10 sm:order-2">
            <img src={photo} alt={`${title} menu`} className="aspect-[16/10] w-full object-cover" />
            <span className="absolute right-3 top-3 rounded-full bg-white px-3 py-1 text-sm font-bold text-ink shadow">{formatINR(price)}<span className="text-xs font-medium text-ink/50"> /week</span></span>
          </div>
          <div>
            <Link to="/menu" className="mb-3 hidden items-center gap-1.5 text-sm font-semibold text-white/70 hover:text-white md:inline-flex"><ArrowLeft className="size-4" /> All menus</Link>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-turmeric">{pack ? 'Ready-made week' : 'Your week'} · {formatWeekRange(week.week_start)}</p>
            <h1 className="mt-1.5 font-script text-[42px] leading-none sm:text-[54px]">{title}</h1>
            <p className="mt-2 max-w-md text-[15px] text-white/80">{subtitle}</p>
            <div className="mt-4 flex flex-wrap items-center gap-1.5">
              {dayMeals.map((m) => <span key={m} className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold ring-1 ring-white/15">{MEAL_NAME[m]}</span>)}
            </div>
            {price > 0 && <p className="mt-3 text-sm text-white/65">{formatINR(price)} for 7 days{pack ? ` · ≈ ${formatINR(price / (7 * Math.max(1, meals.length)))} a meal` : ''}</p>}
          </div>
        </div>
      </section>

      {/* Day picker */}
      <div className="sticky top-16 z-20 bg-[#0f0b0a]/90 px-3 py-3 backdrop-blur sm:top-[72px] sm:px-6">
        <div className="mx-auto grid max-w-3xl grid-cols-7 gap-1 rounded-2xl bg-white/[0.05] p-1 ring-1 ring-white/10" role="tablist" aria-label="Day">
          {DAY_NAMES.map((n, i) => {
            const d = addDays(week.week_start, i)
            const on = i === day
            const isToday = d === today()
            const past = d < today()
            return (
              <button
                key={n}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => changeDay(i)}
                className={cx('relative flex flex-col items-center rounded-xl py-2 transition-all duration-200', on ? 'bg-brand-grad text-white shadow-[0_6px_14px_-6px_rgba(222,59,44,0.8)]' : 'text-white/85 hover:bg-white/[0.07]', past && !on && 'opacity-40')}
              >
                <span className={cx('text-[10px] font-semibold uppercase tracking-wide', on ? 'text-white/80' : 'text-white/50')}>{n.slice(0, 3)}</span>
                <span className="text-[16px] font-bold leading-tight tabular">{Number(d.slice(8))}</span>
                {isToday && <span className={cx('absolute bottom-1 size-1 rounded-full', on ? 'bg-white' : 'bg-brand')} aria-label="today" />}
              </button>
            )
          })}
        </div>
      </div>

      {/* Day content */}
      <section
        className="mx-auto max-w-3xl px-4 pt-6 sm:px-6"
        onTouchStart={(e) => { touchX.current = e.touches[0].clientX }}
        onTouchEnd={(e) => {
          if (touchX.current === null) return
          const dx = e.changedTouches[0].clientX - touchX.current
          touchX.current = null
          if (Math.abs(dx) > 60) changeDay(day + (dx < 0 ? 1 : -1))
        }}
      >
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="font-display text-[22px] font-bold">{date === today() ? 'Today' : DAY_NAMES[day]}</h2>
          <span className="text-sm text-white/50">{formatDate(date, { weekday: date === today() })}</span>
        </div>
        <div key={day} className={dir > 0 ? 'day-in-right' : 'day-in-left'}>
          {dayMeals.length === 0 ? (
            <p className="rounded-2xl bg-white/[0.04] p-6 text-center text-sm text-white/50">Nothing on this menu for {DAY_NAMES[day]}.</p>
          ) : (
            <div className="space-y-3">
              {dayMeals.map((m) => {
                const ds = dishesFor(items, day, m, sel).map((d) => dishes.get(d)).filter((x): x is Dish => !!x)
                const total = ds.reduce((s, d) => s + d.price, 0)
                return (
                  <article key={m} className="overflow-hidden rounded-2xl bg-white/[0.04] ring-1 ring-white/10">
                    <header className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
                      <img src={`/meals/${m}.png`} alt="" className="size-10 rounded-full" />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">{MEAL_NAME[m]}</p>
                        <p className="text-xs text-white/50">{timesOf(settings.data, m)}</p>
                      </div>
                      {ds.length > 0 && <span className="text-sm font-semibold text-white/70 tabular">{formatINR(total)}</span>}
                    </header>
                    {ds.length === 0 ? (
                      <p className="px-4 py-4 text-sm text-white/50">Nothing picked for this meal.</p>
                    ) : (
                      <ul className="divide-y divide-white/10">
                        {ds.map((d) => (
                          <li key={d.id} className="flex items-center gap-3 px-4 py-2.5">
                            <DishImage dish={d} className="size-11 shrink-0 rounded-xl" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[15px] font-medium">{d.name}</p>
                              {d.description && <p className="truncate text-xs text-white/50">{d.description}</p>}
                            </div>
                            {d.is_premium && <span className="rounded-full bg-turmeric/15 px-2 py-0.5 text-[10px] font-bold uppercase text-turmeric">Special</span>}
                            <span className="w-10 shrink-0 text-right text-sm text-white/50 tabular">{formatINR(d.price)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </article>
                )
              })}
            </div>
          )}
        </div>
        <p className="mt-5 text-center text-xs text-white/50">Swipe left or right to change the day</p>
      </section>

      {/* Bottom bar */}
      <div className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-[#120d0c]/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <p className="flex items-baseline gap-1">
              <span className="font-display text-[22px] font-bold tabular">{formatINR(due)}</span>
              <span className="text-xs text-white/50">{due === 0 && price > 0 ? 'included in your plan' : '/ week'}</span>
            </p>
            <p className="truncate text-xs text-white/50">
              {locked ? <span className="inline-flex items-center gap-1"><Lock className="size-3" /> Choices closed for this week</span> : due === 0 && price > 0 ? <span className="inline-flex items-center gap-1 text-leaf">{mealsLabel(meals)} covered</span> : `${mealsLabel(meals)} · 7 days`}
            </p>
          </div>
          <button type="button" onClick={act} disabled={busy || selected} className="bg-brand-grad inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full px-5 text-[15px] font-semibold text-white shadow-[0_10px_24px_-10px_rgba(222,59,44,0.8)] transition hover:brightness-110 active:scale-[0.98] disabled:opacity-60">
            {action.icon}{busy ? 'Saving…' : action.label}
          </button>
        </div>
      </div>
    </div>
  )
}
