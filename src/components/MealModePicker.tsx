import { Package, UtensilsCrossed } from 'lucide-react'
import type { MealMode } from '../lib/types'
import { cx } from './ui'

/** Dine in or get a tiffin: same price, no delivery charge. */
export function MealModePicker({ mode, address, onMode, onAddress, error }: { mode: MealMode; address: string; onMode: (m: MealMode) => void; onAddress: (a: string) => void; error?: string }) {
  const opts: { v: MealMode; title: string; sub: string; icon: typeof Package }[] = [
    { v: 'dine', title: 'Dine with us', sub: 'Show your dining pass at the counter', icon: UtensilsCrossed },
    { v: 'tiffin', title: 'Tiffin', sub: 'Packed and delivered · same price', icon: Package },
  ]
  return (
    <div>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="How you get your meals">
        {opts.map(({ v, title, sub, icon: Icon }) => (
          <button key={v} type="button" role="radio" aria-checked={mode === v} onClick={() => onMode(v)} className={cx('rounded-2xl p-3 text-left ring-1 transition', mode === v ? 'bg-brand/15 ring-2 ring-brand' : 'bg-white/[0.04] ring-white/10 hover:bg-white/[0.07]')}>
            <Icon className={cx('size-5', mode === v ? 'text-[#ff7a5c]' : 'text-white/55')} />
            <p className="mt-2 text-sm font-semibold">{title}</p>
            <p className="mt-0.5 text-[11px] leading-snug text-white/50">{sub}</p>
          </button>
        ))}
      </div>
      {mode === 'tiffin' && (
        <div className="mt-3">
          <label htmlFor="tiffin-address" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-white/45">Delivery address</label>
          <input id="tiffin-address" value={address} onChange={(e) => onAddress(e.target.value)} placeholder="Room / flat, PG or building, area" className={cx('h-11 w-full rounded-xl bg-white/[0.06] px-4 text-[15px] text-white outline-none ring-1 placeholder:text-white/30 focus:ring-2 focus:ring-brand', error ? 'ring-brand' : 'ring-white/12')} />
          {error ? <p className="mt-1.5 text-sm text-[#ff8a7a]" role="alert">{error}</p> : <p className="mt-1.5 text-xs text-white/40">No delivery charge. Tiffins go out at each meal time.</p>}
        </div>
      )}
    </div>
  )
}
