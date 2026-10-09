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

select set_config('request.jwt.claims', '{"sub":"f2000000-0000-0000-0000-0000000000a2","email":"zz-f2-teacher@zztest.local","role":"authenticated"}', true);
set local role authenticated;

select throws_ok($$ select public.publish_announcement('f2000000-0000-0000-0000-0000000000e1', null, 'Skolen', 'Alle', true, true) $$, '42501', 'Forbidden', 'a teacher cannot publish school-wide');
select throws_ok($$ select public.publish_announcement('f2000000-0000-0000-0000-0000000000e1', 'f2000000-0000-0000-0000-0000000000c2', 'Annen klasse', 'Alle', true, true) $$, '42501', 'Forbidden', 'a teacher cannot publish to another class');
select lives_ok($$ select public.publish_announcement('f2000000-0000-0000-0000-0000000000e1', 'f2000000-0000-0000-0000-0000000000c1', 'Ta med bok', 'Husk boken på søndag.', true, true) $$, 'a teacher publishes to their own class');
select lives_ok($$ select public.publish_announcement('f2000000-0000-0000-0000-0000000000e1', 'f2000000-0000-0000-0000-0000000000c1', 'Ta med bok', 'Husk boken på søndag.', true, true) $$, 'a repeated publication is idempotent');
select throws_ok($$ select public.publish_announcement('f2000000-0000-0000-0000-0000000000e1', 'f2000000-0000-0000-0000-0000000000c1', 'Annen tittel', 'Husk boken på søndag.', true, true) $$, '23505', 'Announcement already exists', 'published content is immutable');
select is((select family_count::int from public.announcement_audience('f2000000-0000-0000-0000-0000000000c1')), 1, 'preview counts families');
select is((select email_status from public.announcement_family_status('f2000000-0000-0000-0000-0000000000e1')), 'pending', 'the sender sees queued email');
select throws_ok($$ select * from public.announcement_deliveries $$, '42501', null, 'delivery email addresses are not exposed to teachers');
select throws_ok($$ select public.claim_announcement_emails(null, 25) $$, '42501', null, 'authenticated users cannot claim the delivery queue');

select set_config('request.jwt.claims', '{"sub":"f2000000-0000-0000-0000-0000000000a4","email":"zz-f2-parent@zztest.local","role":"authenticated"}', true);
select is((select count(*)::int from public.school_announcements), 1, 'a recipient guardian reads the announcement');
select lives_ok($$ select public.acknowledge_announcement('f2000000-0000-0000-0000-0000000000e1', 'f2000000-0000-0000-0000-0000000000f1') $$, 'a guardian acknowledges for the family');
select lives_ok($$ select public.acknowledge_announcement('f2000000-0000-0000-0000-0000000000e1', 'f2000000-0000-0000-0000-0000000000f1') $$, 'repeated acknowledgement is idempotent');
select ok((select acknowledged_at is not null from public.announcement_families limit 1), 'acknowledgement is persisted');
select throws_ok($$ select public.acknowledge_announcement('f2000000-0000-0000-0000-0000000000e1', 'f2000000-0000-0000-0000-0000000000f2') $$, '42501', 'Forbidden', 'a guardian cannot acknowledge for another family');
select throws_ok($$ update public.announcement_families set acknowledged_at = null $$, '42501', null, 'a guardian cannot erase acknowledgement');
select throws_ok($$ select public.announcement_family_status('f2000000-0000-0000-0000-0000000000e1') $$, '42501', 'Forbidden', 'guardians cannot read other families delivery reports');
select throws_ok($$ select public.retry_announcement_emails('f2000000-0000-0000-0000-0000000000e1') $$, '42501', 'Forbidden', 'guardians cannot retry delivery');
select throws_ok($$ select public.publish_announcement('f2000000-0000-0000-0000-0000000000e2', null, 'Hei', 'Hei', false, false) $$, '42501', 'Forbidden', 'guardians cannot publish');

select set_config('request.jwt.claims', '{"sub":"f2000000-0000-0000-0000-0000000000a5","email":"zz-f2-other-parent@zztest.local","role":"authenticated"}', true);
select is((select count(*)::int from public.school_announcements), 0, 'unrelated families cannot read class announcements');
select is((select count(*)::int from public.announcement_families), 0, 'unrelated families cannot read acknowledgement rows');

select set_config('request.jwt.claims', '{"sub":"f2000000-0000-0000-0000-0000000000a6","email":"zz-f2-student@zztest.local","role":"authenticated"}', true);
select is((select count(*)::int from public.school_announcements), 0, 'guardian announcements are not visible to student logins');

reset role;
insert into public.students (id, family_id, child_first_name, child_last_name)
values ('f2000000-0000-0000-0000-000000000053', 'f2000000-0000-0000-0000-0000000000f1', 'ZZTEST', 'Søsken');
insert into public.enrollments (student_id, class_id, school_year_id, status)
values ('f2000000-0000-0000-0000-000000000053', 'f2000000-0000-0000-0000-0000000000c2', 'f2000000-0000-0000-0000-000000000001', 'aktiv');
insert into public.family_guardians (family_id, guardian_id)
values ('f2000000-0000-0000-0000-0000000000f1', 'f2000000-0000-0000-0000-000000000064');

select set_config('request.jwt.claims', '{"sub":"f2000000-0000-0000-0000-0000000000a1","email":"zz-f2-admin@zztest.local","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$ select public.publish_announcement('f2000000-0000-0000-0000-0000000000e2', null, 'Skolen stengt', 'Vi sees neste uke.', true, true) $$, 'an admin publishes school-wide');
select is((select count(*)::int from public.announcement_families where announcement_id = 'f2000000-0000-0000-0000-0000000000e2'), 2, 'siblings share a family recipient row');
select is((select email_count::int from public.announcement_audience(null)), 2, 'a shared email across families is deduplicated');
select lives_ok($$ select public.publish_announcement('f2000000-0000-0000-0000-0000000000e3', null, 'Kun portal', 'Praktisk informasjon.', false, false) $$, 'an admin publishes without email');
select is((select email_status from public.announcement_family_status('f2000000-0000-0000-0000-0000000000e3') limit 1), 'portal_only', 'portal-only delivery is explicit');

reset role;
select is((select count(*)::int from public.announcement_deliveries where announcement_id = 'f2000000-0000-0000-0000-0000000000e2'), 2, 'one email is queued per distinct address');
select is((select count(*)::int from public.announcement_deliveries where announcement_id = 'f2000000-0000-0000-0000-0000000000e3'), 0, 'portal-only publication never queues email');
select is((select count(*)::int from public.claim_announcement_emails('f2000000-0000-0000-0000-0000000000e2', 25)), 2, 'the worker claims queued email');
select is((select count(*)::int from public.claim_announcement_emails('f2000000-0000-0000-0000-0000000000e2', 25)), 0, 'an active claim cannot be sent concurrently');
update public.announcement_deliveries set status = 'failed', error = 'ZZTEST' where announcement_id = 'f2000000-0000-0000-0000-0000000000e2';

select set_config('request.jwt.claims', '{"sub":"f2000000-0000-0000-0000-0000000000a1","email":"zz-f2-admin@zztest.local","role":"authenticated"}', true);
set local role authenticated;
select is((select email_status from public.announcement_family_status('f2000000-0000-0000-0000-0000000000e2') limit 1), 'failed', 'delivery failures appear in the family report');
select lives_ok($$ select public.retry_announcement_emails('f2000000-0000-0000-0000-0000000000e2') $$, 'the sender can retry failed email');

select set_config('request.jwt.claims', '{"sub":"f2000000-0000-0000-0000-0000000000a5","email":"zz-f2-other-parent@zztest.local","role":"authenticated"}', true);
select lives_ok($$ select public.acknowledge_announcement('f2000000-0000-0000-0000-0000000000e1', 'f2000000-0000-0000-0000-0000000000f1') $$, 'a second guardian shares the family acknowledgement');
select throws_ok($$ select public.acknowledge_announcement('f2000000-0000-0000-0000-0000000000e3', 'f2000000-0000-0000-0000-0000000000f1') $$, '42501', 'Forbidden', 'ordinary notices do not accept acknowledgements');

reset role;
select is((select attempts from public.announcement_deliveries where announcement_id = 'f2000000-0000-0000-0000-0000000000e2' limit 1), 1, 'retries preserve attempt history');
select is((select count(*)::int from public.audit_log where entity_type = 'school_announcements' and entity_id in ('f2000000-0000-0000-0000-0000000000e1', 'f2000000-0000-0000-0000-0000000000e2', 'f2000000-0000-0000-0000-0000000000e3')), 3, 'publication is audited once per announcement');

select set_config('request.jwt.claims', '{"sub":"f2000000-0000-0000-0000-0000000000a2","email":"zz-f2-teacher@zztest.local","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$ select public.finish_announcement_email_batch(gen_random_uuid(), now(), '{}', null) $$, '42501', null, 'users cannot mark email as sent');
reset role;
select is((select count(distinct batch_id)::int from public.claim_announcement_emails('f2000000-0000-0000-0000-0000000000e2', 25)), 1, 'a claimed batch has one durable idempotency key');
create temporary table zz_batch as select batch_id, attempted_at from public.announcement_deliveries where announcement_id = 'f2000000-0000-0000-0000-0000000000e2' limit 1;
update public.announcement_deliveries set attempted_at = now() - interval '16 minutes' where announcement_id = 'f2000000-0000-0000-0000-0000000000e2';
select is((select batch_id from public.claim_announcement_emails('f2000000-0000-0000-0000-0000000000e2', 25) limit 1), (select batch_id from zz_batch), 'expired claims keep their batch key');
select public.finish_announcement_email_batch((select batch_id from zz_batch), (select attempted_at from zz_batch), '{}', null);
select is((select count(*)::int from public.announcement_deliveries where announcement_id = 'f2000000-0000-0000-0000-0000000000e2' and status = 'sending'), 2, 'an expired worker cannot complete a reclaimed batch');
select public.finish_announcement_email_batch((select batch_id from zz_batch), (select attempted_at from public.announcement_deliveries where announcement_id = 'f2000000-0000-0000-0000-0000000000e2' limit 1), '{}', null);
select is((select count(*)::int from public.announcement_deliveries where announcement_id = 'f2000000-0000-0000-0000-0000000000e2' and status = 'sent'), 2, 'batch completion records accepted emails atomically');
select is((select count(*)::int from public.claim_announcement_emails('f2000000-0000-0000-0000-0000000000e2', 25)), 0, 'sent email is never claimed again');

update public.family_guardians set receives_communication = false where family_id = 'f2000000-0000-0000-0000-0000000000f1';
select set_config('request.jwt.claims', '{"sub":"f2000000-0000-0000-0000-0000000000a1","email":"zz-f2-admin@zztest.local","role":"authenticated"}', true);
set local role authenticated;
select is((select missing_email_count::int from public.announcement_audience('f2000000-0000-0000-0000-0000000000c1')), 1, 'communication opt-outs produce a portal-only family');
select lives_ok($$ select public.publish_announcement('f2000000-0000-0000-0000-0000000000e4', 'f2000000-0000-0000-0000-0000000000c1', 'Kun portal for familien', 'Hei', true, false) $$, 'a family without email still receives the portal announcement');
select is((select email_status from public.announcement_family_status('f2000000-0000-0000-0000-0000000000e4')), 'missing_email', 'a missing email recipient is visible to the sender');
select throws_ok($$ select public.publish_announcement(gen_random_uuid(), null, ' ', 'Hei', true, false) $$, '23514', null, 'empty titles are rejected by the database');
reset role;
update public.guardians set teacher_suspended_at = now() where id = 'f2000000-0000-0000-0000-000000000061';
select set_config('request.jwt.claims', '{"sub":"f2000000-0000-0000-0000-0000000000a2","email":"zz-f2-teacher@zztest.local","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$ select public.publish_announcement(gen_random_uuid(), 'f2000000-0000-0000-0000-0000000000c1', 'Hei', 'Hei', true, false) $$, '42501', 'Forbidden', 'suspended teachers cannot publish');
reset role;

select * from finish();
rollback;
