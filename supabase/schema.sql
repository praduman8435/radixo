-- Radixo database: run this once in the Supabase SQL editor (Dashboard → SQL → New query).
-- Then sign up in the app and make yourself admin (see the bottom of this file).

create extension if not exists pgcrypto;

-- ---------- Tables ----------

create sequence if not exists member_seq start 1;

create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null default '',
  full_name text not null default '',
  phone text not null default '',
  college text not null default '',
  year text not null default '',
  stay_type text not null default '',
  area text not null default '',
  role text not null default 'student' check (role in ('student', 'staff', 'admin')),
  member_code text not null unique default ('RDX' || lpad(nextval('member_seq')::text, 4, '0')),
  created_at timestamptz not null default now()
);

create table if not exists dishes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text not null check (category in ('breakfast', 'snack', 'drink', 'dal', 'sabzi', 'rice', 'bread', 'special', 'sweet', 'side')),
  description text not null default '',
  price integer not null default 0 check (price >= 0), -- ₹ per serving, totals a custom menu
  image_url text not null default '',
  is_premium boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists weeks (
  id uuid primary key default gen_random_uuid(),
  week_start date not null unique check (extract(isodow from week_start) = 1),
  status text not null default 'draft' check (status in ('draft', 'published')),
  choice_deadline timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists menu_items (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references weeks (id) on delete cascade,
  day smallint not null check (day between 0 and 6),
  meal text not null check (meal in ('breakfast', 'lunch', 'snacks', 'dinner')),
  label text not null,
  dish_ids uuid[] not null check (cardinality(dish_ids) between 1 and 4),
  default_dish_id uuid not null,
  position smallint not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists menu_items_week on menu_items (week_id);

create table if not exists packs (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references weeks (id) on delete cascade,
  name text not null,
  tagline text not null default '',
  picks jsonb not null default '{}',
  price integer not null default 0 check (price >= 0), -- ₹ for the week; 0 = not bookable on its own
  meals text[] not null default '{lunch,dinner}' check (meals <@ array['breakfast', 'lunch', 'snacks', 'dinner']),
  position smallint not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists selections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  week_id uuid not null references weeks (id) on delete cascade,
  mode text not null check (mode in ('pack', 'custom')),
  pack_id uuid references packs (id) on delete set null,
  picks jsonb not null default '{}', -- ready-made: menu_item_id → dish_id
  custom jsonb not null default '{}', -- custom: "<day>-<meal>" → [dish_id]
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, week_id)
);

create table if not exists plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  price integer not null check (price > 0),
  duration_days integer not null check (duration_days > 0),
  meals text[] not null default '{lunch,dinner}' check (meals <@ array['breakfast', 'lunch', 'snacks', 'dinner'] and cardinality(meals) > 0),
  badge text not null default '',
  is_active boolean not null default true,
  position smallint not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  plan_id uuid references plans (id), -- a plan purchase…
  pack_id uuid references packs (id) on delete set null, -- …or a ready-made menu for its week
  week_id uuid references weeks (id) on delete set null, -- …or a custom menu for a week
  amount integer not null check (amount > 0),
  method text not null default 'upi' check (method in ('upi', 'cash')),
  utr text not null default '',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  admin_note text not null default '',
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check (plan_id is not null or week_id is not null)
);
-- The same UPI reference can't be submitted twice.
create unique index if not exists payments_utr_unique on payments (utr) where utr <> '';

create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  plan_id uuid references plans (id),
  pack_id uuid references packs (id) on delete set null,
  payment_id uuid references payments (id),
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  meals text[] not null check (meals <@ array['breakfast', 'lunch', 'snacks', 'dinner'] and cardinality(meals) > 0),
  status text not null default 'active' check (status in ('active', 'cancelled')),
  created_at timestamptz not null default now()
);
create index if not exists subscriptions_user on subscriptions (user_id);

create table if not exists pauses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  subscription_id uuid not null references subscriptions (id) on delete cascade,
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  reason text not null default '',
  status text not null default 'requested' check (status in ('requested', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

create table if not exists attendance (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  date date not null,
  meal text not null check (meal in ('breakfast', 'lunch', 'snacks', 'dinner')),
  created_at timestamptz not null default now(),
  unique (user_id, date, meal)
);
create index if not exists attendance_date on attendance (date);

create table if not exists feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  date date not null,
  meal text not null check (meal in ('breakfast', 'lunch', 'snacks', 'dinner')),
  kind text not null check (kind in ('rating', 'complaint', 'suggestion')),
  rating smallint check (rating between 1 and 5),
  comment text not null default '',
  status text not null default 'open' check (status in ('open', 'resolved')),
  admin_reply text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists wastage (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  meal text not null check (meal in ('breakfast', 'lunch', 'snacks', 'dinner')),
  cooked_kg numeric(7, 2) not null check (cooked_kg > 0),
  wasted_kg numeric(7, 2) not null check (wasted_kg >= 0),
  notes text not null default '',
  created_at timestamptz not null default now(),
  unique (date, meal)
);

create table if not exists settings (
  id integer primary key default 1 check (id = 1),
  upi_id text not null default '',
  upi_name text not null default 'Radixo',
  whatsapp text not null default '',
  address text not null default '',
  breakfast_time text not null default '7:30 – 9:30 AM',
  lunch_time text not null default '12:00 – 3:00 PM',
  snacks_time text not null default '5:00 – 6:00 PM',
  dinner_time text not null default '7:30 – 10:30 PM',
  attendance_factor numeric(4, 2) not null default 0.8,
  buffer_pct integer not null default 10,
  min_pause_days integer not null default 4
);

-- ---------- Roles ----------

create or replace function is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin')
$$;

create or replace function is_staff() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role in ('staff', 'admin'))
$$;

-- New sign-ups get a profile from the metadata the app sends.
create or replace function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, full_name, phone, college, year, stay_type, area)
  values (
    new.id, coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'phone', right(coalesce(new.phone, ''), 10), ''),
    coalesce(new.raw_user_meta_data ->> 'college', ''), coalesce(new.raw_user_meta_data ->> 'year', ''),
    coalesce(new.raw_user_meta_data ->> 'stay_type', ''), coalesce(new.raw_user_meta_data ->> 'area', '')
  );
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

-- Students may edit their profile, but never their role, code or email.
create or replace function guard_profile() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not is_admin() then
    new.role := old.role;
    new.member_code := old.member_code;
    new.email := old.email;
  end if;
  return new;
end $$;

drop trigger if exists profiles_guard on profiles;
create trigger profiles_guard before update on profiles for each row execute function guard_profile();

-- ---------- Row level security ----------

alter table profiles enable row level security;
alter table dishes enable row level security;
alter table weeks enable row level security;
alter table menu_items enable row level security;
alter table packs enable row level security;
alter table selections enable row level security;
alter table plans enable row level security;
alter table payments enable row level security;
alter table subscriptions enable row level security;
alter table pauses enable row level security;
alter table attendance enable row level security;
alter table feedback enable row level security;
alter table wastage enable row level security;
alter table settings enable row level security;

-- Profiles: you see yourself; staff see everyone (check-in needs names).
create policy profiles_read on profiles for select using (id = auth.uid() or is_staff());
create policy profiles_update on profiles for update using (id = auth.uid() or is_admin());

-- Menu data: public, so anyone can browse before logging in (draft weeks only for staff); written by admins.
create policy dishes_read on dishes for select using (true);
create policy dishes_write on dishes for all using (is_admin()) with check (is_admin());
create policy weeks_read on weeks for select using (status = 'published' or is_staff());
create policy weeks_write on weeks for all using (is_admin()) with check (is_admin());
create policy menu_read on menu_items for select using (exists (select 1 from weeks w where w.id = week_id and (w.status = 'published' or is_staff())));
create policy menu_write on menu_items for all using (is_admin()) with check (is_admin());
create policy packs_read on packs for select using (exists (select 1 from weeks w where w.id = week_id and (w.status = 'published' or is_staff())));
create policy packs_write on packs for all using (is_admin()) with check (is_admin());

-- Plans and settings are public (the home page shows prices and timings).
create policy plans_read on plans for select using (true);
create policy plans_write on plans for all using (is_admin()) with check (is_admin());
create policy settings_read on settings for select using (true);
create policy settings_write on settings for all using (is_admin()) with check (is_admin());

-- Selections: your own, only for a published week whose deadline hasn't passed.
create policy selections_read on selections for select using (user_id = auth.uid() or is_staff());
-- (Admins also write them: approving a ready-made menu booking sets it as the student's menu.)
create policy selections_insert on selections for insert with check (
  (user_id = auth.uid() and exists (select 1 from weeks w where w.id = week_id and w.status = 'published' and w.choice_deadline > now())) or is_admin()
);
create policy selections_update on selections for update using (user_id = auth.uid() or is_admin()) with check (
  (user_id = auth.uid() and exists (select 1 from weeks w where w.id = week_id and w.status = 'published' and w.choice_deadline > now())) or is_admin()
);

-- Payments: students submit pending UPI payments; admins approve.
create policy payments_read on payments for select using (user_id = auth.uid() or is_admin());
create policy payments_insert on payments for insert with check (
  (user_id = auth.uid() and status = 'pending' and method = 'upi' and reviewed_at is null) or is_admin()
);
create policy payments_update on payments for update using (is_admin()) with check (is_admin());

-- Subscriptions are created only by admins (on approval).
create policy subs_read on subscriptions for select using (user_id = auth.uid() or is_staff());
create policy subs_write on subscriptions for all using (is_admin()) with check (is_admin());

-- Pauses: students request; admins decide.
create policy pauses_read on pauses for select using (user_id = auth.uid() or is_staff());
create policy pauses_insert on pauses for insert with check ((user_id = auth.uid() and status = 'requested') or is_admin());
create policy pauses_update on pauses for update using (is_admin()) with check (is_admin());

-- Attendance: staff check members in; students read their own.
create policy attendance_read on attendance for select using (user_id = auth.uid() or is_staff());
create policy attendance_insert on attendance for insert with check (is_staff());
create policy attendance_delete on attendance for delete using (is_admin());

-- Feedback: students write their own; admins reply.
create policy feedback_read on feedback for select using (user_id = auth.uid() or is_staff());
create policy feedback_insert on feedback for insert with check (user_id = auth.uid() and status = 'open' and admin_reply = '');
create policy feedback_update on feedback for update using (is_admin()) with check (is_admin());

-- Wastage: staff log it.
create policy wastage_read on wastage for select using (is_staff());
create policy wastage_write on wastage for all using (is_staff()) with check (is_staff());

-- ---------- Starter data ----------

insert into settings (id) values (1) on conflict (id) do nothing;

insert into plans (name, description, price, duration_days, meals, badge, position)
select * from (values
  ('Founding batch — Monthly', 'Lunch + dinner for 30 days. ₹300 off for the first 100 students.', 3300, 30, '{lunch,dinner}'::text[], 'First 100 only', 0),
  ('Monthly — Lunch + Dinner', '60 meals over 30 days. Unlimited roti, rice, dal and sabzi.', 3600, 30, '{lunch,dinner}'::text[], 'Best value', 1),
  ('Monthly — Dinner only', '30 dinners. For students who eat lunch on campus.', 2000, 30, '{dinner}'::text[], '', 2),
  ('Trial week', '14 meals over 7 days. Try before you commit.', 999, 7, '{lunch,dinner}'::text[], '', 3)
) as v (name, description, price, duration_days, meals, badge, position)
where not exists (select 1 from plans);

insert into dishes (name, category, description, price, image_url, is_premium) values
  ('Aloo paratha', 'breakfast', 'Two parathas with curd and pickle', 28, '', false),
  ('Poha', 'breakfast', 'Indori poha with sev', 20, '', false),
  ('Upma', 'breakfast', 'Rava upma with veggies', 20, '', false),
  ('Chai', 'drink', 'Masala chai', 8, '', false),
  ('Samosa', 'snack', 'Two samosas with chutney', 15, '', false),
  ('Vada pav', 'snack', 'With green chutney', 18, '', false),
  ('Bread pakora', 'snack', 'Stuffed, with ketchup', 15, '', false),
  ('Dal tadka', 'dal', 'Yellow dal with jeera-garlic tadka', 18, '/dishes/dal.jpg', false),
  ('Rajma', 'dal', 'Slow-cooked kidney beans, Punjabi style', 22, '/dishes/rajma.jpg', false),
  ('Chole', 'dal', 'Spiced chickpeas', 22, '', false),
  ('Kadhi pakora', 'dal', 'Curd kadhi with besan pakoras', 20, '', false),
  ('Dal makhani', 'dal', 'Black dal with butter and cream', 25, '', false),
  ('Moong dal', 'dal', 'Light yellow moong dal', 16, '/dishes/dal.jpg', false),
  ('Arhar dal', 'dal', 'Toor dal, home style', 16, '/dishes/dal.jpg', false),
  ('Aloo gobhi', 'sabzi', 'Dry potato and cauliflower', 18, '', false),
  ('Bhindi masala', 'sabzi', 'Okra with onion masala', 20, '', false),
  ('Mix veg', 'sabzi', 'Seasonal vegetables', 18, '', false),
  ('Aloo matar', 'sabzi', 'Potato and peas curry', 16, '', false),
  ('Soya aloo', 'sabzi', 'Soya chunks with potato', 20, '', false),
  ('Palak aloo', 'sabzi', 'Spinach with potato', 16, '', false),
  ('Paneer butter masala', 'special', 'Paneer in tomato-butter gravy', 40, '/dishes/paneer.jpg', true),
  ('Kadhai paneer', 'special', 'Paneer with capsicum, kadhai masala', 40, '/dishes/paneer.jpg', true),
  ('Egg curry', 'special', 'Two eggs in onion-tomato gravy', 30, '/dishes/egg-curry.jpg', true),
  ('Tawa roti', 'bread', 'Fresh tawa rotis, 4 pieces', 10, '', false),
  ('Puri', 'bread', 'Fried puris, 4 pieces', 15, '', false),
  ('Jeera rice', 'rice', 'Basmati with cumin', 12, '/dishes/rice.jpg', false),
  ('Plain rice', 'rice', 'Steamed rice', 10, '/dishes/rice.jpg', false),
  ('Salad & achar', 'side', 'Onion, cucumber, tomato, pickle', 5, '', false),
  ('Raita', 'side', 'Boondi raita', 8, '', false),
  ('Gulab jamun', 'sweet', 'One piece', 12, '', true),
  ('Kheer', 'sweet', 'Rice kheer', 15, '', true)
on conflict (name) do nothing;

-- ---------- Make yourself admin (run after signing up in the app) ----------
-- update profiles set role = 'admin' where email = 'you@example.com';
