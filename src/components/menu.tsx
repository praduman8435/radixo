// Shared pieces of the dark "menu board" screens: textured background, day pills, day table, total bar.
import type { CSSProperties, ReactNode } from 'react'
import { DAY_NAMES, DAY_SHORT } from '../lib/dates'
import { MEAL_NAME, formatINR } from '../lib/logic'
import type { Meal } from '../lib/types'
import { cx } from './ui'

const NOISE = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.06 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")"

/** The crumpled black paper the Radixo menu screens sit on. */
export const darkPaper: CSSProperties = {
  backgroundColor: '#0d0b0b',
  backgroundImage: `${NOISE}, radial-gradient(120% 80% at 30% 0%, #262120 0%, #0d0b0b 55%), linear-gradient(115deg, rgba(255,255,255,0.025) 0 18%, transparent 18% 36%, rgba(255,255,255,0.02) 36% 52%, transparent 52%)`,
}

export function DayPills({ value, onChange, done }: { value: number; onChange: (d: number) => void; done?: (d: number) => boolean }) {
  return (
    <div className="grid grid-cols-7 gap-1.5" role="tablist" aria-label="Day">
      {DAY_SHORT.map((d, i) => (
        <button
          key={d}
          type="button"
          role="tab"
          aria-selected={value === i}
          onClick={() => onChange(i)}
          className={cx(
            'relative rounded-full py-1.5 font-display text-[15px] font-bold transition-all',
            value === i ? 'bg-brand-grad scale-105 text-white shadow-[0_6px_12px_-4px_rgba(0,0,0,0.6)]' : 'bg-white text-maroon hover:bg-brand-50',
          )}
        >
          {d}
          {done?.(i) && <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full border-2 border-white bg-leaf" aria-label="done" />}
        </button>
      ))}
    </div>
  )
}

export function DayHeader({ day, children }: { day: number; children?: ReactNode }) {
  return (
    <div className="bg-brand-grad flex items-center justify-between border-y-2 border-maroon px-5 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]">
      <h3 className="font-banner text-[30px] leading-none text-white drop-shadow-[0_2px_0_rgba(0,0,0,0.35)]">{DAY_NAMES[day]}</h3>
      {children}
    </div>
  )
}

/** Meal | dishes rows, as on the "Take a look at the menu" board. */
export function MealRows({ meals, render, empty = '—' }: { meals: Meal[]; render: (m: Meal) => ReactNode; empty?: string }) {
  return (
    <div className="divide-y-2 divide-maroon/80 border-b-2 border-maroon/80">
      {meals.map((m) => {
        const content = render(m)
        return (
          <div key={m} className="grid grid-cols-[34%_1fr] divide-x-2 divide-maroon/80">
            <div className="flex items-center justify-center px-2 py-4 font-display text-[18px] font-bold text-white">{MEAL_NAME[m]}</div>
            <div className="flex min-h-14 items-center justify-center px-3 py-3 text-center font-display text-[16px] font-semibold leading-snug text-white/90">{content || <span className="text-white/35">{empty}</span>}</div>
          </div>
        )
      })}
    </div>
  )
}

/** Sticky white bar at the bottom of the board: total budget for the week + an action. */
export function TotalBar({ amount, note = '(for 1 week)', label = 'Total Budget', children }: { amount: number | null; note?: string; label?: string; children: ReactNode }) {
  return (
    <div className="pb-safe fixed inset-x-0 bottom-0 z-30 px-2">
      <div className="mx-auto flex max-w-md items-center justify-between gap-3 rounded-t-[22px] border-x-2 border-t-[3px] border-maroon bg-white px-5 py-3 shadow-[0_-12px_24px_-14px_rgba(0,0,0,0.6)]">
        <div className="min-w-0 leading-tight">
          <p className="whitespace-nowrap font-banner text-[19px] text-ink min-[400px]:text-[21px]">{label}</p>
          <p className="truncate text-xs font-semibold text-maroon">{note}</p>
        </div>
        {amount !== null && (
          <span className="flex items-center gap-1 rounded-full border-[2.5px] border-maroon px-4 py-1 shadow-[0_4px_8px_-4px_rgba(0,0,0,0.4)]">
            <span className="font-display text-lg font-bold text-turmeric">₹</span>
            <span className="font-script-italic text-[19px] tabular text-ink">{formatINR(amount).slice(1)}</span>
          </span>
        )}
        {children}
      </div>
    </div>
  )
}

/** Small "tap" hand icon used on "see the menu". */
export function TapIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M9.5 2a2 2 0 0 0-2 2v8.1l-.9-.9a2 2 0 0 0-2.8 2.8l4.6 4.7A6 6 0 0 0 12.6 21h1.9A5.5 5.5 0 0 0 20 15.5V11a2 2 0 0 0-3.2-1.6A2 2 0 0 0 14 8.6a2 2 0 0 0-2.5-.9V4a2 2 0 0 0-2-2z" />
      <path d="M5 4.5a4.5 4.5 0 0 1 9 0" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity=".55" />
    </svg>
  )
}

/** Hand-with-check icon on "Book Now". */
export function BookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="13" height="9" rx="2.2" fill="currentColor" stroke="none" />
      <path d="m6.5 7.4 1.8 1.8 3.6-3.6" stroke="#8b1a12" strokeWidth="2" />
      <path d="M10 21v-6.5a1.5 1.5 0 0 1 3 0V17l3.4.6a2 2 0 0 1 1.6 2V21" />
    </svg>
  )
}
