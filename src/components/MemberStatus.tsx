import type { ReactNode } from 'react'
import { CalendarClock, CheckCircle2, Hourglass, PauseCircle, UtensilsCrossed } from 'lucide-react'
import { diffDays, formatDate } from '../lib/dates'
import { formatINR, mealsLabel, paymentLabel, subLabel, type MemberState } from '../lib/logic'
import type { Pack, Plan } from '../lib/types'
import { Card, LinkButton, cx } from './ui'

/** The one card that tells a student where they stand: active, pending, paused, expired or new. */
export function MemberStatus({ state, plans, packs = [], compact }: { state: MemberState; plans: Plan[]; packs?: Pack[]; compact?: boolean }) {

  if (state.kind === 'active') {
    const total = Math.max(1, diffDays(state.sub.start_date, state.sub.end_date) + 1)
    const used = Math.min(100, Math.round(((total - state.daysLeft) / total) * 100))
    const renewSoon = state.daysLeft <= 5
    return (
      <Card className="overflow-hidden">
        <div className="bg-gradient-to-br from-brand to-[#E0573A] p-5 text-white">
          <div className="flex items-center justify-between gap-3">
            <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold', state.paused ? 'bg-turmeric text-ink' : 'bg-white/20 text-white')}>
              {state.paused ? <><PauseCircle className="size-3.5" /> Paused today</> : <><CheckCircle2 className="size-3.5" /> Active</>}
            </span>
            <span className="text-sm font-medium text-white/80">{mealsLabel(state.sub.meals)}</span>
          </div>
          <p className="mt-4 font-display text-4xl font-extrabold tabular">{state.daysLeft} <span className="text-xl font-bold">days left</span></p>
          <p className="mt-1 text-sm text-white/85">{subLabel(state.sub, plans, packs)} · till {formatDate(state.sub.end_date, { weekday: true })}</p>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/25" aria-hidden>
            <div className="h-full rounded-full bg-white" style={{ width: `${used}%` }} />
          </div>
        </div>
        {!compact && renewSoon && (
          <div className="flex items-center justify-between gap-3 p-4">
            <p className="text-sm font-medium">Your plan ends soon. Renew now and it continues without a gap.</p>
            <LinkButton to="/wallet" size="sm">Renew</LinkButton>
          </div>
        )}
      </Card>
    )
  }

  const shell = (icon: ReactNode, tone: string, title: string, body: ReactNode, cta?: ReactNode) => (
    <Card className="p-5">
      <div className="flex items-start gap-4">
        <span className={cx('grid size-12 shrink-0 place-items-center rounded-2xl', tone)}>{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg font-bold">{title}</p>
          <div className="mt-0.5 text-sm text-muted">{body}</div>
          {cta && <div className="mt-3">{cta}</div>}
        </div>
      </div>
    </Card>
  )

  if (state.kind === 'pending')
    return shell(
      <Hourglass className="size-6" />, 'bg-amber-50 text-amber', 'Payment under review',
      <>We received your {formatINR(state.payment.amount)} payment for {paymentLabel(state.payment, plans, packs)}. It is usually confirmed within a few hours; your plan starts as soon as it is.</>,
    )
  if (state.kind === 'upcoming')
    return shell(<CalendarClock className="size-6" />, 'bg-sky-50 text-sky', `Starts ${formatDate(state.sub.start_date, { weekday: true })}`, <>{subLabel(state.sub, plans, packs)} is confirmed and begins soon.</>)
  if (state.kind === 'expired')
    return shell(
      <CalendarClock className="size-6" />, 'bg-sand text-muted', 'Your plan has ended',
      <>{subLabel(state.sub, plans, packs)} ended on {formatDate(state.sub.end_date)}. Renew to keep eating at Radixo.</>,
      <LinkButton to="/wallet" size="sm">Renew plan</LinkButton>,
    )
  return shell(
    <UtensilsCrossed className="size-6" />, 'bg-brand-50 text-brand', 'Start with a plan',
    <>Try a week for ₹999 or go monthly. Pay by UPI; your pass works once the payment is confirmed.</>,
    <LinkButton to="/wallet" size="sm">See plans</LinkButton>,
  )
}
