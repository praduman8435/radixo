import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Pencil } from 'lucide-react'
import { useAuth } from '../../../lib/auth'
import { mondayOf, today, weekdayIndex } from '../../../lib/dates'
import { customCharge, customMeals, customTotal, dishesFor, isLocked, weekPlanMeals } from '../../../lib/logic'
import { MEALS, type Selection } from '../../../lib/types'
import { EmptyState, ErrorNote, PageLoader } from '../../../components/ui'
import { DayHeader, DayPills, MealRows, TotalBar, darkPaper } from '../../../components/menu'
import { readDraft, useMenuData } from './useMenuData'

/** "Take a look at the menu": a ready-made menu (by id) or the student's own menu ("mine"). */
export default function MenuView() {
  const { id } = useParams()
  const { profile } = useAuth()
  const uid = profile?.role === 'student' ? profile.id : null
  const nav = useNavigate()
  const q = useMenuData(uid)
  const [day, setDay] = useState(0)

  useEffect(() => {
    const w = q.data?.week
    if (w) setDay(w.week_start === mondayOf(today()) ? weekdayIndex(today()) : 0)
  }, [q.data?.week])

  if (q.loading && !q.data) return <PageLoader />
  if (q.error) return <ErrorNote message={q.error} onRetry={q.reload} />
  const { week, items, packs, dishes, selection, member } = q.data!
  if (!week) return <EmptyState title="No menu published yet" />

  const pack = id && id !== 'mine' ? packs.find((p) => p.id === id) : undefined
  if (id !== 'mine' && !pack) return <EmptyState title="This menu isn’t available" action={<Link to="/menu" className="font-semibold text-brand">Back to menus</Link>} />

  // Show a pack as if the student had chosen it; "mine" shows their real selection (or the defaults).
  const weekId: string = week.id
  const draft = readDraft(weekId)
  const draftSel: Selection | null = draft ? { id: '', user_id: '', week_id: weekId, mode: 'custom', pack_id: null, picks: {}, custom: draft, updated_at: '' } : null
  const sel: Selection | null = pack
    ? { id: '', user_id: uid ?? '', week_id: weekId, mode: 'pack', pack_id: pack.id, picks: pack.picks, custom: {}, updated_at: '' }
    : selection ?? draftSel
  const meals = pack ? pack.meals : sel?.mode === 'custom' ? customMeals(sel.custom) : MEALS.filter((m) => items.some((it) => it.meal === m))
  const total = pack ? pack.price : sel?.mode === 'custom' ? customTotal(sel.custom, dishes) : sel?.mode === 'pack' ? packs.find((p) => p.id === sel.pack_id)?.price ?? null : null
  const planMeals = member && uid ? weekPlanMeals(member.subs, uid, week) : []
  const covered = planMeals.length > 0 && meals.every((m) => planMeals.includes(m))
  const canEdit = !pack && !isLocked(week)

  return (
    <div className="-mx-4 -mt-4 sm:-mx-6 md:mx-auto md:mt-6 md:max-w-3xl md:overflow-hidden md:rounded-[28px] min-h-[calc(100dvh-80px)] pb-28" style={darkPaper}>
      <div className="px-4 pb-6 pt-7">
        {!pack && (
          <p className="mb-4 text-center text-sm font-semibold text-white/70">
            {sel?.mode === 'custom' ? 'Your own menu' : sel?.mode === 'pack' ? `${packs.find((p) => p.id === sel.pack_id)?.name ?? 'Ready-made'} menu` : 'Kitchen’s favourites (you haven’t chosen yet)'}
          </p>
        )}
        <DayPills value={day} onChange={setDay} />
      </div>
      <div className="animate-rise" key={day}>
        <DayHeader day={day}>
          {canEdit && (
            <Link to="/menu/create" className="flex items-center gap-1.5 rounded-xl border-2 border-white/80 px-3 py-1 text-sm font-bold text-white hover:bg-white/10"><Pencil className="size-4" /> Edit</Link>
          )}
        </DayHeader>
        <MealRows
          meals={meals.length ? meals : MEALS}
          render={(m) => dishesFor(items, day, m, sel).map((d) => dishes.get(d)?.name).filter(Boolean).join(' + ')}
          empty="Not included"
        />
      </div>
      <div className="relative mt-4 flex justify-end overflow-hidden">
        <div className="pointer-events-none absolute bottom-10 right-20 size-56 rounded-full bg-[#ff7a1a]/20 blur-3xl" aria-hidden />
        <img src="/menu/chef-flame.jpg" alt="Radixo chef with a flaming pan" className="relative w-[78%] max-w-sm mix-blend-lighten" />
      </div>
      <TotalBar amount={!pack && sel?.mode === 'custom' && planMeals.length ? customCharge(sel.custom, dishes, planMeals) : total} note={covered && total !== null ? '(included in your plan)' : '(for 1 week)'}>
        <button type="button" onClick={() => nav('/menu')} className="bg-brand-grad shadow-brand rounded-full px-5 py-1.5 font-script-italic text-[18px] text-white hover:brightness-110 active:scale-95">Done</button>
      </TotalBar>
    </div>
  )
}
