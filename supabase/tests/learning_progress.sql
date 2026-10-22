begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select no_plan();

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into auth.users (id, email, raw_app_meta_data)
values
  ('f3000000-0000-0000-0000-0000000000a1', 'zz-f3-admin@zztest.local', '{"role":"admin"}'),
  ('f3000000-0000-0000-0000-0000000000a2', 'zz-f3-teacher@zztest.local', '{"role":"member"}'),
  ('f3000000-0000-0000-0000-0000000000a3', 'zz-f3-other-teacher@zztest.local', '{"role":"member"}'),
  ('f3000000-0000-0000-0000-0000000000a4', 'zz-f3-parent@zztest.local', '{"role":"member"}'),
  ('f3000000-0000-0000-0000-0000000000a5', 'zz-f3-other-parent@zztest.local', '{"role":"member"}'),
  ('f3000000-0000-0000-0000-0000000000a6', 'zz-f3-student@zztest.local', '{"role":"member"}');

update public.school_years set is_active = false where is_active;

insert into public.school_years (id, label, starts_on, ends_on, is_active)
values
  ('f3000000-0000-0000-0000-000000000001', 'ZZTEST F3 aktiv',
   (now() at time zone 'Europe/Oslo')::date - 60, (now() at time zone 'Europe/Oslo')::date + 200, true),
  ('f3000000-0000-0000-0000-000000000002', 'ZZTEST F3 gammel',
   (now() at time zone 'Europe/Oslo')::date - 400, (now() at time zone 'Europe/Oslo')::date - 61, false);

insert into public.classes (id, slug, name_no, name_en)
values
  ('f3000000-0000-0000-0000-0000000000c1', 'zztest-f3-a', 'ZZTEST F3 A', 'ZZTEST F3 A'),
  ('f3000000-0000-0000-0000-0000000000c2', 'zztest-f3-b', 'ZZTEST F3 B', 'ZZTEST F3 B');

insert into public.families (id, origin)
values
  ('f3000000-0000-0000-0000-0000000000f1', 'test'),
  ('f3000000-0000-0000-0000-0000000000f2', 'test');

insert into public.guardians (id, first_name, last_name, email)
values
  ('f3000000-0000-0000-0000-000000000061', 'ZZTEST', 'Laerer', 'zz-f3-teacher@zztest.local'),
  ('f3000000-0000-0000-0000-000000000062', 'ZZTEST', 'Annen laerer', 'zz-f3-other-teacher@zztest.local'),
  ('f3000000-0000-0000-0000-000000000063', 'ZZTEST', 'Forelder', 'zz-f3-parent@zztest.local'),
  ('f3000000-0000-0000-0000-000000000064', 'ZZTEST', 'Annen forelder', 'zz-f3-other-parent@zztest.local');
insert into public.person_roles (guardian_id, role_key) values ('f3000000-0000-0000-0000-000000000061', 'teacher'), ('f3000000-0000-0000-0000-000000000062', 'teacher');

insert into public.students (id, family_id, child_first_name, child_last_name, child_email)
values
  ('f3000000-0000-0000-0000-000000000051', 'f3000000-0000-0000-0000-0000000000f1', 'ZZTEST', 'Elev A', 'zz-f3-student@zztest.local'),
  ('f3000000-0000-0000-0000-000000000052', 'f3000000-0000-0000-0000-0000000000f2', 'ZZTEST', 'Elev B', null),
  ('f3000000-0000-0000-0000-000000000053', 'f3000000-0000-0000-0000-0000000000f2', 'ZZTEST', 'Uten klasse', null);

insert into public.family_guardians (family_id, guardian_id, is_primary_contact)
values
  ('f3000000-0000-0000-0000-0000000000f1', 'f3000000-0000-0000-0000-000000000063', true),
  ('f3000000-0000-0000-0000-0000000000f2', 'f3000000-0000-0000-0000-000000000064', true);

insert into public.student_guardians (student_id, family_id, guardian_id)
values
  ('f3000000-0000-0000-0000-000000000051', 'f3000000-0000-0000-0000-0000000000f1', 'f3000000-0000-0000-0000-000000000063'),
  ('f3000000-0000-0000-0000-000000000052', 'f3000000-0000-0000-0000-0000000000f2', 'f3000000-0000-0000-0000-000000000064')
on conflict do nothing;

insert into public.enrollments (student_id, class_id, school_year_id, status)
values
  ('f3000000-0000-0000-0000-000000000051', 'f3000000-0000-0000-0000-0000000000c1', 'f3000000-0000-0000-0000-000000000001', 'aktiv'),
  ('f3000000-0000-0000-0000-000000000052', 'f3000000-0000-0000-0000-0000000000c2', 'f3000000-0000-0000-0000-000000000001', 'aktiv');

insert into public.class_teachers (class_id, guardian_id, school_year_id)
values
  ('f3000000-0000-0000-0000-0000000000c1', 'f3000000-0000-0000-0000-000000000061', 'f3000000-0000-0000-0000-000000000001'),
  ('f3000000-0000-0000-0000-0000000000c2', 'f3000000-0000-0000-0000-000000000062', 'f3000000-0000-0000-0000-000000000001');

select set_config('request.jwt.claims', '{"sub":"f3000000-0000-0000-0000-0000000000a2","email":"zz-f3-teacher@zztest.local","role":"authenticated"}', true);
set local role authenticated;

select ok(public.learning_can_manage_student('f3000000-0000-0000-0000-000000000051'), 'assigned teacher can manage their student');
select ok(not public.learning_can_manage_student('f3000000-0000-0000-0000-000000000052'), 'teacher cannot manage another class');
select lives_ok($$ select public.create_learning_goal('f3000000-0000-0000-0000-0000000000e1', 'f3000000-0000-0000-0000-000000000051', 'f3000000-0000-0000-0000-0000000000c1', 'quran', 'Al-Fatiha', 'Al-Fatiha', 1, 7, 'practising', 'Rolig tempo', 'Øv hver dag') $$, 'teacher creates goal and initial progress atomically');
select lives_ok($$ select public.create_learning_goal('f3000000-0000-0000-0000-0000000000e1', 'f3000000-0000-0000-0000-000000000051', 'f3000000-0000-0000-0000-0000000000c1', 'quran', 'Al-Fatiha', 'Al-Fatiha', 1, 7, 'practising', 'Rolig tempo', 'Øv hver dag') $$, 'retry does not duplicate goal');
select is((select count(*) from public.learning_goals), 1::bigint, 'one goal is saved');
select is((select count(*) from public.learning_progress_updates), 1::bigint, 'one initial update is saved');
select lives_ok($$ select public.record_learning_progress('f3000000-0000-0000-0000-0000000000e2', 'f3000000-0000-0000-0000-0000000000e1', 'f3000000-0000-0000-0000-0000000000e1', 'achieved', 'God uttale', 'Repeter på søndag') $$, 'teacher records achievement');
select lives_ok($$ select public.record_learning_progress('f3000000-0000-0000-0000-0000000000e2', 'f3000000-0000-0000-0000-0000000000e1', 'f3000000-0000-0000-0000-0000000000e1', 'achieved', 'God uttale', 'Repeter på søndag') $$, 'retry does not duplicate update');
select is((select count(*) from public.learning_progress_updates), 2::bigint, 'history preserves practising and achieved');
select throws_ok($$ select public.record_learning_progress('f3000000-0000-0000-0000-0000000000e3', 'f3000000-0000-0000-0000-0000000000e1', 'f3000000-0000-0000-0000-0000000000e1', 'needs_revision', null, null) $$, 'PT409', 'Progress changed', 'stale teacher update cannot replace newer progress');
select throws_ok($$ insert into public.learning_goals(student_id, subject, title) values ('f3000000-0000-0000-0000-000000000051', 'quran', 'Direct') $$, '42501', null, 'direct inserts cannot bypass atomic workflow');
select throws_ok($$ update public.learning_progress_updates set status = 'practising' $$, '42501', null, 'history cannot be rewritten');
select throws_ok($$ delete from public.learning_goals $$, '42501', null, 'published history cannot be deleted by portal users');
select throws_ok($$ select public.create_learning_goal(gen_random_uuid(), 'f3000000-0000-0000-0000-000000000052', 'f3000000-0000-0000-0000-0000000000c2', 'arabic', 'Bokstaver', null, null, null, 'practising', null, null) $$, '42501', 'Forbidden', 'teacher cannot create goals for another class');
select throws_ok($$ select public.create_learning_goal(gen_random_uuid(), 'f3000000-0000-0000-0000-000000000051', 'f3000000-0000-0000-0000-0000000000c1', 'arabic', 'Bokstaver', 'Al-Fatiha', 7, 1, 'practising', null, null) $$, '23514', null, 'invalid range or non-Quran reference is rejected');
select is((select count(*) from public.learning_class_students('f3000000-0000-0000-0000-0000000000c1')), 1::bigint, 'teacher gets active class learners without a school-day dependency');
select is((select count(*) from public.learning_class_students('f3000000-0000-0000-0000-0000000000c2')), 0::bigint, 'other class roster is hidden');
select throws_ok($$ select public.create_learning_goal(gen_random_uuid(), 'f3000000-0000-0000-0000-000000000051', 'f3000000-0000-0000-0000-0000000000c1', 'quran', 'Invalid', 'Al-Fatiha', 7, 1, 'practising', null, null) $$, '23514', null, 'descending Quran range is rejected');
select throws_ok($$ select public.create_learning_goal(gen_random_uuid(), 'f3000000-0000-0000-0000-000000000051', 'f3000000-0000-0000-0000-0000000000c1', 'quran', 'Invalid', null, 1, 7, 'practising', null, null) $$, '23514', null, 'ayah range requires a surah');
select throws_ok($$ select public.create_learning_goal(gen_random_uuid(), 'f3000000-0000-0000-0000-000000000051', 'f3000000-0000-0000-0000-0000000000c1', 'quran', 'Invalid', 'Al-Fatiha', 1, null, 'practising', null, null) $$, '23514', null, 'partial ayah range is rejected');
select throws_ok($$ select public.create_learning_goal(gen_random_uuid(), 'f3000000-0000-0000-0000-000000000051', 'f3000000-0000-0000-0000-0000000000c1', 'quran', ' ', null, null, null, 'practising', null, null) $$, '23514', null, 'blank goal is rejected');
select throws_ok($$ select public.create_learning_goal(gen_random_uuid(), 'f3000000-0000-0000-0000-000000000051', 'f3000000-0000-0000-0000-0000000000c1', 'quran', 'Invalid', null, null, null, 'grade-5', null, null) $$, '23514', null, 'numerical grade is not a status');
select throws_ok($$ select public.create_learning_goal('f3000000-0000-0000-0000-0000000000e1', 'f3000000-0000-0000-0000-000000000051', 'f3000000-0000-0000-0000-0000000000c1', 'quran', 'Changed request', 'Al-Fatiha', 1, 7, 'practising', 'Rolig tempo', 'Øv hver dag') $$, '23514', 'Conflicting request', 'reusing goal request ID with changed content is rejected');
select throws_ok($$ select public.record_learning_progress('f3000000-0000-0000-0000-0000000000e2', 'f3000000-0000-0000-0000-0000000000e1', 'f3000000-0000-0000-0000-0000000000e1', 'achieved', 'Changed request', 'Repeter på søndag') $$, '23514', 'Conflicting request', 'reusing update request ID with changed content is rejected');
select is((select count(*) from public.learning_goals), 1::bigint, 'failed requests leave no orphan goals');
select is((select count(*) from public.learning_progress_updates), 2::bigint, 'failed requests leave history unchanged');


reset role;
select set_config('request.jwt.claims', '{"sub":"f3000000-0000-0000-0000-0000000000a4","email":"zz-f3-parent@zztest.local","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*) from public.learning_goals), 1::bigint, 'guardian sees own child goal');
select is((select count(*) from public.learning_progress_updates), 2::bigint, 'guardian sees dated history');
select is((select count(*) from public.learning_class_students('f3000000-0000-0000-0000-0000000000c1')), 0::bigint, 'guardians cannot browse class learners');
select throws_ok($$ select public.record_learning_progress(gen_random_uuid(), 'f3000000-0000-0000-0000-0000000000e1', 'f3000000-0000-0000-0000-0000000000e2', 'achieved', null, null) $$, '42501', 'Forbidden', 'guardian cannot write teacher progress');

reset role;
select set_config('request.jwt.claims', '{"sub":"f3000000-0000-0000-0000-0000000000a5","email":"zz-f3-other-parent@zztest.local","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*) from public.learning_goals), 0::bigint, 'unrelated family cannot see goal');
select is((select count(*) from public.learning_progress_updates), 0::bigint, 'unrelated family cannot see history');

reset role;
select set_config('request.jwt.claims', '{"sub":"f3000000-0000-0000-0000-0000000000a6","email":"zz-f3-student@zztest.local","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*) from public.learning_goals), 1::bigint, 'student sees own goals');
select is((select count(*) from public.learning_progress_updates), 2::bigint, 'student sees own history');

reset role;
update public.person_roles set suspended_at = now() where guardian_id = 'f3000000-0000-0000-0000-000000000061' and role_key = 'teacher';
select set_config('request.jwt.claims', '{"sub":"f3000000-0000-0000-0000-0000000000a2","email":"zz-f3-teacher@zztest.local","role":"authenticated"}', true);
set local role authenticated;
select ok(not public.learning_can_manage_student('f3000000-0000-0000-0000-000000000051'), 'suspended teacher loses access');
select is((select count(*) from public.learning_goals), 0::bigint, 'suspended teacher cannot read goals');
select throws_ok($$ select public.record_learning_progress(gen_random_uuid(), 'f3000000-0000-0000-0000-0000000000e1', 'f3000000-0000-0000-0000-0000000000e2', 'achieved', null, null) $$, '42501', 'Forbidden', 'suspended teacher cannot record updates');

reset role;
select set_config('request.jwt.claims', '{"sub":"f3000000-0000-0000-0000-0000000000a1","email":"zz-f3-admin@zztest.local","role":"authenticated"}', true);
set local role authenticated;
select ok(public.learning_can_manage_student('f3000000-0000-0000-0000-000000000052'), 'admin manages any student');
select is((select count(*) from public.learning_progress_updates), 2::bigint, 'admin can inspect history');
select is((select count(*) from public.audit_log where entity_type = 'learning_goals' and entity_id = 'f3000000-0000-0000-0000-0000000000e1'), 2::bigint, 'audit records creation and update once');
select lives_ok($$ select public.create_learning_goal('f3000000-0000-0000-0000-0000000000e4', 'f3000000-0000-0000-0000-000000000053', null, 'arabic', 'Bokstaver', null, null, null, 'practising', null, 'Les alif') $$, 'admin creates a goal for an unenrolled learner');
select lives_ok($$ select public.record_learning_progress('f3000000-0000-0000-0000-0000000000e5', 'f3000000-0000-0000-0000-0000000000e4', 'f3000000-0000-0000-0000-0000000000e4', 'achieved', null, null) $$, 'admin updates an unenrolled learner');

reset role;
update public.enrollments set class_id = 'f3000000-0000-0000-0000-0000000000c2' where student_id = 'f3000000-0000-0000-0000-000000000051' and school_year_id = 'f3000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claims', '{"sub":"f3000000-0000-0000-0000-0000000000a3","email":"zz-f3-other-teacher@zztest.local","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*) from public.learning_goals), 1::bigint, 'new class teacher sees existing learning history');
select lives_ok($$ select public.record_learning_progress('f3000000-0000-0000-0000-0000000000e3', 'f3000000-0000-0000-0000-0000000000e1', 'f3000000-0000-0000-0000-0000000000e2', 'needs_revision', 'Repeter', null) $$, 'new teacher can continue goal after transfer');

reset role;
update public.person_roles set suspended_at = null where guardian_id = 'f3000000-0000-0000-0000-000000000061' and role_key = 'teacher';
select set_config('request.jwt.claims', '{"sub":"f3000000-0000-0000-0000-0000000000a2","email":"zz-f3-teacher@zztest.local","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*) from public.learning_goals), 0::bigint, 'former class teacher loses history after transfer');
reset role;
update public.school_years set is_active = false where id = 'f3000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claims', '{"sub":"f3000000-0000-0000-0000-0000000000a4","email":"zz-f3-parent@zztest.local","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*) from public.learning_goals), 1::bigint, 'family retains goals from previous school years');
select is((select count(*) from public.learning_progress_updates), 3::bigint, 'family retains all history from previous school years');
reset role;
set local role anon;
select throws_ok($$ select * from public.learning_goals $$, '42501', null, 'anonymous visitors cannot read learning data');
select throws_ok($$ select public.learning_can_manage_student('f3000000-0000-0000-0000-000000000051') $$, '42501', null, 'anonymous visitors cannot invoke access helper');
reset role;
select * from finish();
rollback;
