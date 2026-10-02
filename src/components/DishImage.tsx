import { useState } from 'react'
import { CakeSlice, CookingPot, Coffee, Croissant, Drumstick, Salad, Sandwich, Soup, Wheat, type LucideIcon } from 'lucide-react'
import type { Dish, DishCategory } from '../lib/types'
import { cx } from './ui'

const TILE: Record<DishCategory, { icon: LucideIcon; from: string; to: string }> = {
  breakfast: { icon: Croissant, from: '#f8d58a', to: '#e39b3b' },
  snack: { icon: Sandwich, from: '#f6c27a', to: '#c96b2c' },
  drink: { icon: Coffee, from: '#d9b38c', to: '#8a5a3b' },
  dal: { icon: Soup, from: '#f6cf62', to: '#d58c1c' },
  sabzi: { icon: Salad, from: '#a9d18e', to: '#4f8f3a' },
  special: { icon: Drumstick, from: '#f29a74', to: '#b8361f' },
  bread: { icon: Wheat, from: '#f1d3a1', to: '#c48a4a' },
  rice: { icon: CookingPot, from: '#f3efe6', to: '#cbbfa8' },
  side: { icon: Salad, from: '#c9e3a8', to: '#6aa04a' },
  sweet: { icon: CakeSlice, from: '#f7b6b0', to: '#c9566a' },
}

/** The dish's photo, or a warm illustrated tile by category when there's no photo yet. */
export function DishImage({ dish, className }: { dish: Pick<Dish, 'name' | 'category' | 'image_url'>; className?: string }) {
  const [broken, setBroken] = useState(false)
  if (dish.image_url && !broken) return <img src={dish.image_url} alt={dish.name} loading="lazy" onError={() => setBroken(true)} className={cx('object-cover', className)} />
  const t = TILE[dish.category] ?? TILE.sabzi
  const Icon = t.icon
  return (
    <div className={cx('relative grid place-items-center overflow-hidden', className)} style={{ background: `radial-gradient(120% 120% at 30% 20%, ${t.from}, ${t.to})` }} role="img" aria-label={dish.name}>
      <Icon className="size-1/3 text-white/90 drop-shadow-[0_4px_8px_rgba(0,0,0,0.25)]" strokeWidth={1.6} />
      <span className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/15 to-transparent" aria-hidden />
    </div>
  )
}
