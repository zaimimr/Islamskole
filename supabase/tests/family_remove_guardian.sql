begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(12);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into auth.users (id, email, raw_app_meta_data)
values
  ('d3000000-0000-0000-0000-0000000000a1', 'zz-d3-admin@zztest.local', '{"role":"admin"}'),
  ('d3000000-0000-0000-0000-0000000000a2', 'zz-d3-member@zztest.local', '{"role":"member"}');

update public.school_years set is_active = false where is_active;

insert into public.school_years (id, label, starts_on, ends_on, is_active)
values ('d3000000-0000-0000-0000-000000000001', 'ZZTEST D3 aktiv', '2026-08-01', '2027-06-30', true);

insert into public.classes (id, slug, name_no, name_en)
values ('d3000000-0000-0000-0000-0000000000c1', 'zztest-d3', 'ZZTEST D3', 'ZZTEST D3');

insert into public.families (id, origin)
values
  ('d3000000-0000-0000-0000-0000000000f1', 'test'),
  ('d3000000-0000-0000-0000-0000000000f2', 'test'),
  ('d3000000-0000-0000-0000-0000000000f3', 'test');

insert into public.guardians (id, first_name, last_name, email)
values
  ('d3000000-0000-0000-0000-000000000061', 'ZZTEST', 'Bare En', 'zz-d3-1@zztest.local'),
  ('d3000000-0000-0000-0000-000000000062', 'ZZTEST', 'To Familier', 'zz-d3-2@zztest.local'),
  ('d3000000-0000-0000-0000-000000000063', 'ZZTEST', 'Laerer', 'zz-d3-3@zztest.local'),
  ('d3000000-0000-0000-0000-000000000064', 'ZZTEST', 'Fire', 'zz-d3-4@zztest.local'),
  ('d3000000-0000-0000-0000-000000000065', 'ZZTEST', 'Fem', 'zz-d3-5@zztest.local');
insert into public.person_roles (guardian_id, role_key) values ('d3000000-0000-0000-0000-000000000063', 'teacher');

insert into public.family_guardians (family_id, guardian_id, is_primary_contact)
values
  ('d3000000-0000-0000-0000-0000000000f1', 'd3000000-0000-0000-0000-000000000061', true),
  ('d3000000-0000-0000-0000-0000000000f1', 'd3000000-0000-0000-0000-000000000062', false),
  ('d3000000-0000-0000-0000-0000000000f2', 'd3000000-0000-0000-0000-000000000062', true),
  ('d3000000-0000-0000-0000-0000000000f2', 'd3000000-0000-0000-0000-000000000064', false),
  ('d3000000-0000-0000-0000-0000000000f3', 'd3000000-0000-0000-0000-000000000063', true),
  ('d3000000-0000-0000-0000-0000000000f3', 'd3000000-0000-0000-0000-000000000065', false);

insert into public.students (id, family_id, child_first_name, child_last_name)
values
  ('d3000000-0000-0000-0000-000000000051', 'd3000000-0000-0000-0000-0000000000f1', 'ZZTEST', 'Barn En'),
  ('d3000000-0000-0000-0000-000000000052', 'd3000000-0000-0000-0000-0000000000f2', 'ZZTEST', 'Barn To'),
  ('d3000000-0000-0000-0000-000000000053', 'd3000000-0000-0000-0000-0000000000f3', 'ZZTEST', 'Barn Tre');

insert into public.class_teachers (class_id, guardian_id, school_year_id)
values ('d3000000-0000-0000-0000-0000000000c1', 'd3000000-0000-0000-0000-000000000063', 'd3000000-0000-0000-0000-000000000001');

select has_function(
  'public',
  'admin_remove_guardian_from_family',
  array['uuid', 'uuid'],
  'D3 FAM-06: admin_remove_guardian_from_family(uuid, uuid) exists'
);

select set_config('request.jwt.claims', '{"sub":"d3000000-0000-0000-0000-0000000000a2","email":"zz-d3-member@zztest.local","role":"authenticated"}', true);
set local role authenticated;

select throws_ok(
  $$ select public.admin_remove_guardian_from_family('d3000000-0000-0000-0000-0000000000f2', 'd3000000-0000-0000-0000-000000000064') $$,
  '42501',
  null,
  'D3 FAM-06: a non-admin cannot remove a guardian'
);

select set_config('request.jwt.claims', '{"sub":"d3000000-0000-0000-0000-0000000000a1","email":"zz-d3-admin@zztest.local","role":"authenticated"}', true);

select is(
  public.admin_remove_guardian_from_family('d3000000-0000-0000-0000-0000000000f2', 'd3000000-0000-0000-0000-000000000062'),
  'unlinked',
  'D3 FAM-06: removing a guardian who is in another family returns unlinked'
);

reset role;

select ok(
  exists (select 1 from public.guardians where id = 'd3000000-0000-0000-0000-000000000062'),
  'D3 FAM-06: an unlinked guardian row is kept'
);

select ok(
  not exists (
    select 1 from public.student_guardians
    where guardian_id = 'd3000000-0000-0000-0000-000000000062'
      and family_id = 'd3000000-0000-0000-0000-0000000000f2'
  ),
  'D3 FAM-06: the unlinked guardian loses the children of that family'
);

select ok(
  exists (
    select 1 from public.student_guardians
    where guardian_id = 'd3000000-0000-0000-0000-000000000062'
      and student_id = 'd3000000-0000-0000-0000-000000000051'
  ),
  'D3 FAM-06: the unlinked guardian keeps the children of the other family'
);

select set_config('request.jwt.claims', '{"sub":"d3000000-0000-0000-0000-0000000000a1","email":"zz-d3-admin@zztest.local","role":"authenticated"}', true);
set local role authenticated;

select is(
  public.admin_remove_guardian_from_family('d3000000-0000-0000-0000-0000000000f1', 'd3000000-0000-0000-0000-000000000061'),
  'deleted',
  'D3 FAM-06: removing a guardian with no other family and not a teacher returns deleted'
);

reset role;

select ok(
  not exists (select 1 from public.guardians where id = 'd3000000-0000-0000-0000-000000000061'),
  'D3 FAM-06: the deleted guardian row is gone'
);

select is(
  (select count(*) from public.student_guardians where guardian_id = 'd3000000-0000-0000-0000-000000000061'),
  0::bigint,
  'D3 FAM-06: the deleted guardian has no student links left'
);

select set_config('request.jwt.claims', '{"sub":"d3000000-0000-0000-0000-0000000000a1","email":"zz-d3-admin@zztest.local","role":"authenticated"}', true);
set local role authenticated;

select throws_ok(
  $$ select public.admin_remove_guardian_from_family('d3000000-0000-0000-0000-0000000000f1', 'd3000000-0000-0000-0000-000000000062') $$,
  'P0001',
  null,
  'D3 FAM-06: removing the last guardian of a family is refused'
);

select is(
  public.admin_remove_guardian_from_family('d3000000-0000-0000-0000-0000000000f3', 'd3000000-0000-0000-0000-000000000063'),
  'unlinked',
  'D3 FAM-06: removing a teacher from a family returns unlinked'
);

reset role;

select is(
  (select count(*) from public.class_teachers where guardian_id = 'd3000000-0000-0000-0000-000000000063'),
  1::bigint,
  'D3 FAM-06: a teacher removed from a family keeps the guardian row and class links'
);

select * from finish();

rollback;
