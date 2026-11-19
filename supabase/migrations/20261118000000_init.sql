-- Squarely: initial schema
-- Money is stored as bigint paise (₹1 = 100). INR only.
--
-- Write model: the app never inserts/updates expenses, splits, settlements or
-- memberships directly. All writes go through the SECURITY DEFINER functions
-- at the bottom of this file, which validate input and enforce the rules
-- (e.g. only the creator can edit an expense). Row-Level Security controls
-- what each user can READ.

-------------------------------------------------------------------------------
-- Tables
-------------------------------------------------------------------------------

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  avatar_url   text,
  created_at   timestamptz not null default now()
);

create table public.groups (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (char_length(name) between 1 and 60),
  simplify_debts boolean not null default true,
  invite_code    text not null unique
                   default substr(md5(gen_random_uuid()::text), 1, 12),
  created_by     uuid not null references public.profiles (id),
  created_at     timestamptz not null default now(),
  archived_at    timestamptz
);

-- A member is either a real user (user_id set) or a name-only placeholder
-- (user_id null) that a friend can claim after joining.
create table public.group_members (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.groups (id) on delete cascade,
  user_id      uuid references public.profiles (id) on delete set null,
  display_name text not null check (char_length(display_name) between 1 and 60),
  role         text not null default 'member' check (role in ('admin', 'member')),
  added_by     uuid references public.profiles (id),
  joined_at    timestamptz not null default now(),
  left_at      timestamptz
);

-- A user can hold at most one membership per group.
create unique index group_members_one_per_user
  on public.group_members (group_id, user_id) where user_id is not null;
create index group_members_user_idx on public.group_members (user_id);

create table public.expenses (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.groups (id) on delete cascade,
  description  text not null check (char_length(description) between 1 and 100),
  amount_paise bigint not null check (amount_paise > 0 and amount_paise <= 100000000000),
  expense_date date not null default current_date,
  category     text check (char_length(category) <= 30),
  split_type   text not null check (split_type in ('equal', 'exact', 'percent', 'shares')),
  created_by   uuid not null references public.profiles (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create index expenses_group_idx on public.expenses (group_id, expense_date desc);

create table public.expense_payers (
  expense_id   uuid not null references public.expenses (id) on delete cascade,
  member_id    uuid not null references public.group_members (id),
  amount_paise bigint not null check (amount_paise > 0),
  primary key (expense_id, member_id)
);

create table public.expense_splits (
  expense_id   uuid not null references public.expenses (id) on delete cascade,
  member_id    uuid not null references public.group_members (id),
  amount_paise bigint not null check (amount_paise >= 0),
  -- What the user typed (percent or share count), so the editor can reopen it.
  share_input  numeric,
  primary key (expense_id, member_id)
);
create index expense_splits_member_idx on public.expense_splits (member_id);
create index expense_payers_member_idx on public.expense_payers (member_id);

create table public.settlements (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.groups (id) on delete cascade,
  from_member  uuid not null references public.group_members (id),
  to_member    uuid not null references public.group_members (id),
  amount_paise bigint not null check (amount_paise > 0 and amount_paise <= 100000000000),
  settled_on   date not null default current_date,
  note         text check (char_length(note) <= 100),
  created_by   uuid not null references public.profiles (id),
  created_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  check (from_member <> to_member)
);
create index settlements_group_idx on public.settlements (group_id);

create table public.activity_log (
  id          bigint generated always as identity primary key,
  group_id    uuid not null references public.groups (id) on delete cascade,
  actor_id    uuid references public.profiles (id) on delete set null,
  action      text not null,
  entity_type text not null,
  entity_id   uuid,
  payload     jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
create index activity_log_group_idx on public.activity_log (group_id, created_at desc);

-------------------------------------------------------------------------------
-- Profile is created automatically when someone signs up
-------------------------------------------------------------------------------

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    left(coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Friend'
    ), 60),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-------------------------------------------------------------------------------
-- RLS helper functions (SECURITY DEFINER avoids recursive policy checks)
-------------------------------------------------------------------------------

create function public.is_group_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = auth.uid() and left_at is null
  );
$$;

create function public.is_group_admin(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = auth.uid()
      and left_at is null and role = 'admin'
  );
$$;

create function public.shares_group_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_members me
    join public.group_members them on them.group_id = me.group_id
    where me.user_id = auth.uid() and me.left_at is null
      and them.user_id = p_user_id
  );
$$;

-------------------------------------------------------------------------------
-- Row-Level Security: who can READ what
-------------------------------------------------------------------------------

alter table public.profiles       enable row level security;
alter table public.groups         enable row level security;
alter table public.group_members  enable row level security;
alter table public.expenses       enable row level security;
alter table public.expense_payers enable row level security;
alter table public.expense_splits enable row level security;
alter table public.settlements    enable row level security;
alter table public.activity_log   enable row level security;

create policy "see own and co-member profiles" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.shares_group_with(id));

create policy "edit own profile" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "members see their groups" on public.groups
  for select to authenticated
  using (public.is_group_member(id));

create policy "admins edit group settings" on public.groups
  for update to authenticated
  using (public.is_group_admin(id))
  with check (public.is_group_admin(id));

create policy "members see group members" on public.group_members
  for select to authenticated
  using (public.is_group_member(group_id));

create policy "members see expenses" on public.expenses
  for select to authenticated
  using (public.is_group_member(group_id));

create policy "members see payers" on public.expense_payers
  for select to authenticated
  using (exists (
    select 1 from public.expenses e
    where e.id = expense_id and public.is_group_member(e.group_id)
  ));

create policy "members see splits" on public.expense_splits
  for select to authenticated
  using (exists (
    select 1 from public.expenses e
    where e.id = expense_id and public.is_group_member(e.group_id)
  ));

create policy "members see settlements" on public.settlements
  for select to authenticated
  using (public.is_group_member(group_id));

create policy "members see activity" on public.activity_log
  for select to authenticated
  using (public.is_group_member(group_id));

-- Explicit grants: read-only for signed-in users, nothing for anonymous.
revoke all on all tables in schema public from anon, authenticated;
grant select on all tables in schema public to authenticated;
grant update (display_name, avatar_url) on public.profiles to authenticated;
grant update (name, simplify_debts, archived_at) on public.groups to authenticated;

-------------------------------------------------------------------------------
-- Balances: computed from expenses and settlements, never stored
-------------------------------------------------------------------------------

create view public.member_balances
with (security_invoker = true)
as
select
  m.group_id,
  m.id as member_id,
  (
    coalesce((select sum(p.amount_paise) from public.expense_payers p
              join public.expenses e on e.id = p.expense_id
              where p.member_id = m.id and e.deleted_at is null), 0)
  - coalesce((select sum(s.amount_paise) from public.expense_splits s
              join public.expenses e on e.id = s.expense_id
              where s.member_id = m.id and e.deleted_at is null), 0)
  + coalesce((select sum(t.amount_paise) from public.settlements t
              where t.from_member = m.id and t.deleted_at is null), 0)
  - coalesce((select sum(t.amount_paise) from public.settlements t
              where t.to_member = m.id and t.deleted_at is null), 0)
  )::bigint as net_paise
from public.group_members m;

grant select on public.member_balances to authenticated;

-------------------------------------------------------------------------------
-- Internal helpers (not callable by clients)
-------------------------------------------------------------------------------

create function public._require_user()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  return v_uid;
end;
$$;

create function public._log(
  p_group_id uuid, p_action text, p_entity_type text, p_entity_id uuid, p_payload jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.activity_log (group_id, actor_id, action, entity_type, entity_id, payload)
  values (p_group_id, auth.uid(), p_action, p_entity_type, p_entity_id, coalesce(p_payload, '{}'));
$$;

-- Validates payer and split lines and writes them for an expense.
-- Lines are JSON arrays: [{"member_id": "...", "amount_paise": 123, "share_input": 2}]
create function public._write_expense_lines(
  p_expense_id uuid, p_group_id uuid, p_amount bigint, p_payers jsonb, p_splits jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_paid  bigint;
  v_owed  bigint;
  v_bad   int;
begin
  if jsonb_typeof(p_payers) <> 'array' or jsonb_array_length(p_payers) = 0 then
    raise exception 'At least one person must have paid' using errcode = '22023';
  end if;
  if jsonb_typeof(p_splits) <> 'array' or jsonb_array_length(p_splits) = 0 then
    raise exception 'At least one person must share the expense' using errcode = '22023';
  end if;

  create temp table _payers on commit drop as
    select * from jsonb_to_recordset(p_payers) as x(member_id uuid, amount_paise bigint);
  create temp table _splits on commit drop as
    select * from jsonb_to_recordset(p_splits)
      as x(member_id uuid, amount_paise bigint, share_input numeric);

  -- Every member must be an active member of this group.
  select count(*) into v_bad
  from (select member_id from _payers union all select member_id from _splits) l
  where l.member_id is null or not exists (
    select 1 from public.group_members m
    where m.id = l.member_id and m.group_id = p_group_id and m.left_at is null
  );
  if v_bad > 0 then
    raise exception 'Everyone on an expense must be in the group' using errcode = '22023';
  end if;

  if (select count(*) from _payers) <> (select count(distinct member_id) from _payers)
     or (select count(*) from _splits) <> (select count(distinct member_id) from _splits) then
    raise exception 'A person appears twice on the expense' using errcode = '22023';
  end if;

  if exists (select 1 from _payers where amount_paise is null or amount_paise <= 0)
     or exists (select 1 from _splits where amount_paise is null or amount_paise < 0) then
    raise exception 'Amounts must be positive' using errcode = '22023';
  end if;

  select sum(amount_paise) into v_paid from _payers;
  select sum(amount_paise) into v_owed from _splits;
  if v_paid <> p_amount or v_owed <> p_amount then
    raise exception 'Paid (%) and split (%) must both equal the total (%)',
      v_paid, v_owed, p_amount using errcode = '22023';
  end if;

  insert into public.expense_payers (expense_id, member_id, amount_paise)
    select p_expense_id, member_id, amount_paise from _payers;
  insert into public.expense_splits (expense_id, member_id, amount_paise, share_input)
    select p_expense_id, member_id, amount_paise, share_input from _splits;

  drop table _payers;
  drop table _splits;
end;
$$;

-------------------------------------------------------------------------------
-- Groups, members and invites
-------------------------------------------------------------------------------

create function public.create_group(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public._require_user();
  v_group_id uuid;
begin
  insert into public.groups (name, created_by)
  values (trim(p_name), v_uid)
  returning id into v_group_id;

  insert into public.group_members (group_id, user_id, display_name, role, added_by)
  select v_group_id, v_uid, p.display_name, 'admin', v_uid
  from public.profiles p where p.id = v_uid;

  perform public._log(v_group_id, 'created', 'group', v_group_id,
                      jsonb_build_object('name', trim(p_name)));
  return v_group_id;
end;
$$;

-- Add a friend by name before they have joined. They can claim it later.
create function public.add_placeholder_member(p_group_id uuid, p_display_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public._require_user();
  v_name text := trim(p_display_name);
  v_member_id uuid;
begin
  if not public.is_group_member(p_group_id) then
    raise exception 'Not a member of this group' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.group_members
    where group_id = p_group_id and left_at is null and lower(display_name) = lower(v_name)
  ) then
    raise exception 'Someone called "%" is already in this group', v_name using errcode = '23505';
  end if;

  insert into public.group_members (group_id, display_name, added_by)
  values (p_group_id, v_name, v_uid)
  returning id into v_member_id;

  perform public._log(p_group_id, 'added', 'member', v_member_id,
                      jsonb_build_object('name', v_name));
  return v_member_id;
end;
$$;

-- What someone sees when they open an invite link, before joining.
create function public.get_invite_preview(p_invite_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public._require_user();
  v_group public.groups;
begin
  select * into v_group from public.groups
  where invite_code = p_invite_code and archived_at is null;
  if not found then
    raise exception 'This invite link is not valid' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'group_id', v_group.id,
    'name', v_group.name,
    'already_member', exists (
      select 1 from public.group_members
      where group_id = v_group.id and user_id = v_uid and left_at is null),
    'placeholders', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'display_name', display_name)
                       order by display_name)
      from public.group_members
      where group_id = v_group.id and user_id is null and left_at is null), '[]'::jsonb)
  );
end;
$$;

-- Join via invite code. Pass p_claim_member_id to take over a placeholder,
-- or null to join as a new member.
create function public.join_group(p_invite_code text, p_claim_member_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public._require_user();
  v_group_id uuid;
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

  if p_claim_member_id is not null then
    update public.group_members
    set user_id = v_uid
    where id = p_claim_member_id and group_id = v_group_id
      and user_id is null and left_at is null
    returning display_name into v_name;
    if v_name is null then
      raise exception 'That person has already been claimed' using errcode = '23505';
    end if;
    perform public._log(v_group_id, 'claimed', 'member', p_claim_member_id,
                        jsonb_build_object('name', v_name));
  else
    insert into public.group_members (group_id, user_id, display_name, added_by)
    select v_group_id, v_uid, p.display_name, v_uid
    from public.profiles p where p.id = v_uid
    returning id, display_name into p_claim_member_id, v_name;
    perform public._log(v_group_id, 'joined', 'member', p_claim_member_id,
                        jsonb_build_object('name', v_name));
  end if;

  return v_group_id;
end;
$$;

-- Admin undo for a wrong claim: turns the member back into a placeholder.
create function public.unclaim_member(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public._require_user();
  v_member public.group_members;
begin
  select * into v_member from public.group_members where id = p_member_id;
  if not found or not public.is_group_admin(v_member.group_id) then
    raise exception 'Only a group admin can do this' using errcode = '42501';
  end if;
  if v_member.user_id is null then
    return;
  end if;
  if v_member.user_id = v_uid then
    raise exception 'You cannot unclaim yourself' using errcode = '22023';
  end if;

  update public.group_members set user_id = null, role = 'member' where id = p_member_id;
  perform public._log(v_member.group_id, 'unclaimed', 'member', p_member_id,
                      jsonb_build_object('name', v_member.display_name));
end;
$$;

-------------------------------------------------------------------------------
-- Expenses
-------------------------------------------------------------------------------

create function public.create_expense(
  p_group_id     uuid,
  p_description  text,
  p_amount_paise bigint,
  p_expense_date date,
  p_category     text,
  p_split_type   text,
  p_payers       jsonb,
  p_splits       jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public._require_user();
  v_expense_id uuid;
begin
  if not public.is_group_member(p_group_id) then
    raise exception 'Not a member of this group' using errcode = '42501';
  end if;

  insert into public.expenses
    (group_id, description, amount_paise, expense_date, category, split_type, created_by)
  values
    (p_group_id, trim(p_description), p_amount_paise,
     coalesce(p_expense_date, current_date), nullif(trim(p_category), ''), p_split_type, v_uid)
  returning id into v_expense_id;

  perform public._write_expense_lines(v_expense_id, p_group_id, p_amount_paise, p_payers, p_splits);
  perform public._log(p_group_id, 'created', 'expense', v_expense_id,
    jsonb_build_object('description', trim(p_description), 'amount_paise', p_amount_paise));
  return v_expense_id;
end;
$$;

-- Only the person who added the expense can change it.
create function public.update_expense(
  p_expense_id   uuid,
  p_description  text,
  p_amount_paise bigint,
  p_expense_date date,
  p_category     text,
  p_split_type   text,
  p_payers       jsonb,
  p_splits       jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public._require_user();
  v_expense public.expenses;
begin
  select * into v_expense from public.expenses
  where id = p_expense_id and deleted_at is null
  for update;
  if not found or not public.is_group_member(v_expense.group_id) then
    raise exception 'Expense not found' using errcode = 'P0002';
  end if;
  if v_expense.created_by <> v_uid then
    raise exception 'Only the person who added this expense can edit it' using errcode = '42501';
  end if;

  update public.expenses
  set description  = trim(p_description),
      amount_paise = p_amount_paise,
      expense_date = coalesce(p_expense_date, expense_date),
      category     = nullif(trim(p_category), ''),
      split_type   = p_split_type,
      updated_at   = now()
  where id = p_expense_id;

  delete from public.expense_payers where expense_id = p_expense_id;
  delete from public.expense_splits where expense_id = p_expense_id;
  perform public._write_expense_lines(p_expense_id, v_expense.group_id, p_amount_paise,
                                      p_payers, p_splits);

  perform public._log(v_expense.group_id, 'updated', 'expense', p_expense_id,
    jsonb_build_object(
      'description', trim(p_description),
      'amount_paise', p_amount_paise,
      'previous_amount_paise', v_expense.amount_paise));
end;
$$;

-- Soft delete: the expense disappears from balances but can be restored.
create function public.delete_expense(p_expense_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public._require_user();
  v_expense public.expenses;
begin
  select * into v_expense from public.expenses
  where id = p_expense_id and deleted_at is null
  for update;
  if not found or not public.is_group_member(v_expense.group_id) then
    raise exception 'Expense not found' using errcode = 'P0002';
  end if;
  if v_expense.created_by <> v_uid then
    raise exception 'Only the person who added this expense can delete it' using errcode = '42501';
  end if;

  update public.expenses set deleted_at = now(), updated_at = now() where id = p_expense_id;
  perform public._log(v_expense.group_id, 'deleted', 'expense', p_expense_id,
    jsonb_build_object('description', v_expense.description,
                       'amount_paise', v_expense.amount_paise));
end;
$$;

-------------------------------------------------------------------------------
-- Settlements ("Ravi paid Anu ₹1,300")
-------------------------------------------------------------------------------

create function public.record_settlement(
  p_group_id     uuid,
  p_from_member  uuid,
  p_to_member    uuid,
  p_amount_paise bigint,
  p_settled_on   date default null,
  p_note         text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public._require_user();
  v_id uuid;
begin
  if not public.is_group_member(p_group_id) then
    raise exception 'Not a member of this group' using errcode = '42501';
  end if;
  if (select count(*) from public.group_members
      where id in (p_from_member, p_to_member)
        and group_id = p_group_id and left_at is null) <> 2 then
    raise exception 'Both people must be in the group' using errcode = '22023';
  end if;

  insert into public.settlements
    (group_id, from_member, to_member, amount_paise, settled_on, note, created_by)
  values
    (p_group_id, p_from_member, p_to_member, p_amount_paise,
     coalesce(p_settled_on, current_date), nullif(trim(p_note), ''), v_uid)
  returning id into v_id;

  perform public._log(p_group_id, 'created', 'settlement', v_id,
    jsonb_build_object('from_member', p_from_member, 'to_member', p_to_member,
                       'amount_paise', p_amount_paise));
  return v_id;
end;
$$;

create function public.delete_settlement(p_settlement_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public._require_user();
  v_row public.settlements;
begin
  select * into v_row from public.settlements
  where id = p_settlement_id and deleted_at is null
  for update;
  if not found or not public.is_group_member(v_row.group_id) then
    raise exception 'Payment not found' using errcode = 'P0002';
  end if;
  if v_row.created_by <> v_uid then
    raise exception 'Only the person who recorded this payment can delete it'
      using errcode = '42501';
  end if;

  update public.settlements set deleted_at = now() where id = p_settlement_id;
  perform public._log(v_row.group_id, 'deleted', 'settlement', p_settlement_id,
    jsonb_build_object('amount_paise', v_row.amount_paise));
end;
$$;

-------------------------------------------------------------------------------
-- Function permissions: only signed-in users may call the public API;
-- internal helpers are callable by no client at all.
-------------------------------------------------------------------------------

revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function
  public.is_group_member(uuid),
  public.is_group_admin(uuid),
  public.shares_group_with(uuid),
  public.create_group(text),
  public.add_placeholder_member(uuid, text),
  public.get_invite_preview(text),
  public.join_group(text, uuid),
  public.unclaim_member(uuid),
  public.create_expense(uuid, text, bigint, date, text, text, jsonb, jsonb),
  public.update_expense(uuid, text, bigint, date, text, text, jsonb, jsonb),
  public.delete_expense(uuid),
  public.record_settlement(uuid, uuid, uuid, bigint, date, text),
  public.delete_settlement(uuid)
to authenticated;

-- Stop new functions being executable by default.
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-------------------------------------------------------------------------------
-- Realtime: push changes to everyone viewing a group (RLS still applies)
-------------------------------------------------------------------------------

alter publication supabase_realtime
  add table public.expenses, public.settlements, public.group_members;
