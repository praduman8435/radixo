-- Owner sets the login password for a team member (staff/owner), or for themselves.
-- Team accounts log in with number + password; students use the mobile-number login.
create or replace function set_team_password(p_user uuid, p_password text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_role text;
begin
  if not is_admin() then raise exception 'Only the owner can set team passwords'; end if;
  if length(coalesce(p_password, '')) < 8 then raise exception 'Use at least 8 characters'; end if;
  select role into v_role from profiles where id = p_user;
  if v_role is null then raise exception 'Member not found'; end if;
  if v_role not in ('staff', 'admin') then raise exception 'Make them staff first, then set a password'; end if;
  update auth.users set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')), updated_at = now() where id = p_user;
end $$;

revoke all on function set_team_password(uuid, text) from public, anon;
grant execute on function set_team_password(uuid, text) to authenticated;
