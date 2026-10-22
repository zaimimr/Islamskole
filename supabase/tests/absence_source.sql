begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(12);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into auth.users (id, email, raw_app_meta_data)
values
  ('f3000000-0000-0000-0000-0000000000a2', 'zz-f3-teacher@zztest.local', '{"role":"member"}'),
  ('f3000000-0000-0000-0000-0000000000a3', 'zz-f3-other-teacher@zztest.local', '{"role":"member"}'),
  ('f3000000-0000-0000-0000-0000000000a4', 'zz-f3-parent@zztest.local', '{"role":"member"}');

update public.school_years set is_active = false where is_active;

insert into public.school_years (id, label, starts_on, ends_on, is_active)
values ('f3000000-0000-0000-0000-000000000001', 'ZZTEST F3 aktiv',
  (now() at time zone 'Europe/Oslo')::date - 60, (now() at time zone 'Europe/Oslo')::date + 200, true);

insert into public.classes (id, slug, name_no, name_en)
values
  ('f3000000-0000-0000-0000-0000000000c1', 'zztest-f3-a', 'ZZTEST F3 A', 'ZZTEST F3 A'),
  ('f3000000-0000-0000-0000-0000000000c2', 'zztest-f3-b', 'ZZTEST F3 B', 'ZZTEST F3 B');

insert into public.families (id, origin)
values ('f3000000-0000-0000-0000-0000000000f1', 'test');

insert into public.guardians (id, first_name, last_name, email)
values
  ('f3000000-0000-0000-0000-000000000061', 'ZZTEST', 'Laerer', 'zz-f3-teacher@zztest.local'),
  ('f3000000-0000-0000-0000-000000000062', 'ZZTEST', 'Annen laerer', 'zz-f3-other-teacher@zztest.local'),
  ('f3000000-0000-0000-0000-000000000063', 'ZZTEST', 'Forelder', 'zz-f3-parent@zztest.local');
insert into public.person_roles (guardian_id, role_key) values ('f3000000-0000-0000-0000-000000000061', 'teacher'), ('f3000000-0000-0000-0000-000000000062', 'teacher');

insert into public.students (id, family_id, child_first_name, child_last_name)
values
  ('f3000000-0000-0000-0000-000000000051', 'f3000000-0000-0000-0000-0000000000f1', 'ZZTEST', 'Elev A'),
  ('f3000000-0000-0000-0000-000000000052', 'f3000000-0000-0000-0000-0000000000f1', 'ZZTEST', 'Elev B');

insert into public.family_guardians (family_id, guardian_id, is_primary_contact)
values ('f3000000-0000-0000-0000-0000000000f1', 'f3000000-0000-0000-0000-000000000063', true);

insert into public.student_guardians (student_id, family_id, guardian_id)
values
  ('f3000000-0000-0000-0000-000000000051', 'f3000000-0000-0000-0000-0000000000f1', 'f3000000-0000-0000-0000-000000000063'),
  ('f3000000-0000-0000-0000-000000000052', 'f3000000-0000-0000-0000-0000000000f1', 'f3000000-0000-0000-0000-000000000063')
on conflict do nothing;

insert into public.enrollments (student_id, class_id, school_year_id, status)
values
  ('f3000000-0000-0000-0000-000000000051', 'f3000000-0000-0000-0000-0000000000c1', 'f3000000-0000-0000-0000-000000000001', 'aktiv'),
  ('f3000000-0000-0000-0000-000000000052', 'f3000000-0000-0000-0000-0000000000c1', 'f3000000-0000-0000-0000-000000000001', 'aktiv');

insert into public.class_teachers (class_id, guardian_id, school_year_id)
values
  ('f3000000-0000-0000-0000-0000000000c1', 'f3000000-0000-0000-0000-000000000061', 'f3000000-0000-0000-0000-000000000001'),
  ('f3000000-0000-0000-0000-0000000000c2', 'f3000000-0000-0000-0000-000000000062', 'f3000000-0000-0000-0000-000000000001');

insert into public.school_days (id, school_year_id, date)
values
  ('f3000000-0000-0000-0000-0000000000d1', 'f3000000-0000-0000-0000-000000000001', (now() at time zone 'Europe/Oslo')::date - 7),
  ('f3000000-0000-0000-0000-0000000000d3', 'f3000000-0000-0000-0000-000000000001', (now() at time zone 'Europe/Oslo')::date + 7);

insert into public.attendance (student_id, school_day_id, lesson_id, status)
select 'f3000000-0000-0000-0000-000000000052', l.school_day_id, l.id, 'fravaer'
from public.lessons l
where l.class_id = 'f3000000-0000-0000-0000-0000000000c1' and l.school_day_id = 'f3000000-0000-0000-0000-0000000000d1';

select set_config('request.jwt.claims', '{"sub":"f3000000-0000-0000-0000-0000000000a2","email":"zz-f3-teacher@zztest.local","role":"authenticated"}', true);
set local role authenticated;

select lives_ok(
  $$ insert into public.absence_reports (student_id, school_day_id, source, reported_by)
     values ('f3000000-0000-0000-0000-000000000051', 'f3000000-0000-0000-0000-0000000000d3', 'laerer', 'f3000000-0000-0000-0000-0000000000a2') $$,
  'a class teacher records an absence the parent told them about for an upcoming day'
);

select is(
  (select count(*) from public.attendance
   where student_id = 'f3000000-0000-0000-0000-000000000051'
     and school_day_id = 'f3000000-0000-0000-0000-0000000000d3'
     and status = 'meldt_fravaer'),
  1::bigint,
  'the teacher report marks the lesson as reported absent'
);

select is(
  (select absence_source from public.portal_lesson_roster(
     (select id from public.lessons where class_id = 'f3000000-0000-0000-0000-0000000000c1' and school_day_id = 'f3000000-0000-0000-0000-0000000000d3' limit 1))
   where student_id = 'f3000000-0000-0000-0000-000000000051'),
  'laerer',
  'the roster shows that the absence was told to the teacher'
);

select throws_ok(
  $$ insert into public.absence_reports (student_id, school_day_id, source, reported_by)
     values ('f3000000-0000-0000-0000-000000000052', 'f3000000-0000-0000-0000-0000000000d3', 'app', 'f3000000-0000-0000-0000-0000000000a2') $$,
  '42501',
  null,
  'a teacher cannot record an absence as reported in the app'
);

select lives_ok(
  $$ insert into public.absence_reports (student_id, school_day_id, source, reported_by)
     values ('f3000000-0000-0000-0000-000000000052', 'f3000000-0000-0000-0000-0000000000d1', 'laerer', 'f3000000-0000-0000-0000-0000000000a2') $$,
  'a teacher records a reported absence after the day'
);

select is(
  (select status from public.attendance
   where student_id = 'f3000000-0000-0000-0000-000000000052'
     and school_day_id = 'f3000000-0000-0000-0000-0000000000d1'),
  'meldt_fravaer',
  'an unreported absence turns into a reported one'
);

update public.absence_reports set withdrawn_at = now()
where student_id = 'f3000000-0000-0000-0000-000000000051' and school_day_id = 'f3000000-0000-0000-0000-0000000000d3';

select is(
  (select count(*) from public.attendance
   where student_id = 'f3000000-0000-0000-0000-000000000051'
     and school_day_id = 'f3000000-0000-0000-0000-0000000000d3'),
  0::bigint,
  'the teacher withdraws their own report'
);

select set_config('request.jwt.claims', '{"sub":"f3000000-0000-0000-0000-0000000000a3","email":"zz-f3-other-teacher@zztest.local","role":"authenticated"}', true);

select throws_ok(
  $$ insert into public.absence_reports (student_id, school_day_id, source, reported_by)
     values ('f3000000-0000-0000-0000-000000000051', 'f3000000-0000-0000-0000-0000000000d3', 'laerer', 'f3000000-0000-0000-0000-0000000000a3') $$,
  '42501',
  null,
  'a teacher of another class cannot record an absence'
);

select set_config('request.jwt.claims', '{"sub":"f3000000-0000-0000-0000-0000000000a4","email":"zz-f3-parent@zztest.local","role":"authenticated"}', true);

select throws_ok(
  $$ insert into public.absence_reports (student_id, school_day_id, source, reported_by_guardian_id)
     values ('f3000000-0000-0000-0000-000000000051', 'f3000000-0000-0000-0000-0000000000d3', 'laerer', 'f3000000-0000-0000-0000-000000000063') $$,
  '42501',
  null,
  'a parent cannot pose as the teacher'
);

select lives_ok(
  $$ insert into public.absence_reports (student_id, school_day_id, reason, reported_by_guardian_id)
     values ('f3000000-0000-0000-0000-000000000051', 'f3000000-0000-0000-0000-0000000000d3', 'ZZTEST syk', 'f3000000-0000-0000-0000-000000000063') $$,
  'a parent reports an absence in the app'
);

select set_config('request.jwt.claims', '{"sub":"f3000000-0000-0000-0000-0000000000a2","email":"zz-f3-teacher@zztest.local","role":"authenticated"}', true);

update public.absence_reports set withdrawn_at = now()
where student_id = 'f3000000-0000-0000-0000-000000000051' and school_day_id = 'f3000000-0000-0000-0000-0000000000d3';

select is(
  (select source from public.absence_reports
   where student_id = 'f3000000-0000-0000-0000-000000000051'
     and school_day_id = 'f3000000-0000-0000-0000-0000000000d3'
     and withdrawn_at is null),
  'app',
  'a teacher cannot withdraw a report the parent made in the app'
);

select is(
  (select count(*) from public.attendance
   where student_id = 'f3000000-0000-0000-0000-000000000051'
     and school_day_id = 'f3000000-0000-0000-0000-0000000000d3'
     and status = 'meldt_fravaer'),
  1::bigint,
  'the app report still marks the lesson'
);

select * from finish();

rollback;
