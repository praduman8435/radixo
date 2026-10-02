import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { ArrowDown, ArrowRight, CheckCircle2, ChefHat, ChevronDown, Clock3, Hand, MapPin, QrCode, Sparkles } from 'lucide-react'
import { useAuth } from '../../lib/auth'
import { api } from '../../lib/backend'
import { useAsync } from '../../lib/useAsync'
import { useInView } from '../../lib/useInView'
import { loadDishMap, loadMember, loadPlans, loadPublishedWeeks, loadSettings, loadWeekContent } from '../../lib/data'
import { addDays, currentMeal, formatDate, formatDateTime, formatWeekRange, timeUntil, today, weekdayIndex } from '../../lib/dates'
import { MEAL_NAME, dishesFor, formatINR, isLocked, mealsLabel, memberState, weekForDate } from '../../lib/logic'
import { MEALS, type Dish, type Meal, type Plan, type Settings } from '../../lib/types'
import { PageLoader, cx } from '../../components/ui'
import { DishImage } from '../../components/DishImage'
import { darkPaper } from '../../components/menu'
import { pickWeek } from './menu/useMenuData'

/** Photos for ready-made menu cards, in order (see public/photos/CREDITS.md). */
const PACK_PHOTOS = ['/photos/thali-classic.jpg', '/photos/thali-fullday.jpg', '/photos/thali-protein.jpg', '/photos/thali-light.jpg']

function useHomeData(uid: string | null) {
  return useAsync(async () => {
    const t = today()
    const [weeks, dishes, plans, settings] = await Promise.all([loadPublishedWeeks(), loadDishMap(), loadPlans(), loadSettings()])
    const thisWeek = weekForDate(weeks, t)
    const openWeek = pickWeek(weeks)
    const [cur, open] = await Promise.all([
      thisWeek ? loadWeekContent(thisWeek.id) : Promise.resolve(null),
      openWeek && openWeek.id !== thisWeek?.id ? loadWeekContent(openWeek.id) : Promise.resolve(null),
    ])
    const member = uid ? await loadMember(uid) : null
    const selections = uid ? await api.list('selections', { eq: { user_id: uid } }) : []
    const attendance = uid ? await api.list('attendance', { eq: { user_id: uid, date: t } }) : []
    return { thisWeek, openWeek, cur, open: open ?? (openWeek?.id === thisWeek?.id ? cur : null), dishes, plans, settings, member, selections, attendance }
  }, [uid])
}

// ---------- helpers ----------

const Container = ({ children, className }: { children: ReactNode; className?: string }) => <div className={cx('mx-auto max-w-6xl px-4 sm:px-6', className)}>{children}</div>

function SectionHead({ eyebrow, title, link }: { eyebrow?: string; title: string; link?: { to: string; label: string } }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">{eyebrow}</p>}
        <h2 className="mt-1 truncate font-display text-[22px] font-bold leading-tight sm:text-[28px]">{title}</h2>
      </div>
      {link && (
        <Link to={link.to} className="group inline-flex shrink-0 items-center gap-1 whitespace-nowrap pb-1 text-sm font-semibold text-brand">
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

const perMeal = (p: Plan) => p.price / (p.duration_days * Math.max(1, p.meals.length))

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
          <ul className="animate-rise mt-8 flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-white/55" style={{ animationDelay: '240ms' }}>
            <li className="flex items-center gap-1.5"><CheckCircle2 className="size-4 text-[#34c759]" /> 4 meals a day</li>
            <li className="flex items-center gap-1.5"><CheckCircle2 className="size-4 text-[#34c759]" /> New menu every week</li>
            <li className="flex items-center gap-1.5"><CheckCircle2 className="size-4 text-[#34c759]" /> Pause when you go home</li>
          </ul>
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
          className={cx('absolute aspect-[4/3] rounded-2xl object-cover shadow-[0_24px_40px_-20px_rgba(31,26,23,0.6)] ring-4 ring-white transition-all duration-700 ease-out', im.cls, inView ? 'opacity-100' : 'translate-y-6 opacity-0')}
          style={{ transitionDelay: `${im.delay}ms` }}
        />
      ))}
    </div>
  )
}

function ChefStory() {
  const [ref, inView] = useInView<HTMLElement>()
  return (
    <section ref={ref} className={cx('relative grid grid-cols-[1.1fr_1fr] items-center gap-3 overflow-x-clip py-2 md:grid-cols-2 md:gap-12', inView && 'in-view')}>
      <div className="relative">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(closest-side,rgba(201,52,28,0.18),transparent)]" aria-hidden />
        <img src="/home/chef-sketch.png" alt="Radixo chef serving a plate" className="reveal-draw relative mx-auto w-full max-w-sm" />
        <svg viewBox="0 0 100 60" className="pointer-events-none absolute left-[42%] top-[50%] w-[34%] text-ink/30" aria-hidden>
          {[0, 1, 2].map((i) => <path key={i} className="steam" style={{ animationDelay: `${0.4 + i * 0.7}s` }} d={`M${25 + i * 22} 58c-7-9 7-14 0-24s7-14 0-24`} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />)}
        </svg>
      </div>
      <div className="reveal-card">
        <div className="relative overflow-hidden rounded-2xl bg-white px-5 py-8 shadow-[0_18px_34px_-16px_rgba(31,26,23,0.4)] ring-1 ring-line/60 md:px-10 md:py-12">
          <span className="bg-brand-grad absolute inset-x-0 top-0 h-1" aria-hidden />
          <p className="text-center font-script-italic text-[21px] leading-snug text-maroon sm:text-[28px]">when you&rsquo;re far from Mom, let Radixo be near</p>
        </div>
        <div className="mt-3 hidden animate-bounce justify-end pr-3 text-ink [animation-duration:2.2s] sm:flex" aria-hidden>
          <ArrowDown className="size-4" strokeWidth={2.5} />
          <Hand className="size-6 -rotate-12" strokeWidth={1.6} />
        </div>
      </div>
    </section>
  )
}

const FAQ: [string, string][] = [
  ['Do I need an account to see the menu?', 'No. Browse every menu and even build your own. We only ask for your mobile number when you save, book or pay.'],
  ['How does building my own menu work?', 'For every meal the kitchen offers a few dishes. Add the ones you want for each day and the total updates as you go. Prices are per serving and include GST.'],
  ['When do choices close?', 'Saturday 8 pm for the following week, so the kitchen can buy fresh and waste less.'],
  ['What if I go home for a few days?', 'Pause your monthly plan for 4 days or more and it’s extended by the same number of days.'],
  ['How do I pay?', 'By UPI: scan the QR or open your UPI app, then paste the reference number. Cash at the counter works too.'],
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
  const { thisWeek, openWeek, cur, open, dishes, plans, settings, member, selections, attendance } = q.data
  const t = today()
  const state = member && uid ? memberState(uid, member.subs, member.payments, member.pauses) : null
  const curSel = selections.find((s) => s.week_id === thisWeek?.id) ?? null
  const openSel = selections.find((s) => s.week_id === openWeek?.id) ?? null
  const live = servingNow(settings)
  const next = live ?? MEALS.find((m) => MEALS.indexOf(m) >= MEALS.indexOf(currentMeal())) ?? 'breakfast'
  const photoDishes = [...new Map([...dishes.values()].filter((x) => x.is_active && x.image_url).sort((a, b) => b.price - a.price).map((x) => [x.image_url, x])).values()]
  const packs = (open?.packs ?? []).filter((p) => p.price > 0)
  const monthlies = plans.filter((p) => p.duration_days >= 28).sort((a, b) => perMeal(a) - perMeal(b))
  const fromPrice = Math.round(monthlies[0] ? perMeal(monthlies[0]) : 60)
  const trial = plans.find((p) => p.duration_days <= 7)
  const founding = plans.find((p) => p.badge && p.duration_days >= 28)
  const dayMeals = cur ? MEALS.filter((m) => dishesFor(cur.items, day, m, curSel).length > 0) : []
  const firstName = isStudent ? profile!.full_name.split(' ')[0] : undefined

  return (
    <>
      <Hero name={firstName} live={live} next={next} settings={settings} fromPrice={fromPrice} chips={photoDishes} />

      {/* Status strip */}
      <Container className="relative z-10 -mt-8">
        {isStudent && state ? (
          <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-line/70 bg-white p-4 shadow-[0_20px_40px_-24px_rgba(31,26,23,0.6)] sm:p-5">
            <span className={cx('grid size-11 shrink-0 place-items-center rounded-xl', state.kind === 'active' ? 'bg-leaf-50 text-leaf' : 'bg-brand-50 text-brand')}>
              {state.kind === 'active' ? <CheckCircle2 className="size-5" /> : <Sparkles className="size-5" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{state.kind === 'active' ? `${state.daysLeft} days left on your plan${state.paused ? ' · paused today' : ''}` : state.kind === 'pending' ? 'Your payment is being checked' : state.kind === 'upcoming' ? `Your plan starts ${formatDate(state.sub.start_date)}` : 'You don’t have a plan yet'}</p>
              <p className="truncate text-sm text-muted">
                {state.kind === 'active' ? `${mealsLabel(state.sub.meals)} · till ${formatDate(state.sub.end_date)}` : 'Book a week or go monthly'}
                {openWeek && !isLocked(openWeek) && ` · ${openSel ? 'menu chosen' : 'choose your menu'} for ${formatWeekRange(openWeek.week_start)} (${timeUntil(openWeek.choice_deadline)})`}
              </p>
            </div>
            {state.kind === 'active' ? (
              <Link to="/profile" className="inline-flex h-10 items-center gap-1.5 rounded-full bg-ink px-4 text-sm font-semibold text-white"><QrCode className="size-4" /> Show pass</Link>
            ) : (
              <Link to="/wallet" className="bg-brand-grad inline-flex h-10 items-center rounded-full px-4 text-sm font-semibold text-white">See plans</Link>
            )}
          </div>
        ) : openWeek ? (
          <Link to="/menu" className="group flex items-center gap-4 rounded-2xl border border-line/70 bg-white p-4 shadow-[0_20px_40px_-24px_rgba(31,26,23,0.6)] sm:p-5">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand"><ChefHat className="size-5" /></span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">The menu for {formatWeekRange(openWeek.week_start)} is out</span>
              <span className="block truncate text-sm text-muted">{isLocked(openWeek) ? 'Choices are closed for this week' : `Choose by ${formatDateTime(openWeek.choice_deadline)} · ${timeUntil(openWeek.choice_deadline)}`}</span>
            </span>
            <ArrowRight className="size-5 shrink-0 text-brand transition group-hover:translate-x-1" />
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
                <button key={date} type="button" role="tab" aria-selected={on} onClick={() => setDay(i)} className={cx('relative flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition-colors', on ? 'bg-ink text-white' : 'bg-sand/70 text-ink/70 hover:bg-sand hover:text-ink', past && !on && 'opacity-45')}>
                  {date === t ? 'Today' : formatDate(date, { weekday: true }).slice(0, 3)}
                  <span className={cx('tabular', on ? 'text-white/60' : 'text-muted')}>{Number(date.slice(8))}</span>
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
                <article key={m} className={cx(railItem, 'flex flex-col overflow-hidden rounded-2xl text-white shadow-[0_18px_30px_-20px_rgba(0,0,0,0.75)]')} style={darkPaper}>
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
              <article key={p.id} className={cx(railItem, 'group flex flex-col overflow-hidden rounded-2xl border border-line/70 bg-white shadow-[0_18px_34px_-24px_rgba(31,26,23,0.6)]')}>
                <div className="relative aspect-[16/10] overflow-hidden">
                  <img src={PACK_PHOTOS[i % PACK_PHOTOS.length]} alt="" loading="lazy" className="size-full object-cover transition duration-500 group-hover:scale-105" />
                  <span className="absolute right-3 top-3 rounded-full bg-white/95 px-3 py-1 text-sm font-semibold text-ink shadow-sm">{formatINR(p.price)}<span className="text-xs font-medium text-muted"> /week</span></span>
                </div>
                <div className="flex flex-1 flex-col p-4">
                  <h3 className="font-script text-[26px] leading-none text-maroon">{p.name}</h3>
                  <p className="mt-2 line-clamp-2 min-h-10 text-sm text-muted">{p.tagline}</p>
                  <p className="mt-3 text-xs font-medium text-ink/70">{mealsLabel(p.meals)} · ≈ {formatINR(p.price / (7 * Math.max(1, p.meals.length)))} a meal</p>
                  <div className="mt-auto grid grid-cols-2 gap-2 pt-4">
                    <Link to={`/menu/view/${p.id}`} className="flex h-10 items-center justify-center rounded-full border border-line text-sm font-semibold hover:bg-sand">See menu</Link>
                    <Link to="/menu" className="bg-brand-grad flex h-10 items-center justify-center rounded-full text-sm font-semibold text-white">Book</Link>
                  </div>
                </div>
              </article>
            ))}
          </Rail>
        </Container>
      )}

      {/* Build your own — story */}
      <section className="mt-20 bg-cream/70 py-16">
        <Container className="grid items-center gap-10 md:grid-cols-2 md:gap-16">
          <StoryCollage />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">Build your own week</p>
            <h2 className="mt-2 font-display text-[26px] font-bold leading-tight sm:text-[34px]">Eat what you actually like.</h2>
            <p className="mt-4 text-[15px] leading-relaxed text-ink/70">
              Most messes decide for you. At Radixo, the kitchen plans a few good options for every meal and you choose: rajma or dal tadka on Monday, paneer on Wednesday, skip what you never touch.
            </p>
            <p className="mt-3 text-[15px] leading-relaxed text-ink/70">You pay only for what&rsquo;s on your plate, and the kitchen cooks only what&rsquo;s been chosen, so less food goes to waste.</p>
            <dl className="mt-6 grid grid-cols-3 gap-3 border-y border-line py-4 text-center">
              {[['7', 'days to plan'], ['4', 'meals a day'], ['Sat 8 pm', 'choices close']].map(([v, l]) => (
                <div key={l}><dt className="sr-only">{l}</dt><dd className="font-display text-xl font-bold">{v}</dd><dd className="text-xs text-muted">{l}</dd></div>
              ))}
            </dl>
            <Link to="/menu/create" className="mt-6 inline-flex h-11 items-center gap-2 rounded-full bg-ink px-5 text-[15px] font-semibold text-white transition hover:bg-ink/85">
              Start building <ArrowRight className="size-4" />
            </Link>
          </div>
        </Container>
      </section>

      {/* Offers */}
      {(trial || founding) && (
        <Container className="mt-16">
          <SectionHead eyebrow="Offers" title="Start for less" link={{ to: '/wallet', label: 'All plans' }} />
          <Rail cols={3}>
            {trial && (
              <Link to="/wallet" className={cx(railItem, 'relative flex min-h-[188px] flex-col overflow-hidden rounded-2xl bg-[linear-gradient(135deg,#d63a2b,#7a120b)] p-5 text-white')}>
                <span className="absolute -right-10 -top-10 size-36 rounded-full bg-white/10" aria-hidden />
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70">Try first</p>
                <p className="mt-1 text-xl font-bold">Trial week</p>
                <p className="mt-1 text-sm text-white/80">{trial.duration_days} days · {mealsLabel(trial.meals).toLowerCase()}</p>
                <div className="mt-auto flex items-end justify-between pt-4"><span className="text-2xl font-bold">{formatINR(trial.price)}</span><span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-maroon">Try it</span></div>
              </Link>
            )}
            {founding && (
              <Link to="/wallet" className={cx(railItem, 'relative flex min-h-[188px] flex-col overflow-hidden rounded-2xl bg-[linear-gradient(135deg,#2a2120,#0d0b0b)] p-5 text-white ring-1 ring-turmeric/30')}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-turmeric">{founding.badge}</p>
                <p className="mt-1 text-xl font-bold">Founding batch</p>
                <p className="mt-1 text-sm text-white/70">Monthly plan at a locked-in price</p>
                <div className="mt-auto flex items-end justify-between pt-4"><span className="text-2xl font-bold">{formatINR(founding.price)}<span className="text-sm font-medium text-white/55">/mo</span></span><span className="rounded-full bg-turmeric px-3 py-1 text-sm font-semibold text-ink">Join</span></div>
              </Link>
            )}
            <div className={cx(railItem, 'relative flex min-h-[188px] flex-col overflow-hidden rounded-2xl bg-[linear-gradient(135deg,#fdf4df,#f6ece1)] p-5 ring-1 ring-line')}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber">Better together</p>
              <p className="mt-1 text-xl font-bold text-maroon">Bring a friend</p>
              <p className="mt-1 text-sm text-ink/70">Their first week is just {formatINR(trial?.price ?? 999)}.</p>
              <div className="mt-auto pt-4">
                <button type="button" onClick={() => navigator.share?.({ title: 'Radixo', text: 'Fresh student meals, and you build your own menu.', url: location.origin }).catch(() => {})} className="rounded-full bg-maroon px-4 py-1.5 text-sm font-semibold text-white">Share</button>
              </div>
            </div>
          </Rail>
        </Container>
      )}

      {/* Chef story */}
      <Container className="mt-20">
        <ChefStory />
      </Container>

      {/* Timings + FAQ */}
      <Container className="mb-20 mt-20 grid gap-10 md:grid-cols-2">
        <div>
          <SectionHead eyebrow="Visit us" title="Timings & location" />
          <div className="overflow-hidden rounded-2xl border border-line/70 bg-white">
            <ul className="divide-y divide-line">
              {MEALS.map((m) => (
                <li key={m} className={cx('flex items-center gap-3 px-4 py-3', live === m && 'bg-leaf-50/70')}>
                  <img src={`/meals/${m}.png`} alt="" className="size-9 shrink-0 rounded-full" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{MEAL_NAME[m]}</span>
                    {live === m && <span className="block text-xs font-semibold text-leaf">Open now</span>}
                  </span>
                  <span className={cx('shrink-0 whitespace-nowrap text-sm tabular', live === m ? 'font-semibold text-leaf' : 'text-muted')}>{timesOf(settings)[m]}</span>
                </li>
              ))}
            </ul>
            <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(settings.address || 'Radixo')}`} target="_blank" rel="noreferrer" className="flex items-start gap-3 border-t border-line bg-cream/70 px-4 py-3.5 text-sm">
              <MapPin className="mt-0.5 size-4 shrink-0 text-brand" />
              <span className="min-w-0 flex-1 text-ink/80">{settings.address || 'Address coming soon'}</span>
              <span className="shrink-0 whitespace-nowrap font-semibold text-brand">Directions</span>
            </a>
          </div>
        </div>
        <div>
          <SectionHead eyebrow="Help" title="Questions" />
          <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line/70 bg-white">
            {FAQ.map(([question, answer], i) => (
              <div key={question}>
                <button type="button" onClick={() => setFaq(faq === i ? null : i)} aria-expanded={faq === i} className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left text-[15px] font-medium">
                  {question}
                  <ChevronDown className={cx('size-4 shrink-0 text-muted transition-transform', faq === i && 'rotate-180')} />
                </button>
                {faq === i && <p className="animate-rise px-4 pb-4 text-sm leading-relaxed text-muted">{answer}</p>}
              </div>
            ))}
          </div>
        </div>
      </Container>
    </>
  )
}
