begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select no_plan();

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into auth.users (id, email, raw_app_meta_data)
values
  ('5f000000-0000-0000-0000-0000000000a1', 'zz-sfo-admin@zztest.local', '{"role":"admin"}'),
  ('5f000000-0000-0000-0000-0000000000a2', 'zz-sfo-staff@zztest.local', '{"role":"member"}'),
  ('5f000000-0000-0000-0000-0000000000a3', 'zz-sfo-parent@zztest.local', '{"role":"member"}'),
  ('5f000000-0000-0000-0000-0000000000a4', 'zz-sfo-other@zztest.local', '{"role":"member"}'),
  ('5f000000-0000-0000-0000-0000000000a5', 'zz-sfo-teacher@zztest.local', '{"role":"member"}');

update public.school_years set is_active = false where is_active;
insert into public.school_years (id, label, starts_on, ends_on, is_active)
values ('5f000000-0000-0000-0000-000000000001', 'ZZTEST SFO', public.oslo_today() - 60, public.oslo_today() + 200, true);

insert into public.classes (id, slug, name_no, name_en)
values
  ('5f000000-0000-0000-0000-0000000000c1', 'zztest-sfo-a', 'ZZTEST SFO A', 'ZZTEST SFO A'),
  ('5f000000-0000-0000-0000-0000000000c2', 'zztest-sfo-b', 'ZZTEST SFO B', 'ZZTEST SFO B');

insert into public.families (id, origin)
values ('5f000000-0000-0000-0000-0000000000f1', 'test'), ('5f000000-0000-0000-0000-0000000000f2', 'test');

insert into public.guardians (id, first_name, last_name, email, phone)
values
  ('5f000000-0000-0000-0000-000000000061', 'ZZTEST', 'SFO', 'zz-sfo-staff@zztest.local', null),
  ('5f000000-0000-0000-0000-000000000063', 'ZZTEST', 'Forelder', 'zz-sfo-parent@zztest.local', '+4790000001'),
  ('5f000000-0000-0000-0000-000000000064', 'ZZTEST', 'Annen', 'zz-sfo-other@zztest.local', null),
  ('5f000000-0000-0000-0000-000000000065', 'ZZTEST', 'Laerer', 'zz-sfo-teacher@zztest.local', null);
insert into public.person_roles (guardian_id, role_key)
values ('5f000000-0000-0000-0000-000000000061', 'sfo'), ('5f000000-0000-0000-0000-000000000065', 'teacher');

insert into public.family_guardians (family_id, guardian_id, is_primary_contact, receives_communication)
values
  ('5f000000-0000-0000-0000-0000000000f1', '5f000000-0000-0000-0000-000000000063', true, true),
  ('5f000000-0000-0000-0000-0000000000f2', '5f000000-0000-0000-0000-000000000064', true, true);

insert into public.students (id, family_id, child_first_name, child_last_name, child_birth_date, allergies, health_updated_at)
values
  ('5f000000-0000-0000-0000-000000000051', '5f000000-0000-0000-0000-0000000000f1', 'ZZTEST', 'Barn En', make_date(extract(year from public.oslo_today())::int - 8, 3, 1), 'Nøtter', null),
  ('5f000000-0000-0000-0000-000000000053', '5f000000-0000-0000-0000-0000000000f1', 'ZZTEST', 'Barn To', make_date(extract(year from public.oslo_today())::int - 9, 3, 1), null, now()),
  ('5f000000-0000-0000-0000-000000000054', '5f000000-0000-0000-0000-0000000000f1', 'ZZTEST', 'Barn Stor', make_date(extract(year from public.oslo_today())::int - 15, 3, 1), null, now()),
  ('5f000000-0000-0000-0000-000000000052', '5f000000-0000-0000-0000-0000000000f2', 'ZZTEST', 'Barn Annen', make_date(extract(year from public.oslo_today())::int - 8, 3, 1), null, now());

insert into public.enrollments (student_id, class_id, school_year_id, status)
values
  ('5f000000-0000-0000-0000-000000000051', '5f000000-0000-0000-0000-0000000000c1', '5f000000-0000-0000-0000-000000000001', 'aktiv'),
  ('5f000000-0000-0000-0000-000000000053', '5f000000-0000-0000-0000-0000000000c1', '5f000000-0000-0000-0000-000000000001', 'aktiv'),
  ('5f000000-0000-0000-0000-000000000054', '5f000000-0000-0000-0000-0000000000c1', '5f000000-0000-0000-0000-000000000001', 'aktiv'),
  ('5f000000-0000-0000-0000-000000000052', '5f000000-0000-0000-0000-0000000000c2', '5f000000-0000-0000-0000-000000000001', 'aktiv');

insert into public.class_teachers (class_id, guardian_id, school_year_id)
values ('5f000000-0000-0000-0000-0000000000c1', '5f000000-0000-0000-0000-000000000065', '5f000000-0000-0000-0000-000000000001');

insert into public.school_activities (id, owner, class_id, school_year_id, title, consent_text, event_date, respond_by, status)
values ('5f000000-0000-0000-0000-0000000000b9', 'class', '5f000000-0000-0000-0000-0000000000c1', '5f000000-0000-0000-0000-000000000001', 'ZZTEST klassetur', 'Samtykke', public.oslo_today() + 10, public.oslo_today() + 5, 'published');
insert into public.activity_students (activity_id, student_id, student_name)
values ('5f000000-0000-0000-0000-0000000000b9', '5f000000-0000-0000-0000-000000000051', 'ZZTEST Barn En');

create temp table ids (key text primary key, value text);
grant all on ids to authenticated, anon;

select set_config('request.jwt.claims', '{"sub":"5f000000-0000-0000-0000-0000000000a4","email":"zz-sfo-other@zztest.local","role":"authenticated"}', true);
set local role authenticated;

select throws_ok(
  $$ select public.save_sfo_activity('5f000000-0000-0000-0000-0000000000b1', null, 'Tur', '', true, 'Samtykke', public.oslo_today() + 14, public.oslo_today() + 7, null, null, null, 1, 5, 12, 15000, public.oslo_today() + 7, true, array['5f000000-0000-0000-0000-0000000000c1']::uuid[]) $$,
  '42501', null, 'a parent without SFO role cannot create SFO activities');
select throws_ok($$ select * from public.class_activity_overview() $$, '42501', null, 'a parent cannot read the class activity overview');

select set_config('request.jwt.claims', '{"sub":"5f000000-0000-0000-0000-0000000000a2","email":"zz-sfo-staff@zztest.local","role":"authenticated"}', true);

select lives_ok(
  $$ select public.save_sfo_activity('5f000000-0000-0000-0000-0000000000b1', null, 'ZZTEST Tur', 'Beskrivelse', true, 'Samtykke til tur', public.oslo_today() + 14, public.oslo_today() + 7, 'Skogen', '10:00', '14:00', 1, 5, 12, 15000, public.oslo_today() + 7, true, array['5f000000-0000-0000-0000-0000000000c1']::uuid[]) $$,
  'SFO creates a draft activity');
select is((select owner || ':' || coalesce(class_id::text, 'none') from public.school_activities where id = '5f000000-0000-0000-0000-0000000000b1'), 'sfo:none', 'SFO activity has no class owner');
select is((select count(*) from public.activity_audience where activity_id = '5f000000-0000-0000-0000-0000000000b1'), 1::bigint, 'audience is stored');
select throws_ok(
  $$ select public.save_sfo_activity('5f000000-0000-0000-0000-0000000000b9', (select updated_at from public.school_activities where id = '5f000000-0000-0000-0000-0000000000b9'), 'Kapret', '', true, 'x', public.oslo_today() + 14, public.oslo_today() + 7, null, null, null, null, null, null, null, null, false, '{}') $$,
  '42501', null, 'SFO cannot edit a class activity');
select throws_ok(
  $$ select public.cancel_school_activity('5f000000-0000-0000-0000-0000000000b9', (select updated_at from public.school_activities where id = '5f000000-0000-0000-0000-0000000000b9')) $$,
  '42501', null, 'SFO cannot cancel a class activity');
select is((select count(*) from public.activity_students where activity_id = '5f000000-0000-0000-0000-0000000000b9'), 0::bigint, 'SFO cannot read the class activity roster');
select is((select count(*) from public.class_activity_overview()), 1::bigint, 'SFO with class.read sees the class activity overview');
select is((select invited from public.class_activity_overview()), 1, 'overview counts invited children');
select is((select count(*) from public.students), 0::bigint, 'SFO cannot browse students');
select is((select count(*) from public.sadaqa_gifts), 0::bigint, 'SFO cannot read sadaqa directly');
select is((select count(*) from public.payments), 0::bigint, 'SFO cannot read payments');
select is((select count(*) from public.student_fees), 0::bigint, 'SFO cannot read tuition fees');

select lives_ok($$ select public.publish_school_activity('5f000000-0000-0000-0000-0000000000b1', (select updated_at from public.school_activities where id = '5f000000-0000-0000-0000-0000000000b1')) $$, 'SFO publishes');
select is(
  (select array_agg(student_id order by student_id) from public.activity_students where activity_id = '5f000000-0000-0000-0000-0000000000b1'),
  array['5f000000-0000-0000-0000-000000000051', '5f000000-0000-0000-0000-000000000053']::uuid[],
  'only enrolled children in the audience and age range are invited');

reset role;
select is((select count(*) from public.school_email_deliveries where kind = 'activity_consent' and entity_id = '5f000000-0000-0000-0000-0000000000b1'), 1::bigint, 'invite queued to the invited family only');

select set_config('request.jwt.claims', '{"sub":"5f000000-0000-0000-0000-0000000000a4","email":"zz-sfo-other@zztest.local","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*) from public.school_activities where id = '5f000000-0000-0000-0000-0000000000b1'), 0::bigint, 'a parent outside the audience cannot see the activity');

select set_config('request.jwt.claims', '{"sub":"5f000000-0000-0000-0000-0000000000a3","email":"zz-sfo-parent@zztest.local","role":"authenticated"}', true);
select is((select count(*) from public.school_activities where id = '5f000000-0000-0000-0000-0000000000b1'), 1::bigint, 'an invited parent sees the activity');
select throws_ok(
  $$ select public.respond_school_activity(gen_random_uuid(), '5f000000-0000-0000-0000-0000000000b1', '5f000000-0000-0000-0000-000000000051', (select updated_at from public.school_activities where id = '5f000000-0000-0000-0000-0000000000b1'), 'granted', true) $$,
  'PT428', null, 'old health info must be confirmed before signing up');
select lives_ok(
  $$ select public.respond_school_activity(gen_random_uuid(), '5f000000-0000-0000-0000-0000000000b1', '5f000000-0000-0000-0000-000000000051', (select updated_at from public.school_activities where id = '5f000000-0000-0000-0000-0000000000b1'), 'granted', true, true) $$,
  'parent signs up after confirming health info');
select throws_ok(
  $$ select public.respond_school_activity(gen_random_uuid(), '5f000000-0000-0000-0000-0000000000b1', '5f000000-0000-0000-0000-000000000053', (select updated_at from public.school_activities where id = '5f000000-0000-0000-0000-0000000000b1'), 'granted', true, true) $$,
  'PT422', null, 'a full activity refuses more sign-ups');
select lives_ok(
  $$ select public.respond_school_activity(gen_random_uuid(), '5f000000-0000-0000-0000-0000000000b1', '5f000000-0000-0000-0000-000000000053', (select updated_at from public.school_activities where id = '5f000000-0000-0000-0000-0000000000b1'), 'granted', false) $$,
  'a full activity still accepts not going');
select is(public.activity_spots_left('5f000000-0000-0000-0000-0000000000b1'), 0, 'no spots left');
select throws_ok($$ select * from public.sfo_activity_roster('5f000000-0000-0000-0000-0000000000b1') $$, '42501', null, 'a parent cannot read the roster');

reset role;
select ok((select health_updated_at is not null from public.students where id = '5f000000-0000-0000-0000-000000000051'), 'confirming health info stamps the child');

select set_config('request.jwt.claims', '{"sub":"5f000000-0000-0000-0000-0000000000a2","email":"zz-sfo-staff@zztest.local","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*) from public.sfo_activity_roster('5f000000-0000-0000-0000-0000000000b1')), 2::bigint, 'roster lists children with a response');
select is((select allergies from public.sfo_activity_roster('5f000000-0000-0000-0000-0000000000b1') where student_id = '5f000000-0000-0000-0000-000000000051'), 'Nøtter', 'roster shows allergies');
select is((select guardians -> 0 ->> 'phone' from public.sfo_activity_roster('5f000000-0000-0000-0000-0000000000b1') where student_id = '5f000000-0000-0000-0000-000000000051'), '+4790000001', 'roster shows guardian phone');
select is((select count(*) from public.students), 0::bigint, 'roster access does not open the students table');
select lives_ok($$ select public.register_activity_cash('5f000000-0000-0000-0000-0000000000b1', '5f000000-0000-0000-0000-000000000051', 5000, public.oslo_today()) $$, 'SFO registers cash');
select throws_ok($$ select public.register_activity_cash('5f000000-0000-0000-0000-0000000000b1', '5f000000-0000-0000-0000-000000000052', 5000, public.oslo_today()) $$, '22023', null, 'cash only for invited children');
select is((select paid_ore from public.sfo_activity_payments('5f000000-0000-0000-0000-0000000000b1') where student_id = '5f000000-0000-0000-0000-000000000051'), 5000, 'paid status includes cash');
select is((select count(*) from public.sadaqa_gifts), 0::bigint, 'SFO still cannot read sadaqa directly');
select throws_ok($$ select * from public.activity_refunds('5f000000-0000-0000-0000-0000000000b1') $$, '42501', null, 'refund list is admin only');
select throws_ok(
  $$ select public.save_sfo_activity('5f000000-0000-0000-0000-0000000000b1', (select updated_at from public.school_activities where id = '5f000000-0000-0000-0000-0000000000b1'), 'ZZTEST Tur', 'Beskrivelse', true, 'Samtykke til tur', public.oslo_today() + 14, public.oslo_today() + 7, 'Skogen', '10:00', '14:00', 1, 5, 12, 20000, public.oslo_today() + 7, true, array['5f000000-0000-0000-0000-0000000000c1']::uuid[]) $$,
  '23514', null, 'price cannot change after publish');
select lives_ok(
  $$ select public.save_sfo_activity('5f000000-0000-0000-0000-0000000000b1', (select updated_at from public.school_activities where id = '5f000000-0000-0000-0000-0000000000b1'), 'ZZTEST Tur', 'Beskrivelse', true, 'Samtykke til tur', public.oslo_today() + 14, public.oslo_today() + 7, 'Stranda', '10:00', '14:00', 1, 5, 12, 15000, public.oslo_today() + 7, true, array['5f000000-0000-0000-0000-0000000000c1']::uuid[]) $$,
  'place can change after publish');
select is((select count(*) from public.activity_changes where activity_id = '5f000000-0000-0000-0000-0000000000b1'), 1::bigint, 'change is recorded');

reset role;
select is((select count(*) from public.school_email_deliveries where kind = 'activity_changed'), 1::bigint, 'change notice queued for going families');
select is((select count(*) from public.audit_log where action = 'sfo.roster.read' and entity_id = '5f000000-0000-0000-0000-0000000000b1'), 3::bigint, 'every roster read is audit logged');

select set_config('request.jwt.claims', '{"sub":"5f000000-0000-0000-0000-0000000000a3","email":"zz-sfo-parent@zztest.local","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$ select * from public.create_activity_payment('5f000000-0000-0000-0000-0000000000b1', array['5f000000-0000-0000-0000-000000000053']::uuid[]) $$, '42501', null, 'cannot pay for a child who is not going');
insert into ids select unnest(array['payment', 'amount']), unnest(array[payment_id::text, amount::text]) from public.create_activity_payment('5f000000-0000-0000-0000-0000000000b1', array['5f000000-0000-0000-0000-000000000051']::uuid[]);
select is((select value from ids where key = 'amount'), '10000', 'Vipps amount is the unpaid remainder');

select set_config('request.jwt.claims', '{"sub":"5f000000-0000-0000-0000-0000000000a4","email":"zz-sfo-other@zztest.local","role":"authenticated"}', true);
select throws_ok($$ select * from public.create_activity_payment('5f000000-0000-0000-0000-0000000000b1', array['5f000000-0000-0000-0000-000000000051']::uuid[]) $$, '42501', null, 'cannot pay for another family');
select throws_ok($$ select public.record_activity_payment((select value::uuid from ids where key = 'payment')) $$, '42501', null, 'only the service role records Vipps captures');

reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(public.record_activity_payment((select value::uuid from ids where key = 'payment')), 0, 'nothing is recorded before capture');
update public.payments set status = 'fanget', captured_amount = 10000, authorized_amount = 10000, captured_at = now() where id = (select value::uuid from ids where key = 'payment');
select is(public.record_activity_payment((select value::uuid from ids where key = 'payment')), 1, 'capture creates one gift per child');
select is(public.record_activity_payment((select value::uuid from ids where key = 'payment')), 0, 'recording a capture twice is a no-op');
select is(public.activity_paid_ore('5f000000-0000-0000-0000-0000000000b1', '5f000000-0000-0000-0000-000000000051'), 15000, 'child is fully paid');
select is((select count(*) from public.student_fees where student_id = '5f000000-0000-0000-0000-000000000051' and amount = 15000), 0::bigint, 'trip payment never becomes tuition');

select set_config('request.jwt.claims', '{"sub":"5f000000-0000-0000-0000-0000000000a3","email":"zz-sfo-parent@zztest.local","role":"authenticated"}', true);
set local role authenticated;
select is((select paid_ore from public.my_activity_status('5f000000-0000-0000-0000-000000000051') where activity_id = '5f000000-0000-0000-0000-0000000000b1'), 15000, 'parent sees what is paid');
select is((select health_confirm_needed from public.my_activity_status('5f000000-0000-0000-0000-000000000051') where activity_id = '5f000000-0000-0000-0000-0000000000b1'), false, 'confirmed health is not asked again');
select set_config('request.jwt.claims', '{"sub":"5f000000-0000-0000-0000-0000000000a4","email":"zz-sfo-other@zztest.local","role":"authenticated"}', true);
select is((select count(*) from public.my_activity_status('5f000000-0000-0000-0000-000000000051')), 0::bigint, 'another family sees no status');
reset role;

select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select is((select spots_left from public.public_sfo_activities() where id = '5f000000-0000-0000-0000-0000000000b1'), 0, 'public listing shows the activity as full');
select throws_ok($$ select count(*) from public.school_activities $$, '42501', null, 'anonymous visitors cannot read activities directly');

reset role;
select set_config('request.jwt.claims', '{"sub":"5f000000-0000-0000-0000-0000000000a2","email":"zz-sfo-staff@zztest.local","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$ select public.save_sfo_activity('5f000000-0000-0000-0000-0000000000b2', null, 'ZZTEST Gratis', '', false, '', public.oslo_today() + 3, public.oslo_today() + 1, null, null, null, null, null, null, null, null, false, '{}') $$,
  'SFO creates a free activity without consent for all classes');
select lives_ok($$ select public.publish_school_activity('5f000000-0000-0000-0000-0000000000b2', (select updated_at from public.school_activities where id = '5f000000-0000-0000-0000-0000000000b2')) $$, 'free activity is published');
select is((select count(*) from public.activity_students where activity_id = '5f000000-0000-0000-0000-0000000000b2'), 4::bigint, 'all enrolled children are invited when no audience is set');
select throws_ok(
  $$ select public.cancel_school_activity('5f000000-0000-0000-0000-0000000000b1', (select updated_at from public.school_activities where id = '5f000000-0000-0000-0000-0000000000b1')) $$,
  '22023', null, 'cancelling a priced activity needs a refund choice');
select lives_ok(
  $$ select public.cancel_school_activity('5f000000-0000-0000-0000-0000000000b1', (select updated_at from public.school_activities where id = '5f000000-0000-0000-0000-0000000000b1'), 'amount', 10000) $$,
  'SFO cancels with a refund amount');

select set_config('request.jwt.claims', '{"sub":"5f000000-0000-0000-0000-0000000000a3","email":"zz-sfo-parent@zztest.local","role":"authenticated"}', true);
select throws_ok(
  $$ select public.respond_school_activity(gen_random_uuid(), '5f000000-0000-0000-0000-0000000000b2', '5f000000-0000-0000-0000-000000000053', (select updated_at from public.school_activities where id = '5f000000-0000-0000-0000-0000000000b2'), 'declined', false) $$,
  '22023', null, 'declining consent is not possible when no consent is needed');

reset role;
select is((select count(*) from public.school_email_deliveries where kind = 'activity_cancelled' and entity_id = '5f000000-0000-0000-0000-0000000000b1'), 1::bigint, 'cancel notice goes to going families only');
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(public.queue_activity_reminders(), 2, 'reminders are queued to families without a response');
select is(public.queue_activity_reminders(), 0, 'reminders are queued once');

select set_config('request.jwt.claims', '{"sub":"5f000000-0000-0000-0000-0000000000a1","email":"zz-sfo-admin@zztest.local","role":"authenticated"}', true);
set local role authenticated;
select is((select refund_ore from public.activity_refunds('5f000000-0000-0000-0000-0000000000b1') where student_id = '5f000000-0000-0000-0000-000000000051'), 10000, 'refund list uses the chosen amount');
select is((select count(*) from public.sadaqa_gifts where activity_id = '5f000000-0000-0000-0000-0000000000b1'), 2::bigint, 'admin sees activity gifts in sadaqa');

select set_config('request.jwt.claims', '{"sub":"5f000000-0000-0000-0000-0000000000a5","email":"zz-sfo-teacher@zztest.local","role":"authenticated"}', true);
select ok(public.activity_can_staff('5f000000-0000-0000-0000-0000000000b9'), 'class teacher still manages class activities');
select ok(not public.activity_can_staff('5f000000-0000-0000-0000-0000000000b2'), 'class teacher cannot manage SFO activities');

select * from finish();

rollback;
