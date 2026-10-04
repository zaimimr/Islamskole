begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(9);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into auth.users (id, email, raw_app_meta_data)
values
  ('f4000000-0000-0000-0000-0000000000a1', 'zz-f4-teacher@zztest.local', '{"role":"member"}'),
  ('f4000000-0000-0000-0000-0000000000a2', 'zz-f4-parent@zztest.local', '{"role":"member"}');

update public.school_years set is_active = false where is_active;

insert into public.school_years (id, label, starts_on, ends_on, is_active)
values ('f4000000-0000-0000-0000-000000000001', 'ZZTEST F4 aktiv',
  (now() at time zone 'Europe/Oslo')::date - 60, (now() at time zone 'Europe/Oslo')::date + 200, true);

insert into public.guardians (id, first_name, last_name, email, is_teacher)
values
  ('f4000000-0000-0000-0000-000000000061', 'ZZTEST', 'Laerer', 'zz-f4-teacher@zztest.local', true),
  ('f4000000-0000-0000-0000-000000000062', 'ZZTEST', 'Annen laerer', 'zz-f4-other@zztest.local', true),
  ('f4000000-0000-0000-0000-000000000063', 'ZZTEST', 'Forelder', 'zz-f4-parent@zztest.local', false);

insert into public.school_days (id, school_year_id, date)
values
  ('f4000000-0000-0000-0000-0000000000d1', 'f4000000-0000-0000-0000-000000000001', (now() at time zone 'Europe/Oslo')::date - 7),
  ('f4000000-0000-0000-0000-0000000000d2', 'f4000000-0000-0000-0000-000000000001', (now() at time zone 'Europe/Oslo')::date + 7),
  ('f4000000-0000-0000-0000-0000000000d3', 'f4000000-0000-0000-0000-000000000001', (now() at time zone 'Europe/Oslo')::date + 14);

insert into public.teacher_absences (guardian_id, school_day_id, notified, source)
values ('f4000000-0000-0000-0000-000000000061', 'f4000000-0000-0000-0000-0000000000d3', false, 'admin');

select set_config('request.jwt.claims', '{"sub":"f4000000-0000-0000-0000-0000000000a1","email":"zz-f4-teacher@zztest.local","role":"authenticated"}', true);
set local role authenticated;

select lives_ok(
  $$ insert into public.teacher_absences (guardian_id, school_day_id, source)
     values ('f4000000-0000-0000-0000-000000000061', 'f4000000-0000-0000-0000-0000000000d2', 'laerer') $$,
  'a teacher reports their own absence for an upcoming day'
);

select throws_ok(
  $$ insert into public.teacher_absences (guardian_id, school_day_id, source)
     values ('f4000000-0000-0000-0000-000000000061', 'f4000000-0000-0000-0000-0000000000d1', 'laerer') $$,
  '42501', null,
  'a teacher cannot report absence for a past day'
);

select throws_ok(
  $$ insert into public.teacher_absences (guardian_id, school_day_id, source)
     values ('f4000000-0000-0000-0000-000000000062', 'f4000000-0000-0000-0000-0000000000d2', 'laerer') $$,
  '42501', null,
  'a teacher cannot report absence for another teacher'
);

select throws_ok(
  $$ insert into public.teacher_absences (guardian_id, school_day_id, source)
     values ('f4000000-0000-0000-0000-000000000061', 'f4000000-0000-0000-0000-0000000000d2', 'laerer') $$,
  '23505', null,
  'one absence per teacher and day'
);

select throws_ok(
  $$ insert into public.teacher_absences (guardian_id, school_day_id, source, notified)
     values ('f4000000-0000-0000-0000-000000000061', 'f4000000-0000-0000-0000-0000000000d1', 'admin', false) $$,
  '42501', null,
  'a teacher cannot register an unnotified absence'
);

select is(
  (select count(*)::int from public.teacher_absences),
  2,
  'a teacher sees their own absences, also those the school registered'
);

delete from public.teacher_absences where school_day_id = 'f4000000-0000-0000-0000-0000000000d3';

select is(
  (select count(*)::int from public.teacher_absences where school_day_id = 'f4000000-0000-0000-0000-0000000000d3'),
  1,
  'a teacher cannot remove an absence the school registered'
);

update public.teacher_absences set notified = true where school_day_id = 'f4000000-0000-0000-0000-0000000000d3';

select is(
  (select notified from public.teacher_absences where school_day_id = 'f4000000-0000-0000-0000-0000000000d3'),
  false,
  'a teacher cannot change whether the absence was notified'
);

select set_config('request.jwt.claims', '{"sub":"f4000000-0000-0000-0000-0000000000a2","email":"zz-f4-parent@zztest.local","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.teacher_absences),
  0,
  'a parent sees no teacher absences'
);

select * from finish();
rollback;
