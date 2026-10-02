import { useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { CheckCircle2, Clock3, Lock, SquareArrowOutUpRight } from 'lucide-react'
import { useAuth } from '../../../lib/auth'
import { savePicks } from '../../../lib/data'
import { formatDateTime, formatWeekRange, timeUntil } from '../../../lib/dates'
import { MEAL_NAME, customCharge, customCount, customMeals, customTotal, formatINR, isLocked, weekPlanMeals } from '../../../lib/logic'
import { MEALS, type Meal, type Pack } from '../../../lib/types'
import { EmptyState, ErrorNote, PageLoader } from '../../../components/ui'
import { useToast } from '../../../components/toast'
import { BookIcon, TapIcon, darkPaper } from '../../../components/menu'
import { useMenuData } from './useMenuData'

function Zigzag() {
  return (
    <svg viewBox="0 0 400 40" preserveAspectRatio="none" className="block h-10 w-full" aria-hidden>
      <defs>
        <linearGradient id="zz" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#b8261b" />
          <stop offset="1" stopColor="#3a0805" />
        </linearGradient>
      </defs>
      <path d="M0 40 L0 22 L33 6 L66 22 L100 6 L133 22 L166 6 L200 22 L233 6 L266 22 L300 6 L333 22 L366 6 L400 22 L400 40 Z" fill="url(#zz)" />
    </svg>
  )
}

function SectionTab({ children }: { children: string }) {
  return (
    <div className="relative z-10 -mt-1 rounded-b-[22px] border-x-2 border-b-[3px] border-maroon bg-white py-3 text-center shadow-[0_10px_18px_-12px_rgba(139,26,18,0.6)]">
      <p className="font-display text-[21px] font-bold text-maroon">{children}</p>
    </div>
  )
}

/** One dark menu card, as in the design: name, weekly price, "see the menu", meals, Book Now. */
function MenuCard({ name, price, meals, viewTo, footer, selected, delay = 0 }: { name: string; price: number; meals: Meal[]; viewTo: string; footer: ReactNode; selected?: boolean; delay?: number }) {
  return (
    <article className="animate-rise mx-auto w-full max-w-sm overflow-hidden rounded-[22px] shadow-[0_18px_30px_-16px_rgba(0,0,0,0.7)]" style={{ ...darkPaper, animationDelay: `${delay}ms` }}>
      <div className="px-5 pt-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="min-w-0 truncate pb-1 font-script text-[40px] leading-none" style={{ backgroundImage: 'linear-gradient(180deg, #ffffff 30%, #a9a3a1)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>{name}</h3>
          <span className="bg-brand-grad shadow-brand flex items-center gap-2 rounded-2xl px-5 py-2">
            <span className="font-display text-2xl font-bold text-turmeric">₹</span>
            <span className="font-script-italic text-[22px] text-white tabular">{price.toLocaleString('en-IN')}</span>
          </span>
        </div>
        <div className="mt-4 h-1 rounded-full bg-gradient-to-r from-brand via-maroon to-transparent" />
        <Link to={viewTo} className="mx-auto mt-4 flex w-fit items-center gap-2 rounded-full bg-white px-5 py-1.5 font-display text-[15px] font-bold text-ink transition hover:scale-[1.03] active:scale-[0.97]">
          <TapIcon className="size-4" /> see the menu
        </Link>
        <div className="my-5 flex items-center gap-4">
          <div className="bg-brand-grad rounded-2xl px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]">
            {MEALS.filter((m) => meals.includes(m)).map((m) => <p key={m} className="font-display text-[18px] font-bold leading-snug text-white">{MEAL_NAME[m]}</p>)}
          </div>
          <p className="flex-1 text-center font-script-italic text-[20px] text-white">( for 7 days )</p>
        </div>
      </div>
      {selected && <p className="flex items-center justify-center gap-1.5 bg-leaf/90 py-1.5 text-sm font-bold text-white"><CheckCircle2 className="size-4" /> Your menu this week</p>}
      {footer}
    </article>
  )
}

export default function MenuHome() {
  const { profile } = useAuth()
  const uid = profile?.role === 'student' ? profile.id : null
  const toast = useToast()
  const nav = useNavigate()
  const q = useMenuData(uid)
  const [busy, setBusy] = useState<string | null>(null)

  if (q.loading && !q.data) return <PageLoader />
  if (q.error) return <ErrorNote message={q.error} onRetry={q.reload} />
  const { week, packs, dishes, member, selection } = q.data!
  if (!week) return <EmptyState title="No menu published yet">The kitchen publishes each week&rsquo;s menu by Thursday.</EmptyState>

  const locked = isLocked(week)
  const planMeals = member && uid ? weekPlanMeals(member.subs, uid, week) : []
  const covered = planMeals.length > 0
  const freeFor = (meals: Meal[]) => covered && meals.every((m) => planMeals.includes(m))
  const custom = selection?.mode === 'custom' ? selection.custom : null
  const bookable = packs.filter((p) => p.price > 0)

  async function book(p: Pack) {
    if (locked) return
    if (!freeFor(p.meals)) return nav(`/wallet?pack=${p.id}`)
    setBusy(p.id)
    try {
      await savePicks(uid!, week!.id, 'pack', p.id, p.picks)
      toast(`${p.name} is your menu for ${formatWeekRange(week!.week_start)}`)
      q.reload()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not save', 'error')
    } finally {
      setBusy(null)
    }
  }

  const footerBtn = (label: string, onClick: () => void, disabled = false, loading = false) => (
    <button type="button" onClick={onClick} disabled={disabled || loading} className="bg-brand-grad flex w-full items-center justify-center gap-2 py-2.5 font-script-italic text-[19px] text-white transition hover:brightness-110 active:brightness-95 disabled:opacity-60">
      {loading ? 'Saving…' : label} <BookIcon className="size-5" />
    </button>
  )

  return (
    <div className="-mx-4 -mt-4 sm:-mx-6 md:mx-auto md:mt-6 md:max-w-3xl md:overflow-hidden md:rounded-[28px]">
      {/* Hero */}
      <section className="relative overflow-hidden bg-[#09080d] pt-4 text-white">
        <div className="pointer-events-none absolute left-1/2 top-1/3 size-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#c47a3a]/15 blur-3xl" aria-hidden />
        <img src="/menu/chef-lineart.jpg" alt="Radixo chef preparing food" className="animate-rise relative mx-auto w-full max-w-md" />
        <div className="relative -mt-4 flex flex-col items-center gap-3 px-6 pb-6">
          <div className="flex items-center gap-2 rounded-2xl bg-white/[0.07] px-4 py-2 text-center text-xs font-semibold text-white/80 ring-1 ring-white/10">
            {locked ? <Lock className="size-4 shrink-0" /> : <Clock3 className="size-4 shrink-0" />}
            <span>
              <span className="block text-white">Menu for {formatWeekRange(week.week_start)}</span>
              {locked ? 'Choices are closed for this week' : `Choose by ${formatDateTime(week.choice_deadline)} · ${timeUntil(week.choice_deadline)}`}
            </span>
          </div>
          <Link
            to={locked ? '/menu/view/mine' : '/menu/create'}
            className="animate-rise flex h-11 items-center gap-2 rounded-xl bg-gradient-to-b from-[#a3231a] to-[#4a0b07] px-5 font-display text-[17px] font-bold shadow-[0_10px_24px_-8px_rgba(184,38,27,0.7)] ring-1 ring-white/10 transition hover:brightness-110 active:scale-[0.98]"
            style={{ animationDelay: '120ms' }}
          >
            {locked ? 'See your menu' : custom ? 'Edit your menu' : 'Create a new menu'} <SquareArrowOutUpRight className="size-5" />
          </Link>
        </div>
        <Zigzag />
      </section>

      {custom && customCount(custom) > 0 && (
        <>
          <SectionTab>Your created menu</SectionTab>
          <div className="px-4 py-8">
            <MenuCard
              name="My Menu"
              price={customTotal(custom, dishes)}
              meals={customMeals(custom)}
              viewTo="/menu/view/mine"
              selected
              footer={(() => { const due = customCharge(custom, dishes, planMeals); return footerBtn(due === 0 ? 'Included in your plan' : covered ? `Pay ${formatINR(due)} extra` : 'Book Now', () => due > 0 && nav(`/wallet?custom=${week.id}`), due === 0 || locked) })()}
            />
          </div>
        </>
      )}

      <SectionTab>Choose from the prebuilt menu</SectionTab>
      <div className="space-y-8 px-4 py-8">
        {bookable.length === 0 ? (
          <p className="text-center text-sm text-muted">No ready-made menus this week yet.</p>
        ) : (
          bookable.map((p, i) => {
            const isMine = selection?.mode === 'pack' && selection.pack_id === p.id
            return (
              <MenuCard
                key={p.id}
                name={p.name}
                price={p.price}
                meals={p.meals}
                viewTo={`/menu/view/${p.id}`}
                selected={isMine}
                delay={i * 80}
                footer={footerBtn(locked ? 'Choices closed' : isMine ? 'Selected' : freeFor(p.meals) ? 'Choose this menu' : 'Book Now', () => book(p), locked || isMine, busy === p.id)}
              />
            )
          })
        )}
        {covered && !locked && <p className="text-center text-sm text-muted">Menus within your plan&rsquo;s meals cost nothing extra. Menus with more meals are booked for the week.</p>}
        {!covered && bookable.length > 0 && <p className="text-center text-sm text-muted">Prices are for the whole week, GST included. {formatINR(bookable[0].price / Math.max(1, bookable[0].meals.length * 7))} a meal on {bookable[0].name}.</p>}
      </div>
    </div>
  )
}
