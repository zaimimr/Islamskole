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

alter table public.profiles disable trigger profiles_protect_developer;
update public.profiles
set role = 'member'
where role in ('admin', 'developer')
  and id not in ('db000000-0000-0000-0000-0000000000a1', 'db000000-0000-0000-0000-0000000000a2');
alter table public.profiles enable trigger profiles_protect_developer;

select lives_ok(
  $$ update public.profiles set role = 'member' where id = 'db000000-0000-0000-0000-0000000000a2' $$,
  'D11 SEC-18: demoting one of two admins works'
);

select throws_ok(
  $$ update public.profiles set role = 'member' where id = 'db000000-0000-0000-0000-0000000000a1' $$,
  'P0001',
  null,
  'D11 AUTH-14: demoting the last admin is refused'
);

select throws_ok(
  $$ delete from public.profiles where id = 'db000000-0000-0000-0000-0000000000a1' $$,
  'P0001',
  null,
  'D11 AUTH-14: deleting the last admin profile is refused'
);

select throws_ok(
  $$ delete from auth.users where id = 'db000000-0000-0000-0000-0000000000a1' $$,
  'P0001',
  null,
  'D11 AUTH-14: deleting the last admin auth user is refused'
);

select is(
  (select count(*) from public.profiles where role = 'admin'),
  1::bigint,
  'D11 AUTH-14: one admin is left'
);

select lives_ok(
  $$ update public.profiles set full_name = 'ZZTEST Admin' where id = 'db000000-0000-0000-0000-0000000000a1' $$,
  'D11 AUTH-14: editing the last admin without changing role works'
);

select lives_ok(
  $$ delete from auth.users where id = 'db000000-0000-0000-0000-0000000000a3' $$,
  'D11 AUTH-14: deleting a member works'
);

select lives_ok(
  $$ update public.profiles set role = 'admin' where id = 'db000000-0000-0000-0000-0000000000a2' $$,
  'D11 SEC-18: promoting a member back to admin works'
);

select lives_ok(
  $$ delete from auth.users where id = 'db000000-0000-0000-0000-0000000000a2' $$,
  'D11 AUTH-14: deleting one of two admins works'
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
