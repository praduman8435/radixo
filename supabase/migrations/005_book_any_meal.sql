-- Book from the next meal 24 h+ away, any day of the week; bookings run exactly 7 days of meals per week.
-- Meals lock 24 hours before for booking and changes. The weekly "choices close" deadline is no longer used.
-- Safe to run more than once.

alter table subscriptions add column if not exists start_meal text not null default 'breakfast';
alter table subscriptions drop constraint if exists subscriptions_start_meal_check;
alter table subscriptions add constraint subscriptions_start_meal_check check (start_meal in ('breakfast', 'lunch', 'snacks', 'dinner'));

create or replace function radixo_meal_idx(p_meal text) returns int language sql immutable as $$
  select case p_meal when 'breakfast' then 0 when 'lunch' then 1 when 'snacks' then 2 else 3 end
$$;

/** Is this meal slot inside a booking's time span? Covers (start_date, start_meal) up to, not including, the same meal 7 × weeks days later. */
create or replace function radixo_spans(b subscriptions, d date, m text) returns boolean language sql stable as $$
  select b.status = 'active'
    and (d, radixo_meal_idx(m)) >= (b.start_date, radixo_meal_idx(b.start_meal))
    and (d, radixo_meal_idx(m)) < (case when b.start_meal = 'breakfast' then b.end_date + 1 else b.end_date end, radixo_meal_idx(b.start_meal))
$$;

/** The first meal that can still be booked or changed: at least 24 hours away. */
create or replace function radixo_first_slot(out o_date date, out o_meal text) language plpgsql stable set search_path = public as $$
declare d date := (now() at time zone 'Asia/Kolkata')::date; i int; m text;
begin
  for i in 0..3 loop
    foreach m in array array['breakfast', 'lunch', 'snacks', 'dinner'] loop
      if radixo_meal_start(d + i, m) >= now() + interval '24 hours' then o_date := d + i; o_meal := m; return; end if;
    end loop;
  end loop;
  o_date := d + 2; o_meal := 'breakfast';
end $$;

/** Menu value (before discount) of one meal of a booking on a weekday (0 = Monday). */
create or replace function radixo_slot_gross(b subscriptions, p_wd int, p_meal text) returns numeric language sql stable set search_path = public as $$
  select case
    when not (p_meal = any (b.meals)) then 0
    when b.source <> 'custom' then b.weekly_price::numeric / (7 * greatest(1, cardinality(b.meals)))
    else coalesce((select sum(d.price) from jsonb_array_elements_text(coalesce(b.template -> (p_wd || '-' || p_meal), '[]')) x join dishes d on d.id::text = x), 0)
  end
$$;

/** Value of one day of a booking, after discount: only the meals it covers that day. */
create or replace function radixo_day_value(b subscriptions, d date) returns numeric language sql stable set search_path = public as $$
  select coalesce(sum(radixo_slot_gross(b, extract(isodow from d)::int - 1, m)), 0) * (100 - b.discount_pct) / 100.0
  from unnest(array['breakfast', 'lunch', 'snacks', 'dinner']) m where radixo_spans(b, d, m)
$$;

/** "day-meal" keys of a week inside any of the member's bookings. */
create or replace function radixo_covered_keys(p_uid uuid, p_week uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(distinct (dd || '-' || m)), '[]')
  from weeks w, generate_series(0, 6) dd, unnest(array['breakfast', 'lunch', 'snacks', 'dinner']) m, subscriptions s
  where w.id = p_week and s.user_id = p_uid and s.start_date <= w.week_start + 6 and s.end_date >= w.week_start and radixo_spans(s, w.week_start + dd, m)
$$;

/** Price of the dishes in some slots, counting only the given keys. */
create or replace function radixo_slots_value(p_slots jsonb, p_keys jsonb) returns int language sql stable set search_path = public as $$
  select coalesce(sum(d.price), 0)::int from jsonb_each(coalesce(p_slots, '{}')) e, jsonb_array_elements_text(e.value) x join dishes d on d.id::text = x
  where p_keys ? e.key
$$;

/** Already paid for a week: the booked meals that fall in it (menu price) plus approved extras and menu changes. */
create or replace function radixo_week_paid(p_uid uuid, p_week uuid) returns integer language sql stable security definer set search_path = public as $$
  select round((
    select coalesce(sum(radixo_slot_gross(s, dd, m)), 0)
    from weeks w, subscriptions s, generate_series(0, 6) dd, unnest(array['breakfast', 'lunch', 'snacks', 'dinner']) m
    where w.id = p_week and s.user_id = p_uid and s.start_date <= w.week_start + 6 and s.end_date >= w.week_start and radixo_spans(s, w.week_start + dd, m)
  ) + (
    select coalesce(sum(amount + wallet_used), 0) from payments
    where user_id = p_uid and status = 'approved' and week_id = p_week and details ->> 'kind' in ('extra', 'change')
  ))::int
$$;

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
  v_start date;
  v_meal text;
  b subscriptions;
  e_date date;
  e_meal text;
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
  -- Start: the first meal 24 h+ away, after any current booking, or a later chosen day (from breakfast).
  select o_date, o_meal into v_start, v_meal from radixo_first_slot();
  for b in select * from subscriptions where user_id = p_uid and status = 'active' loop
    e_date := case when b.start_meal = 'breakfast' then b.end_date + 1 else b.end_date end;
    e_meal := b.start_meal;
    if (e_date, radixo_meal_idx(e_meal)) > (v_start, radixo_meal_idx(v_meal)) then v_start := e_date; v_meal := e_meal; end if;
  end loop;
  if nullif(p_spec ->> 'start_date', '') is not null and (p_spec ->> 'start_date')::date > v_start then
    if (p_spec ->> 'start_date')::date > v_start + 30 then raise exception 'Pick a start within the next month'; end if;
    v_start := (p_spec ->> 'start_date')::date; v_meal := 'breakfast';
  end if;

  return jsonb_build_object(
    'kind', k, 'week_id', w.id, 'source', v_src, 'pack_id', v_pack, 'pack_name', v_name, 'template', v_template, 'meals', to_jsonb(v_meals),
    'weeks', v_weeks, 'weekly_price', v_weekly, 'discount_pct', v_disc,
    'start_date', v_start, 'start_meal', v_meal,
    'end_date', case when v_meal = 'breakfast' then v_start + v_weeks * 7 - 1 else v_start + v_weeks * 7 end,
    'total', round(v_weekly * v_weeks * (100 - v_disc) / 100.0)::int,
    'label', v_name || ' · ' || case v_weeks when 1 then '1 week' when 4 then '1 month' when 13 then '3 months' when 26 then '6 months' else v_weeks || ' weeks' end);
end $$;

create or replace function radixo_create_booking(p_uid uuid, q jsonb, p_payment uuid) returns subscriptions
language plpgsql security definer set search_path = public as $$
declare r subscriptions;
begin
  insert into subscriptions (user_id, plan_id, pack_id, payment_id, start_date, start_meal, end_date, meals, status, source, pack_name, template, weeks, weekly_price, discount_pct)
  values (p_uid, null, nullif(q ->> 'pack_id', '')::uuid, p_payment, (q ->> 'start_date')::date, coalesce(q ->> 'start_meal', 'breakfast'), (q ->> 'end_date')::date,
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
      -- A day can be split between two bookings (one ends at lunch, the next starts): count each one's meals.
      for b in select * from subscriptions where user_id = uid and status = 'active' and source <> 'plan' and start_date <= d and end_date >= d loop
        if radixo_day_value(b, d) > 0 then
          v_credit := v_credit + radixo_day_value(b, d);
          v_first := coalesce(v_first, b.id);
        end if;
      end loop;
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

create or replace function change_menu(p_week uuid, p_sel jsonb, p_utr text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  w weeks;
  old_slots jsonb;
  new_slots jsonb;
  k text;
  v_value int;
  v_paid int;
  v_extra int;
  v_used int;
  v_due int;
  pay payments;
  v_label text;
  v_cov jsonb;
begin
  if uid is null then raise exception 'Log in first'; end if;
  perform pg_advisory_xact_lock(hashtext('radixo-wallet:' || uid));
  select * into w from weeks where id = p_week and status = 'published';
  if not found then raise exception 'That week isn’t open'; end if;
  if not exists (select 1 from subscriptions where user_id = uid and status = 'active' and start_date <= w.week_start + 6 and end_date >= w.week_start) then
    raise exception 'Book a menu for this week first';
  end if;
  if coalesce(p_sel ->> 'mode', 'custom') not in ('custom', 'pack') then raise exception 'Unknown menu'; end if;

  old_slots := radixo_effective_slots(uid, p_week);
  new_slots := radixo_sel_slots(p_week, coalesce(p_sel ->> 'mode', 'custom'), nullif(p_sel ->> 'pack_id', '')::uuid, coalesce(p_sel -> 'picks', '{}'), coalesce(p_sel -> 'custom', '{}'));
  if new_slots = '{}' then raise exception 'Add some dishes first'; end if;

  -- Every dish must be on that day's menu for that meal.
  if exists (
    select 1 from jsonb_each(new_slots) e, jsonb_array_elements_text(e.value) x
    where not exists (select 1 from menu_items mi where mi.week_id = p_week and mi.day = split_part(e.key, '-', 1)::int
      and mi.meal = split_part(e.key, '-', 2) and x::uuid = any (mi.dish_ids))
  ) then raise exception 'Some dishes aren’t on that day’s menu'; end if;

  -- 24-hour lock: meals starting soon must stay as they are.
  for k in select key from jsonb_each(old_slots) union select key from jsonb_each(new_slots) loop
    if (select coalesce(jsonb_agg(x order by x), '[]') from jsonb_array_elements_text(coalesce(old_slots -> k, '[]')) x)
       is distinct from (select coalesce(jsonb_agg(x order by x), '[]') from jsonb_array_elements_text(coalesce(new_slots -> k, '[]')) x)
       and radixo_meal_start(w.week_start + split_part(k, '-', 1)::int, split_part(k, '-', 2)) < now() + interval '24 hours' then
      raise exception 'Meals starting within 24 hours can’t be changed (% on %)', initcap(split_part(k, '-', 2)), to_char(w.week_start + split_part(k, '-', 1)::int, 'Dy DD Mon');
    end if;
  end loop;

  if p_sel ->> 'mode' = 'pack' and not exists (select 1 from packs where id = (p_sel ->> 'pack_id')::uuid and week_id = p_week) then
    raise exception 'That menu isn’t available';
  end if;
  -- Only meals inside the booking count: the new menu's value there, against what's paid or the current menu's value.
  v_cov := radixo_covered_keys(uid, p_week);
  v_value := radixo_slots_value(new_slots, v_cov);
  v_paid := greatest(radixo_week_paid(uid, p_week), radixo_slots_value(old_slots, v_cov));
  v_extra := greatest(0, v_value - v_paid);

  -- One paid change at a time: the last one's UPI payment is still being checked.
  if exists (select 1 from payments where user_id = uid and week_id = p_week and status = 'pending' and details ->> 'kind' = 'change') then
    raise exception 'Your last menu change is waiting for its payment check. You can change again once it’s confirmed.';
  end if;

  if v_extra = 0 then
    perform radixo_apply_selection(uid, p_week, p_sel);
    return jsonb_build_object('applied', true, 'extra', 0);
  end if;

  v_used := least(greatest(radixo_wallet_balance(uid), 0), v_extra);
  v_due := v_extra - v_used;
  if v_due > 0 and coalesce(trim(p_utr), '') !~ '^\d{12}$' then raise exception 'Enter the 12-digit UPI reference'; end if;
  v_label := 'Menu change · week of ' || to_char(w.week_start, 'DD Mon');

  insert into payments (user_id, plan_id, pack_id, week_id, amount, wallet_used, method, utr, status, admin_note, details, reviewed_at)
  values (uid, null, null, p_week, v_due, v_used, case when v_due = 0 then 'wallet' else 'upi' end, case when v_due = 0 then '' else trim(p_utr) end,
    case when v_due = 0 then 'approved' else 'pending' end, case when v_due = 0 then 'Paid from wallet' else '' end,
    jsonb_build_object('kind', 'change', 'week_id', p_week, 'sel', p_sel, 'total', v_extra, 'label', v_label), case when v_due = 0 then now() end)
  returning * into pay;
  if v_used > 0 then insert into wallet_txns (user_id, amount, kind, note, ref_id) values (uid, -v_used, 'payment', v_label, pay.id); end if;
  if v_due = 0 then perform radixo_apply_selection(uid, p_week, p_sel); end if;
  return jsonb_build_object('applied', v_due = 0, 'extra', v_extra, 'payment', to_jsonb(pay));
end $$;

-- Students save their own menu only for weeks they haven't booked yet (booked weeks change through change_menu).
drop policy if exists selections_insert on selections;
create policy selections_insert on selections for insert with check (
  (user_id = auth.uid() and exists (select 1 from weeks w where w.id = week_id and w.status = 'published')
    and not exists (select 1 from subscriptions s, weeks w where w.id = week_id and s.user_id = auth.uid() and s.status = 'active' and s.start_date <= w.week_start + 6 and s.end_date >= w.week_start))
  or is_admin()
);
drop policy if exists selections_update on selections;
create policy selections_update on selections for update using (user_id = auth.uid() or is_admin()) with check (
  (user_id = auth.uid() and exists (select 1 from weeks w where w.id = week_id and w.status = 'published')
    and not exists (select 1 from subscriptions s, weeks w where w.id = week_id and s.user_id = auth.uid() and s.status = 'active' and s.start_date <= w.week_start + 6 and s.end_date >= w.week_start))
  or is_admin()
);

revoke all on function radixo_quote(uuid, jsonb), radixo_create_booking(uuid, jsonb, uuid), radixo_covered_keys(uuid, uuid), radixo_week_paid(uuid, uuid) from public, anon, authenticated;
