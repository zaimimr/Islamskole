begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(41);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into auth.users (id, email, raw_app_meta_data)
values
  ('f1000000-0000-0000-0000-0000000000a1', 'zz-f1-admin@zztest.local', '{"role":"admin"}'),
  ('f1000000-0000-0000-0000-0000000000a2', 'zz-f1-islam@zztest.local', '{"role":"member"}'),
  ('f1000000-0000-0000-0000-0000000000a3', 'zz-f1-koran@zztest.local', '{"role":"member"}'),
  ('f1000000-0000-0000-0000-0000000000a4', 'zz-f1-vikar@zztest.local', '{"role":"member"}'),
  ('f1000000-0000-0000-0000-0000000000a5', 'zz-f1-parent@zztest.local', '{"role":"member"}'),
  ('f1000000-0000-0000-0000-0000000000a6', 'zz-f1-medlaerer@zztest.local', '{"role":"member"}');

update public.school_years set is_active = false where is_active;

insert into public.school_years (id, label, starts_on, ends_on, is_active)
values (
  'f1000000-0000-0000-0000-000000000001',
  'ZZTEST F1 aktiv',
  (now() at time zone 'Europe/Oslo')::date - 60,
  (now() at time zone 'Europe/Oslo')::date + 200,
  true
);

select is(
  (select string_agg(label || ' ' || to_char(starts_at, 'HH24:MI') || '-' || to_char(ends_at, 'HH24:MI'), ', ' order by position)
   from public.school_time_slots where school_year_id = 'f1000000-0000-0000-0000-000000000001'),
  'Time 1 10:00-11:00, Time 2 11:00-12:00, Time 3 13:00-14:00',
  'a new school year gets the three default time slots'
);

insert into public.classes (id, slug, name_no, name_en)
values
  ('f1000000-0000-0000-0000-0000000000c1', 'zztest-f1-a', 'ZZTEST F1 A', 'ZZTEST F1 A'),
  ('f1000000-0000-0000-0000-0000000000c2', 'zztest-f1-b', 'ZZTEST F1 B', 'ZZTEST F1 B');

insert into public.families (id, origin)
values ('f1000000-0000-0000-0000-0000000000f1', 'test');

insert into public.guardians (id, first_name, last_name, email)
values
  ('f1000000-0000-0000-0000-000000000061', 'ZZTEST', 'Islam', 'zz-f1-islam@zztest.local'),
  ('f1000000-0000-0000-0000-000000000062', 'ZZTEST', 'Koran', 'zz-f1-koran@zztest.local'),
  ('f1000000-0000-0000-0000-000000000063', 'ZZTEST', 'Vikar', 'zz-f1-vikar@zztest.local'),
  ('f1000000-0000-0000-0000-000000000064', 'ZZTEST', 'Forelder', 'zz-f1-parent@zztest.local'),
  ('f1000000-0000-0000-0000-000000000065', 'ZZTEST', 'Medlaerer', 'zz-f1-medlaerer@zztest.local');
insert into public.person_roles (guardian_id, role_key) values ('f1000000-0000-0000-0000-000000000061', 'teacher'), ('f1000000-0000-0000-0000-000000000062', 'teacher'), ('f1000000-0000-0000-0000-000000000063', 'teacher'), ('f1000000-0000-0000-0000-000000000065', 'teacher');

insert into public.family_guardians (family_id, guardian_id, is_primary_contact)
values ('f1000000-0000-0000-0000-0000000000f1', 'f1000000-0000-0000-0000-000000000064', true);

insert into public.students (id, family_id, child_first_name, child_last_name)
values
  ('f1000000-0000-0000-0000-000000000051', 'f1000000-0000-0000-0000-0000000000f1', 'ZZTEST', 'Elev A'),
  ('f1000000-0000-0000-0000-000000000052', null, 'ZZTEST', 'Elev B');

insert into public.enrollments (student_id, class_id, school_year_id, status)
values
  ('f1000000-0000-0000-0000-000000000051', 'f1000000-0000-0000-0000-0000000000c1', 'f1000000-0000-0000-0000-000000000001', 'aktiv'),
  ('f1000000-0000-0000-0000-000000000052', 'f1000000-0000-0000-0000-0000000000c2', 'f1000000-0000-0000-0000-000000000001', 'aktiv');

insert into public.school_days (id, school_year_id, date)
values
  ('f1000000-0000-0000-0000-0000000000d1', 'f1000000-0000-0000-0000-000000000001', (now() at time zone 'Europe/Oslo')::date - 7),
  ('f1000000-0000-0000-0000-0000000000d2', 'f1000000-0000-0000-0000-000000000001', (now() at time zone 'Europe/Oslo')::date),
  ('f1000000-0000-0000-0000-0000000000d3', 'f1000000-0000-0000-0000-000000000001', (now() at time zone 'Europe/Oslo')::date + 7);

select is(
  (select string_agg(start_position || '-' || end_position, ',') from public.lessons
   where class_id = 'f1000000-0000-0000-0000-0000000000c1' and school_day_id = 'f1000000-0000-0000-0000-0000000000d2'),
  '1-3',
  'a class without a weekly plan gets one lesson covering the whole day'
);

insert into public.attendance (student_id, school_day_id, status)
values ('f1000000-0000-0000-0000-000000000051', 'f1000000-0000-0000-0000-0000000000d1', 'til_stede');

select isnt(
  (select lesson_id from public.attendance where student_id = 'f1000000-0000-0000-0000-000000000051' and school_day_id = 'f1000000-0000-0000-0000-0000000000d1'),
  null::uuid,
  'attendance written per day is placed on the lesson of that day'
);

select set_config('request.jwt.claims', '{"sub":"f1000000-0000-0000-0000-0000000000a2","email":"zz-f1-islam@zztest.local","role":"authenticated"}', true);
set local role authenticated;

select throws_ok(
  $$ select public.admin_save_class_slot_plans('f1000000-0000-0000-0000-0000000000c1', 'f1000000-0000-0000-0000-000000000001', '[]'::jsonb) $$,
  '42501',
  null,
  'a teacher cannot change the weekly plan'
);

select set_config('request.jwt.claims', '{"sub":"f1000000-0000-0000-0000-0000000000a1","email":"zz-f1-admin@zztest.local","role":"authenticated"}', true);

select throws_ok(
  $$ select public.admin_save_class_slot_plans('f1000000-0000-0000-0000-0000000000c1', 'f1000000-0000-0000-0000-000000000001',
       '[{"start_position":1,"end_position":2,"subject":"Islam"},{"start_position":2,"end_position":3,"subject":"Koran"}]'::jsonb) $$,
  '23P01',
  null,
  'overlapping slots in a weekly plan are refused'
);

select is(
  public.admin_save_class_slot_plans('f1000000-0000-0000-0000-0000000000c1', 'f1000000-0000-0000-0000-000000000001',
    '[{"start_position":1,"end_position":1,"subject":"Islam","teacher_guardian_id":"f1000000-0000-0000-0000-000000000061"},
      {"start_position":2,"end_position":3,"subject":"Koran","teacher_guardian_id":"f1000000-0000-0000-0000-000000000062"}]'::jsonb),
  2,
  'admin saves a weekly plan with a merged slot'
);

select is(
  (select string_agg(start_position || '-' || end_position || ' ' || subject, ',' order by start_position) from public.lessons
   where class_id = 'f1000000-0000-0000-0000-0000000000c1' and school_day_id = 'f1000000-0000-0000-0000-0000000000d3'),
  '1-1 Islam,2-3 Koran',
  'upcoming days follow the new weekly plan'
);

select is(
  (select string_agg(start_position || '-' || end_position, ',') from public.lessons
   where class_id = 'f1000000-0000-0000-0000-0000000000c1' and school_day_id = 'f1000000-0000-0000-0000-0000000000d1'),
  '1-3',
  'a past day with attendance keeps its lesson'
);

select is(
  (select count(*) from public.class_teachers
   where class_id = 'f1000000-0000-0000-0000-0000000000c1'
     and school_year_id = 'f1000000-0000-0000-0000-000000000001'),
  2::bigint,
  'plan teachers become teachers of the class'
);

select is(
  public.admin_save_class_slot_plans('f1000000-0000-0000-0000-0000000000c1', 'f1000000-0000-0000-0000-000000000001',
    '[{"start_position":1,"end_position":1,"subject":"Islam","teacher_guardian_id":"f1000000-0000-0000-0000-000000000061"},
      {"start_position":2,"end_position":3,"subject":"Koran","teacher_guardian_id":"f1000000-0000-0000-0000-000000000062"}]'::jsonb),
  2,
  'saving the same plan again works'
);

select is(
  (select count(*) from public.lessons
   where class_id = 'f1000000-0000-0000-0000-0000000000c1' and school_day_id = 'f1000000-0000-0000-0000-0000000000d3'),
  2::bigint,
  'saving the same plan again does not duplicate lessons'
);

select lives_ok(
  $$ select public.admin_update_lesson(
       (select id from public.lessons where class_id = 'f1000000-0000-0000-0000-0000000000c1' and school_day_id = 'f1000000-0000-0000-0000-0000000000d2' and start_position = 1),
       'Islam', 'f1000000-0000-0000-0000-000000000063', false, null) $$,
  'admin assigns a substitute for one lesson'
);

select is(
  (select is_substitute from public.lessons where class_id = 'f1000000-0000-0000-0000-0000000000c1' and school_day_id = 'f1000000-0000-0000-0000-0000000000d2' and start_position = 1),
  true,
  'the lesson is marked as taught by a substitute'
);

reset role;

create temporary table f1_koran on commit drop as
select id from public.lessons
where class_id = 'f1000000-0000-0000-0000-0000000000c1'
  and school_day_id = 'f1000000-0000-0000-0000-0000000000d2'
  and start_position = 2;

grant select on f1_koran to authenticated;

select set_config('request.jwt.claims', '{"sub":"f1000000-0000-0000-0000-0000000000a4","email":"zz-f1-vikar@zztest.local","role":"authenticated"}', true);
set local role authenticated;

select is(
  (select count(*) from public.portal_my_lessons((now() at time zone 'Europe/Oslo')::date, (now() at time zone 'Europe/Oslo')::date + 14)),
  1::bigint,
  'the substitute sees the one lesson assigned to them'
);

select is(
  (select attendance_status from public.portal_lesson_roster(
     (select lesson_id from public.portal_my_lessons((now() at time zone 'Europe/Oslo')::date, (now() at time zone 'Europe/Oslo')::date))
   ) where student_id = 'f1000000-0000-0000-0000-000000000051'),
  null::text,
  'the substitute can open the roster of their lesson'
);

select lives_ok(
  $$
    insert into public.attendance (student_id, lesson_id, status)
    select 'f1000000-0000-0000-0000-000000000051', lesson_id, 'til_stede'
    from public.portal_my_lessons((now() at time zone 'Europe/Oslo')::date, (now() at time zone 'Europe/Oslo')::date)
  $$,
  'the substitute marks attendance for their lesson'
);

select lives_ok(
  $$
    insert into public.class_notes (lesson_id, class_id, school_day_id, homework)
    select lesson_id, class_id, school_day_id, 'ZZTEST lekse'
    from public.portal_my_lessons((now() at time zone 'Europe/Oslo')::date, (now() at time zone 'Europe/Oslo')::date)
  $$,
  'the substitute writes homework for their lesson'
);

select throws_ok(
  $$
    insert into public.attendance (student_id, lesson_id, status)
    values (
      'f1000000-0000-0000-0000-000000000051',
      (select id from f1_koran),
      'til_stede'
    )
  $$,
  '42501',
  null,
  'the substitute cannot mark a lesson they do not teach'
);

select set_config('request.jwt.claims', '{"sub":"f1000000-0000-0000-0000-0000000000a1","email":"zz-f1-admin@zztest.local","role":"authenticated"}', true);

select lives_ok(
  $$ select public.admin_update_lesson((select id from f1_koran), 'Koran', 'f1000000-0000-0000-0000-000000000062', false, null,
       'f1000000-0000-0000-0000-000000000065') $$,
  'admin adds a co-teacher to one lesson'
);

select throws_ok(
  $$ select public.admin_update_lesson((select id from f1_koran), 'Koran', 'f1000000-0000-0000-0000-000000000062', false, null,
       'f1000000-0000-0000-0000-000000000062') $$,
  'P0001',
  null,
  'the co-teacher cannot be the same person as the teacher'
);

select set_config('request.jwt.claims', '{"sub":"f1000000-0000-0000-0000-0000000000a4","email":"zz-f1-vikar@zztest.local","role":"authenticated"}', true);

select is(
  public.portal_can_write_lesson_attendance('f1000000-0000-0000-0000-000000000051', (select id from f1_koran)),
  false,
  'an unrelated teacher still cannot mark the co-taught lesson'
);

select set_config('request.jwt.claims', '{"sub":"f1000000-0000-0000-0000-0000000000a6","email":"zz-f1-medlaerer@zztest.local","role":"authenticated"}', true);

select is(
  (select string_agg(teacher_last_name || ' og ' || co_teacher_last_name || ' ' || is_mine::text, ',')
   from public.portal_my_lessons((now() at time zone 'Europe/Oslo')::date, (now() at time zone 'Europe/Oslo')::date)),
  'Koran og Medlaerer true',
  'the co-teacher sees the lesson with both teacher names'
);

select lives_ok(
  $$
    insert into public.attendance (student_id, lesson_id, status)
    values ('f1000000-0000-0000-0000-000000000051', (select id from f1_koran), 'til_stede')
    on conflict (student_id, lesson_id) do update set status = excluded.status
  $$,
  'the co-teacher marks attendance for the lesson'
);

select lives_ok(
  $$
    insert into public.class_notes (lesson_id, class_id, school_day_id, homework)
    select id, 'f1000000-0000-0000-0000-0000000000c1', 'f1000000-0000-0000-0000-0000000000d2', 'ZZTEST medlaerer lekse'
    from f1_koran
  $$,
  'the co-teacher writes homework for the lesson'
);

reset role;
update public.person_roles set suspended_at = now() where guardian_id = 'f1000000-0000-0000-0000-000000000065' and role_key = 'teacher';
set local role authenticated;

select is(
  public.portal_can_write_lesson_attendance('f1000000-0000-0000-0000-000000000051', (select id from f1_koran)),
  false,
  'a suspended co-teacher cannot mark attendance'
);

select is(
  (select count(*) from public.portal_my_lessons((now() at time zone 'Europe/Oslo')::date, (now() at time zone 'Europe/Oslo')::date + 14)),
  0::bigint,
  'a suspended co-teacher loses access to the lesson'
);

select set_config('request.jwt.claims', '{"sub":"f1000000-0000-0000-0000-0000000000a4","email":"zz-f1-vikar@zztest.local","role":"authenticated"}', true);

reset role;
update public.person_roles set suspended_at = now() where guardian_id = 'f1000000-0000-0000-0000-000000000063' and role_key = 'teacher';
set local role authenticated;

select is(
  (select count(*) from public.portal_my_lessons((now() at time zone 'Europe/Oslo')::date, (now() at time zone 'Europe/Oslo')::date + 14)),
  0::bigint,
  'a suspended teacher loses access to their lessons'
);

select set_config('request.jwt.claims', '{"sub":"f1000000-0000-0000-0000-0000000000a5","email":"zz-f1-parent@zztest.local","role":"authenticated"}', true);

select is(
  (select string_agg(coalesce(subject, '-') || ' ' || coalesce(teacher_last_name, '-'), ',' order by start_position)
   from public.portal_lessons(array['f1000000-0000-0000-0000-0000000000d3'::uuid])),
  'Islam Islam,Koran Koran',
  'a parent sees the lessons of their child''s class with the teacher'
);

insert into public.absence_reports (student_id, school_day_id, reason, reported_by_guardian_id)
values ('f1000000-0000-0000-0000-000000000051', 'f1000000-0000-0000-0000-0000000000d3', 'ZZTEST syk', 'f1000000-0000-0000-0000-000000000064');

select is(
  (select count(*) from public.attendance
   where student_id = 'f1000000-0000-0000-0000-000000000051'
     and school_day_id = 'f1000000-0000-0000-0000-0000000000d3'
     and status = 'meldt_fravaer'),
  2::bigint,
  'a reported absence marks every lesson of the day'
);

update public.absence_reports set withdrawn_at = now()
where student_id = 'f1000000-0000-0000-0000-000000000051' and school_day_id = 'f1000000-0000-0000-0000-0000000000d3';

select is(
  (select count(*) from public.attendance
   where student_id = 'f1000000-0000-0000-0000-000000000051'
     and school_day_id = 'f1000000-0000-0000-0000-0000000000d3'),
  0::bigint,
  'withdrawing the absence clears every lesson of the day'
);

select set_config('request.jwt.claims', '{"sub":"f1000000-0000-0000-0000-0000000000a1","email":"zz-f1-admin@zztest.local","role":"authenticated"}', true);

select throws_ok(
  $$ select public.admin_merge_lessons(
       (select id from public.lessons where class_id = 'f1000000-0000-0000-0000-0000000000c1' and school_day_id = 'f1000000-0000-0000-0000-0000000000d2' and start_position = 2),
       (select id from public.lessons where class_id = 'f1000000-0000-0000-0000-0000000000c1' and school_day_id = 'f1000000-0000-0000-0000-0000000000d2' and start_position = 1)) $$,
  'P0001',
  null,
  'a lesson with attendance cannot be merged away'
);

select is(
  public.admin_split_lesson(
    (select id from public.lessons where class_id = 'f1000000-0000-0000-0000-0000000000c1' and school_day_id = 'f1000000-0000-0000-0000-0000000000d3' and start_position = 2)
  ),
  1,
  'admin splits a merged lesson on one day'
);

select lives_ok(
  $$ select public.admin_merge_lessons(
       (select id from public.lessons where class_id = 'f1000000-0000-0000-0000-0000000000c1' and school_day_id = 'f1000000-0000-0000-0000-0000000000d3' and start_position = 1),
       (select id from public.lessons where class_id = 'f1000000-0000-0000-0000-0000000000c1' and school_day_id = 'f1000000-0000-0000-0000-0000000000d3' and start_position = 2)) $$,
  'admin merges two adjacent lessons without data'
);

select is(
  (select string_agg(start_position || '-' || end_position, ',' order by start_position) from public.lessons
   where class_id = 'f1000000-0000-0000-0000-0000000000c1' and school_day_id = 'f1000000-0000-0000-0000-0000000000d3'),
  '1-2,3-3',
  'the merged day keeps its own shape'
);

select is(
  public.admin_save_time_slots('f1000000-0000-0000-0000-000000000001',
    '[{"label":"Time 1","starts_at":"10:00","ends_at":"11:00"},{"label":"Time 2","starts_at":"11:00","ends_at":"12:00"},
      {"label":"Time 3","starts_at":"13:00","ends_at":"14:00"},{"label":"Time 4","starts_at":"14:00","ends_at":"15:00"}]'::jsonb),
  4,
  'admin adds a fourth time slot'
);

select is(
  (select string_agg(start_position || '-' || end_position, ',') from public.lessons
   where class_id = 'f1000000-0000-0000-0000-0000000000c2' and school_day_id = 'f1000000-0000-0000-0000-0000000000d3'),
  '1-4',
  'a class without a weekly plan follows the new length of the day'
);

select throws_ok(
  $$ select public.admin_save_time_slots('f1000000-0000-0000-0000-000000000001',
       '[{"label":"Time 1","starts_at":"10:00","ends_at":"11:00"},{"label":"Time 2","starts_at":"11:00","ends_at":"12:00"}]'::jsonb) $$,
  'P0001',
  null,
  'slots used by a weekly plan cannot be removed'
);

select is(
  public.admin_reset_day_lessons('f1000000-0000-0000-0000-0000000000d3', 'f1000000-0000-0000-0000-0000000000c1'),
  2,
  'resetting a day rebuilds it from the weekly plan'
);

select is(
  (select string_agg(start_position || '-' || end_position || ' ' || subject, ',' order by start_position) from public.lessons
   where class_id = 'f1000000-0000-0000-0000-0000000000c1' and school_day_id = 'f1000000-0000-0000-0000-0000000000d3'),
  '1-1 Islam,2-3 Koran',
  'the reset day matches the weekly plan again'
);

select is(
  public.admin_save_class_slot_plans('f1000000-0000-0000-0000-0000000000c2', 'f1000000-0000-0000-0000-000000000001',
    '[{"start_position":1,"end_position":4,"subject":"Arabisk","teacher_guardian_id":"f1000000-0000-0000-0000-000000000062","co_teacher_guardian_id":"f1000000-0000-0000-0000-000000000061"}]'::jsonb),
  1,
  'admin saves a weekly plan slot with a co-teacher'
);

select is(
  (select co_teacher_guardian_id from public.lessons
   where class_id = 'f1000000-0000-0000-0000-0000000000c2' and school_day_id = 'f1000000-0000-0000-0000-0000000000d3'),
  'f1000000-0000-0000-0000-000000000061'::uuid,
  'upcoming lessons get the co-teacher from the weekly plan'
);

reset role;

select * from finish();

rollback;
