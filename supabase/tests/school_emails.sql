begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into auth.users (id, email, raw_app_meta_data) values
  ('e1000000-0000-0000-0000-0000000000a1', 'zz-e1-parent@zztest.local', '{"role":"member"}'),
  ('e1000000-0000-0000-0000-0000000000a2', 'zz-e1-other@zztest.local', '{"role":"member"}'),
  ('e1000000-0000-0000-0000-0000000000a3', 'zz-e1-admin@zztest.local', '{"role":"admin"}');
update public.school_years set is_active = false where is_active;
insert into public.school_years (id, label, starts_on, is_active) values
  ('e1000000-0000-0000-0000-000000000001', 'ZZTEST E1 active', current_date - 60, true),
  ('e1000000-0000-0000-0000-000000000002', 'ZZTEST E1 old', current_date - 500, false);
insert into public.classes (id, slug, name_no, name_en) values
  ('e1000000-0000-0000-0000-0000000000c1', 'zztest-e1', 'ZZTEST E1', 'ZZTEST E1');
insert into public.families (id, origin) values ('e1000000-0000-0000-0000-0000000000f1', 'test');
insert into public.guardians (id, first_name, email) values
  ('e1000000-0000-0000-0000-000000000061', 'ZZTEST Parent', 'zz-e1-parent@zztest.local'),
  ('e1000000-0000-0000-0000-000000000062', 'ZZTEST Opted out', 'zz-e1-optout@zztest.local'),
  ('e1000000-0000-0000-0000-000000000063', 'ZZTEST Placeholder', 'mangler@islamskole.no');
insert into public.family_guardians (family_id, guardian_id, receives_communication) values
  ('e1000000-0000-0000-0000-0000000000f1', 'e1000000-0000-0000-0000-000000000061', true),
  ('e1000000-0000-0000-0000-0000000000f1', 'e1000000-0000-0000-0000-000000000062', false),
  ('e1000000-0000-0000-0000-0000000000f1', 'e1000000-0000-0000-0000-000000000063', true);
insert into public.students (id, family_id, child_first_name, child_email) values
  ('e1000000-0000-0000-0000-000000000051', 'e1000000-0000-0000-0000-0000000000f1', 'ZZTEST A', 'zz-e1-student@zztest.local'),
  ('e1000000-0000-0000-0000-000000000052', 'e1000000-0000-0000-0000-0000000000f1', 'ZZTEST B', null);

select is((select count(*) from public.school_email_deliveries where family_id = 'e1000000-0000-0000-0000-0000000000f1'), 0::bigint, 'unplaced students do not get access-ready email');
insert into public.enrollments (student_id, class_id, school_year_id, status, price_snapshot) values
  ('e1000000-0000-0000-0000-000000000051', 'e1000000-0000-0000-0000-0000000000c1', 'e1000000-0000-0000-0000-000000000002', 'aktiv', 10000);
select is((select count(*) from public.school_email_deliveries where family_id = 'e1000000-0000-0000-0000-0000000000f1'), 0::bigint, 'previous school-year placement does not send a welcome');
insert into public.enrollments (student_id, class_id, school_year_id, status, price_snapshot) values
  ('e1000000-0000-0000-0000-000000000051', 'e1000000-0000-0000-0000-0000000000c1', 'e1000000-0000-0000-0000-000000000001', 'aktiv', 10000),
  ('e1000000-0000-0000-0000-000000000052', 'e1000000-0000-0000-0000-0000000000c1', 'e1000000-0000-0000-0000-000000000001', 'aktiv', 10000);
select is((select count(*) from public.school_email_deliveries where family_id = 'e1000000-0000-0000-0000-0000000000f1' and kind = 'welcome_parent'), 1::bigint, 'siblings produce one parent welcome per address');
select is((select count(*) from public.school_email_deliveries where family_id = 'e1000000-0000-0000-0000-0000000000f1' and kind = 'welcome_student'), 1::bigint, 'only students with a login email receive a student welcome');
select is((select count(*) from public.school_email_deliveries where family_id = 'e1000000-0000-0000-0000-0000000000f1' and email in ('mangler@islamskole.no', 'zz-e1-optout@zztest.local')), 0::bigint, 'opted-out guardians and placeholder addresses are excluded');
update public.enrollments set status = 'aktiv' where student_id = 'e1000000-0000-0000-0000-000000000051';
select is((select count(*) from public.school_email_deliveries where family_id = 'e1000000-0000-0000-0000-0000000000f1'), 2::bigint, 'repeated placement updates do not duplicate welcomes');

insert into public.payments (id, school_year_id, reference, amount, status, method) values
  ('e1000000-0000-0000-0000-000000000071', 'e1000000-0000-0000-0000-000000000001', 'ZZTEST E1 signup', 20000, 'opprettet', 'vipps');
insert into public.student_applications (id, family_id, child_first_name, child_email, status, payment_id) values
  ('e1000000-0000-0000-0000-000000000081', 'e1000000-0000-0000-0000-0000000000f1', 'ZZTEST A', 'proposed@zztest.local', 'ny', 'e1000000-0000-0000-0000-000000000071'),
  ('e1000000-0000-0000-0000-000000000082', 'e1000000-0000-0000-0000-0000000000f1', 'ZZTEST B', null, 'ny', 'e1000000-0000-0000-0000-000000000071');
select is((select count(*) from public.school_email_deliveries where family_id = 'e1000000-0000-0000-0000-0000000000f1' and kind = 'signup_parent'), 1::bigint, 'multi-child signup sends one parent confirmation');
select is((select count(*) from public.school_email_deliveries where family_id = 'e1000000-0000-0000-0000-0000000000f1' and kind = 'signup_student'), 1::bigint, 'application student address gets only signup confirmation');
select is((select count(*) from public.school_email_deliveries where kind = 'welcome_student' and email = 'proposed@zztest.local'), 0::bigint, 'proposed application email does not grant access-ready onboarding');

insert into public.payment_plans (id, family_id, school_year_id, plan_type, created_by) values
  ('e1000000-0000-0000-0000-000000000091', 'e1000000-0000-0000-0000-0000000000f1', 'e1000000-0000-0000-0000-000000000001', 'semester', 'test');
insert into public.installments (id, plan_id, student_id, school_year_id, due_date, amount) values
  ('e1000000-0000-0000-0000-000000000092', 'e1000000-0000-0000-0000-000000000091', 'e1000000-0000-0000-0000-000000000051', 'e1000000-0000-0000-0000-000000000001', current_date - 10, 5000),
  ('e1000000-0000-0000-0000-000000000093', 'e1000000-0000-0000-0000-000000000091', 'e1000000-0000-0000-0000-000000000052', 'e1000000-0000-0000-0000-000000000001', current_date + 30, 5000);
select is((select count(*) from public.school_email_deliveries where family_id = 'e1000000-0000-0000-0000-0000000000f1' and kind = 'plan_confirmed'), 1::bigint, 'all installments share one plan confirmation');
update public.installments set status = 'sendt', payment_id = 'e1000000-0000-0000-0000-000000000071' where id = 'e1000000-0000-0000-0000-000000000092';
select is((select count(*) from public.school_email_deliveries where family_id = 'e1000000-0000-0000-0000-0000000000f1' and kind = 'installment_due'), 1::bigint, 'preparing an installment payment queues a durable notice');

create temp table claimed as select * from public.claim_school_emails(50, 'e1000000-0000-0000-0000-0000000000f1');
select is((select count(*) from claimed), 6::bigint, 'service claims each queued delivery');
select is((select count(*) from public.claim_school_emails(50, 'e1000000-0000-0000-0000-0000000000f1')), 0::bigint, 'live claims are not claimed twice');
select ok(public.finish_school_email(id, attempted_at, 'failed', 'test'), 'failed delivery is recorded') from claimed where kind = 'installment_due';
select is((select count(*) from public.claim_school_emails(50, 'e1000000-0000-0000-0000-0000000000f1')), 0::bigint, 'failed delivery observes retry backoff');
update public.school_email_deliveries set attempted_at = statement_timestamp() - interval '16 minutes' where family_id = 'e1000000-0000-0000-0000-0000000000f1';
select is((select count(*) from public.claim_school_emails(50, 'e1000000-0000-0000-0000-0000000000f1')), 6::bigint, 'failed and interrupted sends are recovered');
select ok(not public.finish_school_email(id, attempted_at, 'sent'), 'an old worker cannot complete a newer claim') from claimed limit 1;
select ok(public.finish_school_email(id, attempted_at, 'sent'), 'current worker records accepted delivery') from public.school_email_deliveries where family_id = 'e1000000-0000-0000-0000-0000000000f1';
select is((select count(*) from public.claim_school_emails(50, 'e1000000-0000-0000-0000-0000000000f1')), 0::bigint, 'accepted deliveries are never automatically resent');

update public.guardians set email = 'zz-e1-new-parent@zztest.local' where id = 'e1000000-0000-0000-0000-000000000061';
select is((select count(*) from public.school_email_deliveries where kind = 'welcome_parent' and email = 'zz-e1-new-parent@zztest.local'), 1::bigint, 'new parent login email receives onboarding');

insert into public.student_fees (student_id, school_year_id, amount) values
  ('e1000000-0000-0000-0000-000000000051', 'e1000000-0000-0000-0000-000000000001', 10000);
insert into public.payments (id, student_id, school_year_id, reference, amount, status, method, due_date) values
  ('e1000000-0000-0000-0000-000000000072', 'e1000000-0000-0000-0000-000000000051', 'e1000000-0000-0000-0000-000000000001', 'ZZTEST E1 overdue', 5000, 'opprettet', 'vipps', current_date - 10),
  ('e1000000-0000-0000-0000-000000000073', 'e1000000-0000-0000-0000-000000000051', 'e1000000-0000-0000-0000-000000000001', 'ZZTEST E1 future', 5000, 'opprettet', 'vipps', current_date + 10),
  ('e1000000-0000-0000-0000-000000000074', 'e1000000-0000-0000-0000-000000000051', 'e1000000-0000-0000-0000-000000000001', 'ZZTEST E1 paid', 100, 'fanget', 'vipps', current_date - 10);
update public.payment_plans set paused_at = statement_timestamp() where id = 'e1000000-0000-0000-0000-000000000091';
select public.queue_overdue_payment_emails();
select is((select count(*) from public.school_email_deliveries where family_id = 'e1000000-0000-0000-0000-0000000000f1' and kind = 'payment_reminder'), 1::bigint, 'only overdue unpaid regular payments receive reminders');
select is((select count(*) from public.school_email_deliveries where family_id = 'e1000000-0000-0000-0000-0000000000f1' and kind = 'installment_reminder'), 0::bigint, 'paused installment plans do not receive reminders');
update public.payment_plans set paused_at = null where id = 'e1000000-0000-0000-0000-000000000091';
select public.queue_overdue_payment_emails();
select public.queue_overdue_payment_emails();
select is((select count(*) from public.school_email_deliveries where family_id = 'e1000000-0000-0000-0000-0000000000f1' and kind = 'installment_reminder'), 1::bigint, 'overdue installment queues one reminder despite repeated cron runs');
select is((select count(*) from public.school_email_deliveries where family_id = 'e1000000-0000-0000-0000-0000000000f1' and kind in ('plan_confirmed', 'payment_reminder', 'installment_due', 'installment_reminder') and email = 'zz-e1-student@zztest.local'), 0::bigint, 'students do not receive financial notifications');
select is((select reminder_sent_at from public.installments where id = 'e1000000-0000-0000-0000-000000000092'), null::timestamptz, 'queuing a reminder does not record it as delivered');
create temp table reminder_claim as select * from public.claim_school_emails(50, 'e1000000-0000-0000-0000-0000000000f1') where kind = 'installment_reminder';
select ok(public.finish_school_email(id, attempted_at, 'failed'), 'failed reminder is recorded') from reminder_claim;
select is((select reminder_sent_at from public.installments where id = 'e1000000-0000-0000-0000-000000000092'), null::timestamptz, 'a failed reminder is not marked delivered');
update public.school_email_deliveries set status = 'pending' where kind = 'installment_reminder' and family_id = 'e1000000-0000-0000-0000-0000000000f1';
select ok(public.finish_school_email(id, attempted_at, 'sent'), 'accepted reminder is recorded') from public.claim_school_emails(50, 'e1000000-0000-0000-0000-0000000000f1') where kind = 'installment_reminder';
select ok((select reminder_sent_at is not null from public.installments where id = 'e1000000-0000-0000-0000-000000000092'), 'only accepted reminders mark the installment as notified');

insert into public.payments (id, student_id, school_year_id, reference, amount, status, method, due_date) values
  ('e1000000-0000-0000-0000-000000000075', 'e1000000-0000-0000-0000-000000000051', 'e1000000-0000-0000-0000-000000000001', 'ZZTEST E1 authorized', 5000, 'autorisert', 'vipps', current_date - 10),
  ('e1000000-0000-0000-0000-000000000076', null, 'e1000000-0000-0000-0000-000000000001', 'ZZTEST E1 grouped', 10000, 'opprettet', 'vipps', current_date - 10);
insert into public.payment_targets (payment_id, student_id, amount) values
  ('e1000000-0000-0000-0000-000000000076', 'e1000000-0000-0000-0000-000000000051', 5000),
  ('e1000000-0000-0000-0000-000000000076', 'e1000000-0000-0000-0000-000000000052', 5000);
select public.queue_overdue_payment_emails();
select is((select count(*) from public.school_email_deliveries where entity_id = 'e1000000-0000-0000-0000-000000000075'), 0::bigint, 'authorized payments awaiting capture do not receive reminders');
select is((select count(*) from public.school_email_deliveries where entity_id = 'e1000000-0000-0000-0000-000000000076' and kind = 'payment_reminder'), 1::bigint, 'grouped family payment receives one guardian reminder');
update public.school_email_deliveries set status = 'sending', attempts = 5, attempted_at = statement_timestamp() - interval '16 minutes'
where entity_id = 'e1000000-0000-0000-0000-000000000076';
select count(*) from public.claim_school_emails(50, 'e1000000-0000-0000-0000-0000000000f1');
select is((select status from public.school_email_deliveries where entity_id = 'e1000000-0000-0000-0000-000000000076'), 'failed', 'interrupted last attempt becomes visible for manual recovery');
update public.school_email_deliveries set status = 'pending', attempts = 0 where entity_id = 'e1000000-0000-0000-0000-000000000076';
select is((select count(*) from public.claim_school_emails(50, 'e1000000-0000-0000-0000-0000000000f1') where entity_id = 'e1000000-0000-0000-0000-000000000076'), 1::bigint, 'admin reset recovers an exhausted interrupted delivery');

select set_config('request.jwt.claims', '{"sub":"e1000000-0000-0000-0000-0000000000a1","email":"zz-e1-parent@zztest.local","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*) from public.school_email_deliveries), 0::bigint, 'parents cannot read delivery addresses or status');
select throws_ok($$ select * from public.claim_school_emails(20, null) $$, '42501', null, 'parent cannot process school emails');
select throws_ok($$ select public.queue_school_email('signup_parent', gen_random_uuid(), null, 'attacker@example.org') $$, '42501', null, 'parent cannot enqueue arbitrary messages');
select throws_ok($$ select public.queue_overdue_payment_emails() $$, '42501', null, 'parent cannot trigger financial reminders');
select lives_ok($$ insert into public.portal_onboarding (user_id, role) values ('e1000000-0000-0000-0000-0000000000a1', 'parent') $$, 'parent persists first-use completion');
select throws_ok($$ insert into public.portal_onboarding (user_id, role) values ('e1000000-0000-0000-0000-0000000000a2', 'student') $$, '42501', null, 'cannot dismiss guidance for another account');
select is((select count(*) from public.portal_onboarding), 1::bigint, 'only own onboarding is visible');
reset role;
select set_config('request.jwt.claims', '{"sub":"e1000000-0000-0000-0000-0000000000a2","email":"zz-e1-other@zztest.local","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*) from public.portal_onboarding), 0::bigint, 'another account cannot read first-use completion');
reset role;
select set_config('request.jwt.claims', '{"sub":"e1000000-0000-0000-0000-0000000000a3","email":"zz-e1-admin@zztest.local","role":"authenticated"}', true);
set local role authenticated;
select cmp_ok((select count(*) from public.school_email_deliveries), '>=', 7::bigint, 'admin can inspect delivery status');
select throws_ok($$ select * from public.claim_school_emails(20, null) $$, '42501', null, 'browser admin role cannot bypass server delivery authorization');
reset role;
set local role anon;
select throws_ok($$ select * from public.school_email_deliveries $$, '42501', null, 'anonymous visitors cannot read emails');
select throws_ok($$ select * from public.portal_onboarding $$, '42501', null, 'anonymous visitors cannot read onboarding');
reset role;
select * from finish();
rollback;
