begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(16);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into auth.users (id, email, raw_app_meta_data)
values
  ('f2000000-0000-0000-0000-0000000000a1', 'zz-f2-admin@zztest.local', '{"role":"admin"}'),
  ('f2000000-0000-0000-0000-0000000000a2', 'zz-f2-teacher@zztest.local', '{"role":"member"}'),
  ('f2000000-0000-0000-0000-0000000000a3', 'zz-f2-other-teacher@zztest.local', '{"role":"member"}'),
  ('f2000000-0000-0000-0000-0000000000a4', 'zz-f2-parent@zztest.local', '{"role":"member"}'),
  ('f2000000-0000-0000-0000-0000000000a5', 'zz-f2-other-parent@zztest.local', '{"role":"member"}'),
  ('f2000000-0000-0000-0000-0000000000a6', 'zz-f2-student@zztest.local', '{"role":"member"}');

update public.school_years set is_active = false where is_active;

insert into public.school_years (id, label, starts_on, ends_on, is_active)
values
  ('f2000000-0000-0000-0000-000000000001', 'ZZTEST F2 aktiv',
   (now() at time zone 'Europe/Oslo')::date - 60, (now() at time zone 'Europe/Oslo')::date + 200, true),
  ('f2000000-0000-0000-0000-000000000002', 'ZZTEST F2 gammel',
   (now() at time zone 'Europe/Oslo')::date - 400, (now() at time zone 'Europe/Oslo')::date - 61, false);

insert into public.classes (id, slug, name_no, name_en)
values
  ('f2000000-0000-0000-0000-0000000000c1', 'zztest-f2-a', 'ZZTEST F2 A', 'ZZTEST F2 A'),
  ('f2000000-0000-0000-0000-0000000000c2', 'zztest-f2-b', 'ZZTEST F2 B', 'ZZTEST F2 B');

insert into public.families (id, origin)
values
  ('f2000000-0000-0000-0000-0000000000f1', 'test'),
  ('f2000000-0000-0000-0000-0000000000f2', 'test');

insert into public.guardians (id, first_name, last_name, email)
values
  ('f2000000-0000-0000-0000-000000000061', 'ZZTEST', 'Laerer', 'zz-f2-teacher@zztest.local'),
  ('f2000000-0000-0000-0000-000000000062', 'ZZTEST', 'Annen laerer', 'zz-f2-other-teacher@zztest.local'),
  ('f2000000-0000-0000-0000-000000000063', 'ZZTEST', 'Forelder', 'zz-f2-parent@zztest.local'),
  ('f2000000-0000-0000-0000-000000000064', 'ZZTEST', 'Annen forelder', 'zz-f2-other-parent@zztest.local');
insert into public.person_roles (guardian_id, role_key) values ('f2000000-0000-0000-0000-000000000061', 'teacher'), ('f2000000-0000-0000-0000-000000000062', 'teacher');

insert into public.students (id, family_id, child_first_name, child_last_name, child_email)
values
  ('f2000000-0000-0000-0000-000000000051', 'f2000000-0000-0000-0000-0000000000f1', 'ZZTEST', 'Elev A', 'zz-f2-student@zztest.local'),
  ('f2000000-0000-0000-0000-000000000052', 'f2000000-0000-0000-0000-0000000000f2', 'ZZTEST', 'Elev B', null);

insert into public.family_guardians (family_id, guardian_id, is_primary_contact)
values
  ('f2000000-0000-0000-0000-0000000000f1', 'f2000000-0000-0000-0000-000000000063', true),
  ('f2000000-0000-0000-0000-0000000000f2', 'f2000000-0000-0000-0000-000000000064', true);

insert into public.student_guardians (student_id, family_id, guardian_id)
values
  ('f2000000-0000-0000-0000-000000000051', 'f2000000-0000-0000-0000-0000000000f1', 'f2000000-0000-0000-0000-000000000063'),
  ('f2000000-0000-0000-0000-000000000052', 'f2000000-0000-0000-0000-0000000000f2', 'f2000000-0000-0000-0000-000000000064')
on conflict do nothing;

insert into public.enrollments (student_id, class_id, school_year_id, status)
values
  ('f2000000-0000-0000-0000-000000000051', 'f2000000-0000-0000-0000-0000000000c1', 'f2000000-0000-0000-0000-000000000001', 'aktiv'),
  ('f2000000-0000-0000-0000-000000000052', 'f2000000-0000-0000-0000-0000000000c2', 'f2000000-0000-0000-0000-000000000001', 'aktiv');

insert into public.class_teachers (class_id, guardian_id, school_year_id)
values
  ('f2000000-0000-0000-0000-0000000000c1', 'f2000000-0000-0000-0000-000000000061', 'f2000000-0000-0000-0000-000000000001'),
  ('f2000000-0000-0000-0000-0000000000c2', 'f2000000-0000-0000-0000-000000000062', 'f2000000-0000-0000-0000-000000000001');

insert into public.class_week_plans (id, class_id, school_year_id, week_start, title)
values (
  'f2000000-0000-0000-0000-0000000000e9',
  'f2000000-0000-0000-0000-0000000000c1',
  'f2000000-0000-0000-0000-000000000002',
  date_trunc('week', (now() at time zone 'Europe/Oslo')::date - 100)::date,
  'Gammel plan'
);

select set_config('request.jwt.claims', '{"sub":"f2000000-0000-0000-0000-0000000000a1","email":"zz-f2-admin@zztest.local","role":"authenticated"}', true);
set local role authenticated;

select lives_ok(
  $$ insert into public.class_week_plans (id, class_id, school_year_id, week_start, start_position, end_position, subject, title, description)
     values ('f2000000-0000-0000-0000-0000000000e1', 'f2000000-0000-0000-0000-0000000000c1', 'f2000000-0000-0000-0000-000000000001',
             date_trunc('week', (now() at time zone 'Europe/Oslo')::date)::date, 1, 1, 'Islam', 'Profetens liv', 'Vi leser om Mekka') $$,
  'an admin adds a week plan entry'
);

select throws_ok(
  $$ insert into public.class_week_plans (class_id, school_year_id, week_start, title)
     values ('f2000000-0000-0000-0000-0000000000c1', 'f2000000-0000-0000-0000-000000000001',
             date_trunc('week', (now() at time zone 'Europe/Oslo')::date)::date + 2, 'Onsdag') $$,
  '23514',
  null,
  'a week must start on a Monday'
);

select throws_ok(
  $$ insert into public.class_week_plans (class_id, school_year_id, week_start, title, resource_url)
     values ('f2000000-0000-0000-0000-0000000000c1', 'f2000000-0000-0000-0000-000000000001',
             date_trunc('week', (now() at time zone 'Europe/Oslo')::date)::date, 'Lenke', 'javascript:alert(1)') $$,
  '23514',
  null,
  'resource links must be http or https'
);

select set_config('request.jwt.claims', '{"sub":"f2000000-0000-0000-0000-0000000000a4","email":"zz-f2-parent@zztest.local","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.class_week_plans where class_id = 'f2000000-0000-0000-0000-0000000000c1'),
  1,
  'a guardian of an enrolled child reads the plan for the active year only'
);

select throws_ok(
  $$ insert into public.class_week_plans (class_id, school_year_id, week_start, title)
     values ('f2000000-0000-0000-0000-0000000000c1', 'f2000000-0000-0000-0000-000000000001',
             date_trunc('week', (now() at time zone 'Europe/Oslo')::date)::date, 'Forelder skriver') $$,
  '42501',
  null,
  'a guardian cannot add to the plan'
);

select set_config('request.jwt.claims', '{"sub":"f2000000-0000-0000-0000-0000000000a5","email":"zz-f2-other-parent@zztest.local","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.class_week_plans where class_id = 'f2000000-0000-0000-0000-0000000000c1'),
  0,
  'a guardian from another family cannot read the plan'
);

select set_config('request.jwt.claims', '{"sub":"f2000000-0000-0000-0000-0000000000a6","email":"zz-f2-student@zztest.local","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.class_week_plans where class_id = 'f2000000-0000-0000-0000-0000000000c1'),
  1,
  'the student reads their own class plan'
);

select set_config('request.jwt.claims', '{"sub":"f2000000-0000-0000-0000-0000000000a2","email":"zz-f2-teacher@zztest.local","role":"authenticated"}', true);

select lives_ok(
  $$ insert into public.class_week_plans (id, class_id, school_year_id, week_start, title, created_by)
     values ('f2000000-0000-0000-0000-0000000000e2', 'f2000000-0000-0000-0000-0000000000c1', 'f2000000-0000-0000-0000-000000000001',
             date_trunc('week', (now() at time zone 'Europe/Oslo')::date)::date + 7, 'Bønn', 'f2000000-0000-0000-0000-0000000000a5') $$,
  'a class teacher adds to the plan'
);

select is(
  (select created_by from public.class_week_plans where id = 'f2000000-0000-0000-0000-0000000000e2'),
  'f2000000-0000-0000-0000-0000000000a2'::uuid,
  'created_by is the signed in user, not what the client sent'
);

update public.class_week_plans set title = 'Bønn og wudu' where id = 'f2000000-0000-0000-0000-0000000000e1';

select is(
  (select title from public.class_week_plans where id = 'f2000000-0000-0000-0000-0000000000e1'),
  'Bønn og wudu',
  'a class teacher edits the plan'
);

select throws_ok(
  $$ insert into public.class_week_plans (class_id, school_year_id, week_start, title)
     values ('f2000000-0000-0000-0000-0000000000c1', 'f2000000-0000-0000-0000-000000000002',
             date_trunc('week', (now() at time zone 'Europe/Oslo')::date - 100)::date, 'Gammelt år') $$,
  '42501',
  null,
  'a teacher cannot write into an inactive school year'
);

select throws_ok(
  $$ update public.class_week_plans set class_id = 'f2000000-0000-0000-0000-0000000000c2'
     where id = 'f2000000-0000-0000-0000-0000000000e1' $$,
  '42501',
  null,
  'a teacher cannot move an entry to a class they do not teach'
);

select set_config('request.jwt.claims', '{"sub":"f2000000-0000-0000-0000-0000000000a3","email":"zz-f2-other-teacher@zztest.local","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.class_week_plans where class_id = 'f2000000-0000-0000-0000-0000000000c1'),
  0,
  'a teacher of another class cannot read the plan'
);

delete from public.class_week_plans where id = 'f2000000-0000-0000-0000-0000000000e1';

select set_config('request.jwt.claims', '{"sub":"f2000000-0000-0000-0000-0000000000a2","email":"zz-f2-teacher@zztest.local","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.class_week_plans where id = 'f2000000-0000-0000-0000-0000000000e1'),
  1,
  'a teacher of another class cannot delete from the plan'
);

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  $$ select count(*) from public.class_week_plans $$,
  '42501',
  null,
  'anonymous visitors cannot read any plan'
);

reset role;

select is(
  (select count(*)::int from public.class_week_plans where class_id = 'f2000000-0000-0000-0000-0000000000c1'),
  3,
  'the old year entry and both active year entries are stored'
);

select * from finish();

rollback;
