-- Bookings for 1 week / 1 / 3 / 6 months, wallet, and "not coming" credits.
-- Safe to run more than once. Money is computed here, never trusted from the browser.

-- ---------- Columns ----------

alter table subscriptions alter column plan_id drop not null;
alter table subscriptions add column if not exists source text not null default 'plan';
alter table subscriptions add column if not exists pack_name text not null default '';
alter table subscriptions add column if not exists template jsonb not null default '{}';
alter table subscriptions add column if not exists weeks integer not null default 1;
alter table subscriptions add column if not exists weekly_price integer not null default 0;
alter table subscriptions add column if not exists discount_pct integer not null default 0;
alter table subscriptions drop constraint if exists subscriptions_source_check;
alter table subscriptions add constraint subscriptions_source_check check (source in ('pack', 'custom', 'plan'));

alter table payments add column if not exists wallet_used integer not null default 0;
alter table payments add column if not exists details jsonb;
alter table payments drop constraint if exists payments_amount_check;
alter table payments add constraint payments_amount_check check (amount >= 0);
alter table payments drop constraint if exists payments_method_check;
alter table payments add constraint payments_method_check check (method in ('upi', 'cash', 'wallet'));

alter table pauses add column if not exists credit integer not null default 0;
alter table pauses drop constraint if exists pauses_status_check;
alter table pauses add constraint pauses_status_check check (status in ('requested', 'approved', 'rejected', 'cancelled'));

alter table settings add column if not exists discount_1m integer not null default 5;
alter table settings add column if not exists discount_3m integer not null default 8;
alter table settings add column if not exists discount_6m integer not null default 12;
alter table settings add column if not exists skip_notice_hours integer not null default 24;

create table if not exists wallet_txns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  amount integer not null,
  kind text not null check (kind in ('skip', 'skip_cancelled', 'payment', 'refund', 'admin')),
  note text not null default '',
  ref_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists wallet_txns_user on wallet_txns (user_id);

alter table wallet_txns enable row level security;
drop policy if exists wallet_read on wallet_txns;
create policy wallet_read on wallet_txns for select using (user_id = auth.uid() or is_admin());
drop policy if exists wallet_admin on wallet_txns;
create policy wallet_admin on wallet_txns for insert with check (is_admin());

-- Students now book and mark "not coming" only through the functions below.
drop policy if exists payments_insert on payments;
create policy payments_insert on payments for insert with check (is_admin());
drop policy if exists pauses_insert on pauses;
create policy pauses_insert on pauses for insert with check (is_admin());

-- ---------- Pricing ----------

create or replace function radixo_custom_value(p_custom jsonb) returns integer language sql stable set search_path = public as $$
  select coalesce(sum(d.price), 0)::int
  from jsonb_each(coalesce(p_custom, '{}')) e
  cross join lateral jsonb_array_elements_text(e.value) x(id)
  join dishes d on d.id::text = x.id
$$;

/** Everything a booking costs and covers, for one member. Raises if it can't be booked. */
create or replace function radixo_quote(p_uid uuid, p_spec jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  k text := p_spec ->> 'kind';
  v_weeks int := least(26, greatest(1, coalesce((p_spec ->> 'weeks')::int, 1)));
  s settings;
  w weeks;
  pk packs;
  sel selections;
  v_weekly int;
  v_disc int := 0;
  v_meals text[];
  v_template jsonb := '{}';
  v_src text;
  v_name text := '';
  v_pack uuid;
  v_last date;
  v_start date;
  v_value int;
  v_credit int;
begin
  select * into s from settings where id = 1;
  if k = 'pack' then
    select * into pk from packs where id = (p_spec ->> 'pack_id')::uuid;
    if not found or pk.price <= 0 then raise exception 'This menu can’t be booked'; end if;
    select * into w from weeks where id = pk.week_id and status = 'published';
    v_weekly := pk.price; v_meals := pk.meals; v_src := 'pack'; v_name := pk.name; v_pack := pk.id;
  elsif k in ('custom', 'extra') then
    select * into w from weeks where id = (p_spec ->> 'week_id')::uuid and status = 'published';
    select * into sel from selections where user_id = p_uid and week_id = w.id;
    if not found then raise exception 'Save your menu first'; end if;
    if k = 'extra' then
      v_value := case when sel.mode = 'pack' then (select price from packs where id = sel.pack_id) else radixo_custom_value(sel.custom) end;
      select coalesce(sum(weekly_price), 0) into v_credit from subscriptions
        where user_id = p_uid and status = 'active' and start_date <= w.week_start and end_date >= w.week_start;
      return jsonb_build_object('kind', 'extra', 'week_id', w.id, 'total', greatest(0, coalesce(v_value, 0) - v_credit),
        'label', 'Extra for week of ' || to_char(w.week_start, 'DD Mon'));
    end if;
    v_weekly := radixo_custom_value(sel.custom);
    if v_weekly <= 0 then raise exception 'Add some dishes first'; end if;
    v_template := sel.custom; v_src := 'custom'; v_name := 'My Menu';
    select array_agg(distinct split_part(key, '-', 2)) into v_meals from jsonb_each(sel.custom) where jsonb_array_length(value) > 0;
  else
    raise exception 'Unknown booking';
  end if;
  if w.id is null then raise exception 'That week isn’t open'; end if;

  v_disc := case when v_weeks >= 26 then s.discount_6m when v_weeks >= 13 then s.discount_3m when v_weeks >= 4 then s.discount_1m else 0 end;
  select max(end_date) into v_last from subscriptions where user_id = p_uid and status = 'active' and end_date >= w.week_start;
  v_start := case when v_last is null then w.week_start else (v_last + 7) - (extract(isodow from v_last + 7)::int - 1) end;
  if v_start = w.week_start and w.choice_deadline <= now() then raise exception 'Choices for this week are closed. Book from next week.'; end if;

  return jsonb_build_object(
    'kind', k, 'week_id', w.id, 'source', v_src, 'pack_id', v_pack, 'pack_name', v_name, 'template', v_template, 'meals', to_jsonb(v_meals),
    'weeks', v_weeks, 'weekly_price', v_weekly, 'discount_pct', v_disc,
    'start_date', v_start, 'end_date', v_start + v_weeks * 7 - 1,
    'total', round(v_weekly * v_weeks * (100 - v_disc) / 100.0)::int,
    'label', v_name || ' · ' || case v_weeks when 1 then '1 week' when 4 then '1 month' when 13 then '3 months' when 26 then '6 months' else v_weeks || ' weeks' end);
end $$;

create or replace function radixo_wallet_balance(p_uid uuid) returns integer language sql stable security definer set search_path = public as $$
  select coalesce(sum(amount), 0)::int from wallet_txns where user_id = p_uid
$$;

create or replace function radixo_create_booking(p_uid uuid, q jsonb, p_payment uuid) returns subscriptions
language plpgsql security definer set search_path = public as $$
declare r subscriptions;
begin
  insert into subscriptions (user_id, plan_id, pack_id, payment_id, start_date, end_date, meals, status, source, pack_name, template, weeks, weekly_price, discount_pct)
  values (p_uid, null, nullif(q ->> 'pack_id', '')::uuid, p_payment, (q ->> 'start_date')::date, (q ->> 'end_date')::date,
    array(select jsonb_array_elements_text(q -> 'meals')), 'active', q ->> 'source', coalesce(q ->> 'pack_name', ''), coalesce(q -> 'template', '{}'),
    (q ->> 'weeks')::int, (q ->> 'weekly_price')::int, (q ->> 'discount_pct')::int)
  returning * into r;
  -- Booking a ready-made menu also sets it as the member's menu for its first week.
  if q ->> 'source' = 'pack' then
    insert into selections (user_id, week_id, mode, pack_id, picks, custom)
    select p_uid, pk.week_id, 'pack', pk.id, pk.picks, '{}' from packs pk where pk.id = (q ->> 'pack_id')::uuid
    on conflict (user_id, week_id) do update set mode = 'pack', pack_id = excluded.pack_id, picks = excluded.picks, custom = '{}', updated_at = now();
  end if;
  return r;
end $$;

/** Book (or pay an extra): wallet first, the rest by UPI. Fully covered by the wallet → confirmed at once. */
create or replace function book(p_spec jsonb, p_utr text default '') returns payments
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  q jsonb;
  v_total int;
  v_used int;
  v_due int;
  pay payments;
begin
  if uid is null then raise exception 'Log in first'; end if;
  perform pg_advisory_xact_lock(hashtext('radixo-wallet:' || uid)); -- one wallet change at a time per member
  q := radixo_quote(uid, p_spec);
  v_total := (q ->> 'total')::int;
  if v_total <= 0 then raise exception 'Nothing to pay'; end if;
  v_used := least(greatest(radixo_wallet_balance(uid), 0), v_total);
  v_due := v_total - v_used;
  if v_due > 0 and coalesce(trim(p_utr), '') !~ '^\d{12}$' then raise exception 'Enter the 12-digit UPI reference'; end if;

  insert into payments (user_id, plan_id, pack_id, week_id, amount, wallet_used, method, utr, status, admin_note, details, reviewed_at)
  values (uid, null, nullif(q ->> 'pack_id', '')::uuid, (q ->> 'week_id')::uuid, v_due, v_used,
    case when v_due = 0 then 'wallet' else 'upi' end, case when v_due = 0 then '' else trim(p_utr) end,
    case when v_due = 0 then 'approved' else 'pending' end, case when v_due = 0 then 'Paid from wallet' else '' end, q,
    case when v_due = 0 then now() end)
  returning * into pay;

  if v_used > 0 then insert into wallet_txns (user_id, amount, kind, note, ref_id) values (uid, -v_used, 'payment', q ->> 'label', pay.id); end if;
  if v_due = 0 and q ->> 'kind' <> 'extra' then perform radixo_create_booking(uid, q, pay.id); end if;
  return pay;
end $$;

/** Admin approves a UPI/cash payment: create the booking it paid for. */
create or replace function approve_payment(p_id uuid, p_note text default '') returns payments
language plpgsql security definer set search_path = public as $$
declare pay payments;
begin
  if not is_admin() then raise exception 'Only the owner can approve payments'; end if;
  select * into pay from payments where id = p_id and status = 'pending' for update;
  if not found then raise exception 'Payment not found or already reviewed'; end if;
  if pay.details is not null and pay.details ->> 'kind' in ('pack', 'custom') then perform radixo_create_booking(pay.user_id, pay.details, pay.id); end if;
  update payments set status = 'approved', admin_note = coalesce(p_note, ''), reviewed_at = now() where id = p_id returning * into pay;
  return pay;
end $$;

/** Admin rejects a payment: wallet money used for it goes back. */
create or replace function reject_payment(p_id uuid, p_note text default '') returns payments
language plpgsql security definer set search_path = public as $$
declare pay payments;
begin
  if not is_admin() then raise exception 'Only the owner can reject payments'; end if;
  select * into pay from payments where id = p_id and status = 'pending' for update;
  if not found then raise exception 'Payment not found or already reviewed'; end if;
  if pay.wallet_used > 0 then insert into wallet_txns (user_id, amount, kind, note, ref_id) values (pay.user_id, pay.wallet_used, 'refund', 'Payment rejected', pay.id); end if;
  update payments set status = 'rejected', admin_note = coalesce(nullif(p_note, ''), 'Payment not found'), reviewed_at = now() where id = p_id returning * into pay;
  return pay;
end $$;

-- ---------- Not coming ----------

create or replace function radixo_day_value(b subscriptions, d date) returns numeric language plpgsql stable set search_path = public as $$
declare v_net numeric := b.weekly_price * (100 - b.discount_pct) / 100.0; v_wd int := extract(isodow from d)::int - 1; v_day int; v_week int;
begin
  if b.source <> 'custom' then return v_net / 7; end if;
  v_week := radixo_custom_value(b.template);
  if v_week = 0 then return 0; end if;
  select coalesce(sum(dd.price), 0) into v_day
  from jsonb_each(b.template) e cross join lateral jsonb_array_elements_text(e.value) x(id) join dishes dd on dd.id::text = x.id
  where split_part(e.key, '-', 1) = v_wd::text;
  return v_net * v_day / v_week;
end $$;

/** Mark "not coming" from p_start to p_end (inclusive). The value of those days goes to the wallet. */
create or replace function mark_skip(p_start date, p_end date, p_reason text default '') returns pauses
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  s settings;
  d date;
  b subscriptions;
  v_first uuid;
  v_credit numeric := 0;
  r pauses;
begin
  if uid is null then raise exception 'Log in first'; end if;
  perform pg_advisory_xact_lock(hashtext('radixo-wallet:' || uid));
  select * into s from settings where id = 1;
  if p_end < p_start then raise exception 'The end date is before the start date'; end if;
  if p_end - p_start > 60 then raise exception 'Mark at most 60 days at a time'; end if;
  if (p_start::timestamp at time zone 'Asia/Kolkata') - now() < make_interval(hours => s.skip_notice_hours) then
    raise exception 'Mark it at least % hours before the day starts', s.skip_notice_hours;
  end if;
  d := p_start;
  while d <= p_end loop
    if not exists (select 1 from pauses where user_id = uid and status = 'approved' and start_date <= d and end_date >= d) then
      select * into b from subscriptions where user_id = uid and status = 'active' and source <> 'plan' and start_date <= d and end_date >= d order by created_at desc limit 1;
      if found then
        v_credit := v_credit + radixo_day_value(b, d);
        v_first := coalesce(v_first, b.id);
      end if;
    end if;
    d := d + 1;
  end loop;
  if v_first is null or round(v_credit) <= 0 then raise exception 'You have no booked meals on those days'; end if;
  insert into pauses (user_id, subscription_id, start_date, end_date, reason, status, credit)
  values (uid, v_first, p_start, p_end, coalesce(p_reason, ''), 'approved', round(v_credit)::int) returning * into r;
  insert into wallet_txns (user_id, amount, kind, note, ref_id)
  values (uid, r.credit, 'skip', 'Not coming ' || to_char(p_start, 'DD Mon') || case when p_end > p_start then ' – ' || to_char(p_end, 'DD Mon') else '' end, r.id);
  return r;
end $$;

/** Undo a "not coming" that hasn't started yet (same notice applies): its credit is taken back. */
create or replace function cancel_skip(p_id uuid) returns pauses
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); s settings; r pauses;
begin
  if uid is null then raise exception 'Log in first'; end if;
  perform pg_advisory_xact_lock(hashtext('radixo-wallet:' || uid));
  select * into s from settings where id = 1;
  select * into r from pauses where id = p_id and user_id = uid and status = 'approved' for update;
  if not found then raise exception 'Not found'; end if;
  if (r.start_date::timestamp at time zone 'Asia/Kolkata') - now() < make_interval(hours => s.skip_notice_hours) then
    raise exception 'It’s too late to undo this one';
  end if;
  update pauses set status = 'cancelled' where id = p_id returning * into r;
  insert into wallet_txns (user_id, amount, kind, note, ref_id) values (uid, -r.credit, 'skip_cancelled', 'Coming after all', r.id);
  return r;
end $$;

revoke all on function radixo_quote(uuid, jsonb), radixo_create_booking(uuid, jsonb, uuid), radixo_wallet_balance(uuid) from public, anon, authenticated;
revoke all on function book(jsonb, text), mark_skip(date, date, text), cancel_skip(uuid), approve_payment(uuid, text), reject_payment(uuid, text) from public, anon;
grant execute on function book(jsonb, text), mark_skip(date, date, text), cancel_skip(uuid), approve_payment(uuid, text), reject_payment(uuid, text) to authenticated;
