// Demo data for the in-browser store. Everything is dated relative to today so the demo always looks live.
import { addDays, defaultDeadline, diffDays, mondayOf, today } from '../dates'
import { phoneEmail } from '../phone'
import { MEALS } from '../types'
import type {
  Attendance, CustomMenu, Dish, DishCategory, Feedback, Meal, MenuItem, Pack, Payment, Pause, Profile,
  Selection, Settings, Subscription, TableName, Tables, WalletTxn, Wastage, Week,
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
  ['Gobi paratha', 'breakfast', 'Two cauliflower parathas with curd', 28],
  ['Methi thepla', 'breakfast', 'Three theplas with curd and pickle', 22],
  ['Idli sambar', 'breakfast', 'Four idlis with sambar and chutney', 30],
  ['Masala dosa', 'breakfast', 'Crisp dosa, potato masala, sambar', 40],
  ['Medu vada', 'breakfast', 'Two vadas with sambar and chutney', 25],
  ['Uttapam', 'breakfast', 'Onion-tomato uttapam with chutney', 35],
  ['Besan chilla', 'breakfast', 'Two gram-flour chillas with chutney', 25],
  ['Chole bhature', 'breakfast', 'Two bhature with chole (Sunday)', 45, true],
  ['Puri bhaji', 'breakfast', 'Four puris with aloo bhaji', 30],
  ['Sabudana khichdi', 'breakfast', 'With peanuts and lemon', 28],
  ['Bread omelette', 'breakfast', 'Two-egg masala omelette with toast', 30],
  ['Boiled eggs', 'breakfast', 'Two eggs, salt and pepper', 16],
  ['Sprouts chaat', 'breakfast', 'Moong sprouts, onion, tomato, lemon', 20],
  ['Bread butter jam', 'breakfast', 'Four slices, toasted', 15],
  ['Cornflakes with milk', 'breakfast', 'A bowl with warm or cold milk', 25],
  ['Coffee', 'drink', 'Filter coffee', 12],
  ['Lassi', 'drink', 'Sweet lassi', 20],
  ['Masala chaas', 'drink', 'Spiced buttermilk', 10],
  ['Banana shake', 'drink', 'Banana and milk', 25],
  ['Nimbu pani', 'drink', 'Fresh lemon water', 10],
  ['Pav bhaji', 'snack', 'Two pav with butter bhaji', 35],
  ['Aloo tikki', 'snack', 'Two tikkis with chutney', 20],
  ['Kachori', 'snack', 'Two kachoris with aloo sabzi', 15],
  ['Dhokla', 'snack', 'Soft khaman dhokla', 20],
  ['Veg momos', 'snack', 'Six steamed momos with chutney', 35],
  ['Onion pakoda', 'snack', 'Crisp onion pakodas', 15],
  ['Masala Maggi', 'snack', 'With veggies', 25],
  ['Bhel puri', 'snack', 'Puffed rice, sev, chutneys', 20],
  ['Dal fry', 'dal', 'Toor dal fry with onion-tomato', 18],
  ['Sambar', 'dal', 'South Indian lentil and vegetable stew', 16],
  ['Dum aloo', 'sabzi', 'Baby potatoes in rich gravy', 20],
  ['Aloo baingan', 'sabzi', 'Potato and brinjal', 16],
  ['Lauki kofta', 'sabzi', 'Bottle-gourd koftas in gravy', 22],
  ['Palak paneer', 'special', 'Paneer in spinach gravy', 40, true],
  ['Matar paneer', 'special', 'Paneer and peas curry', 38, true],
  ['Shahi paneer', 'special', 'Paneer in creamy cashew gravy', 45, true],
  ['Malai kofta', 'special', 'Paneer-potato koftas in creamy gravy', 40, true],
  ['Egg bhurji', 'special', 'Two-egg masala scramble', 30, true],
  ['Chicken biryani', 'special', 'Dum biryani with raita (Sunday)', 80, true],
  ['Butter naan', 'bread', 'Two naans with butter', 15],
  ['Laccha paratha', 'bread', 'Two layered parathas', 18],
  ['Missi roti', 'bread', 'Two besan-masala rotis', 12],
  ['Veg biryani', 'rice', 'Vegetable dum biryani', 40],
  ['Lemon rice', 'rice', 'South Indian lemon rice', 20],
  ['Curd rice', 'rice', 'Cool curd rice with tadka', 20],
  ['Khichdi', 'rice', 'Moong dal khichdi with ghee', 25],
  ['Papad', 'side', 'Roasted papad', 5],
  ['Sooji halwa', 'sweet', 'Ghee sooji halwa', 15, true],
  ['Gajar halwa', 'sweet', 'Carrot halwa (winter)', 25, true],
  ['Rasgulla', 'sweet', 'Two pieces', 15, true],
  ['Jalebi', 'sweet', 'Hot jalebis, 100 g', 15, true],
]

// Photos: public/dishes/<slug>.jpg from Wikimedia Commons (see public/dishes/CREDITS.md); a few from the Radixo designs.
const DESIGN_PHOTOS: Record<string, string> = {
  'Dal tadka': '/dishes/dal.jpg', 'Moong dal': '/dishes/dal.jpg', Rajma: '/dishes/rajma.jpg',
}
const photoFor = (name: string) => DESIGN_PHOTOS[name] ?? `/dishes/${slug(name)}.jpg`

type DayTemplate = Partial<Record<Meal, Record<string, string[]>>>
const WEEK_TEMPLATE: DayTemplate[] = [
  {
    breakfast: { Breakfast: ['Aloo paratha', 'Poha', 'Idli sambar'], Side: ['Boiled eggs', 'Sprouts chaat'], Drink: ['Chai', 'Coffee'] },
    lunch: { Dal: ['Dal tadka', 'Rajma', 'Sambar'], Sabzi: ['Aloo gobhi', 'Bhindi masala', 'Dum aloo'], Side: ['Salad & achar', 'Raita', 'Papad'] },
    snacks: { Snack: ['Samosa', 'Bread pakora', 'Dhokla'], Drink: ['Chai', 'Coffee', 'Nimbu pani'] },
    dinner: { Dal: ['Moong dal', 'Dal fry'], Sabzi: ['Mix veg', 'Aloo matar'], Special: ['Matar paneer', 'Egg curry'] },
  },
  {
    breakfast: { Breakfast: ['Poha', 'Upma', 'Besan chilla'], Side: ['Bread butter jam', 'Boiled eggs'], Drink: ['Chai', 'Coffee'] },
    lunch: { Dal: ['Kadhi pakora', 'Chana dal'], Sabzi: ['Aloo matar', 'Lauki chana', 'Aloo baingan'], Side: ['Salad & achar', 'Masala chaas'] },
    snacks: { Snack: ['Vada pav', 'Veg sandwich', 'Aloo tikki'], Drink: ['Chai', 'Coffee'] },
    dinner: { Dal: ['Arhar dal'], Sabzi: ['Aloo jeera', 'Cabbage matar'], Rice: ['Plain rice', 'Khichdi'] },
  },
  {
    breakfast: { Breakfast: ['Paneer paratha', 'Masala dosa', 'Upma'], Side: ['Sprouts chaat', 'Cornflakes with milk'], Drink: ['Chai', 'Coffee'] },
    lunch: { Dal: ['Dal makhani', 'Mix dal'], Sabzi: ['Soya aloo', 'Cabbage matar', 'Tinda masala'], Rice: ['Jeera rice', 'Lemon rice'] },
    snacks: { Snack: ['Samosa', 'Veg sandwich', 'Kachori'], Drink: ['Chai', 'Coffee'] },
    dinner: { Dal: ['Dal tadka'], Special: ['Paneer butter masala', 'Kadhai paneer', 'Egg curry'], Bread: ['Tawa roti', 'Butter naan'], Sweet: ['Gulab jamun', 'Rasgulla'] },
  },
  {
    breakfast: { Breakfast: ['Aloo paratha', 'Uttapam', 'Medu vada'], Side: ['Boiled eggs', 'Bread butter jam'], Drink: ['Chai', 'Coffee'] },
    lunch: { Dal: ['Chole', 'Moong dal', 'Sambar'], Sabzi: ['Aloo shimla mirch', 'Tinda masala'], Rice: ['Jeera rice', 'Curd rice'] },
    snacks: { Snack: ['Bread pakora', 'Vada pav', 'Onion pakoda'], Drink: ['Chai', 'Coffee', 'Nimbu pani'] },
    dinner: { Dal: ['Masoor dal'], Sabzi: ['Kaddu', 'Aloo methi', 'Lauki kofta'], Special: ['Egg bhurji', 'Palak paneer'] },
  },
  {
    breakfast: { Breakfast: ['Poha', 'Gobi paratha', 'Bread omelette', 'Methi thepla'], Drink: ['Chai', 'Coffee', 'Banana shake'] },
    lunch: { Dal: ['Rajma', 'Arhar dal'], Sabzi: ['Baingan bharta', 'Aloo methi'], Side: ['Salad & achar', 'Raita'] },
    snacks: { Snack: ['Veg momos', 'Samosa', 'Masala Maggi'], Drink: ['Chai', 'Coffee'] },
    dinner: { Dal: ['Dal tadka'], Special: ['Chicken curry', 'Paneer butter masala', 'Shahi paneer'], Sabzi: ['Mix veg', 'Palak aloo'], Bread: ['Tawa roti', 'Laccha paratha'] },
  },
  {
    breakfast: { Breakfast: ['Upma', 'Paneer paratha', 'Idli sambar', 'Sabudana khichdi'], Drink: ['Chai', 'Coffee'] },
    lunch: { Dal: ['Kadhi pakora', 'Lobia'], Sabzi: ['Palak aloo', 'Aloo gobhi'], Rice: ['Jeera rice', 'Veg pulao'], Bread: ['Tawa roti', 'Missi roti'] },
    snacks: { Snack: ['Vada pav', 'Bread pakora', 'Bhel puri'], Drink: ['Chai', 'Coffee'] },
    dinner: { Dal: ['Chana dal'], Sabzi: ['Matar mushroom', 'Aloo jeera'], Rice: ['Plain rice', 'Veg biryani'], Sweet: ['Sooji halwa'] },
  },
  {
    breakfast: { Breakfast: ['Chole bhature', 'Puri bhaji', 'Aloo paratha', 'Masala dosa'], Drink: ['Chai', 'Coffee', 'Lassi'] },
    lunch: { Dal: ['Chole', 'Dal makhani'], Sabzi: ['Aloo jeera', 'Mix veg', 'Malai kofta'], Bread: ['Puri', 'Tawa roti'], Rice: ['Jeera rice', 'Veg pulao'], Sweet: ['Kheer', 'Gajar halwa'] },
    snacks: { Snack: ['Samosa', 'Pav bhaji', 'Vada pav'], Drink: ['Chai', 'Coffee'] },
    dinner: { Dal: ['Dal tadka'], Rice: ['Veg pulao', 'Chicken biryani'], Side: ['Raita', 'Papad'], Sweet: ['Jalebi'] },
  },
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
          label: label === 'Bread' ? (ids.length === 1 && lines[label][0] === 'Tawa roti' ? 'Roti' : 'Bread') : label === 'Side' && meal === 'breakfast' ? 'Extras' : label,
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
    id: `d-${slug(name)}`, name, category, description, price, image_url: photoFor(name), is_premium: !!premium, is_active: true, created_at: now,
  }))
  const dishByName = new Map(dishes.map((d) => [d.name, d]))

  const thisMonday = mondayOf(t)
  const cur = buildWeek(thisMonday, 0, dishByName, now)
  const next = buildWeek(addDays(thisMonday, 7), 2, dishByName, now)


  const users: DemoUser[] = []
  const profiles: Profile[] = []
  const mk = (id: string, email: string, full_name: string, role: Profile['role'], extra: Partial<Profile>, n: number) => {
    users.push({ id, email, password: DEMO_PASSWORD })
    profiles.push({
      id, email, full_name, role, phone: '', college: '', year: '', stay_type: '', area: '', meal_mode: 'dine', address: '',
      member_code: `RDX${String(n).padStart(4, '0')}`, created_at: addDays(t, -40) + 'T10:00:00.000Z', ...extra,
    })
  }
  mk('u-admin', phoneEmail(DEMO_PHONES.owner), 'Radixo Owner', 'admin', { phone: DEMO_PHONES.owner, college: '' }, 1)
  mk('u-staff', phoneEmail(DEMO_PHONES.staff), 'Counter Staff', 'staff', { phone: DEMO_PHONES.staff, college: '' }, 2)
  STUDENTS.forEach(([name, phone, year, stay, area], i) => {
    const id = i === 0 ? 'u-student' : `u-s${i}`
    // A few students take tiffins instead of eating at the mess.
    const tiffin = [2, 5, 9].includes(i)
    mk(id, phoneEmail(phone), name, 'student', { phone, year, stay_type: stay, area, meal_mode: tiffin ? 'tiffin' : 'dine', address: tiffin ? `Room ${10 + i}, ${area}` : '' }, i + 3)
  })

  // Bookings: each student booked a ready-made menu or their own for 1 week to 6 months, starting on a Monday.
  const subscriptions: Subscription[] = []
  const payments: Payment[] = []
  const wallet_txns: WalletTxn[] = []
  const selections: Selection[] = []
  const customFor = (items: MenuItem[], meals: Meal[]) => {
    const custom: Record<string, string[]> = {}
    for (let day = 0; day < 7; day++) {
      for (const meal of meals) {
        if (meal === 'lunch' && day % 3 === 2 && meals.length > 1) continue // skips a few lunches, like real students do
        const lines = items.filter((it) => it.day === day && it.meal === meal)
        if (lines.length) custom[`${day}-${meal}`] = lines.map((it) => it.dish_ids[Math.floor(rand() * it.dish_ids.length)])
      }
    }
    return custom
  }
  const dishMap = new Map(dishes.map((d) => [d.id, d]))
  const value = (custom: CustomMenu) => Object.values(custom).flat().reduce((n, id) => n + (dishMap.get(id)?.price ?? 0), 0)
  const disc = (weeks: number) => (weeks >= 26 ? 12 : weeks >= 13 ? 8 : weeks >= 4 ? 5 : 0)
  const label = (name: string, weeks: number) => `${name} · ${({ 1: '1 week', 4: '1 month', 13: '3 months', 26: '6 months' } as Record<number, string>)[weeks]}`

  type Spec = { uid: string; start: string; weeks: number; pack?: Pack; custom?: CustomMenu; status?: Payment['status'] }
  const book = ({ uid, start, weeks, pack, custom, status = 'approved' }: Spec) => {
    const weekly = pack ? pack.price : value(custom!)
    const total = Math.round((weekly * weeks * (100 - disc(weeks))) / 100)
    const created = status === 'pending' ? addDays(t, -(payments.length % 2)) : addDays(start, -2)
    const details = {
      kind: pack ? 'pack' : 'custom', source: pack ? 'pack' : 'custom', pack_id: pack?.id ?? null, pack_name: pack?.name ?? 'My Menu', template: custom ?? {},
      meals: pack ? pack.meals : MEALS.filter((m) => Object.entries(custom!).some(([k, v]) => k.endsWith('-' + m) && v.length)), weeks, weekly_price: weekly, discount_pct: disc(weeks),
      start_date: start, end_date: addDays(start, weeks * 7 - 1), total, label: label(pack?.name ?? 'My Menu', weeks),
    } as const
    const p: Payment = {
      id: `pay-${uid}-${start}`, user_id: uid, plan_id: null, pack_id: pack?.id ?? null, week_id: pack?.week_id ?? cur.week.id, amount: total, wallet_used: 0, method: 'upi',
      utr: String(Math.floor(1e11 + rand() * 9e11)), status, admin_note: '', details: { ...details },
      created_at: created + 'T09:30:00.000Z', reviewed_at: status === 'pending' ? null : created + 'T12:00:00.000Z',
    }
    payments.push(p)
    if (status !== 'approved') return p
    subscriptions.push({
      id: `sub-${uid}-${start}`, user_id: uid, plan_id: null, pack_id: details.pack_id, payment_id: p.id, start_date: start, start_meal: 'breakfast', end_date: details.end_date,
      meals: [...details.meals], status: 'active', source: details.source, pack_name: details.pack_name, template: details.template, weeks, weekly_price: weekly,
      discount_pct: details.discount_pct, created_at: p.created_at,
    })
    return p
  }

  const plan: [weeksAgo: number, weeks: number, packIdx: number | null][] = [
    [1, 4, 2], [2, 13, 0], [0, 4, 3], [3, 26, 1], [0, 1, null], [2, 4, 0], [3, 13, null], [0, 4, 2], [2, 4, 3], [1, 13, 0], [0, 4, null],
  ]
  plan.forEach(([ago, weeks, pk], i) => {
    const uid = i === 0 ? 'u-student' : `u-s${i}`
    const start = addDays(thisMonday, -7 * ago)
    if (pk === null) {
      const custom = customFor(cur.items, i === 4 ? ['dinner'] : ['lunch', 'dinner'])
      book({ uid, start, weeks, custom })
      selections.push({ id: `sel-${uid}-${cur.week.id}`, user_id: uid, week_id: cur.week.id, mode: 'custom', pack_id: null, picks: {}, custom, updated_at: now })
    } else {
      book({ uid, start, weeks, pack: cur.packs[pk] })
    }
  })
  // Simran: a Full Day menu, this week only
  book({ uid: 'u-s13', start: thisMonday, weeks: 1, pack: cur.packs[1] })
  // Dev: a month that ended last week (shows up in renewals) and is now asking for one week of Budget
  book({ uid: 'u-s14', start: addDays(thisMonday, -35), weeks: 4, pack: cur.packs[0] })
  book({ uid: 'u-s14', start: addDays(thisMonday, 7), weeks: 1, pack: next.packs[0], status: 'pending' })
  book({ uid: 'u-s11', start: addDays(thisMonday, 7), weeks: 4, pack: next.packs[2], status: 'pending' }) // Tanya
  book({ uid: 'u-s12', start: addDays(thisMonday, 7), weeks: 13, pack: next.packs[3], status: 'pending' }) // Harsh
  // A few members already picked dishes for next week
  for (const uid of ['u-s1', 'u-s4']) selections.push({ id: `sel-${uid}-${next.week.id}`, user_id: uid, week_id: next.week.id, mode: 'pack', pack_id: next.packs[2].id, picks: { ...next.packs[2].picks }, custom: {}, updated_at: now })

  // "Not coming" days: credited to the wallet when marked.
  const skip = (id: string, uid: string, start: string, end: string, reason: string): Pause => {
    const b = subscriptions.find((x) => x.user_id === uid && x.start_date <= start && x.end_date >= end)!
    const net = (b.weekly_price * (100 - b.discount_pct)) / 100
    const credit = Math.round((net / 7) * (diffDays(start, end) + 1))
    wallet_txns.push({ id: `wt-${id}`, user_id: uid, amount: credit, kind: 'skip', note: `Not coming ${start.slice(8)}–${end.slice(8)}`, ref_id: id, created_at: addDays(start, -2) + 'T18:00:00.000Z' })
    return { id, user_id: uid, subscription_id: b.id, credit, start_date: start, end_date: end, reason, status: 'approved', created_at: addDays(start, -2) + 'T18:00:00.000Z' }
  }
  const pauses: Pause[] = [
    skip('pause-1', 'u-s2', addDays(t, 3), addDays(t, 7), 'Going home for a family function'),
    skip('pause-2', 'u-student', addDays(thisMonday, -6), addDays(thisMonday, -5), 'College trip'),
  ]

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
    id: 1, upi_id: 'radixo.demo@upi', upi_name: 'Radixo Dining', whatsapp: '', address: '',
    breakfast_time: '7:30 – 9:30 AM', lunch_time: '12:00 – 3:00 PM', snacks_time: '5:00 – 6:00 PM', dinner_time: '7:30 – 10:30 PM', attendance_factor: 0.8, buffer_pct: 10, min_pause_days: 4,
    discount_1m: 5, discount_3m: 8, discount_6m: 12, skip_notice_hours: 24,
  }]

  return {
    version: 5,
    users,
    session: null,
    memberSeq: STUDENTS.length + 3,
    tables: {
      profiles, dishes, weeks: [cur.week, next.week], menu_items: [...cur.items, ...next.items], packs: [...cur.packs, ...next.packs],
      selections, plans: [], payments, subscriptions, pauses, wallet_txns, attendance, feedback, wastage, settings,
    },
  }
}
