-- Leave a group, remove a member, delete a group, and multi-payer support.
--
-- Rules (chosen by the product owner):
--   * You can leave only when your balance in the group is ₹0.
--   * Admins can remove someone else only when that person's balance is ₹0.
--   * Admins can delete a group only when EVERY balance is ₹0.
--   * Deleting a group is permanent: all its expenses, payments and history go.
--
-- People who left stay on old expenses (shown as "Name (left)") so history
-- still makes sense, and their balance must stay ₹0 after any later edit.

-------------------------------------------------------------------------------
-- Guard: nobody who has left may end up owing or being owed money
-------------------------------------------------------------------------------
create function public._assert_left_members_settled(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_names text;
begin
  select string_agg(m.display_name, ', ' order by m.display_name) into v_names
  from public.group_members m
  join public.member_balances b on b.member_id = m.id
  where m.group_id = p_group_id and m.left_at is not null and b.net_paise <> 0;

  if v_names is not null then
    raise exception '% left the group, so this change can''t alter what they owe. Ask them to rejoin first.',
      v_names using errcode = '22023';
  end if;
end;
$$;

-------------------------------------------------------------------------------
-- Expense lines: people who left may stay on an expense they were already on
-------------------------------------------------------------------------------
drop function public._write_expense_lines(uuid, uuid, bigint, jsonb, jsonb);

create function public._write_expense_lines(
  p_expense_id uuid, p_group_id uuid, p_amount bigint, p_payers jsonb, p_splits jsonb,
  p_allow_left uuid[] default '{}'
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

  -- Everyone must be in this group: active, or already on this expense.
  select count(*) into v_bad
  from (select member_id from _payers union all select member_id from _splits) l
  where l.member_id is null or not exists (
    select 1 from public.group_members m
    where m.id = l.member_id and m.group_id = p_group_id
      and (m.left_at is null or m.id = any (p_allow_left))
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

create or replace function public.update_expense(
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
  v_previous uuid[];
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

  select coalesce(array_agg(distinct member_id), '{}') into v_previous from (
    select member_id from public.expense_payers where expense_id = p_expense_id
    union all
    select member_id from public.expense_splits where expense_id = p_expense_id
  ) x;

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
                                      p_payers, p_splits, v_previous);
  perform public._assert_left_members_settled(v_expense.group_id);

  perform public._log(v_expense.group_id, 'updated', 'expense', p_expense_id,
    jsonb_build_object(
      'description', trim(p_description),
      'amount_paise', p_amount_paise,
      'previous_amount_paise', v_expense.amount_paise));
end;
$$;

create or replace function public.delete_expense(p_expense_id uuid)
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
  perform public._assert_left_members_settled(v_expense.group_id);
  perform public._log(v_expense.group_id, 'deleted', 'expense', p_expense_id,
    jsonb_build_object('description', v_expense.description,
                       'amount_paise', v_expense.amount_paise));
end;
$$;

create or replace function public.delete_settlement(p_settlement_id uuid)
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
  perform public._assert_left_members_settled(v_row.group_id);
  perform public._log(v_row.group_id, 'deleted', 'settlement', p_settlement_id,
    jsonb_build_object('amount_paise', v_row.amount_paise));
end;
$$;

-------------------------------------------------------------------------------
-- Rejoining: someone who left can come back through the invite link
-------------------------------------------------------------------------------
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
  v_old_member uuid;
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
  select id into v_old_member from public.group_members
  where group_id = v_group_id and user_id = v_uid and left_at is not null;

  if p_claim_member_id is not null then
    select display_name into v_placeholder_name from public.group_members
    where id = p_claim_member_id and group_id = v_group_id
      and user_id is null and left_at is null
    for update;
    if v_placeholder_name is null then
      raise exception 'That person has already been claimed' using errcode = '23505';
    end if;
    -- Taking a new spot: the old (left) spot stays in history, unlinked.
    if v_old_member is not null then
      update public.group_members set user_id = null where id = v_old_member;
    end if;
    update public.group_members
    set user_id = v_uid, display_name = v_name
    where id = p_claim_member_id;
    perform public._log(v_group_id, 'claimed', 'member', p_claim_member_id,
                        jsonb_build_object('name', v_placeholder_name, 'new_name', v_name));
  elsif v_old_member is not null then
    update public.group_members
    set left_at = null, display_name = v_name, role = 'member'
    where id = v_old_member;
    perform public._log(v_group_id, 'rejoined', 'member', v_old_member,
                        jsonb_build_object('name', v_name));
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

-------------------------------------------------------------------------------
-- Leave a group (yourself)
-------------------------------------------------------------------------------
create function public.leave_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public._require_user();
  v_me public.group_members;
  v_net bigint;
  v_next_admin uuid;
begin
  select * into v_me from public.group_members
  where group_id = p_group_id and user_id = v_uid and left_at is null
  for update;
  if not found then
    raise exception 'You are not in this group' using errcode = '42501';
  end if;

  select net_paise into v_net from public.member_balances where member_id = v_me.id;
  if coalesce(v_net, 0) <> 0 then
    raise exception 'Settle up first: your balance in this group must be ₹0 before you can leave'
      using errcode = '22023';
  end if;

  if not exists (select 1 from public.group_members
                 where group_id = p_group_id and left_at is null
                   and user_id is not null and id <> v_me.id) then
    raise exception 'You are the only person in this group who has joined. Delete the group instead.'
      using errcode = '22023';
  end if;

  -- Never leave a group without an admin: promote whoever joined first.
  if v_me.role = 'admin' and not exists (
    select 1 from public.group_members
    where group_id = p_group_id and left_at is null and role = 'admin' and id <> v_me.id
  ) then
    select id into v_next_admin from public.group_members
    where group_id = p_group_id and left_at is null and user_id is not null and id <> v_me.id
    order by joined_at, id limit 1;  -- id breaks ties so the choice is never random
    update public.group_members set role = 'admin' where id = v_next_admin;
  end if;

  update public.group_members set left_at = now(), role = 'member' where id = v_me.id;
  perform public._log(p_group_id, 'left', 'member', v_me.id,
                      jsonb_build_object('name', v_me.display_name));
end;
$$;

-------------------------------------------------------------------------------
-- Remove someone else (admins only)
-------------------------------------------------------------------------------
create function public.remove_member(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public._require_user();
  v_member public.group_members;
  v_net bigint;
begin
  select * into v_member from public.group_members
  where id = p_member_id and left_at is null
  for update;
  if not found or not public.is_group_admin(v_member.group_id) then
    raise exception 'Only a group admin can remove people' using errcode = '42501';
  end if;
  if v_member.user_id = v_uid then
    raise exception 'To remove yourself, use Leave group' using errcode = '22023';
  end if;

  select net_paise into v_net from public.member_balances where member_id = v_member.id;
  if coalesce(v_net, 0) <> 0 then
    raise exception '% must settle up first: their balance must be ₹0 before they can be removed',
      v_member.display_name using errcode = '22023';
  end if;

  update public.group_members set left_at = now(), role = 'member' where id = p_member_id;
  perform public._log(v_member.group_id, 'removed', 'member', p_member_id,
                      jsonb_build_object('name', v_member.display_name));
end;
$$;

-------------------------------------------------------------------------------
-- Delete a group permanently (admins only, everyone settled)
-------------------------------------------------------------------------------
create function public.delete_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unsettled int;
begin
  perform public._require_user();
  if not public.is_group_admin(p_group_id) then
    raise exception 'Only a group admin can delete the group' using errcode = '42501';
  end if;

  select count(*) into v_unsettled from public.member_balances
  where group_id = p_group_id and net_paise <> 0;
  if v_unsettled > 0 then
    raise exception 'Everyone must be settled up before the group can be deleted (% people still have a balance)',
      v_unsettled using errcode = '22023';
  end if;

  -- Child rows first, so member references are gone before members are.
  delete from public.settlements where group_id = p_group_id;
  delete from public.expenses where group_id = p_group_id; -- payers/splits cascade
  delete from public.groups where id = p_group_id;          -- members, activity cascade
end;
$$;

-------------------------------------------------------------------------------
-- Permissions
-------------------------------------------------------------------------------
revoke execute on function
  public._assert_left_members_settled(uuid),
  public._write_expense_lines(uuid, uuid, bigint, jsonb, jsonb, uuid[])
from public, anon, authenticated;

grant execute on function
  public.leave_group(uuid),
  public.remove_member(uuid),
  public.delete_group(uuid)
to authenticated;
