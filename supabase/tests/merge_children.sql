begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
insert into auth.users (id, email, raw_app_meta_data) values
  ('f4000000-0000-0000-0000-0000000000a1', 'zz-f4-admin@zztest.local', '{"role":"admin"}'),
  ('f4000000-0000-0000-0000-0000000000a2', 'zz-f4-member@zztest.local', '{"role":"member"}');
insert into public.families (id, origin) values
  ('f4000000-0000-0000-0000-0000000000f1', 'test'),
  ('f4000000-0000-0000-0000-0000000000f2', 'test');
insert into public.school_years (id, label, fee, starts_on, ends_on) values
  ('f4000000-0000-0000-0000-000000000001', 'ZZTEST F4', 5000, '2035-08-01', '2036-07-31');
insert into public.classes (id, slug, name_no, name_en) values
  ('f4000000-0000-0000-0000-0000000000c1', 'zztest-f4-class', 'ZZTEST Klasse', 'ZZTEST Class'),
  ('f4000000-0000-0000-0000-0000000000c2', 'zztest-f4-other', 'ZZTEST Annen', 'ZZTEST Other');
insert into public.student_applications (id, family_id, child_first_name, child_last_name, child_birth_date, status, terms_accepted) values
  ('f4000000-0000-0000-0000-000000000071', 'f4000000-0000-0000-0000-0000000000f1', 'ZZTEST', 'Barn', '2017-03-14', 'akseptert', true),
  ('f4000000-0000-0000-0000-000000000072', 'f4000000-0000-0000-0000-0000000000f1', 'ZZTEST', 'Barn', '2017-03-14', 'ny', true);
insert into public.students (id, family_id, application_id, child_first_name, child_last_name, child_birth_date, notes) values
  ('f4000000-0000-0000-0000-000000000051', 'f4000000-0000-0000-0000-0000000000f1', 'f4000000-0000-0000-0000-000000000071', 'ZZTEST', 'Barn', '2017-03-14', 'Behold'),
  ('f4000000-0000-0000-0000-000000000052', 'f4000000-0000-0000-0000-0000000000f1', null, 'ZZTEST', 'Barn', '2017-03-14', 'Annen historikk'),
  ('f4000000-0000-0000-0000-000000000053', 'f4000000-0000-0000-0000-0000000000f2', null, 'ZZTEST', 'Annen', '2017-03-14', null);
insert into public.enrollments (id, student_id, class_id, school_year_id) values
  ('f4000000-0000-0000-0000-000000000081', 'f4000000-0000-0000-0000-000000000051', 'f4000000-0000-0000-0000-0000000000c1', 'f4000000-0000-0000-0000-000000000001');
insert into public.student_fees (student_id, school_year_id, amount) values
  ('f4000000-0000-0000-0000-000000000051', 'f4000000-0000-0000-0000-000000000001', 500000),
  ('f4000000-0000-0000-0000-000000000052', 'f4000000-0000-0000-0000-000000000001', 500000);
insert into public.payments (id, reference, amount, captured_amount, status, school_year_id) values
  ('f4000000-0000-0000-0000-000000000091', 'ZZTEST-F4-PAID', 200000, 200000, 'fanget', 'f4000000-0000-0000-0000-000000000001'),
  ('f4000000-0000-0000-0000-000000000092', 'ZZTEST-F4-SECOND', 100000, 100000, 'fanget', 'f4000000-0000-0000-0000-000000000001');
update public.student_applications set payment_id = 'f4000000-0000-0000-0000-000000000091', message = 'Fra innmelding'
  where id = 'f4000000-0000-0000-0000-000000000072';
insert into public.payment_allocations (payment_id, student_id, school_year_id, amount) values
  ('f4000000-0000-0000-0000-000000000092', 'f4000000-0000-0000-0000-000000000052', 'f4000000-0000-0000-0000-000000000001', 100000);

select set_config('request.jwt.claims', '{"sub":"f4000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select public.admin_merge_children('f4000000-0000-0000-0000-000000000051', null, 'f4000000-0000-0000-0000-000000000072')$$,
  '42501', null, 'members cannot preview or merge children');
select set_config('request.jwt.claims', '{"sub":"f4000000-0000-0000-0000-0000000000a1","email":"zz-f4-admin@zztest.local","role":"authenticated"}', true);
select throws_ok($$select public.admin_merge_children('f4000000-0000-0000-0000-000000000051', 'f4000000-0000-0000-0000-000000000053')$$,
  'P0001', null, 'children from different families cannot be merged');
create temporary table preview as select public.admin_merge_children('f4000000-0000-0000-0000-000000000051', null, 'f4000000-0000-0000-0000-000000000072') result;
select is((select result #>> '{finances,0,paid}' from preview), '200000', 'preview includes paid application');
select is((select result #>> '{finances,0,remaining}' from preview), '300000', 'preview keeps remaining tuition due');
select is((select count(*) from public.payment_allocations where payment_id='f4000000-0000-0000-0000-000000000091'), 0::bigint, 'preview never allocates payments');
select is((select status from public.student_applications where id='f4000000-0000-0000-0000-000000000072'), 'ny', 'preview leaves application unchanged');
select throws_ok($$select public.admin_merge_children('f4000000-0000-0000-0000-000000000051', null, 'f4000000-0000-0000-0000-000000000072', true, 'stale')$$,
  'P0001', null, 'stale confirmation is rejected');
select lives_ok($$select public.admin_merge_children('f4000000-0000-0000-0000-000000000051', null, 'f4000000-0000-0000-0000-000000000072', true, (select result->>'token' from preview))$$,
  'admin attaches paid application to existing student');
select is((select paid from public.student_balances where student_id='f4000000-0000-0000-0000-000000000051'), 200000::bigint, 'paid application counts on enrolled child');
select is((select remaining from public.student_balances where student_id='f4000000-0000-0000-0000-000000000051'), 300000::bigint, 'partial payment remains partial');
select is((select count(*) from public.enrollments where student_id='f4000000-0000-0000-0000-000000000051'), 1::bigint, 'class placement is retained');
select is((select merged_into_student_id from public.student_applications where id='f4000000-0000-0000-0000-000000000072'), 'f4000000-0000-0000-0000-000000000051'::uuid, 'application is linked to kept student');
select is((select status from public.student_applications where id='f4000000-0000-0000-0000-000000000072'), 'arkivert', 'duplicate application archived without deleting payment');
select ok(exists(select 1 from public.payment_allocation_locks where payment_id='f4000000-0000-0000-0000-000000000091'), 'future payment sync preserves allocation');
select throws_ok($$select public.admin_merge_children('f4000000-0000-0000-0000-000000000051', null, 'f4000000-0000-0000-0000-000000000072')$$,
  'P0001', null, 'same application cannot be attached twice');

select throws_ok($$insert into public.students (family_id, application_id, child_first_name, child_last_name) values
  ('f4000000-0000-0000-0000-0000000000f1', 'f4000000-0000-0000-0000-000000000072', 'ZZTEST', 'Duplikat')$$,
  'P0001', null, 'archived merged application cannot create another student');

reset role;
update public.students set child_birth_date='2018-03-14' where id='f4000000-0000-0000-0000-000000000052';
set local role authenticated;
select ok(jsonb_array_length(public.admin_merge_children('f4000000-0000-0000-0000-000000000051', 'f4000000-0000-0000-0000-000000000052')->'conflicts') > 0, 'birth date conflict is visible');
select throws_ok($$select public.admin_merge_children('f4000000-0000-0000-0000-000000000051', 'f4000000-0000-0000-0000-000000000052', null, true,
  public.admin_merge_children('f4000000-0000-0000-0000-000000000051', 'f4000000-0000-0000-0000-000000000052')->>'token')$$,
  'P0001', null, 'birth date conflict blocks confirmation');
select is((select count(*) from public.students where id='f4000000-0000-0000-0000-000000000052'), 1::bigint, 'rejected merge retains source student');

reset role;
update public.students set child_birth_date='2017-03-14' where id='f4000000-0000-0000-0000-000000000052';
insert into public.enrollments (student_id, class_id, school_year_id) values
  ('f4000000-0000-0000-0000-000000000052', 'f4000000-0000-0000-0000-0000000000c2', 'f4000000-0000-0000-0000-000000000001');
set local role authenticated;
select ok(jsonb_array_length(public.admin_merge_children('f4000000-0000-0000-0000-000000000051', 'f4000000-0000-0000-0000-000000000052')->'conflicts') > 0, 'conflicting active classes are visible');
reset role;
update public.enrollments set class_id='f4000000-0000-0000-0000-0000000000c1' where student_id='f4000000-0000-0000-0000-000000000052';
insert into public.learning_goals (id, student_id, subject, title, status, updated_by_name) values
  ('f4000000-0000-0000-0000-0000000000e1', 'f4000000-0000-0000-0000-000000000052', 'arabic', 'ZZTEST mål', 'practising', 'ZZTEST lærer');
insert into public.learning_progress_updates (goal_id, student_id, status, teacher_name) values
  ('f4000000-0000-0000-0000-0000000000e1', 'f4000000-0000-0000-0000-000000000052', 'practising', 'ZZTEST lærer');
update public.student_fees set amount=600000 where student_id='f4000000-0000-0000-0000-000000000052';
set local role authenticated;
select ok(jsonb_array_length(public.admin_merge_children('f4000000-0000-0000-0000-000000000051', 'f4000000-0000-0000-0000-000000000052')->'conflicts') > 0, 'different tuition claims cannot be guessed');
reset role;
update public.student_fees set amount=500000 where student_id='f4000000-0000-0000-0000-000000000052';
insert into public.payments (id, reference, amount, captured_amount, status, school_year_id) values
  ('f4000000-0000-0000-0000-000000000093', 'ZZTEST-F4-SHARED', 100000, 100000, 'fanget', 'f4000000-0000-0000-0000-000000000001');
insert into public.payment_allocations (payment_id, student_id, school_year_id, amount) values
  ('f4000000-0000-0000-0000-000000000093', 'f4000000-0000-0000-0000-000000000051', 'f4000000-0000-0000-0000-000000000001', 25000),
  ('f4000000-0000-0000-0000-000000000093', 'f4000000-0000-0000-0000-000000000052', 'f4000000-0000-0000-0000-000000000001', 75000);
insert into public.payment_targets (payment_id, student_id, amount) values
  ('f4000000-0000-0000-0000-000000000093', 'f4000000-0000-0000-0000-000000000051', 25000),
  ('f4000000-0000-0000-0000-000000000093', 'f4000000-0000-0000-0000-000000000052', 75000);
insert into public.refunds (payment_id, student_id, school_year_id, amount, method, reason, refunded_by) values
  ('f4000000-0000-0000-0000-000000000092', 'f4000000-0000-0000-0000-000000000052', 'f4000000-0000-0000-0000-000000000001', 10000, 'bank', 'ZZTEST delrefusjon', 'ZZTEST');
update public.payments set enrollment_id=(select id from public.enrollments where student_id='f4000000-0000-0000-0000-000000000052')
  where id='f4000000-0000-0000-0000-000000000092';
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
insert into public.school_days (id, school_year_id, date) values
  ('f4000000-0000-0000-0000-0000000000d1', 'f4000000-0000-0000-0000-000000000001', '2035-09-01');
select public.materialize_lessons('f4000000-0000-0000-0000-0000000000d1', 'f4000000-0000-0000-0000-0000000000c1', true);
insert into public.attendance (student_id, school_day_id, lesson_id, status, marked_by, marked_at)
  select 'f4000000-0000-0000-0000-000000000052', school_day_id, id, 'til_stede', 'f4000000-0000-0000-0000-0000000000a2', '2035-09-01 10:00+00'
  from public.lessons where school_day_id='f4000000-0000-0000-0000-0000000000d1';
select set_config('request.jwt.claims', '{"sub":"f4000000-0000-0000-0000-0000000000a1","email":"zz-f4-admin@zztest.local","role":"authenticated"}', true);

set local role authenticated;
update preview set result=public.admin_merge_children('f4000000-0000-0000-0000-000000000051', 'f4000000-0000-0000-0000-000000000052');
select lives_ok($$select public.admin_merge_children('f4000000-0000-0000-0000-000000000051', 'f4000000-0000-0000-0000-000000000052', null, true, (select result->>'token' from preview))$$,
  'admin merges duplicate students atomically');
select is((select count(*) from public.students where id='f4000000-0000-0000-0000-000000000052'), 0::bigint, 'duplicate student removed');
select is((select count(*) from public.student_fees where student_id='f4000000-0000-0000-0000-000000000051'), 1::bigint, 'duplicate tuition claim not doubled');
select is((select paid from public.student_balances where student_id='f4000000-0000-0000-0000-000000000051'), 390000::bigint, 'both captured payments preserved with refund deducted');
select is((select count(*) from public.enrollments where student_id='f4000000-0000-0000-0000-000000000051'), 1::bigint, 'duplicate class placement consolidated');
select is((select student_id from public.learning_progress_updates where goal_id='f4000000-0000-0000-0000-0000000000e1'), 'f4000000-0000-0000-0000-000000000051'::uuid, 'learning history follows goal without losing teacher history');
select ok((select notes from public.students where id='f4000000-0000-0000-0000-000000000051') like '%Annen historikk%', 'notes from both student records preserved');
select is((select count(*) from public.audit_log where action='student.merged' and entity_id='f4000000-0000-0000-0000-000000000051'), 2::bigint, 'each merge has a transactional audit snapshot');

select is((select amount from public.payment_allocations where payment_id='f4000000-0000-0000-0000-000000000093'), 100000, 'shared payment allocations combine without doubling total');
select is((select amount from public.payment_targets where payment_id='f4000000-0000-0000-0000-000000000093'), 100000, 'shared payment targets combine');
select is((select student_id from public.refunds where payment_id='f4000000-0000-0000-0000-000000000092'), 'f4000000-0000-0000-0000-000000000051'::uuid, 'refund attribution follows child');
select is((select enrollment_id from public.payments where id='f4000000-0000-0000-0000-000000000092'), 'f4000000-0000-0000-0000-000000000081'::uuid, 'payment enrollment reference follows kept placement');
select is((select count(*) from public.attendance where student_id='f4000000-0000-0000-0000-000000000051'), 1::bigint, 'attendance follows merged child');
select is((select marked_by from public.attendance where student_id='f4000000-0000-0000-0000-000000000051'), 'f4000000-0000-0000-0000-0000000000a2'::uuid, 'original attendance marker preserved');
select is((select marked_at from public.attendance where student_id='f4000000-0000-0000-0000-000000000051'), '2035-09-01 10:00+00'::timestamptz, 'original attendance timestamp preserved');

reset role;
insert into public.payments (id, reference, amount, captured_amount, status, school_year_id) values
  ('f4000000-0000-0000-0000-000000000094', 'ZZTEST-F4-SIBLINGS', 200000, 200000, 'fanget', 'f4000000-0000-0000-0000-000000000001');
insert into public.student_applications (id, family_id, child_first_name, child_last_name, status, terms_accepted, payment_id) values
  ('f4000000-0000-0000-0000-000000000073', 'f4000000-0000-0000-0000-0000000000f1', 'ZZTEST', 'Barn', 'ny', true, 'f4000000-0000-0000-0000-000000000094'),
  ('f4000000-0000-0000-0000-000000000074', 'f4000000-0000-0000-0000-0000000000f1', 'ZZTEST', 'Søsken', 'ny', true, 'f4000000-0000-0000-0000-000000000094');

set local role authenticated;
update preview set result=public.admin_merge_children('f4000000-0000-0000-0000-000000000051', null, 'f4000000-0000-0000-0000-000000000073');
select ok(jsonb_array_length((select result->'conflicts' from preview)) > 0, 'shared application payment blocks merge before sibling is registered');
select throws_ok($$select public.admin_merge_children('f4000000-0000-0000-0000-000000000051', null, 'f4000000-0000-0000-0000-000000000073', true, (select result->>'token' from preview))$$,
  'P0001', null, 'shared payment cannot be locked while sibling share is unresolved');
reset role;
insert into public.students (id, family_id, application_id, child_first_name, child_last_name) values
  ('f4000000-0000-0000-0000-000000000054', 'f4000000-0000-0000-0000-0000000000f1', 'f4000000-0000-0000-0000-000000000074', 'ZZTEST', 'Søsken');
insert into public.student_fees (student_id, school_year_id, amount) values
  ('f4000000-0000-0000-0000-000000000054', 'f4000000-0000-0000-0000-000000000001', 500000);
insert into public.payment_targets (payment_id, student_id, amount) values
  ('f4000000-0000-0000-0000-000000000094', 'f4000000-0000-0000-0000-000000000054', 100000);
insert into public.payment_allocations (payment_id, student_id, school_year_id, amount) values
  ('f4000000-0000-0000-0000-000000000094', 'f4000000-0000-0000-0000-000000000054', 'f4000000-0000-0000-0000-000000000001', 100000);
set local role authenticated;
update preview set result=public.admin_merge_children('f4000000-0000-0000-0000-000000000051', null, 'f4000000-0000-0000-0000-000000000073');
select is(jsonb_array_length((select result->'conflicts' from preview)), 0, 'shared payment can merge once sibling share is established');
select lives_ok($$select public.admin_merge_children('f4000000-0000-0000-0000-000000000051', null, 'f4000000-0000-0000-0000-000000000073', true, (select result->>'token' from preview))$$,
  'confirmed merge preserves established sibling share');
select public.replace_payment_allocations('f4000000-0000-0000-0000-000000000094');
select is((select paid from public.student_balances where student_id='f4000000-0000-0000-0000-000000000054'), 100000::bigint, 'later payment sync preserves sibling paid balance');
select is((select amount from public.payment_allocations where payment_id='f4000000-0000-0000-0000-000000000094' and student_id='f4000000-0000-0000-0000-000000000051'), 100000, 'merged child receives only own shared payment amount');
select * from finish();
rollback;
