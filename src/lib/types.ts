// Data model shared by the demo store and Supabase. Table names match supabase/schema.sql.

export type Role = 'student' | 'staff' | 'admin'
export type Meal = 'breakfast' | 'lunch' | 'snacks' | 'dinner'
/** Service order through the day. */
export const MEALS: Meal[] = ['breakfast', 'lunch', 'snacks', 'dinner']
export type StayType = 'PG' | 'Hostel' | 'Rented flat' | 'Day scholar'

export interface Profile {
  id: string
  email: string
  full_name: string
  phone: string
  college: string
  year: string
  stay_type: StayType | ''
  area: string
  role: Role
  member_code: string
  created_at: string
}

export type DishCategory = 'breakfast' | 'snack' | 'drink' | 'dal' | 'sabzi' | 'rice' | 'bread' | 'special' | 'sweet' | 'side'

export interface Dish {
  id: string
  name: string
  category: DishCategory
  description: string
  price: number // ₹ per serving, used to total a custom menu
  image_url: string // optional photo; an illustrated tile is shown when empty
  is_premium: boolean
  is_active: boolean
  created_at: string
}

export interface Week {
  id: string
  week_start: string // YYYY-MM-DD, always a Monday
  status: 'draft' | 'published'
  choice_deadline: string // ISO datetime; picks lock after this
  created_at: string
}

/** One line of a meal: fixed (one dish) or a choice (2–4 dishes, student picks one). */
export interface MenuItem {
  id: string
  week_id: string
  day: number // 0 = Monday … 6 = Sunday
  meal: Meal
  label: string // "Dal", "Sabzi", "Roti", "Special"
  dish_ids: string[]
  default_dish_id: string
  position: number
}

/** Map of menu_item_id → chosen dish_id (ready-made menus pick one dish per line). */
export type Picks = Record<string, string>

/** A student-built menu: slot key ("<day>-<meal>", e.g. "0-lunch") → dish ids added to that meal. */
export type CustomMenu = Record<string, string[]>
export const slotKey = (day: number, meal: Meal) => `${day}-${meal}`

/** A ready-made weekly menu ("Budget", "Full Day"…). With a price it can be booked on its own for that week. */
export interface Pack {
  id: string
  week_id: string
  name: string
  tagline: string
  picks: Picks
  price: number // ₹ for the 7 days, GST inclusive; 0 = not bookable on its own
  meals: Meal[] // meals this menu covers
  position: number
}

export interface Selection {
  id: string
  user_id: string
  week_id: string
  mode: 'pack' | 'custom'
  pack_id: string | null
  picks: Picks // used when mode = 'pack'
  custom: CustomMenu // used when mode = 'custom'
  updated_at: string
}

export interface Plan {
  id: string
  name: string
  description: string
  price: number // ₹, GST inclusive
  duration_days: number
  meals: Meal[]
  badge: string
  is_active: boolean
  position: number
}

export type PaymentStatus = 'pending' | 'approved' | 'rejected'

export interface Payment {
  id: string
  user_id: string
  plan_id: string | null // a plan purchase…
  pack_id: string | null // …or a ready-made menu booked for its week
  week_id: string | null // the week a menu booking (ready-made or custom) is for
  amount: number
  method: 'upi' | 'cash'
  utr: string
  status: PaymentStatus
  admin_note: string
  created_at: string
  reviewed_at: string | null
}

export interface Subscription {
  id: string
  user_id: string
  plan_id: string | null
  pack_id: string | null
  payment_id: string | null
  start_date: string
  end_date: string // inclusive
  meals: Meal[]
  status: 'active' | 'cancelled'
  created_at: string
}

export interface Pause {
  id: string
  user_id: string
  subscription_id: string
  start_date: string
  end_date: string // inclusive
  reason: string
  status: 'requested' | 'approved' | 'rejected'
  created_at: string
}

export interface Attendance {
  id: string
  user_id: string
  date: string
  meal: Meal
  created_at: string
}

export interface Feedback {
  id: string
  user_id: string
  date: string
  meal: Meal
  kind: 'rating' | 'complaint' | 'suggestion'
  rating: number | null
  comment: string
  status: 'open' | 'resolved'
  admin_reply: string
  created_at: string
}

export interface Wastage {
  id: string
  date: string
  meal: Meal
  cooked_kg: number
  wasted_kg: number
  notes: string
  created_at: string
}

export interface Settings {
  id: number
  upi_id: string
  upi_name: string
  whatsapp: string
  address: string
  breakfast_time: string
  lunch_time: string
  snacks_time: string
  dinner_time: string
  attendance_factor: number // share of active members expected to eat, used until real data exists
  buffer_pct: number // extra % cooked on top of expected
  min_pause_days: number
}

export interface Tables {
  profiles: Profile
  dishes: Dish
  weeks: Week
  menu_items: MenuItem
  packs: Pack
  selections: Selection
  plans: Plan
  payments: Payment
  subscriptions: Subscription
  pauses: Pause
  attendance: Attendance
  feedback: Feedback
  wastage: Wastage
  settings: Settings
}

export type TableName = keyof Tables
