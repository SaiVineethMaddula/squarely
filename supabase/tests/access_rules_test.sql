-- Database tests for Squarely's access rules and write functions.
-- Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;

select plan(34);

-- Fake users: Anu creates the group, Ravi joins, Mallory is an outsider.
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'anu@example.com',     '{"full_name":"Anu"}'),
  ('22222222-2222-2222-2222-222222222222', 'ravi@example.com',    '{"full_name":"Ravi"}'),
  ('33333333-3333-3333-3333-333333333333', 'mallory@example.com', '{}');

select is((select display_name from profiles where id = '11111111-1111-1111-1111-111111111111'),
          'Anu', 'profile is created on sign-up from full_name');
select is((select display_name from profiles where id = '33333333-3333-3333-3333-333333333333'),
          'mallory', 'profile falls back to email name');

-- Helper to act as a given user.
create function pg_temp.act_as(p_uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.reset_role() returns void language sql as $$
  select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true);
$$;

-------------------------------------------------------------------------------
-- Anu creates a group and adds a placeholder for Chetan
-------------------------------------------------------------------------------
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');

create temp table ctx (k text primary key, v text);
grant all on ctx to authenticated;

insert into ctx values ('group', create_group('Goa Trip'));
insert into ctx values ('chetan', add_placeholder_member((select v::uuid from ctx where k = 'group'), 'Chetan'));
insert into ctx values ('code', (select invite_code from groups));
insert into ctx values ('anu_m', (select id from group_members where user_id = auth.uid()));

select is((select role from group_members where id = (select v::uuid from ctx where k = 'anu_m')),
          'admin', 'group creator is admin');
select throws_ok(
  $$ select add_placeholder_member((select v::uuid from ctx where k = 'group'), 'chetan') $$,
  '23505', null, 'duplicate member names are rejected (case-insensitive)');

-------------------------------------------------------------------------------
-- Outsider cannot see or touch the group
-------------------------------------------------------------------------------
select pg_temp.act_as('33333333-3333-3333-3333-333333333333');

select is((select count(*)::int from groups), 0, 'outsider sees no groups');
select is((select count(*)::int from group_members), 0, 'outsider sees no members');
select is((select count(*)::int from profiles where id <> auth.uid()), 0,
          'outsider sees no other profiles');
select throws_ok(
  $$ select add_placeholder_member((select v::uuid from ctx where k = 'group'), 'Spy') $$,
  '42501', null, 'outsider cannot add members');
select throws_ok(
  $$ select create_expense((select v::uuid from ctx where k = 'group'), 'Hack', 100, null, null,
       'equal', '[]', '[]') $$,
  '42501', null, 'outsider cannot add expenses');

-------------------------------------------------------------------------------
-- Ravi opens the invite and claims the Chetan placeholder?  No: he joins new.
-------------------------------------------------------------------------------
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');

select is((get_invite_preview((select v from ctx where k = 'code')) -> 'placeholders' -> 0 ->> 'display_name'),
          'Chetan', 'invite preview lists unclaimed placeholders');
select throws_ok($$ select get_invite_preview('not-a-real-code') $$,
                 'P0002', null, 'bad invite code is rejected');

select is(join_group((select v from ctx where k = 'code')), (select v::uuid from ctx where k = 'group'),
          'Ravi joins via invite code');
select is(join_group((select v from ctx where k = 'code')), (select v::uuid from ctx where k = 'group'),
          'joining twice is harmless');
select is((select count(*)::int from group_members where user_id = auth.uid()), 1,
          'joining twice does not duplicate the membership');
insert into ctx values ('ravi_m', (select id from group_members where user_id = auth.uid()));

select is((select count(*)::int from profiles), 2, 'member can see co-member profiles');

-------------------------------------------------------------------------------
-- Clients cannot write tables directly
-------------------------------------------------------------------------------
select throws_ok(
  $$ insert into expenses (group_id, description, amount_paise, split_type, created_by)
     values ((select v::uuid from ctx where k = 'group'), 'x', 100, 'equal', auth.uid()) $$,
  '42501', null, 'direct insert into expenses is blocked');
select throws_ok(
  $$ update group_members set role = 'admin' where user_id = auth.uid() $$,
  '42501', null, 'member cannot promote themselves to admin');
select throws_ok(
  $$ select _log((select v::uuid from ctx where k = 'group'), 'x', 'x', null, '{}') $$,
  '42501', null, 'internal helpers are not callable');

-------------------------------------------------------------------------------
-- Expenses
-------------------------------------------------------------------------------
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');

-- Dinner ₹3,000 paid by Anu, split equally between Anu, Ravi, Chetan.
insert into ctx values ('dinner', create_expense(
  (select v::uuid from ctx where k = 'group'), 'Dinner', 300000, null, 'Food', 'equal',
  jsonb_build_array(jsonb_build_object('member_id', (select v from ctx where k = 'anu_m'), 'amount_paise', 300000)),
  jsonb_build_array(
    jsonb_build_object('member_id', (select v from ctx where k = 'anu_m'),    'amount_paise', 100000),
    jsonb_build_object('member_id', (select v from ctx where k = 'ravi_m'),   'amount_paise', 100000),
    jsonb_build_object('member_id', (select v from ctx where k = 'chetan'),   'amount_paise', 100000))));

select throws_ok(
  $$ select create_expense((select v::uuid from ctx where k = 'group'), 'Bad', 1000, null, null, 'exact',
       jsonb_build_array(jsonb_build_object('member_id', (select v from ctx where k = 'anu_m'), 'amount_paise', 1000)),
       jsonb_build_array(jsonb_build_object('member_id', (select v from ctx where k = 'ravi_m'), 'amount_paise', 900))) $$,
  '22023', null, 'split that does not add up is rejected');
select throws_ok(
  $$ select create_expense((select v::uuid from ctx where k = 'group'), 'Bad', 1000, null, null, 'equal',
       jsonb_build_array(jsonb_build_object('member_id', gen_random_uuid(), 'amount_paise', 1000)),
       jsonb_build_array(jsonb_build_object('member_id', (select v from ctx where k = 'ravi_m'), 'amount_paise', 1000))) $$,
  '22023', null, 'payer from outside the group is rejected');

-- Taxi ₹600 paid by Ravi, split Ravi + Chetan. Ravi adds it.
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
insert into ctx values ('taxi', create_expense(
  (select v::uuid from ctx where k = 'group'), 'Taxi', 60000, null, 'Transport', 'equal',
  jsonb_build_array(jsonb_build_object('member_id', (select v from ctx where k = 'ravi_m'), 'amount_paise', 60000)),
  jsonb_build_array(
    jsonb_build_object('member_id', (select v from ctx where k = 'ravi_m'), 'amount_paise', 30000),
    jsonb_build_object('member_id', (select v from ctx where k = 'chetan'), 'amount_paise', 30000))));

select results_eq(
  $$ select net_paise from member_balances order by net_paise desc $$,
  $$ values (200000::bigint), (-70000::bigint), (-130000::bigint) $$,
  'balances match the Goa Trip example');

-- Only the creator can edit or delete.
select throws_ok(
  $$ select delete_expense((select v::uuid from ctx where k = 'dinner')) $$,
  '42501', null, 'Ravi cannot delete Anu''s expense');
select throws_ok(
  $$ select update_expense((select v::uuid from ctx where k = 'dinner'), 'Cheap dinner', 100, null, null, 'equal',
       jsonb_build_array(jsonb_build_object('member_id', (select v from ctx where k = 'ravi_m'), 'amount_paise', 100)),
       jsonb_build_array(jsonb_build_object('member_id', (select v from ctx where k = 'ravi_m'), 'amount_paise', 100))) $$,
  '42501', null, 'Ravi cannot edit Anu''s expense');

select lives_ok(
  $$ select update_expense((select v::uuid from ctx where k = 'taxi'), 'Airport taxi', 90000, null, 'Transport', 'equal',
       jsonb_build_array(jsonb_build_object('member_id', (select v from ctx where k = 'ravi_m'), 'amount_paise', 90000)),
       jsonb_build_array(
         jsonb_build_object('member_id', (select v from ctx where k = 'ravi_m'), 'amount_paise', 45000),
         jsonb_build_object('member_id', (select v from ctx where k = 'chetan'), 'amount_paise', 45000))) $$,
  'Ravi can edit his own expense');

-------------------------------------------------------------------------------
-- Settlements and soft delete
-------------------------------------------------------------------------------
select lives_ok(
  $$ select record_settlement((select v::uuid from ctx where k = 'group'),
       (select v::uuid from ctx where k = 'ravi_m'), (select v::uuid from ctx where k = 'anu_m'), 55000) $$,
  'Ravi records paying Anu ₹550');

select is((select net_paise from member_balances where member_id = (select v::uuid from ctx where k = 'ravi_m')),
          0::bigint, 'Ravi is settled after paying');

select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
select lives_ok($$ select delete_expense((select v::uuid from ctx where k = 'dinner')) $$,
                'Anu can delete her own expense');
select is((select sum(net_paise)::bigint from member_balances), 0::bigint,
          'balances still sum to zero after a delete');

-------------------------------------------------------------------------------
-- Claiming a placeholder, and admin undo
-------------------------------------------------------------------------------
select pg_temp.act_as('33333333-3333-3333-3333-333333333333');
select lives_ok(
  $$ select join_group((select v from ctx where k = 'code'), (select v::uuid from ctx where k = 'chetan')) $$,
  'a new user can claim the Chetan placeholder');
select is((select display_name from group_members where id = (select v::uuid from ctx where k = 'chetan')),
          'mallory', 'claiming a placeholder shows the claimer''s Account name');

-------------------------------------------------------------------------------
-- Renaming yourself in Account updates every group you're in
-------------------------------------------------------------------------------
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
select lives_ok($$ update profiles set display_name = 'Ravi Kumar' where id = auth.uid() $$,
                'Ravi renames himself');
select is((select display_name from group_members where user_id = auth.uid()),
          'Ravi Kumar', 'the new name shows in his group');
select throws_ok(
  $$ select sync_member_names() $$,
  '42501', null, 'the name-sync helper is not callable by users');

select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
select lives_ok($$ select unclaim_member((select v::uuid from ctx where k = 'chetan')) $$,
                'admin can undo a wrong claim');

select pg_temp.reset_role();
select * from finish();
rollback;
