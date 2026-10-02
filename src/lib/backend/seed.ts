// Demo data for the in-browser store. Everything is dated relative to today so the demo always looks live.
import { addDays, defaultDeadline, mondayOf, today } from '../dates'
import { phoneEmail } from '../phone'
import type {
  Attendance, Dish, DishCategory, Feedback, Meal, MenuItem, Pack, Payment, Pause, Plan, Profile,
  Selection, Settings, Subscription, TableName, Tables, Wastage, Week,
} from '../types'

export interface DemoUser {
  id: string
  email: string
  password: string
}

export interface DemoDB {
  version: number
  tables: { [K in TableName]: Tables[K][] }
  users: DemoUser[]
  session: string | null
  memberSeq: number
}

export const DEMO_PASSWORD = 'demo1234'
/** Demo logins by role (all use DEMO_PASSWORD). */
export const DEMO_PHONES = { user: '9811000001', owner: '9800000000', staff: '9800000001' } as const

// Small deterministic RNG so the demo looks the same on every reset.
function rng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

// [name, category, description, ₹ per serving, special?]. A full lunch thali comes to about ₹60.
const DISHES: [string, DishCategory, string, number, boolean?][] = [
  ['Aloo paratha', 'breakfast', 'Two parathas with curd and pickle', 28],
  ['Paneer paratha', 'breakfast', 'Two paneer parathas with curd', 38],
  ['Poha', 'breakfast', 'Indori poha with sev', 20],
  ['Upma', 'breakfast', 'Rava upma with veggies', 20],
  ['Chai', 'drink', 'Masala chai', 8],
  ['Samosa', 'snack', 'Two samosas with chutney', 15],
  ['Vada pav', 'snack', 'With green chutney', 18],
  ['Bread pakora', 'snack', 'Stuffed, with ketchup', 15],
  ['Veg sandwich', 'snack', 'Grilled, with chutney', 25],
  ['Dal tadka', 'dal', 'Yellow dal with jeera-garlic tadka', 18],
  ['Rajma', 'dal', 'Slow-cooked kidney beans, Punjabi style', 22],
  ['Chole', 'dal', 'Spiced chickpeas', 22],
  ['Kadhi pakora', 'dal', 'Curd kadhi with besan pakoras', 20],
  ['Dal makhani', 'dal', 'Black dal with butter and cream', 25],
  ['Moong dal', 'dal', 'Light yellow moong dal', 16],
  ['Arhar dal', 'dal', 'Toor dal, home style', 16],
  ['Chana dal', 'dal', 'Chana dal with lauki', 16],
  ['Mix dal', 'dal', 'Five-dal mix', 18],
  ['Masoor dal', 'dal', 'Red lentil dal', 16],
  ['Lobia', 'dal', 'Black-eyed beans curry', 18],
  ['Aloo gobhi', 'sabzi', 'Dry potato and cauliflower', 18],
  ['Bhindi masala', 'sabzi', 'Okra with onion masala', 20],
  ['Mix veg', 'sabzi', 'Seasonal vegetables', 18],
  ['Aloo matar', 'sabzi', 'Potato and peas curry', 16],
  ['Lauki chana', 'sabzi', 'Bottle gourd with chana dal', 16],
  ['Aloo jeera', 'sabzi', 'Cumin potatoes', 15],
  ['Soya aloo', 'sabzi', 'Soya chunks with potato', 20],
  ['Cabbage matar', 'sabzi', 'Cabbage and peas', 15],
  ['Aloo shimla mirch', 'sabzi', 'Potato and capsicum', 16],
  ['Tinda masala', 'sabzi', 'Round gourd masala', 16],
  ['Baingan bharta', 'sabzi', 'Smoky mashed brinjal', 18],
  ['Palak aloo', 'sabzi', 'Spinach with potato', 16],
  ['Kaddu', 'sabzi', 'Sweet-sour pumpkin', 15],
  ['Matar mushroom', 'sabzi', 'Mushroom and peas curry', 25],
  ['Aloo methi', 'sabzi', 'Potato with fenugreek', 16],
  ['Paneer butter masala', 'special', 'Paneer in tomato-butter gravy', 40, true],
  ['Kadhai paneer', 'special', 'Paneer with capsicum, kadhai masala', 40, true],
  ['Egg curry', 'special', 'Two eggs in onion-tomato gravy', 30, true],
  ['Chicken curry', 'special', 'Home-style chicken curry', 60, true],
  ['Tawa roti', 'bread', 'Fresh tawa rotis, 4 pieces', 10],
  ['Puri', 'bread', 'Fried puris, 4 pieces (Sunday)', 15],
  ['Jeera rice', 'rice', 'Basmati with cumin', 12],
  ['Plain rice', 'rice', 'Steamed rice', 10],
  ['Veg pulao', 'rice', 'Vegetable pulao', 20],
  ['Salad & achar', 'side', 'Onion, cucumber, tomato, pickle', 5],
  ['Raita', 'side', 'Boondi raita', 8],
  ['Gulab jamun', 'sweet', 'One piece', 12, true],
  ['Kheer', 'sweet', 'Rice kheer', 15, true],
]

// Photos cut from the Radixo designs; other dishes show an illustrated tile until the owner uploads one.
const PHOTOS: Record<string, string> = {
  'Paneer butter masala': '/dishes/paneer.jpg', 'Kadhai paneer': '/dishes/paneer.jpg', 'Egg curry': '/dishes/egg-curry.jpg', 'Chicken curry': '/dishes/chicken-curry.jpg',
  'Dal tadka': '/dishes/dal.jpg', 'Moong dal': '/dishes/dal.jpg', 'Arhar dal': '/dishes/dal.jpg', 'Masoor dal': '/dishes/dal.jpg', 'Chana dal': '/dishes/dal.jpg', 'Mix dal': '/dishes/dal.jpg',
  'Jeera rice': '/dishes/rice.jpg', 'Plain rice': '/dishes/rice.jpg', Rajma: '/dishes/rajma.jpg',
}

type DayTemplate = Partial<Record<Meal, Record<string, string[]>>>
const WEEK_TEMPLATE: DayTemplate[] = [
  { breakfast: { Breakfast: ['Aloo paratha', 'Poha'] }, lunch: { Dal: ['Dal tadka', 'Rajma'], Sabzi: ['Aloo gobhi', 'Bhindi masala'] }, snacks: { Snack: ['Samosa', 'Bread pakora'] }, dinner: { Dal: ['Moong dal'], Sabzi: ['Mix veg', 'Aloo matar'] } },
  { breakfast: { Breakfast: ['Poha', 'Upma'] }, lunch: { Dal: ['Kadhi pakora', 'Chana dal'], Sabzi: ['Aloo matar', 'Lauki chana'] }, snacks: { Snack: ['Vada pav', 'Veg sandwich'] }, dinner: { Dal: ['Arhar dal'], Sabzi: ['Aloo jeera', 'Cabbage matar'] } },
  { breakfast: { Breakfast: ['Paneer paratha', 'Upma'] }, lunch: { Dal: ['Dal makhani', 'Mix dal'], Sabzi: ['Soya aloo', 'Cabbage matar', 'Tinda masala'] }, snacks: { Snack: ['Samosa', 'Veg sandwich'] }, dinner: { Dal: ['Dal tadka'], Special: ['Paneer butter masala', 'Kadhai paneer', 'Egg curry'], Sweet: ['Gulab jamun'] } },
  { breakfast: { Breakfast: ['Aloo paratha', 'Upma'] }, lunch: { Dal: ['Chole', 'Moong dal'], Sabzi: ['Aloo shimla mirch', 'Tinda masala'] }, snacks: { Snack: ['Bread pakora', 'Vada pav'] }, dinner: { Dal: ['Masoor dal'], Sabzi: ['Kaddu', 'Aloo methi'] } },
  { breakfast: { Breakfast: ['Poha', 'Aloo paratha'] }, lunch: { Dal: ['Rajma', 'Arhar dal'], Sabzi: ['Baingan bharta', 'Aloo methi'] }, snacks: { Snack: ['Veg sandwich', 'Samosa'] }, dinner: { Dal: ['Dal tadka'], Special: ['Chicken curry', 'Paneer butter masala'], Sabzi: ['Mix veg', 'Palak aloo'] } },
  { breakfast: { Breakfast: ['Upma', 'Paneer paratha'] }, lunch: { Dal: ['Kadhi pakora', 'Lobia'], Sabzi: ['Palak aloo', 'Aloo gobhi'] }, snacks: { Snack: ['Vada pav', 'Bread pakora'] }, dinner: { Dal: ['Chana dal'], Sabzi: ['Matar mushroom', 'Aloo jeera'] } },
  { breakfast: { Breakfast: ['Aloo paratha', 'Paneer paratha'] }, lunch: { Dal: ['Chole', 'Dal makhani'], Sabzi: ['Aloo jeera', 'Mix veg'], Bread: ['Puri'], Sweet: ['Kheer'] }, snacks: { Snack: ['Samosa', 'Vada pav'] }, dinner: { Dal: ['Dal tadka'], Rice: ['Veg pulao'], Side: ['Raita'] } },
]
const LABEL_ORDER = ['Breakfast', 'Snack', 'Dal', 'Sabzi', 'Special', 'Bread', 'Rice', 'Side', 'Sweet', 'Drink']
const FIXED: Record<Meal, Record<string, string>> = {
  breakfast: { Drink: 'Chai' },
  lunch: { Bread: 'Tawa roti', Rice: 'Jeera rice', Side: 'Salad & achar' },
  snacks: { Drink: 'Chai' },
  dinner: { Bread: 'Tawa roti', Rice: 'Plain rice' },
}

const PACKS: { name: string; tagline: string; prefer: string[]; price: number; meals: Meal[] }[] = [
  { name: 'Budget', tagline: 'Lunch + dinner, the kitchen’s favourites', prefer: [], price: 849, meals: ['lunch', 'dinner'] },
  { name: 'Full Day', tagline: 'Breakfast, lunch, snacks and dinner', prefer: ['Aloo paratha', 'Samosa'], price: 1299, meals: ['breakfast', 'lunch', 'snacks', 'dinner'] },
  { name: 'Protein Plus', tagline: 'More rajma, chole, paneer and eggs', prefer: ['Rajma', 'Chole', 'Dal makhani', 'Soya aloo', 'Lobia', 'Egg curry', 'Kadhai paneer', 'Paneer butter masala', 'Matar mushroom', 'Chana dal', 'Paneer paratha'], price: 999, meals: ['lunch', 'dinner'] },
  { name: 'Light & Homely', tagline: 'Moong dal, lauki, tinda: easy on the stomach', prefer: ['Moong dal', 'Lauki chana', 'Tinda masala', 'Arhar dal', 'Masoor dal', 'Kaddu', 'Mix dal', 'Palak aloo', 'Mix veg', 'Cabbage matar', 'Poha', 'Upma'], price: 799, meals: ['lunch', 'dinner'] },
]

const STUDENTS = [
  ['Aarav Gupta', '9811000001', '3rd year', 'PG', 'Shiv Shakti PG, Asalat Nagar'],
  ['Riya Sharma', '9811000002', '2nd year', 'PG', 'Asalat Nagar'],
  ['Kabir Singh', '9811000003', '4th year', 'Rented flat', 'Muradnagar'],
  ['Ananya Verma', '9811000004', '1st year', 'PG', 'Near KIET gate'],
  ['Ishaan Mehta', '9811000005', '2nd year', 'PG', 'Asalat Nagar'],
  ['Sneha Yadav', '9811000006', '3rd year', 'Hostel', 'KIET girls hostel'],
  ['Vikram Chauhan', '9811000007', '4th year', 'PG', 'Duhai'],
  ['Pooja Rawat', '9811000008', '1st year', 'PG', 'Near KIET gate'],
  ['Arjun Tyagi', '9811000009', '2nd year', 'Day scholar', 'Modinagar'],
  ['Neha Bansal', '9811000010', '3rd year', 'PG', 'Asalat Nagar'],
  ['Rohit Saini', '9811000011', '1st year', 'Rented flat', 'Muradnagar'],
  ['Tanya Goel', '9811000012', '2nd year', 'PG', 'Asalat Nagar'],
  ['Harsh Rathi', '9811000013', '3rd year', 'PG', 'Near KIET gate'],
  ['Simran Kaur', '9811000014', '1st year', 'PG', 'Asalat Nagar'],
  ['Dev Malik', '9811000015', '4th year', 'PG', 'Duhai'],
] as const

function buildWeek(weekStart: string, rotate: number, dishByName: Map<string, Dish>, now: string) {
  const week: Week = {
    id: `w-${weekStart}`,
    week_start: weekStart,
    status: 'published',
    choice_deadline: defaultDeadline(weekStart),
    created_at: now,
  }
  const items: MenuItem[] = []
  for (let day = 0; day < 7; day++) {
    const tpl = WEEK_TEMPLATE[day === 6 ? 6 : (day + rotate) % 6]
    for (const meal of ['breakfast', 'lunch', 'snacks', 'dinner'] as Meal[]) {
      const lines: Record<string, string[]> = { ...Object.fromEntries(Object.entries(FIXED[meal]).map(([k, v]) => [k, [v]])), ...tpl[meal] }
      LABEL_ORDER.filter((l) => lines[l]).forEach((label, position) => {
        const ids = lines[label].map((n) => dishByName.get(n)!.id)
        items.push({
          id: `mi-${weekStart}-${day}-${meal}-${slug(label)}`,
          week_id: week.id,
          day,
          meal,
          label: label === 'Bread' ? (ids.length === 1 && lines[label][0] === 'Tawa roti' ? 'Roti' : 'Bread') : label,
          dish_ids: ids,
          default_dish_id: ids[0],
          position,
        })
      })
    }
  }
  const packs: Pack[] = PACKS.map((p, position) => {
    const picks: Record<string, string> = {}
    for (const it of items) {
      if (it.dish_ids.length < 2) continue
      const names = it.dish_ids.map((id) => [...dishByName.values()].find((d) => d.id === id)!.name)
      const prefIdx = p.prefer.findIndex((pref) => names.includes(pref))
      picks[it.id] = prefIdx >= 0 ? it.dish_ids[names.indexOf(p.prefer[prefIdx])] : it.default_dish_id
    }
    return { id: `pk-${weekStart}-${slug(p.name)}`, week_id: week.id, name: p.name, tagline: p.tagline, picks, price: p.price, meals: p.meals, position }
  })
  return { week, items, packs }
}

export function createSeed(): DemoDB {
  const now = new Date().toISOString()
  const t = today()
  const rand = rng(42)

  const dishes: Dish[] = DISHES.map(([name, category, description, price, premium]) => ({
    id: `d-${slug(name)}`, name, category, description, price, image_url: PHOTOS[name] ?? '', is_premium: !!premium, is_active: true, created_at: now,
  }))
  const dishByName = new Map(dishes.map((d) => [d.name, d]))

  const thisMonday = mondayOf(t)
  const cur = buildWeek(thisMonday, 0, dishByName, now)
  const next = buildWeek(addDays(thisMonday, 7), 2, dishByName, now)

  const plans: Plan[] = [
    { id: 'p-founding', name: 'Founding batch — Monthly', description: 'Lunch + dinner for 30 days. ₹300 off for the first 100 students.', price: 3300, duration_days: 30, meals: ['lunch', 'dinner'], badge: 'First 100 only', is_active: true, position: 0 },
    { id: 'p-monthly', name: 'Monthly — Lunch + Dinner', description: '60 meals over 30 days. Unlimited roti, rice, dal and sabzi.', price: 3600, duration_days: 30, meals: ['lunch', 'dinner'], badge: 'Best value', is_active: true, position: 1 },
    { id: 'p-dinner', name: 'Monthly — Dinner only', description: '30 dinners. For students who eat lunch on campus.', price: 2000, duration_days: 30, meals: ['dinner'], badge: '', is_active: true, position: 2 },
    { id: 'p-trial', name: 'Trial week', description: '14 meals over 7 days. Try before you commit.', price: 999, duration_days: 7, meals: ['lunch', 'dinner'], badge: '', is_active: true, position: 3 },
  ]

  const users: DemoUser[] = []
  const profiles: Profile[] = []
  const mk = (id: string, email: string, full_name: string, role: Profile['role'], extra: Partial<Profile>, n: number) => {
    users.push({ id, email, password: DEMO_PASSWORD })
    profiles.push({
      id, email, full_name, role, phone: '', college: 'KIET Group of Institutions', year: '', stay_type: '', area: '',
      member_code: `RDX${String(n).padStart(4, '0')}`, created_at: addDays(t, -40) + 'T10:00:00.000Z', ...extra,
    })
  }
  mk('u-admin', phoneEmail(DEMO_PHONES.owner), 'Radixo Owner', 'admin', { phone: DEMO_PHONES.owner, college: '' }, 1)
  mk('u-staff', phoneEmail(DEMO_PHONES.staff), 'Counter Staff', 'staff', { phone: DEMO_PHONES.staff, college: '' }, 2)
  STUDENTS.forEach(([name, phone, year, stay, area], i) => {
    const id = i === 0 ? 'u-student' : `u-s${i}`
    mk(id, phoneEmail(phone), name, 'student', { phone, year, stay_type: stay, area }, i + 3)
  })

  const subscriptions: Subscription[] = []
  const payments: Payment[] = []
  const pay = (user_id: string, what: { plan?: Plan; pack?: Pack }, created: string, status: Payment['status']) => {
    const p: Payment = {
      id: `pay-${user_id}-${created}`, user_id, plan_id: what.plan?.id ?? null, pack_id: what.pack?.id ?? null, week_id: what.pack?.week_id ?? null,
      amount: what.plan?.price ?? what.pack?.price ?? 0, method: 'upi',
      utr: String(Math.floor(1e11 + rand() * 9e11)), status, admin_note: '',
      created_at: created + 'T09:30:00.000Z', reviewed_at: status === 'pending' ? null : created + 'T12:00:00.000Z',
    }
    payments.push(p)
    return p
  }
  const sub = (user_id: string, plan: Plan, start: string) => {
    const p = pay(user_id, { plan }, addDays(start, -1), 'approved')
    subscriptions.push({
      id: `sub-${user_id}-${start}`, user_id, plan_id: plan.id, pack_id: null, payment_id: p.id, start_date: start,
      end_date: addDays(start, plan.duration_days - 1), meals: plan.meals, status: 'active', created_at: p.created_at,
    })
  }
  const [founding, monthly, dinnerOnly, trial] = plans
  const startOffsets = [-12, -20, -8, -27, -3, -15, -25, -5, -18, -10, -1]
  startOffsets.forEach((off, i) => {
    const plan = i === 8 ? dinnerOnly : i % 3 === 0 ? founding : monthly
    sub(i === 0 ? 'u-student' : `u-s${i}`, plan, addDays(t, off))
  })
  sub('u-s14', monthly, addDays(t, -38)) // Dev: expired 9 days ago — shows up in renewals
  pay('u-s11', { plan: trial }, t, 'pending') // Tanya
  pay('u-s12', { plan: monthly }, addDays(t, -1), 'pending') // Harsh
  // Simran booked this week's Full Day menu on its own (breakfast + snacks show up in the kitchen)
  const fullDay = cur.packs[1]
  const simranPay = pay('u-s13', { pack: fullDay }, addDays(thisMonday, -2), 'approved')
  subscriptions.push({
    id: 'sub-u-s13-pack', user_id: 'u-s13', plan_id: null, pack_id: fullDay.id, payment_id: simranPay.id, start_date: thisMonday,
    end_date: addDays(thisMonday, 6), meals: fullDay.meals, status: 'active', created_at: simranPay.created_at,
  })
  pay('u-s14', { pack: next.packs[0] }, t, 'pending') // Dev wants to come back for one week of Budget

  const pauses: Pause[] = [{
    id: 'pause-1', user_id: 'u-s2', subscription_id: subscriptions[2].id, start_date: addDays(t, 3), end_date: addDays(t, 7),
    reason: 'Going home for a family function', status: 'requested', created_at: now,
  }]

  // Current-week menus for most members: ready-made ones, or custom ones built from each meal's options.
  const selections: Selection[] = []
  const customFor = (items: MenuItem[], meals: Meal[]) => {
    const custom: Record<string, string[]> = {}
    for (let day = 0; day < 7; day++) {
      for (const meal of meals) {
        const lines = items.filter((it) => it.day === day && it.meal === meal)
        if (lines.length) custom[`${day}-${meal}`] = lines.map((it) => it.dish_ids[Math.floor(rand() * it.dish_ids.length)])
      }
    }
    return custom
  }
  const packSel = (uid: string, wk: typeof cur, pk: Pack): Selection => ({ id: `sel-${uid}-${wk.week.id}`, user_id: uid, week_id: wk.week.id, mode: 'pack', pack_id: pk.id, picks: { ...pk.picks }, custom: {}, updated_at: now })
  subscriptions.slice(1, 11).forEach((s, i) => {
    if (rand() < 0.65) selections.push(packSel(s.user_id, cur, cur.packs[[0, 2, 3][i % 3]]))
    else selections.push({ id: `sel-${s.user_id}-${cur.week.id}`, user_id: s.user_id, week_id: cur.week.id, mode: 'custom', pack_id: null, picks: {}, custom: customFor(cur.items, s.meals), updated_at: now })
  })
  selections.push(packSel('u-student', cur, cur.packs[2]))
  selections.push(packSel('u-s13', cur, fullDay))
  for (const uid of ['u-s1', 'u-s4', 'u-s7']) selections.push(packSel(uid, next, next.packs[uid === 'u-s4' ? 3 : 0]))

  // Two weeks of attendance for members active on each day; breakfast and snacks are skipped more often.
  const attendance: Attendance[] = []
  const SHOW: Record<Meal, number> = { breakfast: 0.6, lunch: 0.72, snacks: 0.55, dinner: 0.86 }
  const HOUR: Record<Meal, string> = { breakfast: '08', lunch: '13', snacks: '17', dinner: '20' }
  for (let d = -14; d <= -1; d++) {
    const date = addDays(t, d)
    for (const s of subscriptions) {
      if (date < s.start_date || date > s.end_date) continue
      for (const meal of s.meals) {
        if (rand() < SHOW[meal]) attendance.push({ id: `att-${s.user_id}-${date}-${meal}`, user_id: s.user_id, date, meal, created_at: `${date}T${HOUR[meal]}:15:00.000Z` })
      }
    }
  }

  const fb = (user_id: string, d: number, meal: Meal, kind: Feedback['kind'], rating: number | null, comment: string, status: Feedback['status'] = 'open', admin_reply = ''): Feedback => ({
    id: `fb-${user_id}-${d}-${meal}-${kind}`, user_id, date: addDays(t, d), meal, kind, rating, comment, status, admin_reply,
    created_at: addDays(t, d) + 'T15:00:00.000Z',
  })
  const feedback: Feedback[] = [
    fb('u-s1', -1, 'lunch', 'rating', 5, 'Rajma was amazing, just like home'),
    fb('u-s3', -1, 'dinner', 'rating', 4, ''),
    fb('u-s5', -2, 'lunch', 'complaint', 2, 'Dal was too salty at lunch'),
    fb('u-s6', -2, 'dinner', 'suggestion', null, 'Can you add egg curry on Fridays?'),
    fb('u-s7', -3, 'lunch', 'rating', 4, 'Good portion, rotis were soft'),
    fb('u-student', -3, 'dinner', 'rating', 5, 'Paneer day was great'),
    fb('u-s9', -4, 'lunch', 'complaint', 3, 'Queue was long around 1:15 pm', 'resolved', 'Added a second roti counter at peak time. Thanks!'),
    fb('u-s10', -5, 'dinner', 'rating', 3, 'Sabzi was a bit oily'),
  ]

  const wastage: Wastage[] = []
  for (let d = -10; d <= -1; d++) {
    for (const meal of ['lunch', 'dinner'] as Meal[]) {
      const cooked = Math.round((meal === 'lunch' ? 34 : 40) + rand() * 6)
      wastage.push({ id: `wst-${d}-${meal}`, date: addDays(t, d), meal, cooked_kg: cooked, wasted_kg: Math.round((1.2 + rand() * 2.6) * 10) / 10, notes: '', created_at: now })
    }
  }

  const settings: Settings[] = [{
    id: 1, upi_id: 'radixo.demo@upi', upi_name: 'Radixo Mess', whatsapp: '', address: '',
    breakfast_time: '7:30 – 9:30 AM', lunch_time: '12:00 – 3:00 PM', snacks_time: '5:00 – 6:00 PM', dinner_time: '7:30 – 10:30 PM', attendance_factor: 0.8, buffer_pct: 10, min_pause_days: 4,
  }]

  return {
    version: 3,
    users,
    session: null,
    memberSeq: STUDENTS.length + 3,
    tables: {
      profiles, dishes, weeks: [cur.week, next.week], menu_items: [...cur.items, ...next.items], packs: [...cur.packs, ...next.packs],
      selections, plans, payments, subscriptions, pauses, attendance, feedback, wastage, settings,
    },
  }
}
