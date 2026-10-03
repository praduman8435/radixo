-- Change a booked menu any time, except meals starting within 48 hours. A costlier change is paid first
-- (wallet, then UPI) and applies once paid. Plus: tiffin instead of eating at the mess, same price.
-- Safe to run more than once.

-- ---------- Tiffin ----------

alter table profiles add column if not exists meal_mode text not null default 'dine';
alter table profiles add column if not exists address text not null default '';
alter table profiles drop constraint if exists profiles_meal_mode_check;
alter table profiles add constraint profiles_meal_mode_check check (meal_mode in ('dine', 'tiffin'));

-- ---------- Meal times and the 48-hour lock ----------

/** When a meal starts, from timings like "12:00 – 3:00 PM" (India time). */
create or replace function radixo_meal_start(p_day date, p_meal text) returns timestamptz
language plpgsql stable set search_path = public as $$
declare
  t text;
  a text;
  b text;
  h int;
  m int;
  pm boolean;
begin
  select case p_meal when 'breakfast' then breakfast_time when 'lunch' then lunch_time when 'snacks' then snacks_time else dinner_time end
    into t from settings where id = 1;
  a := split_part(regexp_replace(coalesce(t, ''), '[–—]', '-', 'g'), '-', 1);
  b := split_part(regexp_replace(coalesce(t, ''), '[–—]', '-', 'g'), '-', 2);
  if a !~ '\d{1,2}:\d{2}' then
    return (p_day + case p_meal when 'breakfast' then time '07:30' when 'lunch' then time '12:00' when 'snacks' then time '17:00' else time '19:30' end) at time zone 'Asia/Kolkata';
  end if;
  h := (regexp_match(a, '(\d{1,2}):(\d{2})'))[1]::int;
  m := (regexp_match(a, '(\d{1,2}):(\d{2})'))[2]::int;
  pm := a ~* 'pm' or (a !~* 'am' and b ~* 'pm');
  return (p_day + make_time((h % 12) + case when pm then 12 else 0 end, m, 0)) at time zone 'Asia/Kolkata';
end $$;

-- ---------- A selection as plain slots: {"day-meal": [dish ids]} ----------

/** What a menu choice serves in a week, slot by slot. Pack: each line's pick (else default) for the pack's meals. */
create or replace function radixo_sel_slots(p_week uuid, p_mode text, p_pack uuid, p_picks jsonb, p_custom jsonb) returns jsonb
language plpgsql stable set search_path = public as $$
declare out jsonb := '{}';
begin
  if p_mode = 'pack' then
    select coalesce(jsonb_object_agg(k, ids), '{}') into out from (
      select mi.day || '-' || mi.meal as k,
        jsonb_agg(case when (p_picks ->> mi.id::text)::uuid = any (mi.dish_ids) then p_picks ->> mi.id::text else mi.default_dish_id::text end order by mi.position) as ids
      from menu_items mi join packs pk on pk.id = p_pack
      where mi.week_id = p_week and mi.meal = any (pk.meals)
      group by mi.day, mi.meal
    ) s;
  else
    select coalesce(jsonb_object_agg(e.key, e.value), '{}') into out from jsonb_each(coalesce(p_custom, '{}')) e where jsonb_array_length(e.value) > 0;
  end if;
  return out;
end $$;

/** The member's menu for a week as slots: their saved choice, else what their booking carries over. */
create or replace function radixo_effective_slots(p_uid uuid, p_week uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  w weeks;
  sel selections;
  b subscriptions;
  pk packs;
  out jsonb := '{}';
  e record;
  kept jsonb;
  offered uuid[];
begin
  select * into w from weeks where id = p_week;
  select * into sel from selections where user_id = p_uid and week_id = p_week;
  if found then return radixo_sel_slots(p_week, sel.mode, sel.pack_id, sel.picks, sel.custom); end if;
  select * into b from subscriptions where user_id = p_uid and status = 'active' and source <> 'plan'
    and start_date <= w.week_start + 6 and end_date >= w.week_start order by created_at desc limit 1;
  if not found then return '{}'; end if;
  if b.source = 'pack' then
    select * into pk from packs where week_id = p_week and name = b.pack_name limit 1;
    if not found then return '{}'; end if;
    return radixo_sel_slots(p_week, 'pack', pk.id, pk.picks, '{}');
  end if;
  -- Custom: keep dishes still served that day and meal, else the kitchen's defaults.
  for e in select key, value from jsonb_each(coalesce(b.template, '{}')) where jsonb_array_length(value) > 0 loop
    select array_agg(distinct d) into offered from menu_items mi, unnest(mi.dish_ids) d
      where mi.week_id = p_week and mi.day = split_part(e.key, '-', 1)::int and mi.meal = split_part(e.key, '-', 2);
    if offered is null then continue; end if;
    select jsonb_agg(x) into kept from jsonb_array_elements_text(e.value) x where x::uuid = any (offered);
    if kept is null then
      select jsonb_agg(mi.default_dish_id::text order by mi.position) into kept from menu_items mi
        where mi.week_id = p_week and mi.day = split_part(e.key, '-', 1)::int and mi.meal = split_part(e.key, '-', 2);
    end if;
    out := out || jsonb_build_object(e.key, kept);
  end loop;
  return out;
end $$;

/** Already paid for a week: bookings covering it (menu price) plus approved extras and menu changes. */
create or replace function radixo_week_paid(p_uid uuid, p_week uuid) returns integer
language sql stable security definer set search_path = public as $$
  select (
    select coalesce(sum(weekly_price), 0) from subscriptions s, weeks w
    where w.id = p_week and s.user_id = p_uid and s.status = 'active' and s.start_date <= w.week_start and s.end_date >= w.week_start
  ) + (
    select coalesce(sum(amount + wallet_used), 0) from payments
    where user_id = p_uid and status = 'approved' and week_id = p_week and details ->> 'kind' in ('extra', 'change')
  )::int
$$;

create or replace function radixo_apply_selection(p_uid uuid, p_week uuid, p_sel jsonb) returns void
language sql security definer set search_path = public as $$
  insert into selections (user_id, week_id, mode, pack_id, picks, custom)
  values (p_uid, p_week, coalesce(p_sel ->> 'mode', 'custom'), nullif(p_sel ->> 'pack_id', '')::uuid, coalesce(p_sel -> 'picks', '{}'), coalesce(p_sel -> 'custom', '{}'))
  on conflict (user_id, week_id) do update set mode = excluded.mode, pack_id = excluded.pack_id, picks = excluded.picks, custom = excluded.custom, updated_at = now()
$$;

-- ---------- Change a booked menu ----------

/**
 * p_sel = {mode: 'custom' | 'pack', pack_id, picks, custom}. Meals starting within 48 hours can't change.
 * No extra cost → saved now. Costlier → wallet first, then UPI (p_utr); saved when paid (wallet) or approved.
 */
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
begin
  if uid is null then raise exception 'Log in first'; end if;
  perform pg_advisory_xact_lock(hashtext('radixo-wallet:' || uid));
  select * into w from weeks where id = p_week and status = 'published';
  if not found then raise exception 'That week isn’t open'; end if;
  if not exists (select 1 from subscriptions where user_id = uid and status = 'active' and start_date <= w.week_start and end_date >= w.week_start) then
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

  -- 48-hour lock: meals starting soon must stay as they are.
  for k in select key from jsonb_each(old_slots) union select key from jsonb_each(new_slots) loop
    if (select coalesce(jsonb_agg(x order by x), '[]') from jsonb_array_elements_text(coalesce(old_slots -> k, '[]')) x)
       is distinct from (select coalesce(jsonb_agg(x order by x), '[]') from jsonb_array_elements_text(coalesce(new_slots -> k, '[]')) x)
       and radixo_meal_start(w.week_start + split_part(k, '-', 1)::int, split_part(k, '-', 2)) < now() + interval '48 hours' then
      raise exception 'Meals starting within 48 hours can’t be changed (% on %)', initcap(split_part(k, '-', 2)), to_char(w.week_start + split_part(k, '-', 1)::int, 'Dy DD Mon');
    end if;
  end loop;

  v_value := case when p_sel ->> 'mode' = 'pack' then (select price from packs where id = (p_sel ->> 'pack_id')::uuid and week_id = p_week) else radixo_custom_value(p_sel -> 'custom') end;
  if v_value is null then raise exception 'That menu isn’t available'; end if;
  -- Pay only the difference from the menu they have now (a ready-made menu can be worth more than its price).
  v_paid := greatest(radixo_week_paid(uid, p_week), (select coalesce(sum(d.price), 0) from jsonb_each(old_slots) e, jsonb_array_elements_text(e.value) x join dishes d on d.id::text = x)::int);
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

/** Admin approves a UPI/cash payment: create the booking, or apply the menu change, it paid for. */
create or replace function approve_payment(p_id uuid, p_note text default '') returns payments
language plpgsql security definer set search_path = public as $$
declare pay payments;
begin
  if not is_admin() then raise exception 'Only the owner can approve payments'; end if;
  select * into pay from payments where id = p_id and status = 'pending' for update;
  if not found then raise exception 'Payment not found or already reviewed'; end if;
  if pay.details is not null and pay.details ->> 'kind' in ('pack', 'custom') then perform radixo_create_booking(pay.user_id, pay.details, pay.id); end if;
  if pay.details is not null and pay.details ->> 'kind' = 'change' then perform radixo_apply_selection(pay.user_id, pay.week_id, pay.details -> 'sel'); end if;
  update payments set status = 'approved', admin_note = coalesce(p_note, ''), reviewed_at = now() where id = p_id returning * into pay;
  return pay;
end $$;

revoke all on function radixo_effective_slots(uuid, uuid), radixo_week_paid(uuid, uuid), radixo_apply_selection(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function change_menu(uuid, jsonb, text) from public, anon;
grant execute on function change_menu(uuid, jsonb, text) to authenticated;
