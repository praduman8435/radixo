import { Check } from 'lucide-react'
import { MEAL_NAME } from '../lib/logic'
import { MEALS, type Meal } from '../lib/types'
import { cx } from './ui'

/** Pick which meals a plan or ready-made menu includes. */
export function MealToggles({ value, onChange, label = 'Meals included' }: { value: Meal[]; onChange: (m: Meal[]) => void; label?: string }) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-semibold">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {MEALS.map((m) => {
          const on = value.includes(m)
          return (
            <button
              key={m}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? value.filter((x) => x !== m) : MEALS.filter((x) => x === m || value.includes(x)))}
              className={cx('inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold transition-colors', on ? 'border-brand bg-brand-50 text-brand' : 'border-line bg-paper text-muted hover:text-ink')}
            >
              {on && <Check className="size-4" strokeWidth={3} />} {MEAL_NAME[m]}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}
