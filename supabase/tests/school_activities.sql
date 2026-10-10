begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select no_plan();

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into auth.users (id, email, raw_app_meta_data)
values
  ('f8000000-0000-0000-0000-0000000000a1', 'zz-f8-admin@zztest.local', '{"role":"admin"}'),
  ('f8000000-0000-0000-0000-0000000000a2', 'zz-f8-teacher@zztest.local', '{"role":"member"}'),
  ('f8000000-0000-0000-0000-0000000000a3', 'zz-f8-other-teacher@zztest.local', '{"role":"member"}'),
  ('f8000000-0000-0000-0000-0000000000a4', 'zz-f8-parent@zztest.local', '{"role":"member"}'),
  ('f8000000-0000-0000-0000-0000000000a5', 'zz-f8-other-parent@zztest.local', '{"role":"member"}'),
  ('f8000000-0000-0000-0000-0000000000a6', 'zz-f8-student@zztest.local', '{"role":"member"}');

update public.school_years set is_active = false where is_active;

insert into public.school_years (id, label, starts_on, ends_on, is_active)
values
  ('f8000000-0000-0000-0000-000000000001', 'ZZTEST F8 aktiv',
   (now() at time zone 'Europe/Oslo')::date - 60, (now() at time zone 'Europe/Oslo')::date + 200, true),
  ('f8000000-0000-0000-0000-000000000002', 'ZZTEST F8 gammel',
   (now() at time zone 'Europe/Oslo')::date - 400, (now() at time zone 'Europe/Oslo')::date - 61, false);

insert into public.classes (id, slug, name_no, name_en)
values
  ('f8000000-0000-0000-0000-0000000000c1', 'zztest-f2-a', 'ZZTEST F8 A', 'ZZTEST F8 A'),
  ('f8000000-0000-0000-0000-0000000000c2', 'zztest-f2-b', 'ZZTEST F8 B', 'ZZTEST F8 B');

insert into public.families (id, origin)
values
  ('f8000000-0000-0000-0000-0000000000f1', 'test'),
  ('f8000000-0000-0000-0000-0000000000f2', 'test');

insert into public.guardians (id, first_name, last_name, email, is_teacher)
values
  ('f8000000-0000-0000-0000-000000000061', 'ZZTEST', 'Laerer', 'zz-f8-teacher@zztest.local', true),
  ('f8000000-0000-0000-0000-000000000062', 'ZZTEST', 'Annen laerer', 'zz-f8-other-teacher@zztest.local', true),
  ('f8000000-0000-0000-0000-000000000063', 'ZZTEST', 'Forelder', 'zz-f8-parent@zztest.local', false),
  ('f8000000-0000-0000-0000-000000000064', 'ZZTEST', 'Annen forelder', 'zz-f8-other-parent@zztest.local', false);

insert into public.students (id, family_id, child_first_name, child_last_name, child_email)
values
  ('f8000000-0000-0000-0000-000000000051', 'f8000000-0000-0000-0000-0000000000f1', 'ZZTEST', 'Elev A', 'zz-f8-student@zztest.local'),
  ('f8000000-0000-0000-0000-000000000052', 'f8000000-0000-0000-0000-0000000000f2', 'ZZTEST', 'Elev B', null);

insert into public.family_guardians (family_id, guardian_id, is_primary_contact)
values
  ('f8000000-0000-0000-0000-0000000000f1', 'f8000000-0000-0000-0000-000000000063', true),
  ('f8000000-0000-0000-0000-0000000000f2', 'f8000000-0000-0000-0000-000000000064', true);

insert into public.student_guardians (student_id, family_id, guardian_id)
values
  ('f8000000-0000-0000-0000-000000000051', 'f8000000-0000-0000-0000-0000000000f1', 'f8000000-0000-0000-0000-000000000063'),
  ('f8000000-0000-0000-0000-000000000052', 'f8000000-0000-0000-0000-0000000000f2', 'f8000000-0000-0000-0000-000000000064')
on conflict do nothing;

insert into public.enrollments (student_id, class_id, school_year_id, status)
values
  ('f8000000-0000-0000-0000-000000000051', 'f8000000-0000-0000-0000-0000000000c1', 'f8000000-0000-0000-0000-000000000001', 'aktiv'),
  ('f8000000-0000-0000-0000-000000000052', 'f8000000-0000-0000-0000-0000000000c2', 'f8000000-0000-0000-0000-000000000001', 'aktiv');

insert into public.class_teachers (class_id, guardian_id, school_year_id)
values
  ('f8000000-0000-0000-0000-0000000000c1', 'f8000000-0000-0000-0000-000000000061', 'f8000000-0000-0000-0000-000000000001'),
  ('f8000000-0000-0000-0000-0000000000c2', 'f8000000-0000-0000-0000-000000000062', 'f8000000-0000-0000-0000-000000000001');

update public.enrollments set created_at = statement_timestamp() - interval '40 days';
insert into public.school_days (id, school_year_id, date) values
  ('f8000000-0000-0000-0000-0000000000d1', 'f8000000-0000-0000-0000-000000000001', date_trunc('week', current_date)::date - 1),
  ('f8000000-0000-0000-0000-0000000000d2', 'f8000000-0000-0000-0000-000000000001', date_trunc('week', current_date)::date + 13);
select set_config('request.jwt.claims','{"sub":"f8000000-0000-0000-0000-0000000000a2","email":"zz-f8-teacher@zztest.local","role":"authenticated"}',true);
set local role authenticated;
select lives_ok($$ select public.save_school_activity('f8000000-0000-0000-0000-0000000000e1','f8000000-0000-0000-0000-0000000000c1','f8000000-0000-0000-0000-000000000001',null,'ZZTEST Trip','School activity','I consent to this trip',(select date from public.school_days where id='f8000000-0000-0000-0000-0000000000d2'),current_date) $$,'staff saves activity draft');
select lives_ok($$ select public.save_school_activity('f8000000-0000-0000-0000-0000000000e1','f8000000-0000-0000-0000-0000000000c1','f8000000-0000-0000-0000-000000000001',null,'ZZTEST Trip','School activity','I consent to this trip',(select date from public.school_days where id='f8000000-0000-0000-0000-0000000000d2'),current_date) $$,'creating the same draft again is idempotent');
select throws_ok($$ select public.save_school_activity(gen_random_uuid(),'f8000000-0000-0000-0000-0000000000c2','f8000000-0000-0000-0000-000000000001',null,'Other class','','Consent',current_date + 7,current_date) $$,'42501',null,'staff cannot create for another class');
reset role;
select set_config('request.jwt.claims','{"sub":"f8000000-0000-0000-0000-0000000000a4","email":"zz-f8-parent@zztest.local","role":"authenticated"}',true);
set local role authenticated;
select is((select count(*) from public.school_activities),0::bigint,'guardian cannot read draft activity');
reset role;
select set_config('request.jwt.claims','{"sub":"f8000000-0000-0000-0000-0000000000a2","email":"zz-f8-teacher@zztest.local","role":"authenticated"}',true);
set local role authenticated;
select throws_ok($$ select public.publish_school_activity(id,null) from public.school_activities $$,'40001',null,'publication requires current draft version');
select lives_ok($$ select public.publish_school_activity(id,updated_at) from public.school_activities $$,'staff publishes reviewed invitation');
select lives_ok($$ select public.publish_school_activity(id,updated_at) from public.school_activities $$,'publication retry is idempotent');
select is((select count(*) from public.activity_students),1::bigint,'publication freezes invited children');
select throws_ok($$ select public.save_school_activity(id,class_id,school_year_id,updated_at,'Changed','Changed','New consent',event_date,respond_by) from public.school_activities $$,'23514',null,'published consent wording cannot be silently changed');
select throws_ok($$ select public.record_activity_participation(id,'f8000000-0000-0000-0000-000000000051','participated') from public.school_activities $$,'22023',null,'future participation cannot be recorded');
reset role;
select is((select count(*) from public.school_email_deliveries where kind='activity_consent' and email='zz-f8-parent@zztest.local'),1::bigint,'invitation queues one guardian email');
select is((select count(*) from public.school_email_deliveries where kind='activity_consent' and email='zz-f8-student@zztest.local'),0::bigint,'consent email is guardian only');
insert into public.students(id,family_id,child_first_name,child_last_name) values
('f8000000-0000-0000-0000-000000000053','f8000000-0000-0000-0000-0000000000f1','ZZTEST','Late sibling');
insert into public.enrollments(student_id,class_id,school_year_id,status) values
('f8000000-0000-0000-0000-000000000053','f8000000-0000-0000-0000-0000000000c1','f8000000-0000-0000-0000-000000000001','aktiv');
select set_config('request.jwt.claims','{"sub":"f8000000-0000-0000-0000-0000000000a2","email":"zz-f8-teacher@zztest.local","role":"authenticated"}',true);
set local role authenticated;
select is(public.add_activity_students('f8000000-0000-0000-0000-0000000000e1'),1,'staff adds newly enrolled sibling');
select is(public.add_activity_students('f8000000-0000-0000-0000-0000000000e1'),0,'repeat addition does not invite twice');
reset role;
select is((select count(*) from public.school_email_deliveries where kind='activity_added' and email='zz-f8-parent@zztest.local'),1::bigint,'new sibling has a separate guardian notification');
select is((select count(*) from public.activity_added_invitations where student_id='f8000000-0000-0000-0000-000000000053'),1::bigint,'new invitation remains tied to the child');
select set_config('request.jwt.claims','{"sub":"f8000000-0000-0000-0000-0000000000a4","email":"zz-f8-parent@zztest.local","role":"authenticated"}',true);
set local role authenticated;
select is((select count(*) from public.school_activities),1::bigint,'guardian sees invited activity');
select lives_ok($$ select public.respond_school_activity('f8000000-0000-0000-0000-000000000071',id,'f8000000-0000-0000-0000-000000000051',updated_at,'granted',true) from public.school_activities $$,'guardian consents and plans attendance per child');
select lives_ok($$ select public.respond_school_activity('f8000000-0000-0000-0000-000000000071',id,'f8000000-0000-0000-0000-000000000051',updated_at,'granted',true) from public.school_activities $$,'response retry is idempotent');
select is((select count(*) from public.activity_response_history),1::bigint,'retry retains one consent history entry');
select is((select responded_by from public.activity_responses),auth.uid(),'actual responding guardian is saved');
select is((select consent_text from public.activity_response_history),'I consent to this trip','consent wording retained with guardian decision');
select throws_ok($$ insert into public.activity_responses(activity_id,student_id,consent,going,guardian_name) values('f8000000-0000-0000-0000-0000000000e1','f8000000-0000-0000-0000-000000000051','granted',true,'Forged') $$,'42501',null,'direct responses cannot forge identity');
select throws_ok($$ select public.respond_school_activity(gen_random_uuid(),id,'f8000000-0000-0000-0000-000000000051',updated_at,'declined',true) from public.school_activities $$,'23514',null,'declined consent cannot indicate participation');
select lives_ok($$ select public.respond_school_activity('f8000000-0000-0000-0000-000000000072',id,'f8000000-0000-0000-0000-000000000051',updated_at,'declined',false) from public.school_activities $$,'guardian can change decision before deadline');
select is((select count(*) from public.activity_response_history),2::bigint,'prior decision retained');
select is((select consent from public.activity_responses),'declined','current decision updated');
select throws_ok($$ select public.respond_school_activity(gen_random_uuid(),id,'f8000000-0000-0000-0000-000000000052',updated_at,'granted',true) from public.school_activities $$,'42501',null,'guardian cannot respond for another child');
reset role;
select set_config('request.jwt.claims','{"sub":"f8000000-0000-0000-0000-0000000000a6","email":"zz-f8-student@zztest.local","role":"authenticated"}',true);
set local role authenticated;
select is((select count(*) from public.school_activities),1::bigint,'student can see own invited activity');
select throws_ok($$ select public.respond_school_activity(gen_random_uuid(),id,'f8000000-0000-0000-0000-000000000051',updated_at,'granted',true) from public.school_activities $$,'42501',null,'student cannot grant guardian consent');
reset role;
select set_config('request.jwt.claims','{"sub":"f8000000-0000-0000-0000-0000000000a5","email":"zz-f8-other-parent@zztest.local","role":"authenticated"}',true);
set local role authenticated;
select is((select count(*) from public.school_activities),0::bigint,'uninvited family sees no activity');
select is((select count(*) from public.activity_responses),0::bigint,'unrelated family sees no guardian responses');
reset role;
update public.school_activities set event_date=current_date - 7,respond_by=current_date - 8 where id='f8000000-0000-0000-0000-0000000000e1';
select set_config('request.jwt.claims','{"sub":"f8000000-0000-0000-0000-0000000000a4","email":"zz-f8-parent@zztest.local","role":"authenticated"}',true);
set local role authenticated;
select throws_ok($$ select public.respond_school_activity(gen_random_uuid(),id,'f8000000-0000-0000-0000-000000000051',updated_at,'granted',true) from public.school_activities $$,'40001',null,'deadline closes new guardian responses');
reset role;
select set_config('request.jwt.claims','{"sub":"f8000000-0000-0000-0000-0000000000a2","email":"zz-f8-teacher@zztest.local","role":"authenticated"}',true);
set local role authenticated;
select throws_ok($$ select public.record_activity_participation(id,'f8000000-0000-0000-0000-000000000051','participated') from public.school_activities $$,'22023',null,'staff cannot record participation without consent');
reset role;
update public.activity_responses set consent='granted',going=true;
set local role authenticated;
select lives_ok($$ select public.record_activity_participation(id,'f8000000-0000-0000-0000-000000000051','participated') from public.school_activities $$,'staff records actual participation with consent');
select is((select participation_by from public.activity_students where student_id='f8000000-0000-0000-0000-000000000051'),auth.uid(),'actual participation marker is retained');
select lives_ok($$ select public.cancel_school_activity(id,updated_at) from public.school_activities $$,'staff explicitly cancels activity');
reset role;
select is((select count(*) from public.school_email_deliveries where kind='activity_cancelled' and email='zz-f8-parent@zztest.local'),1::bigint,'cancellation queues guardian notification');
select is((select count(*) from public.activity_response_history where activity_id='f8000000-0000-0000-0000-0000000000e1'),2::bigint,'cancellation retains consent history');
set local role anon;
select throws_ok($$ select * from public.school_activities $$,'42501',null,'anonymous visitors cannot read activities');
reset role;
select * from finish();
rollback;
