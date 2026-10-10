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

update public.enrollments set created_at = statement_timestamp() - interval '40 days';
insert into public.school_days (id, school_year_id, date) values
  ('f2000000-0000-0000-0000-0000000000d1', 'f2000000-0000-0000-0000-000000000001', date_trunc('week', current_date)::date - 1),
  ('f2000000-0000-0000-0000-0000000000d2', 'f2000000-0000-0000-0000-000000000001', date_trunc('week', current_date)::date + 13);
insert into public.class_notes (id, class_id, school_day_id, homework) values
  ('f2000000-0000-0000-0000-0000000000e1', 'f2000000-0000-0000-0000-0000000000c1', 'f2000000-0000-0000-0000-0000000000d1', 'Practise reading'),
  ('f2000000-0000-0000-0000-0000000000e2', 'f2000000-0000-0000-0000-0000000000c1', 'f2000000-0000-0000-0000-0000000000d2', 'Future reading');
select set_config('request.jwt.claims', '{"sub":"f2000000-0000-0000-0000-0000000000a4","email":"zz-f2-parent@zztest.local","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*) from public.student_homework('f2000000-0000-0000-0000-000000000051')), 1::bigint, 'guardian sees assigned past homework only');
select throws_ok($$ insert into public.homework_responses (note_id, student_id, status, homework_version, responded_by) values
  ('f2000000-0000-0000-0000-0000000000e1', 'f2000000-0000-0000-0000-000000000051', 'completed', 999, 'f2000000-0000-0000-0000-0000000000a3') $$, '42501', null, 'direct writes cannot bypass assignment version checks');
select lives_ok($$ select public.record_homework_response('f2000000-0000-0000-0000-0000000000e1', 'f2000000-0000-0000-0000-000000000051', 1, 'completed') $$, 'guardian records completion');
select is((select responded_by from public.homework_responses), auth.uid(), 'actual response identity is saved');
select is((select homework_version from public.homework_responses), 1, 'current assignment version is saved');
select throws_ok($$ select public.record_homework_response('f2000000-0000-0000-0000-0000000000e2', 'f2000000-0000-0000-0000-000000000051', 1, 'completed') $$, '42501', null, 'future assignments cannot be completed');
select throws_ok($$ select public.record_homework_response('f2000000-0000-0000-0000-0000000000e1', 'f2000000-0000-0000-0000-000000000052', 1, 'completed') $$, '42501', null, 'cannot complete another child homework');
select throws_ok($$ select * from public.homework_class_responses('f2000000-0000-0000-0000-0000000000e1') $$, '42501', null, 'guardian cannot read class completion roster');
reset role;
select set_config('request.jwt.claims', '{"sub":"f2000000-0000-0000-0000-0000000000a6","email":"zz-f2-student@zztest.local","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$ select public.record_homework_response('f2000000-0000-0000-0000-0000000000e1', 'f2000000-0000-0000-0000-000000000051', 1, 'needs_help') $$, 'student can request help');
select is((select responded_by from public.homework_responses), auth.uid(), 'student response identity is saved');
select is((select status from public.student_homework('f2000000-0000-0000-0000-000000000051')), 'needs_help', 'student sees own latest status');
reset role;
select set_config('request.jwt.claims', '{"sub":"f2000000-0000-0000-0000-0000000000a2","email":"zz-f2-teacher@zztest.local","role":"authenticated"}', true);
set local role authenticated;
select is((select status from public.homework_class_responses('f2000000-0000-0000-0000-0000000000e1')), 'needs_help', 'class teacher sees help requests');
select throws_ok($$ update public.homework_responses set status = 'completed' $$, '42501', null, 'teacher cannot silently change student completion');
update public.class_notes set summary = 'Summary only' where id = 'f2000000-0000-0000-0000-0000000000e1';
select is((select homework_version from public.class_notes where id = 'f2000000-0000-0000-0000-0000000000e1'), 1, 'summary edit does not reset homework');
update public.class_notes set homework = 'New reading assignment' where id = 'f2000000-0000-0000-0000-0000000000e1';
select is((select status from public.homework_class_responses('f2000000-0000-0000-0000-0000000000e1')), 'not_started', 'changed assignment does not inherit earlier completion');
reset role;
select set_config('request.jwt.claims', '{"sub":"f2000000-0000-0000-0000-0000000000a4","email":"zz-f2-parent@zztest.local","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$ select public.record_homework_response('f2000000-0000-0000-0000-0000000000e1', 'f2000000-0000-0000-0000-000000000051', 1, 'completed') $$, '40001', null, 'stale screen cannot complete an edited assignment');
select lives_ok($$ select public.record_homework_response('f2000000-0000-0000-0000-0000000000e1', 'f2000000-0000-0000-0000-000000000051', 2, 'completed') $$, 'current homework version can be completed');
reset role;
select set_config('request.jwt.claims', '{"sub":"f2000000-0000-0000-0000-0000000000a5","email":"zz-f2-other-parent@zztest.local","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*) from public.homework_responses), 0::bigint, 'another family sees no response');
select throws_ok($$ select * from public.student_homework('f2000000-0000-0000-0000-000000000051') $$, '42501', null, 'another family cannot list assignments for the child');
reset role;
update public.enrollments set created_at = statement_timestamp() where student_id = 'f2000000-0000-0000-0000-000000000051';
select set_config('request.jwt.claims', '{"sub":"f2000000-0000-0000-0000-0000000000a2","email":"zz-f2-teacher@zztest.local","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*) from public.homework_class_responses('f2000000-0000-0000-0000-0000000000e1')), 0::bigint, 'late joiner is not listed as missing old homework');
reset role;
set local role anon;
select throws_ok($$ select * from public.homework_responses $$, '42501', null, 'anonymous visitors cannot read responses');
reset role;
select * from finish();
rollback;
