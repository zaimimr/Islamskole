begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(6);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into auth.users (id, email, raw_app_meta_data)
values ('d6000000-0000-0000-0000-0000000000a1', 'zz-d6-admin@zztest.local', '{"role":"admin"}');

update public.school_years set is_active = false where is_active;

insert into public.school_years (id, label, starts_on, ends_on, is_active)
values
  ('d6000000-0000-0000-0000-000000000001', 'ZZTEST D6 i fjor', '2026-08-01', '2027-06-30', true),
  ('d6000000-0000-0000-0000-000000000002', 'ZZTEST D6 neste', '2027-08-01', '2028-06-30', false);

insert into public.classes (id, slug, name_no, name_en)
values
  ('d6000000-0000-0000-0000-0000000000c1', 'zztest-d6-a', 'ZZTEST D6 A', 'ZZTEST D6 A'),
  ('d6000000-0000-0000-0000-0000000000c2', 'zztest-d6-b', 'ZZTEST D6 B', 'ZZTEST D6 B');

insert into public.guardians (id, first_name, last_name, email)
values
  ('d6000000-0000-0000-0000-000000000061', 'ZZTEST', 'Fortsetter', 'zz-d6-1@zztest.local'),
  ('d6000000-0000-0000-0000-000000000062', 'ZZTEST', 'Sluttet', 'zz-d6-2@zztest.local');
insert into public.person_roles (guardian_id, role_key) values ('d6000000-0000-0000-0000-000000000061', 'teacher');

insert into public.class_teachers (class_id, guardian_id, school_year_id, role)
values
  ('d6000000-0000-0000-0000-0000000000c1', 'd6000000-0000-0000-0000-000000000061', 'd6000000-0000-0000-0000-000000000001', 'lærer'),
  ('d6000000-0000-0000-0000-0000000000c2', 'd6000000-0000-0000-0000-000000000061', 'd6000000-0000-0000-0000-000000000001', 'assistent'),
  ('d6000000-0000-0000-0000-0000000000c1', 'd6000000-0000-0000-0000-000000000062', 'd6000000-0000-0000-0000-000000000001', 'lærer');

select set_config('request.jwt.claims', '{"sub":"d6000000-0000-0000-0000-0000000000a1","email":"zz-d6-admin@zztest.local","role":"authenticated"}', true);
set local role authenticated;

select lives_ok(
  $$ select public.set_active_school_year('d6000000-0000-0000-0000-000000000002') $$,
  'D6 CLS-18: an admin activates the next school year'
);

reset role;

select results_eq(
  $$
    select class_id, role
    from public.class_teachers
    where guardian_id = 'd6000000-0000-0000-0000-000000000061'
      and school_year_id = 'd6000000-0000-0000-0000-000000000002'
    order by class_id
  $$,
  $$
    values
      ('d6000000-0000-0000-0000-0000000000c1'::uuid, 'lærer'::text),
      ('d6000000-0000-0000-0000-0000000000c2'::uuid, 'assistent'::text)
  $$,
  'D6 CLS-18: active teachers keep their classes in the new year'
);

select is(
  (
    select count(*) from public.class_teachers
    where guardian_id = 'd6000000-0000-0000-0000-000000000062'
      and school_year_id = 'd6000000-0000-0000-0000-000000000002'
  ),
  0::bigint,
  'D6 TCH-10: a guardian who is no longer a teacher is not copied'
);

select is(
  (select count(*) from public.class_teachers where school_year_id = 'd6000000-0000-0000-0000-000000000001'),
  3::bigint,
  'D6 TCH-10: last year assignments are left as they were'
);

set local role authenticated;

select lives_ok(
  $$ select public.set_active_school_year('d6000000-0000-0000-0000-000000000002') $$,
  'D6 CLS-18: activating the same year again works'
);

reset role;

select is(
  (select count(*) from public.class_teachers where school_year_id = 'd6000000-0000-0000-0000-000000000002'),
  2::bigint,
  'D6 CLS-18: activating again does not duplicate or drop assignments'
);

select * from finish();

rollback;
