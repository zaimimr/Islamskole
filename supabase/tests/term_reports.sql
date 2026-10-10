begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select no_plan();

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into auth.users (id, email, raw_app_meta_data)
values
  ('f6000000-0000-0000-0000-0000000000a1', 'zz-f6-admin@zztest.local', '{"role":"admin"}'),
  ('f6000000-0000-0000-0000-0000000000a2', 'zz-f6-teacher@zztest.local', '{"role":"member"}'),
  ('f6000000-0000-0000-0000-0000000000a3', 'zz-f6-other-teacher@zztest.local', '{"role":"member"}'),
  ('f6000000-0000-0000-0000-0000000000a4', 'zz-f6-parent@zztest.local', '{"role":"member"}'),
  ('f6000000-0000-0000-0000-0000000000a5', 'zz-f6-other-parent@zztest.local', '{"role":"member"}'),
  ('f6000000-0000-0000-0000-0000000000a6', 'zz-f6-student@zztest.local', '{"role":"member"}');

update public.school_years set is_active = false where is_active;

insert into public.school_years (id, label, starts_on, ends_on, is_active)
values
  ('f6000000-0000-0000-0000-000000000001', 'ZZTEST F6 aktiv',
   date_trunc('year', current_date)::date, (now() at time zone 'Europe/Oslo')::date + 200, true),
  ('f6000000-0000-0000-0000-000000000002', 'ZZTEST F6 gammel',
   (now() at time zone 'Europe/Oslo')::date - 400, (now() at time zone 'Europe/Oslo')::date - 61, false);

insert into public.classes (id, slug, name_no, name_en)
values
  ('f6000000-0000-0000-0000-0000000000c1', 'zztest-f2-a', 'ZZTEST F6 A', 'ZZTEST F6 A'),
  ('f6000000-0000-0000-0000-0000000000c2', 'zztest-f2-b', 'ZZTEST F6 B', 'ZZTEST F6 B');

insert into public.families (id, origin)
values
  ('f6000000-0000-0000-0000-0000000000f1', 'test'),
  ('f6000000-0000-0000-0000-0000000000f2', 'test');

insert into public.guardians (id, first_name, last_name, email, is_teacher)
values
  ('f6000000-0000-0000-0000-000000000061', 'ZZTEST', 'Laerer', 'zz-f6-teacher@zztest.local', true),
  ('f6000000-0000-0000-0000-000000000062', 'ZZTEST', 'Annen laerer', 'zz-f6-other-teacher@zztest.local', true),
  ('f6000000-0000-0000-0000-000000000063', 'ZZTEST', 'Forelder', 'zz-f6-parent@zztest.local', false),
  ('f6000000-0000-0000-0000-000000000064', 'ZZTEST', 'Annen forelder', 'zz-f6-other-parent@zztest.local', false);

insert into public.students (id, family_id, child_first_name, child_last_name, child_email)
values
  ('f6000000-0000-0000-0000-000000000051', 'f6000000-0000-0000-0000-0000000000f1', 'ZZTEST', 'Elev A', 'zz-f6-student@zztest.local'),
  ('f6000000-0000-0000-0000-000000000052', 'f6000000-0000-0000-0000-0000000000f2', 'ZZTEST', 'Elev B', null);

insert into public.family_guardians (family_id, guardian_id, is_primary_contact)
values
  ('f6000000-0000-0000-0000-0000000000f1', 'f6000000-0000-0000-0000-000000000063', true),
  ('f6000000-0000-0000-0000-0000000000f2', 'f6000000-0000-0000-0000-000000000064', true);

insert into public.student_guardians (student_id, family_id, guardian_id)
values
  ('f6000000-0000-0000-0000-000000000051', 'f6000000-0000-0000-0000-0000000000f1', 'f6000000-0000-0000-0000-000000000063'),
  ('f6000000-0000-0000-0000-000000000052', 'f6000000-0000-0000-0000-0000000000f2', 'f6000000-0000-0000-0000-000000000064')
on conflict do nothing;

insert into public.enrollments (student_id, class_id, school_year_id, status)
values
  ('f6000000-0000-0000-0000-000000000051', 'f6000000-0000-0000-0000-0000000000c1', 'f6000000-0000-0000-0000-000000000001', 'aktiv'),
  ('f6000000-0000-0000-0000-000000000052', 'f6000000-0000-0000-0000-0000000000c2', 'f6000000-0000-0000-0000-000000000001', 'aktiv');

insert into public.class_teachers (class_id, guardian_id, school_year_id)
values
  ('f6000000-0000-0000-0000-0000000000c1', 'f6000000-0000-0000-0000-000000000061', 'f6000000-0000-0000-0000-000000000001'),
  ('f6000000-0000-0000-0000-0000000000c2', 'f6000000-0000-0000-0000-000000000062', 'f6000000-0000-0000-0000-000000000001');

update public.enrollments set created_at = statement_timestamp() - interval '40 days';
insert into public.school_days (id, school_year_id, date) values
  ('f6000000-0000-0000-0000-0000000000d1', 'f6000000-0000-0000-0000-000000000001', date_trunc('week', current_date)::date - 1),
  ('f6000000-0000-0000-0000-0000000000d2', 'f6000000-0000-0000-0000-000000000001', date_trunc('week', current_date)::date + 13);
insert into public.school_days(id, school_year_id, date, cancelled) values
('f6000000-0000-0000-0000-0000000000d3','f6000000-0000-0000-0000-000000000001', date_trunc('week', current_date)::date - 8, false),
('f6000000-0000-0000-0000-0000000000d4','f6000000-0000-0000-0000-000000000001', date_trunc('week', current_date)::date - 15, false),
('f6000000-0000-0000-0000-0000000000d5','f6000000-0000-0000-0000-000000000001', date_trunc('week', current_date)::date - 22, true),
('f6000000-0000-0000-0000-0000000000d6','f6000000-0000-0000-0000-000000000001', date_trunc('week', current_date)::date - 2, false);
insert into public.attendance(student_id, school_day_id, status) values
('f6000000-0000-0000-0000-000000000051','f6000000-0000-0000-0000-0000000000d1','fravaer'),
('f6000000-0000-0000-0000-000000000051','f6000000-0000-0000-0000-0000000000d3','til_stede');
insert into public.learning_goals(id, student_id, subject, title, status, next_target, updated_by_name, created_at) values
('f6000000-0000-0000-0000-0000000000e1','f6000000-0000-0000-0000-000000000051','arabic','ZZTEST Reading','achieved','Future target','Teacher',current_date - 30);
insert into public.learning_progress_updates(goal_id, student_id, status, feedback, next_target, teacher_name, created_at) values
('f6000000-0000-0000-0000-0000000000e1','f6000000-0000-0000-0000-000000000051','practising','Good effort','Current target','Teacher', current_date - 29),
('f6000000-0000-0000-0000-0000000000e1','f6000000-0000-0000-0000-000000000051','achieved','Future progress','Future target','Teacher', current_date + 30);
select set_config('request.jwt.claims', '{"sub":"f6000000-0000-0000-0000-0000000000a2","email":"zz-f6-teacher@zztest.local","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$ select public.prepare_term_report('f6000000-0000-0000-0000-000000000051','f6000000-0000-0000-0000-000000000001','autumn') $$, 'teacher prepares draft');
select lives_ok($$ select public.prepare_term_report('f6000000-0000-0000-0000-000000000051','f6000000-0000-0000-0000-000000000001','autumn') $$, 'draft creation is repeatable');
select is((select count(*) from public.term_reports),1::bigint,'reopening does not duplicate draft');
select is((select snapshot->'attendance'->>'total' from public.term_reports),'3','only noncancelled school Sundays during enrollment count');
select is((select snapshot->'attendance'->>'unrecorded' from public.term_reports),'1','unrecorded attendance stays separate');
select is((select snapshot->'attendance'->>'absent' from public.term_reports),'1','recorded absence counts once');
select is((select snapshot->'goals'->0->>'status' from public.term_reports),'practising','future progress does not change current report');
select is((select next_steps from public.term_reports),'Current target','draft targets use progress as of report period');
select throws_ok($$ select public.prepare_term_report('f6000000-0000-0000-0000-000000000052','f6000000-0000-0000-0000-000000000001','autumn') $$,'42501',null,'another class is forbidden');
select throws_ok($$ select public.publish_term_report(id, updated_at, gen_random_uuid()) from public.term_reports $$,'22023',null,'unreviewed blank assessment cannot publish');
select throws_ok($$ select public.save_term_report(id, null, 'Assessment', 'Practice', false) from public.term_reports $$,'40001',null,'null version cannot bypass review');
select lives_ok($$ select public.save_term_report(id, updated_at, 'ZZTEST Reviewed assessment', 'ZZTEST Practice reading', false) from public.term_reports $$,'staff saves editable assessment');
select throws_ok($$ select public.save_term_report(id, '2000-01-01'::timestamptz, 'Stale', '', false) from public.term_reports $$,'40001',null,'stale draft cannot overwrite another teacher');
select lives_ok($$ select public.publish_term_report(id, updated_at, 'f6000000-0000-0000-0000-000000000071') from public.term_reports $$,'staff publishes reviewed report');
select lives_ok($$ select public.publish_term_report(id, updated_at, 'f6000000-0000-0000-0000-000000000071') from public.term_reports $$,'publish retry is idempotent');
select is((select count(*) from public.term_report_publications),1::bigint,'retry creates only one published copy');
select throws_ok($$ update public.term_report_publications set snapshot = '{}' $$,'42501',null,'published copies cannot be edited directly');
select lives_ok($$ select public.save_term_report(id, updated_at, 'ZZTEST New private draft', '', false) from public.term_reports $$,'staff can edit next draft');
select is((select snapshot->>'summary' from public.term_report_publications),'ZZTEST Reviewed assessment','published assessment survives later draft edits');
reset role;
select is((select count(*) from public.school_email_deliveries where kind='report_published' and email='zz-f6-parent@zztest.local'),1::bigint,'publication queues one guardian email');
select is((select count(*) from public.school_email_deliveries where kind='report_published' and email='zz-f6-student@zztest.local'),0::bigint,'publication email goes to guardians only');
select set_config('request.jwt.claims', '{"sub":"f6000000-0000-0000-0000-0000000000a4","email":"zz-f6-parent@zztest.local","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*) from public.term_reports),0::bigint,'guardian cannot read draft');
select is((select snapshot->>'summary' from public.term_report_publications),'ZZTEST Reviewed assessment','guardian sees reviewed publication only');
select throws_ok($$ select public.prepare_term_report('f6000000-0000-0000-0000-000000000051','f6000000-0000-0000-0000-000000000001','autumn') $$,'42501',null,'guardian cannot prepare reports');
reset role;
select set_config('request.jwt.claims', '{"sub":"f6000000-0000-0000-0000-0000000000a5","email":"zz-f6-other-parent@zztest.local","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*) from public.term_report_publications),0::bigint,'unrelated guardian cannot see publication');
reset role;
select set_config('request.jwt.claims', '{"sub":"f6000000-0000-0000-0000-0000000000a6","email":"zz-f6-student@zztest.local","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*) from public.term_report_publications),1::bigint,'student sees own publication');
select is((select count(*) from public.term_reports),0::bigint,'student cannot see draft');
reset role;
set local role anon;
select throws_ok($$ select * from public.term_report_publications $$,'42501',null,'anonymous access is forbidden');
reset role;
select * from finish();
rollback;
