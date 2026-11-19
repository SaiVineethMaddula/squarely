-- Multi-payer expenses, leaving, removing, rejoining and deleting groups.
-- Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;

select plan(25);

insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'anu@example.com',  '{"full_name":"Anu"}'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'ravi@example.com', '{"full_name":"Ravi"}'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'meera@example.com', '{"full_name":"Meera"}');

create function pg_temp.act_as(p_uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;

create temp table ctx (k text primary key, v text);
grant all on ctx to authenticated;
create function pg_temp.v(p_k text) returns uuid language sql as $$ select v::uuid from ctx where k = p_k $$;
create function pg_temp.line(p_member text, p_amount bigint) returns jsonb language sql as $$
  select jsonb_build_object('member_id', pg_temp.v(p_member), 'amount_paise', p_amount)
$$;

-- Anu creates the group; Ravi and Meera join; Chetan is a name-only placeholder.
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001');
insert into ctx values ('group', create_group('Flat 4B'));
insert into ctx values ('code', (select invite_code from groups));
insert into ctx values ('anu', (select id from group_members where user_id = auth.uid()));
insert into ctx values ('chetan', add_placeholder_member(pg_temp.v('group'), 'Chetan'));

select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000002');
select join_group((select v from ctx where k = 'code'));
insert into ctx values ('ravi', (select id from group_members where user_id = auth.uid()));

select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000003');
select join_group((select v from ctx where k = 'code'));
insert into ctx values ('meera', (select id from group_members where user_id = auth.uid()));

-- Everything here runs in one transaction, so every join gets the same time.
-- Give Meera a later join time so "who joined first" is well defined.
select set_config('role', 'postgres', true);
update group_members set joined_at = joined_at + interval '1 minute' where id = pg_temp.v('meera');

-------------------------------------------------------------------------------
-- Multiple payers
-------------------------------------------------------------------------------
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001');

-- Groceries ₹900: Anu paid ₹600 and Ravi paid ₹300, split equally Anu/Ravi/Meera.
select lives_ok($$
  select create_expense(pg_temp.v('group'), 'Groceries', 90000, null, null, 'equal',
    jsonb_build_array(pg_temp.line('anu', 60000), pg_temp.line('ravi', 30000)),
    jsonb_build_array(pg_temp.line('anu', 30000), pg_temp.line('ravi', 30000), pg_temp.line('meera', 30000)))
$$, 'an expense can have two payers');

select results_eq(
  $$ select member_id, net_paise from member_balances where member_id in
       (pg_temp.v('anu'), pg_temp.v('ravi'), pg_temp.v('meera')) order by net_paise desc $$,
  $$ values (pg_temp.v('anu'), 30000::bigint), (pg_temp.v('ravi'), 0::bigint), (pg_temp.v('meera'), -30000::bigint) $$,
  'balances account for both payers');

select throws_ok($$
  select create_expense(pg_temp.v('group'), 'Bad', 90000, null, null, 'equal',
    jsonb_build_array(pg_temp.line('anu', 60000), pg_temp.line('ravi', 20000)),
    jsonb_build_array(pg_temp.line('anu', 90000)))
$$, '22023', null, 'payers must add up to the total');

select throws_ok($$
  select create_expense(pg_temp.v('group'), 'Bad', 1000, null, null, 'equal',
    jsonb_build_array(pg_temp.line('anu', 500), pg_temp.line('anu', 500)),
    jsonb_build_array(pg_temp.line('anu', 1000)))
$$, '22023', null, 'the same payer cannot appear twice');

-- Snacks ₹200 paid by Anu, all Ravi's share; Ravi then pays Anu back.
-- Ravi's balance is ₹0 overall, but this expense alone moves it by ₹200.
insert into ctx values ('snacks', create_expense(pg_temp.v('group'), 'Snacks', 20000, null, null, 'exact',
  jsonb_build_array(pg_temp.line('anu', 20000)), jsonb_build_array(pg_temp.line('ravi', 20000))));
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000002');
select record_settlement(pg_temp.v('group'), pg_temp.v('ravi'), pg_temp.v('anu'), 20000);

-------------------------------------------------------------------------------
-- Leaving
-------------------------------------------------------------------------------
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000003');
select throws_ok($$ select leave_group(pg_temp.v('group')) $$,
  '22023', null, 'Meera cannot leave while she owes ₹300');

select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000002');
select lives_ok($$ select leave_group(pg_temp.v('group')) $$, 'Ravi (₹0 balance) can leave');
select is((select count(*)::int from groups), 0, 'after leaving, Ravi no longer sees the group');
select throws_ok($$ select leave_group(pg_temp.v('group')) $$,
  '42501', null, 'leaving twice is rejected');

-- Edits must not change what someone who left owes.
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001');
select throws_ok($$
  select create_expense(pg_temp.v('group'), 'Late bill', 1000, null, null, 'equal',
    jsonb_build_array(pg_temp.line('anu', 1000)),
    jsonb_build_array(pg_temp.line('ravi', 1000)))
$$, '22023', null, 'new expenses cannot include someone who left');

insert into ctx values ('groceries', (select id from expenses where description = 'Groceries'));
select throws_ok($$ select delete_expense(pg_temp.v('snacks')) $$,
  '22023', null, 'deleting an expense that would give a left member a balance is blocked');
select lives_ok($$
  select update_expense(pg_temp.v('groceries'), 'Groceries & milk', 90000, null, null, 'equal',
    jsonb_build_array(pg_temp.line('anu', 60000), pg_temp.line('ravi', 30000)),
    jsonb_build_array(pg_temp.line('anu', 30000), pg_temp.line('ravi', 30000), pg_temp.line('meera', 30000)))
$$, 'an expense with a left member can still be edited if their share is unchanged');

-------------------------------------------------------------------------------
-- Rejoining
-------------------------------------------------------------------------------
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000002');
select is(join_group((select v from ctx where k = 'code')), pg_temp.v('group'), 'Ravi can rejoin via the invite link');
select is((select id from group_members where user_id = auth.uid() and left_at is null), pg_temp.v('ravi'),
          'rejoining reuses his old spot, keeping his history');

-------------------------------------------------------------------------------
-- Removing someone (admins only, balance must be ₹0)
-------------------------------------------------------------------------------
select throws_ok($$ select remove_member(pg_temp.v('chetan')) $$,
  '42501', null, 'a non-admin cannot remove people');

select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001');
select throws_ok($$ select remove_member(pg_temp.v('meera')) $$,
  '22023', null, 'admin cannot remove Meera while she owes money');
select lives_ok($$ select remove_member(pg_temp.v('chetan')) $$,
  'admin can remove the Chetan placeholder (₹0 balance)');
select throws_ok($$ select remove_member(pg_temp.v('anu')) $$,
  '22023', null, 'admin uses Leave, not Remove, for themselves');

-------------------------------------------------------------------------------
-- Deleting the group (admins only, everyone settled, permanent)
-------------------------------------------------------------------------------
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000002');
select throws_ok($$ select delete_group(pg_temp.v('group')) $$,
  '42501', null, 'a non-admin cannot delete the group');

select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001');
select throws_ok($$ select delete_group(pg_temp.v('group')) $$,
  '22023', null, 'the group cannot be deleted while Meera owes money');

select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000003');
select lives_ok($$ select record_settlement(pg_temp.v('group'), pg_temp.v('meera'), pg_temp.v('anu'), 30000) $$,
  'Meera pays Anu back');

-- Admin hand-over when the only admin leaves.
select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000001');
select lives_ok($$ select leave_group(pg_temp.v('group')) $$, 'Anu (the only admin) can leave once settled');

select pg_temp.act_as('aaaaaaaa-0000-0000-0000-000000000002');
select is((select role from group_members where id = pg_temp.v('ravi')), 'admin',
          'the earliest remaining member becomes admin');

select lives_ok($$ select delete_group(pg_temp.v('group')) $$, 'new admin can delete once everyone is settled');

-- Check as the database owner that nothing is left behind.
select set_config('role', 'postgres', true);
select is((select count(*)::int from groups where id = pg_temp.v('group')), 0, 'the group is gone');
select is(
  (select count(*)::int from expenses where group_id = pg_temp.v('group'))
  + (select count(*)::int from settlements where group_id = pg_temp.v('group'))
  + (select count(*)::int from group_members where group_id = pg_temp.v('group'))
  + (select count(*)::int from activity_log where group_id = pg_temp.v('group'))
  + (select count(*)::int from expense_payers where expense_id = pg_temp.v('groceries'))
  + (select count(*)::int from expense_splits where expense_id = pg_temp.v('groceries')),
  0, 'all expenses, payments, members and history are permanently deleted');

select * from finish();
rollback;
