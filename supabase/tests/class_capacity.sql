begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(25);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
insert into auth.users(id, email, raw_app_meta_data) values
  ('a7200000-0000-0000-0000-000000000001', 'zz-capacity-admin@zztest.local', '{"role":"admin"}'),
  ('a7200000-0000-0000-0000-000000000002', 'zz-capacity-parent@zztest.local', '{"role":"member"}');
insert into public.school_years(id, label, fee) values ('a7200000-0000-0000-0000-000000000010', 'ZZTEST capacity', 3000);
insert into public.classes(id, slug, name_no, capacity) values
  ('a7200000-0000-0000-0000-000000000020', 'zztest-capacity-target', 'ZZTEST Capacity', 1),
  ('a7200000-0000-0000-0000-000000000021', 'zztest-capacity-source', 'ZZTEST Source', 10);
insert into public.students(id, child_first_name, child_last_name) values
  ('a7200000-0000-0000-0000-000000000031', 'ZZTEST', 'One'),
  ('a7200000-0000-0000-0000-000000000032', 'ZZTEST', 'Two'),
  ('a7200000-0000-0000-0000-000000000033', 'ZZTEST', 'Three');
insert into public.student_applications(id, child_first_name, child_last_name, status) values
  ('a7200000-0000-0000-0000-000000000041', 'ZZTEST', 'Admission', 'ny'),
  ('a7200000-0000-0000-0000-000000000042', 'ZZTEST', 'Accepted without student', 'akseptert');
select set_config('request.jwt.claims', '{"sub":"a7200000-0000-0000-0000-000000000002","email":"zz-capacity-parent@zztest.local","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select public.admin_place_student('a7200000-0000-0000-0000-000000000031', 'a7200000-0000-0000-0000-000000000020', 'a7200000-0000-0000-0000-000000000010')$$, '42501', null, 'parents cannot place students or change capacity');
select throws_ok($$select public.admin_admit_student('a7200000-0000-0000-0000-000000000041')$$, '42501', null, 'parents cannot admit students');
select set_config('request.jwt.claims', '{"sub":"a7200000-0000-0000-0000-000000000001","email":"zz-capacity-admin@zztest.local","role":"authenticated"}', true);
select lives_ok($$select public.admin_place_student('a7200000-0000-0000-0000-000000000031', 'a7200000-0000-0000-0000-000000000020', 'a7200000-0000-0000-0000-000000000010')$$, 'admin fills the final available seat');
select throws_ok($$select public.admin_place_student('a7200000-0000-0000-0000-000000000032', 'a7200000-0000-0000-0000-000000000020', 'a7200000-0000-0000-0000-000000000010')$$, 'P0001', null, 'full classes require explicit capacity increase');
select is((select count(*) from public.enrollments where class_id = 'a7200000-0000-0000-0000-000000000020'), 1::bigint, 'failed placement adds no enrollment');
select lives_ok($$select public.admin_place_student('a7200000-0000-0000-0000-000000000032', 'a7200000-0000-0000-0000-000000000020', 'a7200000-0000-0000-0000-000000000010', p_new_capacity => 2, p_expected_capacity => 1)$$, 'explicit increase and placement succeeds together');
select is((select capacity from public.classes where id = 'a7200000-0000-0000-0000-000000000020'), 2, 'capacity increases to the reviewed value');
select is((select count(*) from public.enrollments where class_id = 'a7200000-0000-0000-0000-000000000020'), 2::bigint, 'both students occupy the class');
select throws_ok($$select public.admin_place_student('a7200000-0000-0000-0000-000000000033', 'a7200000-0000-0000-0000-000000000020', 'a7200000-0000-0000-0000-000000000010', p_new_capacity => 3, p_expected_capacity => 1)$$, 'P0001', null, 'stale capacity review is rejected');
select throws_ok($$insert into public.enrollments(student_id, class_id, school_year_id) values('a7200000-0000-0000-0000-000000000033', 'a7200000-0000-0000-0000-000000000020', 'a7200000-0000-0000-0000-000000000010')$$, 'P0001', null, 'direct writes also respect class capacity');
insert into public.enrollments(id, student_id, class_id, school_year_id, status) values
  ('a7200000-0000-0000-0000-000000000051', 'a7200000-0000-0000-0000-000000000033', 'a7200000-0000-0000-0000-000000000021', 'a7200000-0000-0000-0000-000000000010', 'aktiv'),
  ('a7200000-0000-0000-0000-000000000052', 'a7200000-0000-0000-0000-000000000033', 'a7200000-0000-0000-0000-000000000020', 'a7200000-0000-0000-0000-000000000010', 'avsluttet');
select throws_ok($$select public.admin_place_student('a7200000-0000-0000-0000-000000000033', 'a7200000-0000-0000-0000-000000000020', 'a7200000-0000-0000-0000-000000000010', p_enrollment => 'a7200000-0000-0000-0000-000000000051', p_expected_class => 'a7200000-0000-0000-0000-000000000021', p_new_capacity => 3, p_expected_capacity => 2)$$, '23505', null, 'failed transfer rolls back capacity expansion');
select is((select capacity from public.classes where id = 'a7200000-0000-0000-0000-000000000020'), 2, 'failed transfer preserves capacity');
select is((select class_id::text from public.enrollments where id = 'a7200000-0000-0000-0000-000000000051'), 'a7200000-0000-0000-0000-000000000021', 'failed transfer preserves source placement');
select throws_ok($$select public.admin_admit_student('a7200000-0000-0000-0000-000000000041', p_class => 'a7200000-0000-0000-0000-000000000020', p_year => 'a7200000-0000-0000-0000-000000000010', p_new_capacity => 3, p_expected_capacity => 1)$$, 'P0001', null, 'stale admission fails atomically');
select is((select count(*) from public.students where application_id = 'a7200000-0000-0000-0000-000000000041'), 0::bigint, 'failed admission does not leave a student behind');
select is((select status from public.student_applications where id = 'a7200000-0000-0000-0000-000000000041'), 'ny', 'failed admission preserves application state');
select lives_ok($$select public.admin_admit_student('a7200000-0000-0000-0000-000000000041', p_class => 'a7200000-0000-0000-0000-000000000020', p_year => 'a7200000-0000-0000-0000-000000000010', p_new_capacity => 3, p_expected_capacity => 2)$$, 'admission increases capacity and places the child atomically');
select is((select capacity from public.classes where id = 'a7200000-0000-0000-0000-000000000020'), 3, 'successful admission expands reviewed capacity');
select is((select status from public.student_applications where id = 'a7200000-0000-0000-0000-000000000041'), 'akseptert', 'successful admission accepts the application');
select is((select count(*) from public.enrollments where class_id = 'a7200000-0000-0000-0000-000000000020' and status = 'aktiv'), 3::bigint, 'successful admission uses the additional seat');
select lives_ok($$select public.admin_admit_student('a7200000-0000-0000-0000-000000000042')$$, 'an accepted application without a student can still be registered');
select is((select count(*) from public.students where application_id = 'a7200000-0000-0000-0000-000000000042'), 1::bigint, 'registration creates the missing student for an accepted application');
update public.classes set price = 4500 where id = 'a7200000-0000-0000-0000-000000000020';
select throws_ok($$select public.admin_place_student('a7200000-0000-0000-0000-000000000033', 'a7200000-0000-0000-0000-000000000020', 'a7200000-0000-0000-0000-000000000010', p_enrollment => 'a7200000-0000-0000-0000-000000000051', p_expected_class => 'a7200000-0000-0000-0000-000000000021', p_new_capacity => 4, p_expected_capacity => 3, p_reprice => true, p_expected_price => 4000)$$, 'P0001', null, 'a concurrent target price change rejects repricing before placement');
select is((select capacity from public.classes where id = 'a7200000-0000-0000-0000-000000000020'), 3, 'a changed price does not leave an expanded capacity');
select is((select class_id::text from public.enrollments where id = 'a7200000-0000-0000-0000-000000000051'), 'a7200000-0000-0000-0000-000000000021', 'a changed price preserves the original enrollment');
select * from finish();
rollback;
