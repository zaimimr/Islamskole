begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(21);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
insert into auth.users(id, email, raw_app_meta_data) values
  ('a7300000-0000-0000-0000-000000000001', 'zz-bulk-admin@zztest.local', '{"role":"admin"}'),
  ('a7300000-0000-0000-0000-000000000002', 'zz-bulk-teacher@zztest.local', '{"role":"member"}'),
  ('a7300000-0000-0000-0000-000000000003', 'zz-bulk-parent@zztest.local', '{"role":"member"}');
update public.school_years set is_active = false where is_active;
insert into public.school_years(id, label, is_active) values ('a7300000-0000-0000-0000-000000000010', 'ZZTEST mobile attendance', true);
insert into public.classes(id, slug, name_no, name_en, capacity) values
  ('a7300000-0000-0000-0000-000000000020', 'zztest-bulk-a', 'ZZTEST Bulk A', 'ZZTEST Bulk A', 30),
  ('a7300000-0000-0000-0000-000000000021', 'zztest-bulk-b', 'ZZTEST Bulk B', 'ZZTEST Bulk B', 30);
insert into public.guardians(id, first_name, email) values ('a7300000-0000-0000-0000-000000000022', 'ZZTEST Teacher', 'zz-bulk-teacher@zztest.local');
insert into public.person_roles(guardian_id, role_key) values ('a7300000-0000-0000-0000-000000000022', 'teacher');
insert into public.class_teachers(class_id, guardian_id, school_year_id) values ('a7300000-0000-0000-0000-000000000020', 'a7300000-0000-0000-0000-000000000022', 'a7300000-0000-0000-0000-000000000010');
insert into public.students(id, child_first_name) values
  ('a7300000-0000-0000-0000-000000000031', 'ZZTEST Unrecorded'),
  ('a7300000-0000-0000-0000-000000000032', 'ZZTEST Late'),
  ('a7300000-0000-0000-0000-000000000033', 'ZZTEST Unreported'),
  ('a7300000-0000-0000-0000-000000000034', 'ZZTEST Reported'),
  ('a7300000-0000-0000-0000-000000000035', 'ZZTEST Other class');
insert into public.enrollments(student_id, class_id, school_year_id, status)
  select id, case when id = 'a7300000-0000-0000-0000-000000000035' then 'a7300000-0000-0000-0000-000000000021'::uuid else 'a7300000-0000-0000-0000-000000000020'::uuid end, 'a7300000-0000-0000-0000-000000000010', 'aktiv'
  from public.students where id::text like 'a7300000-0000-0000-0000-00000000003%';
insert into public.school_days(id, school_year_id, date) values
  ('a7300000-0000-0000-0000-000000000040', 'a7300000-0000-0000-0000-000000000010', (now() at time zone 'Europe/Oslo')::date - 7),
  ('a7300000-0000-0000-0000-000000000041', 'a7300000-0000-0000-0000-000000000010', (now() at time zone 'Europe/Oslo')::date + 7);
delete from public.lessons where school_day_id in ('a7300000-0000-0000-0000-000000000040', 'a7300000-0000-0000-0000-000000000041');
insert into public.lessons(id, class_id, school_day_id, start_position, end_position) values
  ('a7300000-0000-0000-0000-000000000051', 'a7300000-0000-0000-0000-000000000020', 'a7300000-0000-0000-0000-000000000040', 1, 1),
  ('a7300000-0000-0000-0000-000000000052', 'a7300000-0000-0000-0000-000000000020', 'a7300000-0000-0000-0000-000000000040', 2, 2),
  ('a7300000-0000-0000-0000-000000000053', 'a7300000-0000-0000-0000-000000000020', 'a7300000-0000-0000-0000-000000000040', 3, 3),
  ('a7300000-0000-0000-0000-000000000054', 'a7300000-0000-0000-0000-000000000020', 'a7300000-0000-0000-0000-000000000041', 1, 1),
  ('a7300000-0000-0000-0000-000000000055', 'a7300000-0000-0000-0000-000000000021', 'a7300000-0000-0000-0000-000000000040', 1, 1);
insert into public.attendance(student_id, school_day_id, lesson_id, status) values
  ('a7300000-0000-0000-0000-000000000032', 'a7300000-0000-0000-0000-000000000040', 'a7300000-0000-0000-0000-000000000051', 'sent'),
  ('a7300000-0000-0000-0000-000000000033', 'a7300000-0000-0000-0000-000000000040', 'a7300000-0000-0000-0000-000000000051', 'fravaer');
insert into public.absence_reports(student_id, school_day_id, source, reason, reported_by) values
  ('a7300000-0000-0000-0000-000000000034', 'a7300000-0000-0000-0000-000000000040', 'app', 'ZZTEST Parent message', 'a7300000-0000-0000-0000-000000000003');
delete from public.attendance where student_id = 'a7300000-0000-0000-0000-000000000034';
select set_config('request.jwt.claims', '{"sub":"a7300000-0000-0000-0000-000000000003","email":"zz-bulk-parent@zztest.local","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select public.portal_mark_unrecorded_present('a7300000-0000-0000-0000-000000000051', array['a7300000-0000-0000-0000-000000000031']::uuid[])$$, '42501', null, 'parents cannot bulk mark attendance');
select set_config('request.jwt.claims', '{"sub":"a7300000-0000-0000-0000-000000000001","email":"zz-bulk-admin@zztest.local","role":"authenticated"}', true);
select throws_ok($$select public.portal_mark_unrecorded_present('a7300000-0000-0000-0000-000000000051', '{}'::uuid[])$$, '22023', null, 'empty student lists are rejected');
select throws_ok($$select public.portal_mark_unrecorded_present('a7300000-0000-0000-0000-000000000051', array['a7300000-0000-0000-0000-000000000031', 'a7300000-0000-0000-0000-000000000035']::uuid[])$$, '42501', null, 'mixed class requests fail before writing any student');
select is((select count(*) from public.attendance where student_id = 'a7300000-0000-0000-0000-000000000031'), 0::bigint, 'a rejected request leaves the unrecorded student unchanged');
select is(public.portal_mark_unrecorded_present('a7300000-0000-0000-0000-000000000051', array['a7300000-0000-0000-0000-000000000031', 'a7300000-0000-0000-0000-000000000032', 'a7300000-0000-0000-0000-000000000033', 'a7300000-0000-0000-0000-000000000034']::uuid[]), array['a7300000-0000-0000-0000-000000000031']::uuid[], 'a stale roster marks only the remaining unrecorded student');
select is((select status from public.attendance where student_id = 'a7300000-0000-0000-0000-000000000031' and lesson_id = 'a7300000-0000-0000-0000-000000000051'), 'til_stede', 'the selected lesson is marked present');
select is((select status from public.attendance where student_id = 'a7300000-0000-0000-0000-000000000031' and lesson_id = 'a7300000-0000-0000-0000-000000000052'), 'til_stede', 'bulk present carries into the next lesson');
select is((select inherited_from_lesson_id from public.attendance where student_id = 'a7300000-0000-0000-0000-000000000031' and lesson_id = 'a7300000-0000-0000-0000-000000000052'), 'a7300000-0000-0000-0000-000000000051'::uuid, 'carried attendance retains its source lesson');
select is((select status from public.attendance where student_id = 'a7300000-0000-0000-0000-000000000032' and lesson_id = 'a7300000-0000-0000-0000-000000000051'), 'sent', 'late attendance entered after loading the roster is preserved');
select is((select status from public.attendance where student_id = 'a7300000-0000-0000-0000-000000000033' and lesson_id = 'a7300000-0000-0000-0000-000000000051'), 'fravaer', 'unreported absence is preserved');
select is((select count(*) from public.attendance where student_id = 'a7300000-0000-0000-0000-000000000034'), 0::bigint, 'an active absence report blocks bulk present even without an attendance row');
select is((select reason from public.absence_reports where student_id = 'a7300000-0000-0000-0000-000000000034' and withdrawn_at is null), 'ZZTEST Parent message', 'the parent report and note remain intact');
select is(cardinality(public.portal_mark_unrecorded_present('a7300000-0000-0000-0000-000000000051', array['a7300000-0000-0000-0000-000000000031']::uuid[])), 0, 'repeating a completed bulk action changes nothing');
select is(public.portal_mark_unrecorded_present('a7300000-0000-0000-0000-000000000054', array['a7300000-0000-0000-0000-000000000031']::uuid[]), array['a7300000-0000-0000-0000-000000000031']::uuid[], 'admins can bulk mark future lessons present');
select is((select status from public.attendance where student_id = 'a7300000-0000-0000-0000-000000000031' and lesson_id = 'a7300000-0000-0000-0000-000000000054'), 'til_stede', 'future attendance is saved');
update public.school_days set cancelled = true where id = 'a7300000-0000-0000-0000-000000000041';
select throws_ok($$select public.portal_mark_unrecorded_present('a7300000-0000-0000-0000-000000000054', array['a7300000-0000-0000-0000-000000000032']::uuid[])$$, '42501', null, 'cancelled future school days cannot be marked present');
update public.school_days set cancelled = false where id = 'a7300000-0000-0000-0000-000000000041';
update public.lessons set cancelled = true where id = 'a7300000-0000-0000-0000-000000000053';
select throws_ok($$select public.portal_mark_unrecorded_present('a7300000-0000-0000-0000-000000000053', array['a7300000-0000-0000-0000-000000000031']::uuid[])$$, '42501', null, 'cancelled lessons cannot be marked present');
select set_config('request.jwt.claims', '{"sub":"a7300000-0000-0000-0000-000000000002","email":"zz-bulk-teacher@zztest.local","role":"authenticated"}', true);
select throws_ok($$select public.portal_mark_unrecorded_present('a7300000-0000-0000-0000-000000000054', array['a7300000-0000-0000-0000-000000000032']::uuid[])$$, '42501', null, 'future attendance remains restricted for teachers');
select is(cardinality(public.portal_mark_unrecorded_present('a7300000-0000-0000-0000-000000000051', array['a7300000-0000-0000-0000-000000000031']::uuid[])), 0, 'assigned teachers can safely repeat a completed bulk action');
select throws_ok($$select public.portal_mark_unrecorded_present('a7300000-0000-0000-0000-000000000055', array['a7300000-0000-0000-0000-000000000035']::uuid[])$$, '42501', null, 'teachers cannot mark another class');
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok($$select public.portal_mark_unrecorded_present('a7300000-0000-0000-0000-000000000051', array['a7300000-0000-0000-0000-000000000031']::uuid[])$$, '42501', null, 'an expired session cannot bulk mark attendance');
select * from finish();
rollback;
