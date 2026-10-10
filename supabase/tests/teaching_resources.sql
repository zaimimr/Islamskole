begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select no_plan();

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

insert into public.guardians (id, first_name, last_name, email, is_teacher)
values
  ('f2000000-0000-0000-0000-000000000061', 'ZZTEST', 'Laerer', 'zz-f2-teacher@zztest.local', true),
  ('f2000000-0000-0000-0000-000000000062', 'ZZTEST', 'Annen laerer', 'zz-f2-other-teacher@zztest.local', true),
  ('f2000000-0000-0000-0000-000000000063', 'ZZTEST', 'Forelder', 'zz-f2-parent@zztest.local', false),
  ('f2000000-0000-0000-0000-000000000064', 'ZZTEST', 'Annen forelder', 'zz-f2-other-parent@zztest.local', false);

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

insert into public.school_days (id, school_year_id, date) values
  ('f2000000-0000-0000-0000-0000000000d1', 'f2000000-0000-0000-0000-000000000001', '2026-10-11'),
  ('f2000000-0000-0000-0000-0000000000d2', 'f2000000-0000-0000-0000-000000000002', '2025-10-12');
delete from public.lessons where school_day_id = 'f2000000-0000-0000-0000-0000000000d1';
insert into public.lessons (id, class_id, school_day_id, start_position, end_position, teacher_guardian_id) values
  ('f2000000-0000-0000-0000-0000000000b1', 'f2000000-0000-0000-0000-0000000000c1', 'f2000000-0000-0000-0000-0000000000d1', 1, 1, 'f2000000-0000-0000-0000-000000000061');
insert into public.class_week_plans (class_id, school_year_id, week_start, title, goals, completed_at) values
  ('f2000000-0000-0000-0000-0000000000c1', 'f2000000-0000-0000-0000-000000000002', '2025-10-06', 'Tema fra tidligere år', 'Læringsmål fra tidligere år', now());
select set_config('request.jwt.claims', '{"sub":"f2000000-0000-0000-0000-0000000000a2","email":"zz-f2-teacher@zztest.local","role":"authenticated"}', true);
set local role authenticated;
select is(public.copy_teaching_year('f2000000-0000-0000-0000-0000000000c1', 'f2000000-0000-0000-0000-000000000002', 'f2000000-0000-0000-0000-000000000001'), 1, 'class teacher can reuse earlier year');
select is(public.copy_teaching_year('f2000000-0000-0000-0000-0000000000c1', 'f2000000-0000-0000-0000-000000000002', 'f2000000-0000-0000-0000-000000000001'), 0, 'reusing again does not duplicate topics');
select is((select goals from public.class_week_plans where title = 'Tema fra tidligere år'), 'Læringsmål fra tidligere år', 'goals survive copying');
select is((select completed_at from public.class_week_plans where title = 'Tema fra tidligere år'), null::timestamptz, 'completion resets for the new year');
update public.class_week_plans set completed_at = '2000-01-01' where title = 'Tema fra tidligere år';
select ok((select completed_at > '2026-01-01' and completed_by = auth.uid() from public.class_week_plans where title = 'Tema fra tidligere år'), 'completion records current teacher and actual timestamp');
select lives_ok($$ insert into public.lesson_materials (id, class_id, school_year_id, title, kind, url) values
  ('f2000000-0000-0000-0000-0000000000e1', 'f2000000-0000-0000-0000-0000000000c1', 'f2000000-0000-0000-0000-000000000001', 'Lesestoff', 'link', 'https://example.org/lesson') $$, 'teacher adds a class link');
select throws_ok($$ insert into public.lesson_materials (class_id, school_year_id, title, kind, url) values
  ('f2000000-0000-0000-0000-0000000000c1', 'f2000000-0000-0000-0000-000000000001', 'Unsafe', 'link', 'javascript:alert(1)') $$, '23514', null, 'unsafe link rejected');
select throws_ok($$ insert into public.lesson_materials (class_id, school_year_id, lesson_id, title, kind, url) values
  ('f2000000-0000-0000-0000-0000000000c2', 'f2000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-0000000000b1', 'Wrong class', 'link', 'https://example.org') $$, '23514', null, 'lesson cannot authorize resources for another class');
select lives_ok($$ insert into public.lesson_materials (id, class_id, school_year_id, title, kind, status, file_path, file_name, mime_type, file_size) values
  ('f2000000-0000-0000-0000-0000000000e2', 'f2000000-0000-0000-0000-0000000000c1', 'f2000000-0000-0000-0000-000000000001', 'PDF', 'file', 'uploading', 'f2000000-0000-0000-0000-0000000000c1/f2000000-0000-0000-0000-0000000000e2/resource', 'lesson.pdf', 'application/pdf', 100) $$, 'teacher starts a private upload');
select throws_ok($$ update public.lesson_materials set status = 'ready' where id = 'f2000000-0000-0000-0000-0000000000e2' $$, '23514', null, 'missing uploads cannot be published');
select throws_ok($$ update public.lesson_materials set class_id = 'f2000000-0000-0000-0000-0000000000c2' where id = 'f2000000-0000-0000-0000-0000000000e1' $$, '23514', null, 'resource scope cannot be moved to another class');
select lives_ok($$ insert into public.lesson_handovers (lesson_id, instructions) values ('f2000000-0000-0000-0000-0000000000b1', 'Staff only information') $$, 'teacher saves private handover');
select is((select updated_by from public.lesson_handovers), auth.uid(), 'handover records its actual author');
reset role;
insert into storage.objects (bucket_id, name, metadata) values ('lesson-materials', 'f2000000-0000-0000-0000-0000000000c1/f2000000-0000-0000-0000-0000000000e2/resource', '{"size":100,"mimetype":"application/pdf"}');
select set_config('request.jwt.claims', '{"sub":"f2000000-0000-0000-0000-0000000000a4","email":"zz-f2-parent@zztest.local","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*) from public.lesson_materials), 1::bigint, 'guardian sees ready class links only');
select is((select count(*) from storage.objects where bucket_id = 'lesson-materials'), 0::bigint, 'unfinished upload is hidden from guardians in storage');
select is((select count(*) from public.lesson_handovers), 0::bigint, 'staff handover is hidden from parents');
select throws_ok($$ insert into public.lesson_handovers (lesson_id, instructions) values ('f2000000-0000-0000-0000-0000000000b1', 'Parent edit') $$, '42501', null, 'parent cannot edit handover');
select throws_ok($$ select public.copy_teaching_year('f2000000-0000-0000-0000-0000000000c1', 'f2000000-0000-0000-0000-000000000002', 'f2000000-0000-0000-0000-000000000001') $$, '42501', null, 'parent cannot reuse teaching plans');
select throws_ok($$ insert into public.lesson_materials (class_id, school_year_id, title, kind, url) values
  ('f2000000-0000-0000-0000-0000000000c1', 'f2000000-0000-0000-0000-000000000001', 'Parent material', 'link', 'https://example.org') $$, '42501', null, 'parent cannot add material');
reset role;
select set_config('request.jwt.claims', '{"sub":"f2000000-0000-0000-0000-0000000000a2","email":"zz-f2-teacher@zztest.local","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$ update public.lesson_materials set status = 'ready' where id = 'f2000000-0000-0000-0000-0000000000e2' $$, 'a verified uploaded file can be published');
reset role;
select set_config('request.jwt.claims', '{"sub":"f2000000-0000-0000-0000-0000000000a6","email":"zz-f2-student@zztest.local","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*) from public.lesson_materials), 2::bigint, 'student reads own class ready files and links');
select is((select count(*) from storage.objects where bucket_id = 'lesson-materials'), 1::bigint, 'student can download a ready private material');
select is((select count(*) from public.lesson_handovers), 0::bigint, 'staff handover is hidden from students');
reset role;
select set_config('request.jwt.claims', '{"sub":"f2000000-0000-0000-0000-0000000000a5","email":"zz-f2-other-parent@zztest.local","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*) from public.lesson_materials), 0::bigint, 'another family sees no materials from the class');
select is((select count(*) from storage.objects where bucket_id = 'lesson-materials'), 0::bigint, 'another family cannot bypass material policy through storage');
reset role;
insert into auth.users (id, email, raw_app_meta_data) values ('f2000000-0000-0000-0000-0000000000a7', 'zz-f2-substitute@zztest.local', '{"role":"member"}');
insert into public.guardians (id, first_name, email, is_teacher) values ('f2000000-0000-0000-0000-000000000065', 'ZZTEST Substitute', 'zz-f2-substitute@zztest.local', true);
update public.lessons set teacher_guardian_id = 'f2000000-0000-0000-0000-000000000065', is_override = true where id = 'f2000000-0000-0000-0000-0000000000b1';
insert into public.school_days (id, school_year_id, date) values ('f2000000-0000-0000-0000-0000000000d3', 'f2000000-0000-0000-0000-000000000001', '2026-10-04');
insert into public.class_notes (class_id, school_day_id, homework) values ('f2000000-0000-0000-0000-0000000000c1', 'f2000000-0000-0000-0000-0000000000d3', 'Previous homework');
select set_config('request.jwt.claims', '{"sub":"f2000000-0000-0000-0000-0000000000a7","email":"zz-f2-substitute@zztest.local","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*) from public.portal_active_school_year()), 1::bigint, 'lesson-only substitute can discover active school year');
select is((select count(*) from public.lesson_handovers), 1::bigint, 'lesson-only substitute sees handover');
select is((select count(*) from public.class_notes where homework = 'Previous homework'), 1::bigint, 'lesson-only substitute sees previous class notes');
select is((select count(*) from public.lesson_materials), 2::bigint, 'lesson-only substitute reads ready class materials');
select ok(not public.can_manage_lesson_material('f2000000-0000-0000-0000-0000000000c1', 'f2000000-0000-0000-0000-000000000001', null), 'lesson-only substitute cannot manage generic class resources');
select throws_ok($$ select * from public.teaching_previous_years('f2000000-0000-0000-0000-0000000000c1', 'f2000000-0000-0000-0000-000000000001') $$, '42501', null, 'lesson-only substitute cannot reuse class-year plans');
reset role;
set local role anon;
select is((select count(*) from storage.objects where bucket_id = 'lesson-materials'), 0::bigint, 'private files are hidden from anonymous visitors');
reset role;
select * from finish();
rollback;
