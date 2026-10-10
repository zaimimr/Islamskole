begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data)
values
  ('d4000000-0000-4000-8000-000000000001', 'developer-other@zztest.local', now(), '{"role":"developer"}'),
  ('d4000000-0000-4000-8000-000000000002', 'developer-admin@zztest.local', now(), '{"role":"admin"}'),
  ('d4000000-0000-4000-8000-000000000003', 'developer-target@zztest.local', now(), '{"role":"member"}');

select is((select role from public.profiles where id = 'd4000000-0000-4000-8000-000000000001'), 'member', 'Another email cannot gain developer access through app metadata');
select throws_ok($$update public.profiles set role = 'developer' where id = 'd4000000-0000-4000-8000-000000000001'$$,
  '42501', 'Utviklertilgang er begrenset til utviklerkontoen.', 'Developer role is limited to the owner');

insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data)
select 'd4000000-0000-4000-8000-000000000004', 'zaim.imran@gmail.com', now(), '{"role":"developer"}'
where not exists (select 1 from auth.users where lower(email) = 'zaim.imran@gmail.com');
update public.profiles set role = 'developer' where id in (select id from auth.users where lower(email) = 'zaim.imran@gmail.com');

insert into auth.sessions (id, user_id)
select 'd4000000-0000-4000-8000-000000000010', id from auth.users where lower(email) = 'zaim.imran@gmail.com';
insert into auth.sessions (id, user_id) values
  ('d4000000-0000-4000-8000-000000000011', 'd4000000-0000-4000-8000-000000000003'),
  ('d4000000-0000-4000-8000-000000000012', 'd4000000-0000-4000-8000-000000000002');

select throws_ok($$update public.profiles set role = 'admin' where role = 'developer'$$,
  '42501', 'Utviklertilgangen kan ikke endres her.', 'Developer cannot be demoted through admin management');
select throws_ok($$delete from public.profiles where role = 'developer'$$,
  '42501', 'Utviklertilgangen kan ikke endres her.', 'Developer profile cannot be deleted');

select set_config('request.jwt.claims', jsonb_build_object('sub', id, 'email', email,
  'role', 'authenticated', 'session_id', 'd4000000-0000-4000-8000-000000000010')::text, true)
from auth.users where lower(email) = 'zaim.imran@gmail.com';
set local role authenticated;
select ok(public.is_admin(), 'Developer retains administrative access');
select ok(public.developer_can_impersonate(), 'Verified developer with live original session may impersonate');
select throws_ok($$select * from public.developer_impersonations$$, '42501', null, 'Even developer cannot read impersonation records directly');
reset role;

insert into public.developer_impersonations (id, developer_id, developer_email, developer_session_id, target_id, target_email, target_session_id)
select 'd4000000-0000-4000-8000-000000000020', id, email, 'd4000000-0000-4000-8000-000000000010',
  'd4000000-0000-4000-8000-000000000003', 'developer-target@zztest.local', 'd4000000-0000-4000-8000-000000000011'
from auth.users where lower(email) = 'zaim.imran@gmail.com';

select set_config('request.jwt.claims', '{"sub":"d4000000-0000-4000-8000-000000000003","role":"authenticated","email":"developer-target@zztest.local","session_id":"d4000000-0000-4000-8000-000000000011"}', true);
set local role authenticated;
select ok(not public.is_admin(), 'Impersonating a member does not inherit developer access');
select ok(not public.developer_can_impersonate(), 'Target cannot start nested impersonation');
select throws_ok($$insert into public.developer_impersonations (developer_id, developer_email, developer_session_id, target_id, target_email, target_session_id) values (auth.uid(), 'x', gen_random_uuid(), gen_random_uuid(), 'x', gen_random_uuid())$$,
  '42501', null, 'Member cannot manufacture impersonation');
reset role;

insert into public.audit_log (id, actor_id, actor_email, action, entity_type, metadata)
values ('d4000000-0000-4000-8000-000000000030', 'd4000000-0000-4000-8000-000000000003', 'developer-target@zztest.local', 'test', 'users', '{"existing":true}');
select is((select actor_email from public.audit_log where id = 'd4000000-0000-4000-8000-000000000030'), 'zaim.imran@gmail.com', 'Database audit attributes changes to developer');
select is((select metadata->>'impersonated_email' from public.audit_log where id = 'd4000000-0000-4000-8000-000000000030'), 'developer-target@zztest.local', 'Audit also preserves target identity');
select is((select metadata->>'existing' from public.audit_log where id = 'd4000000-0000-4000-8000-000000000030'), 'true', 'Existing audit metadata survives');

select set_config('request.jwt.claims', '{"sub":"d4000000-0000-4000-8000-000000000002","role":"authenticated","session_id":"d4000000-0000-4000-8000-000000000012"}', true);
set local role authenticated;
select ok(not public.developer_can_impersonate(), 'Ordinary admin cannot impersonate');
select throws_ok($$select * from public.developer_impersonations$$, '42501', null, 'Ordinary admin cannot inspect target sessions');
reset role;

delete from auth.sessions where id = 'd4000000-0000-4000-8000-000000000010';
select set_config('request.jwt.claims', jsonb_build_object('sub', id, 'role', 'authenticated',
  'session_id', 'd4000000-0000-4000-8000-000000000010')::text, true)
from auth.users where lower(email) = 'zaim.imran@gmail.com';
set local role authenticated;
select ok(not public.developer_can_impersonate(), 'Revoked original session cannot authorize impersonation');
reset role;
select * from finish();
rollback;
