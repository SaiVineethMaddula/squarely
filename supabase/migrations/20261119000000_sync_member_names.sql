-- Your Account name is your name in every group.
-- Previously each group kept a copy of the name from when you joined, so
-- renaming yourself in Account never reached existing groups.

-- 1. Renaming yourself updates every group you are in.
create function public.sync_member_names()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.group_members
  set display_name = new.display_name
  where user_id = new.id and display_name is distinct from new.display_name;
  return new;
end;
$$;

revoke execute on function public.sync_member_names() from public, anon, authenticated;

create trigger on_profile_name_change
  after update of display_name on public.profiles
  for each row
  when (old.display_name is distinct from new.display_name)
  execute function public.sync_member_names();

-- 2. Claiming a placeholder ("I'm Ravi") links your account to that spot and
--    shows your Account name from then on.
create or replace function public.join_group(p_invite_code text, p_claim_member_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public._require_user();
  v_group_id uuid;
  v_placeholder_name text;
  v_name text;
begin
  select id into v_group_id from public.groups
  where invite_code = p_invite_code and archived_at is null;
  if v_group_id is null then
    raise exception 'This invite link is not valid' using errcode = 'P0002';
  end if;

  if exists (select 1 from public.group_members
             where group_id = v_group_id and user_id = v_uid and left_at is null) then
    return v_group_id;
  end if;

  select display_name into v_name from public.profiles where id = v_uid;

  if p_claim_member_id is not null then
    select display_name into v_placeholder_name from public.group_members
    where id = p_claim_member_id and group_id = v_group_id
      and user_id is null and left_at is null
    for update;
    if v_placeholder_name is null then
      raise exception 'That person has already been claimed' using errcode = '23505';
    end if;
    update public.group_members
    set user_id = v_uid, display_name = v_name
    where id = p_claim_member_id;
    perform public._log(v_group_id, 'claimed', 'member', p_claim_member_id,
                        jsonb_build_object('name', v_placeholder_name, 'new_name', v_name));
  else
    insert into public.group_members (group_id, user_id, display_name, added_by)
    values (v_group_id, v_uid, v_name, v_uid)
    returning id into p_claim_member_id;
    perform public._log(v_group_id, 'joined', 'member', p_claim_member_id,
                        jsonb_build_object('name', v_name));
  end if;

  return v_group_id;
end;
$$;

-- 3. One-time fix for groups that already show an out-of-date name.
update public.group_members gm
set display_name = p.display_name
from public.profiles p
where gm.user_id = p.id and gm.display_name is distinct from p.display_name;

-- 4. Ask new users their name once, instead of silently using their email
--    address. name_confirmed is false until they pick a name.
alter table public.profiles add column name_confirmed boolean not null default false;
grant update (name_confirmed) on public.profiles to authenticated;

-- Google sign-in provides a real name, so those users needn't be asked.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_real_name text := coalesce(
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'name', ''));
begin
  insert into public.profiles (id, display_name, avatar_url, name_confirmed)
  values (
    new.id,
    left(coalesce(v_real_name, nullif(split_part(coalesce(new.email, ''), '@', 1), ''), 'Friend'), 60),
    new.raw_user_meta_data ->> 'avatar_url',
    v_real_name is not null
  );
  return new;
end;
$$;

-- Existing users who already changed their name from the email default
-- don't need to be asked again.
update public.profiles p
set name_confirmed = true
from auth.users u
where u.id = p.id
  and p.display_name is distinct from split_part(coalesce(u.email, ''), '@', 1);
