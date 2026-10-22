begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(14);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into auth.users (id, email, raw_app_meta_data)
values
  ('db000000-0000-0000-0000-0000000000a1', 'zz-d11-admin1@zztest.local', '{"role":"admin"}'),
  ('db000000-0000-0000-0000-0000000000a2', 'zz-d11-admin2@zztest.local', '{"role":"admin"}'),
  ('db000000-0000-0000-0000-0000000000a3', 'zz-d11-member@zztest.local', '{"role":"member"}');

delete from public.person_roles
where role_key = 'admin'
  and guardian_id not in (select id from public.guardians where email in ('zz-d11-admin1@zztest.local', 'zz-d11-admin2@zztest.local'));

select lives_ok(
  $$ delete from public.person_roles where role_key = 'admin' and guardian_id = (select id from public.guardians where email = 'zz-d11-admin2@zztest.local') $$,
  'D11 SEC-18: removing one of two admins works'
);

select throws_ok(
  $$ update public.person_roles set suspended_at = now() where role_key = 'admin' and guardian_id = (select id from public.guardians where email = 'zz-d11-admin1@zztest.local') $$,
  'P0001',
  null,
  'D11 AUTH-14: suspending the last admin is refused'
);

select throws_ok(
  $$ delete from public.person_roles where role_key = 'admin' and guardian_id = (select id from public.guardians where email = 'zz-d11-admin1@zztest.local') $$,
  'P0001',
  null,
  'D11 AUTH-14: removing the last admin role is refused'
);

select throws_ok(
  $$ delete from public.guardians where email = 'zz-d11-admin1@zztest.local' $$,
  'P0001',
  null,
  'D11 AUTH-14: deleting the last admin person is refused'
);

select is(
  (select count(*) from public.person_roles where role_key = 'admin'),
  1::bigint,
  'D11 AUTH-14: one admin is left'
);

select lives_ok(
  $$ update public.person_roles set note = 'ZZTEST' where role_key = 'admin' and guardian_id = (select id from public.guardians where email = 'zz-d11-admin1@zztest.local') $$,
  'D11 AUTH-14: editing the last admin without removing the role works'
);

select lives_ok(
  $$ delete from auth.users where id = 'db000000-0000-0000-0000-0000000000a3' $$,
  'D11 AUTH-14: deleting a member works'
);

select lives_ok(
  $$ insert into public.person_roles (guardian_id, role_key) values ((select id from public.guardians where email = 'zz-d11-admin2@zztest.local'), 'admin') $$,
  'D11 SEC-18: promoting a member back to admin works'
);

select lives_ok(
  $$ delete from public.person_roles where role_key = 'admin' and guardian_id = (select id from public.guardians where email = 'zz-d11-admin2@zztest.local') $$,
  'D11 AUTH-14: removing one of two admins works'
);

insert into public.classes (id, slug, name_no, name_en)
values ('dc000000-0000-0000-0000-0000000000c4', 'zztest-d12-engelsk', 'ZZTEST Engelsk', 'ZZTEST English');

select lives_ok(
  $$
    insert into public.classes (id, slug, name_no)
    values ('dc000000-0000-0000-0000-0000000000c1', 'zztest-d12-null', 'ZZTEST Bare norsk')
  $$,
  'D12 CLS-01: a class can be saved without an English name'
);

select is(
  (select name_en from public.classes where id = 'dc000000-0000-0000-0000-0000000000c1'),
  'ZZTEST Bare norsk',
  'D12 CLS-01: a missing name_en falls back to the Norwegian name'
);

select lives_ok(
  $$
    insert into public.classes (id, slug, name_no, name_en)
    values ('dc000000-0000-0000-0000-0000000000c2', 'zztest-d12-blank', 'ZZTEST Blank', '   ')
  $$,
  'D12 CLS-01: a class can be saved with a blank English name'
);

select is(
  (select name_en from public.classes where id = 'dc000000-0000-0000-0000-0000000000c2'),
  'ZZTEST Blank',
  'D12 CLS-01: a blank name_en falls back to the Norwegian name'
);

select is(
  (select name_en from public.classes where id = 'dc000000-0000-0000-0000-0000000000c4'),
  'ZZTEST English',
  'D12 CLS-01: a real English name is kept'
);

select * from finish();

rollback;
