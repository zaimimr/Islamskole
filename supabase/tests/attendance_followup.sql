begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select no_plan();

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into auth.users (id, email, raw_app_meta_data)
values
  ('f7000000-0000-0000-0000-0000000000a1', 'zz-f7-admin@zztest.local', '{"role":"admin"}'),
  ('f7000000-0000-0000-0000-0000000000a2', 'zz-f7-teacher@zztest.local', '{"role":"member"}'),
  ('f7000000-0000-0000-0000-0000000000a3', 'zz-f7-other-teacher@zztest.local', '{"role":"member"}'),
  ('f7000000-0000-0000-0000-0000000000a4', 'zz-f7-parent@zztest.local', '{"role":"member"}'),
  ('f7000000-0000-0000-0000-0000000000a5', 'zz-f7-other-parent@zztest.local', '{"role":"member"}'),
  ('f7000000-0000-0000-0000-0000000000a6', 'zz-f7-student@zztest.local', '{"role":"member"}');

update public.school_years set is_active = false where is_active;

insert into public.school_years (id, label, starts_on, ends_on, is_active)
values
  ('f7000000-0000-0000-0000-000000000001', 'ZZTEST F7 aktiv',
   (now() at time zone 'Europe/Oslo')::date - 60, (now() at time zone 'Europe/Oslo')::date + 200, true),
  ('f7000000-0000-0000-0000-000000000002', 'ZZTEST F7 gammel',
   (now() at time zone 'Europe/Oslo')::date - 400, (now() at time zone 'Europe/Oslo')::date - 61, false);

insert into public.classes (id, slug, name_no, name_en)
values
  ('f7000000-0000-0000-0000-0000000000c1', 'zztest-f2-a', 'ZZTEST F7 A', 'ZZTEST F7 A'),
  ('f7000000-0000-0000-0000-0000000000c2', 'zztest-f2-b', 'ZZTEST F7 B', 'ZZTEST F7 B');

insert into public.families (id, origin)
values
  ('f7000000-0000-0000-0000-0000000000f1', 'test'),
  ('f7000000-0000-0000-0000-0000000000f2', 'test');

insert into public.guardians (id, first_name, last_name, email)
values
  ('f7000000-0000-0000-0000-000000000061', 'ZZTEST', 'Laerer', 'zz-f7-teacher@zztest.local'),
  ('f7000000-0000-0000-0000-000000000062', 'ZZTEST', 'Annen laerer', 'zz-f7-other-teacher@zztest.local'),
  ('f7000000-0000-0000-0000-000000000063', 'ZZTEST', 'Forelder', 'zz-f7-parent@zztest.local'),
  ('f7000000-0000-0000-0000-000000000064', 'ZZTEST', 'Annen forelder', 'zz-f7-other-parent@zztest.local');
insert into public.person_roles (guardian_id, role_key) values ('f7000000-0000-0000-0000-000000000061', 'teacher'), ('f7000000-0000-0000-0000-000000000062', 'teacher');

insert into public.students (id, family_id, child_first_name, child_last_name, child_email)
values
  ('f7000000-0000-0000-0000-000000000051', 'f7000000-0000-0000-0000-0000000000f1', 'ZZTEST', 'Elev A', 'zz-f7-student@zztest.local'),
  ('f7000000-0000-0000-0000-000000000052', 'f7000000-0000-0000-0000-0000000000f2', 'ZZTEST', 'Elev B', null);

insert into public.family_guardians (family_id, guardian_id, is_primary_contact)
values
  ('f7000000-0000-0000-0000-0000000000f1', 'f7000000-0000-0000-0000-000000000063', true),
  ('f7000000-0000-0000-0000-0000000000f2', 'f7000000-0000-0000-0000-000000000064', true);

insert into public.student_guardians (student_id, family_id, guardian_id)
values
  ('f7000000-0000-0000-0000-000000000051', 'f7000000-0000-0000-0000-0000000000f1', 'f7000000-0000-0000-0000-000000000063'),
  ('f7000000-0000-0000-0000-000000000052', 'f7000000-0000-0000-0000-0000000000f2', 'f7000000-0000-0000-0000-000000000064')
on conflict do nothing;

insert into public.enrollments (student_id, class_id, school_year_id, status)
values
  ('f7000000-0000-0000-0000-000000000051', 'f7000000-0000-0000-0000-0000000000c1', 'f7000000-0000-0000-0000-000000000001', 'aktiv'),
  ('f7000000-0000-0000-0000-000000000052', 'f7000000-0000-0000-0000-0000000000c2', 'f7000000-0000-0000-0000-000000000001', 'aktiv');

insert into public.class_teachers (class_id, guardian_id, school_year_id)
values
  ('f7000000-0000-0000-0000-0000000000c1', 'f7000000-0000-0000-0000-000000000061', 'f7000000-0000-0000-0000-000000000001'),
  ('f7000000-0000-0000-0000-0000000000c2', 'f7000000-0000-0000-0000-000000000062', 'f7000000-0000-0000-0000-000000000001');

update public.enrollments set created_at = statement_timestamp() - interval '40 days';
insert into public.school_days (id, school_year_id, date) values
  ('f7000000-0000-0000-0000-0000000000d1', 'f7000000-0000-0000-0000-000000000001', date_trunc('week', current_date)::date - 1),
  ('f7000000-0000-0000-0000-0000000000d2', 'f7000000-0000-0000-0000-000000000001', date_trunc('week', current_date)::date + 13);
insert into public.school_days(id, school_year_id, date, cancelled) values
('f7000000-0000-0000-0000-0000000000d3','f7000000-0000-0000-0000-000000000001',date_trunc('week',current_date)::date - 8,false),
('f7000000-0000-0000-0000-0000000000d4','f7000000-0000-0000-0000-000000000001',date_trunc('week',current_date)::date - 15,false),
('f7000000-0000-0000-0000-0000000000d5','f7000000-0000-0000-0000-000000000001',date_trunc('week',current_date)::date - 22,true),
('f7000000-0000-0000-0000-0000000000d6','f7000000-0000-0000-0000-000000000001',date_trunc('week',current_date)::date - 2,false);
insert into public.attendance(student_id,school_day_id,status) values
('f7000000-0000-0000-0000-000000000051','f7000000-0000-0000-0000-0000000000d1','fravaer'),
('f7000000-0000-0000-0000-000000000051','f7000000-0000-0000-0000-0000000000d2','fravaer'),
('f7000000-0000-0000-0000-000000000051','f7000000-0000-0000-0000-0000000000d3','meldt_fravaer'),
('f7000000-0000-0000-0000-000000000051','f7000000-0000-0000-0000-0000000000d4','fravaer'),
('f7000000-0000-0000-0000-000000000051','f7000000-0000-0000-0000-0000000000d5','fravaer'),
('f7000000-0000-0000-0000-000000000051','f7000000-0000-0000-0000-0000000000d6','fravaer');
select set_config('request.jwt.claims','{"sub":"f7000000-0000-0000-0000-0000000000a2","email":"zz-f7-teacher@zztest.local","role":"authenticated"}',true);
set local role authenticated;
select is((select missed from public.class_absence_streaks('f7000000-0000-0000-0000-0000000000c1','f7000000-0000-0000-0000-000000000001')),3,'streak counts actual noncancelled school Sundays only');
select lives_ok($$ select public.record_attendance_followup('f7000000-0000-0000-0000-000000000071','f7000000-0000-0000-0000-000000000051','f7000000-0000-0000-0000-0000000000c1','f7000000-0000-0000-0000-000000000001',(select ended_on from public.class_absence_streaks('f7000000-0000-0000-0000-0000000000c1','f7000000-0000-0000-0000-000000000001')),'contacted','ZZTEST Called guardian','') $$,'teacher records contact');
select is((select recorded_by from public.attendance_followups),auth.uid(),'actual staff identity retained');
select lives_ok($$ select public.record_attendance_followup('f7000000-0000-0000-0000-000000000071','f7000000-0000-0000-0000-000000000051','f7000000-0000-0000-0000-0000000000c1','f7000000-0000-0000-0000-000000000001',(select ended_on from public.class_absence_streaks('f7000000-0000-0000-0000-0000000000c1','f7000000-0000-0000-0000-000000000001')),'contacted','ZZTEST Called guardian','') $$,'contact retry is idempotent');
select is((select count(*) from public.attendance_followups),1::bigint,'retry creates no duplicate');
select throws_ok($$ select public.record_attendance_followup(gen_random_uuid(),'f7000000-0000-0000-0000-000000000051','f7000000-0000-0000-0000-0000000000c1','f7000000-0000-0000-0000-000000000001',current_date + 20,'contacted','','') $$,'PT409',null,'stale streak cannot be recorded');
select throws_ok($$ update public.attendance_followups set note='Changed' $$,'42501',null,'history cannot be rewritten directly');
reset role;
select is((select count(*) from public.school_email_deliveries where kind='attendance_followup'),0::bigint,'contact record alone sends no email');
set local role authenticated;
select lives_ok($$ select public.record_attendance_followup('f7000000-0000-0000-0000-000000000072','f7000000-0000-0000-0000-000000000051','f7000000-0000-0000-0000-0000000000c1','f7000000-0000-0000-0000-000000000001',(select ended_on from public.class_absence_streaks('f7000000-0000-0000-0000-0000000000c1','f7000000-0000-0000-0000-000000000001')),'email','ZZTEST Private note','ZZTEST Please contact school') $$,'teacher explicitly queues reviewed email');
reset role;
select is((select count(*) from public.school_email_deliveries where kind='attendance_followup' and email='zz-f7-parent@zztest.local'),1::bigint,'only guardian gets followup email');
select is((select count(*) from public.school_email_deliveries where kind='attendance_followup' and email='zz-f7-student@zztest.local'),0::bigint,'student does not receive guardian followup');
update public.attendance set status='til_stede' where school_day_id='f7000000-0000-0000-0000-0000000000d3';
set local role authenticated;
select is((select count(*) from public.class_absence_streaks('f7000000-0000-0000-0000-0000000000c1','f7000000-0000-0000-0000-000000000001')),0::bigint,'presence breaks the streak');
reset role;
update public.attendance set status='sent' where school_day_id='f7000000-0000-0000-0000-0000000000d3';
set local role authenticated;
select is((select count(*) from public.class_absence_streaks('f7000000-0000-0000-0000-0000000000c1','f7000000-0000-0000-0000-000000000001')),0::bigint,'lateness is not a missed Sunday');
reset role;
delete from public.attendance where school_day_id='f7000000-0000-0000-0000-0000000000d3';
set local role authenticated;
select is((select count(*) from public.class_absence_streaks('f7000000-0000-0000-0000-0000000000c1','f7000000-0000-0000-0000-000000000001')),0::bigint,'missing attendance is not absence');
reset role;
insert into public.attendance(student_id,school_day_id,status) values('f7000000-0000-0000-0000-000000000051','f7000000-0000-0000-0000-0000000000d3','fravaer');
update public.enrollments set created_at=now() where student_id='f7000000-0000-0000-0000-000000000051';
set local role authenticated;
select is((select count(*) from public.class_absence_streaks('f7000000-0000-0000-0000-0000000000c1','f7000000-0000-0000-0000-000000000001')),0::bigint,'dates before enrollment do not count');
reset role;
select set_config('request.jwt.claims','{"sub":"f7000000-0000-0000-0000-0000000000a3","email":"zz-f7-other-teacher@zztest.local","role":"authenticated"}',true);
set local role authenticated;
select throws_ok($$ select * from public.class_absence_streaks('f7000000-0000-0000-0000-0000000000c1','f7000000-0000-0000-0000-000000000001') $$,'42501',null,'unassigned teacher cannot inspect streaks');
select is((select count(*) from public.attendance_followups),0::bigint,'unassigned teacher cannot read followup history');
reset role;
select set_config('request.jwt.claims','{"sub":"f7000000-0000-0000-0000-0000000000a4","email":"zz-f7-parent@zztest.local","role":"authenticated"}',true);
set local role authenticated;
select is((select count(*) from public.attendance_followups),0::bigint,'guardian cannot see private staff notes');
select throws_ok($$ select * from public.class_absence_streaks('f7000000-0000-0000-0000-0000000000c1','f7000000-0000-0000-0000-000000000001') $$,'42501',null,'guardian cannot inspect class streaks');
reset role;
set local role anon;
select throws_ok($$ select * from public.attendance_followups $$,'42501',null,'anonymous history access is forbidden');
reset role;
select * from finish();
rollback;
