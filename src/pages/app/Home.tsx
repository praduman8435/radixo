import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { ArrowLeft, ArrowRight, CheckCircle2, ChefHat, ChevronDown, Clock3, MapPin, QrCode, UtensilsCrossed } from 'lucide-react'
import { useAuth } from '../../lib/auth'
import { api } from '../../lib/backend'
import { useAsync } from '../../lib/useAsync'
import { useInView } from '../../lib/useInView'
import { loadDishMap, loadMember, loadPublishedWeeks, loadSettings, loadWeekContent } from '../../lib/data'
import { DURATIONS, bookingTotal, discountFor, effectiveSelection, firstOpenSlot } from '../../lib/booking'
import { addDays, currentMeal, formatDate, formatWeekRange, today, weekdayIndex } from '../../lib/dates'
import { MEAL_NAME, dishesFor, formatINR, mealsLabel, memberState, subLabel, weekForDate } from '../../lib/logic'
import { MEALS, type Dish, type Meal, type Pack, type Settings } from '../../lib/types'
import { PageLoader, cx } from '../../components/ui'
import { DishImage } from '../../components/DishImage'
import { Chef } from '../../components/Chef'
import { darkPaper } from '../../components/menu'
import { pickWeek } from './menu/useMenuData'

/** Photos for ready-made menu cards, in order (see public/photos/CREDITS.md). */
const PACK_PHOTOS = ['/photos/thali-classic.jpg', '/photos/thali-fullday.jpg', '/photos/thali-protein.jpg', '/photos/thali-light.jpg']

function useHomeData(uid: string | null) {
  return useAsync(async () => {
    const t = today()
    const [weeks, dishes, settings] = await Promise.all([loadPublishedWeeks(), loadDishMap(), loadSettings()])
    const thisWeek = weekForDate(weeks, t)
    const openWeek = pickWeek(weeks, null, settings)
    const [cur, open] = await Promise.all([
      thisWeek ? loadWeekContent(thisWeek.id) : Promise.resolve(null),
      openWeek && openWeek.id !== thisWeek?.id ? loadWeekContent(openWeek.id) : Promise.resolve(null),
    ])
    const member = uid ? await loadMember(uid) : null
    const selections = uid ? await api.list('selections', { eq: { user_id: uid } }) : []
    const attendance = uid ? await api.list('attendance', { eq: { user_id: uid, date: t } }) : []
    return { thisWeek, openWeek, cur, open: open ?? (openWeek?.id === thisWeek?.id ? cur : null), dishes, settings, member, selections, attendance }
  }, [uid])
}

// ---------- helpers ----------

const Container = ({ children, className }: { children: ReactNode; className?: string }) => <div className={cx('mx-auto max-w-6xl px-4 sm:px-6', className)}>{children}</div>

function SectionHead({ eyebrow, title, link }: { eyebrow?: string; title: string; link?: { to: string; label: string } }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#ff7a5c]">{eyebrow}</p>}
        <h2 className="mt-1 truncate font-display text-[22px] font-bold leading-tight text-white sm:text-[28px]">{title}</h2>
      </div>
      {link && (
        <Link to={link.to} className="group inline-flex shrink-0 items-center gap-1 whitespace-nowrap pb-1 text-sm font-semibold text-white/70 hover:text-white">
          {link.label} <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
        </Link>
      )}
    </div>
  )
}

/** Horizontal scroller on phones, grid on larger screens; children all stretch to the same height. */
function Rail({ children, cols = 3 }: { children: ReactNode; cols?: 2 | 3 | 4 }) {
  const grid = { 2: 'md:grid-cols-2', 3: 'md:grid-cols-3', 4: 'md:grid-cols-2 lg:grid-cols-4' }[cols]
  return (
    <div className={cx('no-scrollbar -mx-4 flex snap-x snap-mandatory scroll-pl-4 gap-3 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:scroll-pl-6 sm:px-6 md:mx-0 md:grid md:overflow-visible md:px-0 md:pb-0', grid)}>
      {children}
    </div>
  )
}
const railItem = 'w-[78%] max-w-[320px] shrink-0 snap-start md:w-auto md:max-w-none'

const timesOf = (s: Settings): Record<Meal, string> => ({ breakfast: s.breakfast_time, lunch: s.lunch_time, snacks: s.snacks_time, dinner: s.dinner_time })

/** Which meal is being served right now, from timings like "12:00 – 3:00 PM". */
function servingNow(s: Settings): Meal | null {
  const toMin = (txt: string, pmDefault: boolean) => {
    const m = txt.trim().match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i)
    if (!m) return null
    const pm = m[3] ? m[3].toUpperCase() === 'PM' : pmDefault
    return ((Number(m[1]) % 12) + (pm ? 12 : 0)) * 60 + Number(m[2])
  }
  const now = new Date().getHours() * 60 + new Date().getMinutes()
  for (const meal of MEALS) {
    const [a, b] = timesOf(s)[meal].split(/[–-]/)
    if (!a || !b) continue
    const endPm = /PM/i.test(b)
    const start = toMin(a, endPm && !/AM/i.test(a))
    const end = toMin(b, endPm)
    if (start !== null && end !== null && now >= start && now <= end) return meal
  }
  return null
}

const perMeal = (p: Pack) => p.price / (7 * Math.max(1, p.meals.length))

// ---------- sections ----------

function Hero({ name, live, next, settings, fromPrice, chips }: { name?: string; live: Meal | null; next: Meal; settings: Settings; fromPrice: number; chips: Dish[] }) {
  return (
    <section className="relative overflow-hidden bg-[#120d0c] text-white">
      <div className="pointer-events-none absolute inset-0 opacity-70" style={darkPaper} aria-hidden />
      <div className="pointer-events-none absolute -right-40 -top-40 size-[520px] rounded-full bg-[radial-gradient(circle,rgba(201,52,28,0.28),transparent_65%)]" aria-hidden />
      <Container className="relative grid items-center gap-10 pb-16 pt-10 md:grid-cols-[1.05fr_1fr] md:pb-24 md:pt-16">
        <div>
          <p className="animate-rise inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs font-medium text-white/75">
            {live ? <><span className="pulse-dot size-1.5 rounded-full bg-[#34c759]" /> Serving {MEAL_NAME[live].toLowerCase()} now · {timesOf(settings)[live]}</> : <><Clock3 className="size-3.5" /> Next up: {MEAL_NAME[next]} · {timesOf(settings)[next]}</>}
          </p>
          <h1 className="animate-rise mt-5 font-display text-[34px] font-bold leading-[1.1] sm:text-[46px] lg:text-[52px]" style={{ animationDelay: '60ms' }}>
            {name ? <>Hey {name}, <span className="font-script font-normal text-brand-grad">what&rsquo;s on your plate?</span></> : <>Ghar jaisa khana, <span className="whitespace-nowrap font-script font-normal text-brand-grad">your way.</span></>}
          </h1>
          <p className="animate-rise mt-4 max-w-md text-[15px] leading-relaxed text-white/65 sm:text-base" style={{ animationDelay: '120ms' }}>
            Choose a ready-made week or build your own, dish by dish. Freshly cooked student meals from {formatINR(fromPrice)} a meal.
          </p>
          <div className="animate-rise mt-7 flex flex-wrap gap-2.5" style={{ animationDelay: '180ms' }}>
            <Link to="/menu/create" className="bg-brand-grad inline-flex h-11 items-center gap-2 rounded-full px-5 text-[15px] font-semibold shadow-[0_10px_24px_-10px_rgba(222,59,44,0.8)] transition hover:brightness-110 active:scale-[0.98]">
              Build my menu
            </Link>
            <Link to="/menu" className="inline-flex h-11 items-center gap-1.5 rounded-full border border-white/15 px-5 text-[15px] font-semibold text-white/90 transition hover:bg-white/[0.06] active:scale-[0.98]">
              See this week <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-[460px]">
          <div className="animate-rise relative overflow-hidden rounded-[28px] shadow-[0_40px_80px_-30px_rgba(0,0,0,0.9)] ring-1 ring-white/10" style={{ animationDelay: '100ms' }}>
            <img src="/photos/hero-thali.jpg" alt="A freshly served Indian thali" className="aspect-[5/4] w-full object-cover md:aspect-[5/6]" />
            <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/60 to-transparent" aria-hidden />
          </div>
          {chips.slice(0, 2).map((d, i) => (
            <div key={d.id} className={cx('animate-float absolute flex items-center gap-2.5 rounded-2xl bg-white py-2 pl-2 pr-4 text-ink shadow-[0_18px_40px_-14px_rgba(0,0,0,0.6)]', i === 0 ? '-left-3 top-10 sm:-left-8' : '-right-2 bottom-12 sm:-right-6')} style={{ animationDelay: `${i * 1.2}s` }}>
              <DishImage dish={d} className="size-10 rounded-xl" />
              <span className="leading-tight">
                <span className="block max-w-[120px] truncate text-[13px] font-semibold">{d.name}</span>
                <span className="block text-xs text-muted">{formatINR(d.price)} · {d.is_premium ? 'chef’s special' : 'today'}</span>
              </span>
            </div>
          ))}
        </div>
      </Container>
    </section>
  )
}

function StoryCollage() {
  const [ref, inView] = useInView<HTMLDivElement>()
  const imgs = [
    { src: '/photos/roti-thali.jpg', cls: 'left-0 top-6 w-[58%] -rotate-3', delay: 0 },
    { src: '/photos/dal-rice.jpg', cls: 'right-0 top-0 w-[48%] rotate-3', delay: 120 },
    { src: '/photos/spread.jpg', cls: 'bottom-0 left-[18%] w-[64%] rotate-1', delay: 240 },
  ]
  return (
    <div ref={ref} className="relative aspect-[5/4] w-full">
      {imgs.map((im) => (
        <img
          key={im.src}
          src={im.src}
          alt=""
          className={cx('absolute aspect-[4/3] rounded-2xl object-cover shadow-[0_24px_40px_-20px_rgba(0,0,0,0.8)] ring-4 ring-[#0f0b0a] transition-all duration-700 ease-out', im.cls, inView ? 'opacity-100' : 'translate-y-6 opacity-0')}
          style={{ transitionDelay: `${im.delay}ms` }}
        />
      ))}
    </div>
  )
}

const QUOTES: { text: string; by: string }[] = [
  { text: 'Ghar ka swaad, college ke paas.', by: 'Cooked fresh, every morning' },
  { text: 'Exams are hard. Dinner shouldn’t be.', by: 'Hot food, on time, every day' },
  { text: 'Your plate, your rules, every single week.', by: 'Build your own menu' },
  { text: 'Fewer Maggi nights, more real meals.', by: 'Four meals a day, if you want' },
  { text: 'Made with care, like it’s for family.', by: 'From the Radixo kitchen' },
]
const QUOTE_MS = 5000

/** "From our kitchen": the chef beside a rotating line. Auto-advances; swipe, tap the bars or use the arrows. */
function ChefStory() {
  const [ref, inView] = useInView<HTMLElement>()
  const [idx, setIdx] = useState(0)
  const [paused, setPaused] = useState(false)
  const [tick, setTick] = useState(0) // restarts the progress bar after manual changes
  const touchX = useRef<number | null>(null)

  const go = useCallback((n: number) => {
    setIdx(((n % QUOTES.length) + QUOTES.length) % QUOTES.length)
    setTick((t) => t + 1)
  }, [])

  useEffect(() => {
    if (!inView || paused) return
    const t = window.setTimeout(() => go(idx + 1), QUOTE_MS)
    return () => clearTimeout(t)
  }, [idx, inView, paused, tick, go])

  return (
    <section
      ref={ref}
      className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#1f1412] via-[#161010] to-[#100b0a] ring-1 ring-white/10"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={(e) => { touchX.current = e.touches[0].clientX; setPaused(true) }}
      onTouchEnd={(e) => {
        const start = touchX.current
        touchX.current = null
        setPaused(false)
        if (start === null) return
        const dx = e.changedTouches[0].clientX - start
        if (Math.abs(dx) > 40) go(idx + (dx < 0 ? 1 : -1))
      }}
      aria-roledescription="carousel"
      aria-label="From the Radixo kitchen"
    >
      <span className="pointer-events-none absolute -left-24 top-1/2 size-[420px] -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(201,52,28,0.22),transparent_65%)]" aria-hidden />
      <div className="relative grid items-center gap-2 px-6 py-8 md:grid-cols-[minmax(0,340px)_1fr] md:gap-10 md:px-12 md:py-12">
        <Chef className="chef-bob mx-auto w-full max-w-[230px] [mask-image:linear-gradient(to_bottom,#000_78%,transparent)] md:max-w-[320px]" />

        <div className="min-w-0 text-center md:text-left">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#ff7a5c]">From our kitchen</p>

          {/* All lines share one grid cell, so the panel keeps the height of the longest one. */}
          <div className="mt-4 grid" aria-live="polite">
            {QUOTES.map((q, i) => (
              <figure
                key={q.text}
                aria-hidden={i !== idx}
                className={cx(
                  'col-start-1 row-start-1 flex flex-col justify-center transition-all duration-700 ease-[cubic-bezier(0.2,0.8,0.2,1)]',
                  i === idx ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0',
                )}
              >
                <blockquote className="font-script-italic text-[28px] leading-[1.2] text-white sm:text-[36px] lg:text-[42px]">{q.text}</blockquote>
                <figcaption className="mt-3 text-sm text-white/50">{q.by}</figcaption>
              </figure>
            ))}
          </div>

          <div className="mt-7 flex items-center justify-center gap-4 md:justify-start">
            <div className="flex items-center gap-1.5">
              {QUOTES.map((q, i) => (
                <button key={q.text} type="button" onClick={() => go(i)} aria-label={`Line ${i + 1}`} aria-current={i === idx} className="group grid h-6 place-items-center">
                  <span className={cx('relative block h-1 overflow-hidden rounded-full bg-white/15 transition-all duration-500', i === idx ? 'w-10' : 'w-4 group-hover:bg-white/30')}>
                    {i === idx && (
                      <span
                        key={`${idx}-${tick}`}
                        className="quote-progress absolute inset-y-0 left-0 rounded-full bg-[#ff7a5c]"
                        style={{ animationDuration: `${QUOTE_MS}ms`, animationPlayState: paused || !inView ? 'paused' : 'running' }}
                      />
                    )}
                  </span>
                </button>
              ))}
            </div>
            <div className="hidden items-center gap-1.5 sm:flex">
              <button type="button" onClick={() => go(idx - 1)} aria-label="Previous line" className="grid size-8 place-items-center rounded-full bg-white/[0.07] text-white/70 ring-1 ring-white/10 transition hover:bg-white/15 hover:text-white"><ArrowLeft className="size-4" /></button>
              <button type="button" onClick={() => go(idx + 1)} aria-label="Next line" className="grid size-8 place-items-center rounded-full bg-white/[0.07] text-white/70 ring-1 ring-white/10 transition hover:bg-white/15 hover:text-white"><ArrowRight className="size-4" /></button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

const FAQ: [string, string][] = [
  ['Do I need an account to see the menu?', 'No. Browse every menu and even build your own. We only ask for your mobile number when you save, book or pay.'],
  ['How does building my own menu work?', 'For every meal the kitchen offers a few dishes. Add the ones you want for each day and the total updates as you go. Prices are per serving and include GST.'],
  ['How late can I book or change?', 'Up to 24 hours before each meal. Book today and you can start from the next meal that’s at least 24 hours away.'],
  ['Can I book for longer?', 'Yes. Book any menu for 1 week, 1 month, 3 months or 6 months. Longer bookings cost less per week, and your menu carries over each week. Change any meal up to 24 hours before it.'],
  ['What if I go home for a few days?', 'Mark the days you’re not coming, at least 24 hours before. The full value of those meals goes to your wallet and pays for your next booking automatically.'],
  ['How do I pay?', 'By UPI: scan the QR or open your UPI app, then paste the reference number. Cash at the counter goes into your wallet.'],
]

// ---------- page ----------

export default function Home() {
  const { profile } = useAuth()
  const isStudent = !!profile && profile.role === 'student'
  const uid = isStudent ? profile!.id : null
  const q = useHomeData(uid)
  const [faq, setFaq] = useState<number | null>(0)
  const [day, setDay] = useState(weekdayIndex(today()))

  if (q.loading && !q.data) return <PageLoader />
  if (!q.data) return null
  const { thisWeek, openWeek, cur, open, dishes, settings, member, selections, attendance } = q.data
  const t = today()
  const state = member && uid ? memberState(uid, member.subs, member.payments, member.pauses) : null
  const savedCur = selections.find((s) => s.week_id === thisWeek?.id) ?? null
  const curSel = thisWeek && cur && uid && member ? effectiveSelection({ userId: uid, week: thisWeek, items: cur.items, packs: cur.packs, selection: savedCur, subs: member.subs }) : savedCur
  const live = servingNow(settings)
  const next = live ?? MEALS.find((m) => MEALS.indexOf(m) >= MEALS.indexOf(currentMeal())) ?? 'breakfast'
  const photoDishes = [...new Map([...dishes.values()].filter((x) => x.is_active && x.image_url).sort((a, b) => b.price - a.price).map((x) => [x.image_url, x])).values()]
  const packs = (open?.packs ?? []).filter((p) => p.price > 0)
  const cheapest = [...packs].sort((a, b) => a.price - b.price)[0]
  const fromPrice = Math.round(cheapest ? (perMeal(cheapest) * (100 - settings.discount_6m)) / 100 : 60)
  const dayMeals = cur ? MEALS.filter((m) => dishesFor(cur.items, day, m, curSel).length > 0) : []
  const firstName = isStudent ? profile!.full_name.split(' ')[0] : undefined

  return (
    <>
      <Hero name={firstName} live={live} next={next} settings={settings} fromPrice={fromPrice} chips={photoDishes} />

      {/* Status strip */}
      <Container className="relative z-10 -mt-8">
        {isStudent && state ? (
          <div className="flex flex-wrap items-center gap-4 rounded-2xl bg-[#1a1413] p-4 text-white shadow-[0_20px_40px_-24px_rgba(0,0,0,0.9)] ring-1 ring-white/10 sm:p-5">
            <span className={cx('grid size-11 shrink-0 place-items-center rounded-xl', state.kind === 'active' || state.kind === 'upcoming' ? 'bg-[#34c759]/15 text-[#5ee07f]' : 'bg-brand/15 text-[#ff7a5c]')}>
              {state.kind === 'active' || state.kind === 'upcoming' ? <CheckCircle2 className="size-5" /> : <UtensilsCrossed className="size-5" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{state.kind === 'active' ? `${state.daysLeft} days left on your booking${state.paused ? ' · not coming today' : ''}` : state.kind === 'pending' ? 'Your payment is being checked' : state.kind === 'upcoming' ? `Your booking starts ${formatDate(state.sub.start_date)}` : 'Nothing booked yet'}</p>
              <p className="truncate text-sm text-white/55">
                {state.kind === 'active' || state.kind === 'upcoming' ? `${subLabel(state.sub)} · ${mealsLabel(state.sub.meals)} · till ${formatDate(state.sub.end_date)}` : state.kind === 'pending' ? 'We’ll confirm it soon, usually within a few hours' : 'Pick a menu and book it for a week or longer'}

              </p>
            </div>
            {state.kind === 'pending' ? (
              <Link to="/wallet" className="inline-flex h-10 items-center rounded-full bg-white/[0.08] px-4 text-sm font-semibold text-white ring-1 ring-white/10">Wallet</Link>
            ) : state.kind === 'active' || state.kind === 'upcoming' ? (
              <Link to="/profile" className="inline-flex h-10 items-center gap-1.5 rounded-full bg-white px-4 text-sm font-semibold text-ink"><QrCode className="size-4" /> Show pass</Link>
            ) : (
              <Link to="/menu" className="bg-brand-grad inline-flex h-10 items-center rounded-full px-4 text-sm font-semibold text-white">See menus</Link>
            )}
          </div>
        ) : openWeek ? (
          <Link to="/menu" className="group flex items-center gap-4 rounded-2xl bg-[#1a1413] p-4 text-white shadow-[0_20px_40px_-24px_rgba(0,0,0,0.9)] ring-1 ring-white/10 sm:p-5">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand/15 text-[#ff7a5c]"><ChefHat className="size-5" /></span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">The menu for {formatWeekRange(openWeek.week_start)} is out</span>
              <span className="block truncate text-sm text-white/55">{`Book from ${(() => { const o = firstOpenSlot(settings); return `${o.date === addDays(today(), 1) ? 'tomorrow' : formatDate(o.date, { weekday: true })} ${MEAL_NAME[o.meal].toLowerCase()}` })()} · meals lock 24 h before`}</span>
            </span>
            <ArrowRight className="size-5 shrink-0 text-white/60 transition group-hover:translate-x-1" />
          </Link>
        ) : null}
      </Container>

      {/* Today's menu */}
      {cur && thisWeek && (
        <Container className="mt-16">
          <SectionHead eyebrow={day === weekdayIndex(t) ? 'Fresh today' : formatDate(addDays(thisWeek.week_start, day), { weekday: true })} title={day === weekdayIndex(t) ? 'Today’s menu' : 'On the menu'} link={{ to: '/menu', label: 'Full week' }} />
          <div className="no-scrollbar -mx-4 mb-5 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="tablist" aria-label="Day">
            {Array.from({ length: 7 }, (_, i) => addDays(thisWeek.week_start, i)).map((date, i) => {
              const on = day === i
              const past = date < t
              return (
                <button key={date} type="button" role="tab" aria-selected={on} onClick={() => setDay(i)} className={cx('relative flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition-colors', on ? 'bg-white text-ink' : 'bg-white/[0.06] text-white/70 hover:bg-white/10 hover:text-white', past && !on && 'opacity-45')}>
                  {date === t ? 'Today' : formatDate(date, { weekday: true }).slice(0, 3)}
                  <span className={cx('tabular', on ? 'text-ink/45' : 'text-white/35')}>{Number(date.slice(8))}</span>
                </button>
              )
            })}
          </div>
          <Rail cols={4}>
            {dayMeals.map((m) => {
              const ds = dishesFor(cur.items, day, m, curSel).map((id) => dishes.get(id)).filter((x): x is Dish => !!x)
              const came = day === weekdayIndex(t) && attendance.some((a) => a.meal === m)
              const nowServing = live === m && day === weekdayIndex(t)
              return (
                <article key={m} className={cx(railItem, 'flex flex-col overflow-hidden rounded-2xl bg-white/[0.04] text-white ring-1 ring-white/10')}>
                  <div className="flex items-center gap-3 px-4 pb-3 pt-4">
                    <img src={`/meals/${m}.png`} alt="" className="size-11 rounded-full ring-2 ring-white/15" />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{MEAL_NAME[m]}</p>
                      <p className="text-xs text-white/50">{timesOf(settings)[m]}</p>
                    </div>
                    {came ? <span className="rounded-full bg-leaf/90 px-2 py-0.5 text-[11px] font-semibold">Eaten</span> : nowServing ? <span className="flex items-center gap-1.5 text-[11px] font-semibold text-[#34c759]"><span className="pulse-dot size-1.5 rounded-full bg-[#34c759]" /> Now</span> : null}
                  </div>
                  <ul className="flex-1 space-y-1.5 border-t border-white/10 px-4 py-3 text-[14px]">
                    {ds.slice(0, 4).map((x) => (
                      <li key={x.id} className="flex items-center justify-between gap-2">
                        <span className="truncate text-white/90">{x.name}</span>
                        <span className="shrink-0 text-xs text-white/45">{formatINR(x.price)}</span>
                      </li>
                    ))}
                    {ds.length > 4 && <li className="text-xs text-white/45">+{ds.length - 4} more</li>}
                  </ul>
                </article>
              )
            })}
          </Rail>
        </Container>
      )}

      {/* Ready-made weeks */}
      {packs.length > 0 && openWeek && (
        <Container className="mt-16">
          <SectionHead eyebrow={`Week of ${formatWeekRange(openWeek.week_start)}`} title="Ready-made weeks" link={{ to: '/menu', label: 'All menus' }} />
          <Rail cols={packs.length >= 4 ? 4 : 3}>
            {packs.map((p, i) => (
              <article key={p.id} className={cx(railItem, 'group flex flex-col overflow-hidden rounded-2xl bg-white/[0.04] text-white ring-1 ring-white/10')}>
                <div className="relative aspect-[16/10] overflow-hidden">
                  <img src={PACK_PHOTOS[i % PACK_PHOTOS.length]} alt="" loading="lazy" className="size-full object-cover transition duration-500 group-hover:scale-105" />
                  <span className="absolute right-3 top-3 rounded-full bg-black/60 px-3 py-1 text-sm font-semibold text-white backdrop-blur">{formatINR(p.price)}<span className="text-xs font-medium text-white/60"> /week</span></span>
                </div>
                <div className="flex flex-1 flex-col p-4">
                  <h3 className="font-script text-[26px] leading-none text-white">{p.name}</h3>
                  <p className="mt-2 line-clamp-2 min-h-10 text-sm text-white/55">{p.tagline}</p>
                  <p className="mt-3 text-xs font-medium text-white/60">{mealsLabel(p.meals)} · ≈ {formatINR(p.price / (7 * Math.max(1, p.meals.length)))} a meal</p>
                  <div className="mt-auto grid grid-cols-2 gap-2 pt-4">
                    <Link to={`/menu/view/${p.id}`} className="flex h-10 items-center justify-center rounded-full text-sm font-semibold ring-1 ring-white/15 hover:bg-white/[0.06]">See menu</Link>
                    <Link to={`/wallet?pack=${p.id}`} className="bg-brand-grad flex h-10 items-center justify-center rounded-full text-sm font-semibold text-white">Book</Link>
                  </div>
                </div>
              </article>
            ))}
          </Rail>
        </Container>
      )}

      {/* Build your own — story */}
      <section className="mt-20 border-y border-white/[0.06] bg-white/[0.02] py-16">
        <Container className="grid items-center gap-10 md:grid-cols-2 md:gap-16">
          <StoryCollage />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#ff7a5c]">Build your own week</p>
            <h2 className="mt-2 font-display text-[26px] font-bold leading-tight text-white sm:text-[34px]">Eat what you actually like.</h2>
            <p className="mt-4 text-[15px] leading-relaxed text-white/65">
              Most messes decide for you. At Radixo, the kitchen plans a few good options for every meal and you choose: rajma or dal tadka on Monday, paneer on Wednesday, skip what you never touch.
            </p>
            <p className="mt-3 text-[15px] leading-relaxed text-white/65">You pay only for what&rsquo;s on your plate, and the kitchen cooks only what&rsquo;s been chosen, so less food goes to waste.</p>
            <dl className="mt-6 grid grid-cols-3 gap-3 border-y border-white/10 py-4 text-center text-white">
              {[['7', 'days a week'], ['4', 'meals a day'], ['24 h', 'before a meal to book']].map(([v, l]) => (
                <div key={l}><dt className="sr-only">{l}</dt><dd className="font-display text-xl font-bold">{v}</dd><dd className="text-xs text-white/50">{l}</dd></div>
              ))}
            </dl>
            <Link to="/menu/create" className="mt-6 inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 text-[15px] font-semibold text-ink transition hover:bg-white/90">
              Start building <ArrowRight className="size-4" />
            </Link>
          </div>
        </Container>
      </section>

      {/* Book longer, pay less */}
      {cheapest && (
        <Container className="mt-16">
          <SectionHead eyebrow="Book longer, pay less" title="One menu, any length" link={{ to: '/menu', label: 'Pick a menu' }} />
          <Rail cols={4}>
            {DURATIONS.map((d) => {
              const off = discountFor(d.weeks, settings)
              const total = bookingTotal(cheapest.price, d.weeks, off)
              return (
                <Link key={d.weeks} to={`/wallet?pack=${cheapest.id}&weeks=${d.weeks}`} className={cx(railItem, 'group relative flex min-h-[176px] flex-col overflow-hidden rounded-2xl p-5 text-white ring-1 transition', d.weeks === 26 ? 'bg-[linear-gradient(135deg,#d63a2b,#7a120b)] ring-white/10' : 'bg-white/[0.04] ring-white/10 hover:bg-white/[0.07]')}>
                  <div className="flex items-center justify-between">
                    <p className="text-[17px] font-semibold">{d.label}</p>
                    {off > 0 && <span className={cx('rounded-full px-2 py-0.5 text-xs font-bold', d.weeks === 26 ? 'bg-white text-maroon' : 'bg-[#34c759]/15 text-[#5ee07f]')}>{off}% off</span>}
                  </div>
                  <p className={cx('mt-1 text-sm', d.weeks === 26 ? 'text-white/80' : 'text-white/50')}>{cheapest.name} · {formatINR(Math.round(total / d.weeks))} a week</p>
                  <div className="mt-auto flex items-end justify-between pt-4">
                    <span className="text-2xl font-bold tabular">{formatINR(total)}</span>
                    <ArrowRight className="size-4 text-white/60 transition group-hover:translate-x-0.5" />
                  </div>
                </Link>
              )
            })}
          </Rail>
          <p className="mt-3 text-xs text-white/45">Not coming some days? Mark them 24 hours before and their value goes to your wallet.</p>
        </Container>
      )}

      {/* Chef story */}
      <Container className="mt-20">
        <ChefStory />
      </Container>

      {/* Timings + FAQ */}
      <Container className="mb-20 mt-20 grid gap-10 md:grid-cols-2">
        <div>
          <SectionHead eyebrow="Visit us" title={settings.address ? 'Timings & location' : 'Meal timings'} />
          <div className="overflow-hidden rounded-2xl bg-white/[0.04] text-white ring-1 ring-white/10">
            <ul className="divide-y divide-white/[0.06]">
              {MEALS.map((m) => (
                <li key={m} className={cx('flex items-center gap-3 px-4 py-3', live === m && 'bg-[#34c759]/[0.07]')}>
                  <img src={`/meals/${m}.png`} alt="" className="size-9 shrink-0 rounded-full" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{MEAL_NAME[m]}</span>
                    {live === m && <span className="block text-xs font-semibold text-[#5ee07f]">Open now</span>}
                  </span>
                  <span className={cx('shrink-0 whitespace-nowrap text-sm tabular', live === m ? 'font-semibold text-[#5ee07f]' : 'text-white/50')}>{timesOf(settings)[m]}</span>
                </li>
              ))}
            </ul>
            {settings.address && <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(settings.address)}`} target="_blank" rel="noreferrer" className="flex items-start gap-3 border-t border-white/[0.06] bg-white/[0.03] px-4 py-3.5 text-sm">
              <MapPin className="mt-0.5 size-4 shrink-0 text-[#ff7a5c]" />
              <span className="min-w-0 flex-1 text-white/75">{settings.address}</span>
              <span className="shrink-0 whitespace-nowrap font-semibold text-white">Directions</span>
            </a>}
          </div>
        </div>
        <div>
          <SectionHead eyebrow="Help" title="Questions" />
          <div className="divide-y divide-white/[0.06] overflow-hidden rounded-2xl bg-white/[0.04] text-white ring-1 ring-white/10">
            {FAQ.map(([question, answer], i) => (
              <div key={question}>
                <button type="button" onClick={() => setFaq(faq === i ? null : i)} aria-expanded={faq === i} className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left text-[15px] font-medium">
                  {question}
                  <ChevronDown className={cx('size-4 shrink-0 text-white/45 transition-transform', faq === i && 'rotate-180')} />
                </button>
                {faq === i && <p className="animate-rise px-4 pb-4 text-sm leading-relaxed text-white/60">{answer}</p>}
              </div>
            ))}
          </div>
        </div>
      </Container>
    </>
  )
}
