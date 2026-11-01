begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(9);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

create temporary table split_ids (
  year_id uuid,
  first_student uuid,
  second_student uuid,
  payment_id uuid,
  second_app uuid
) on commit drop;

do $$
declare
  v_year uuid := gen_random_uuid();
  v_payment uuid := gen_random_uuid();
  v_app1 uuid := gen_random_uuid();
  v_app2 uuid := gen_random_uuid();
  v_student1 uuid := gen_random_uuid();
  v_student2 uuid := gen_random_uuid();
begin
  insert into public.school_years (id, label, fee)
  values (v_year, '2097/2098', 5000);

  insert into public.payments (
    id, school_year_id, reference, amount, status, method,
    authorized_amount, captured_amount, refunded_amount
  ) values (
    v_payment, v_year, 'isk-split-2098', 400000, 'fanget', 'vipps',
    400000, 400000, 0
  );

  insert into public.student_applications (id, child_first_name, payment_id, status, created_at)
  values
    (v_app1, 'ZZTEST Split A', v_payment, 'ny', now() - interval '1 minute'),
    (v_app2, 'ZZTEST Split B', v_payment, 'ny', now());

  insert into public.students (id, child_first_name, child_last_name, application_id)
  values (v_student2, 'ZZTEST Split', 'B', v_app2);

  insert into public.student_fees (student_id, school_year_id, amount)
  values (v_student2, v_year, 500000);

  insert into split_ids values (v_year, v_student1, v_student2, v_payment, v_app1);
end
$$;

select public.replace_payment_allocations((select payment_id from split_ids), null);

select is(
  (select sum(amount)::integer from public.payment_allocations where payment_id = (select payment_id from split_ids)),
  200000,
  'first admitted sibling only gets its own share while the other application is pending'
);

insert into public.students (id, child_first_name, child_last_name, application_id)
select first_student, 'ZZTEST Split', 'A', second_app from split_ids;

insert into public.student_fees (student_id, school_year_id, amount)
select first_student, year_id, 500000 from split_ids;

select public.replace_payment_allocations((select payment_id from split_ids), null);

select is(
  (select amount from public.payment_allocations where payment_id = (select payment_id from split_ids) and student_id = (select first_student from split_ids)),
  200000,
  'first sibling gets half of the group deposit'
);

select is(
  (select amount from public.payment_allocations where payment_id = (select payment_id from split_ids) and student_id = (select second_student from split_ids)),
  200000,
  'second sibling gets half of the group deposit'
);

create temporary table release_ids (
  payment_id uuid,
  pending_app uuid,
  linked_app uuid,
  student_id uuid
) on commit drop;

do $$
declare
  v_year uuid := (select year_id from split_ids);
  v_payment uuid := gen_random_uuid();
  v_pending uuid := gen_random_uuid();
  v_linked uuid := gen_random_uuid();
  v_student uuid := gen_random_uuid();
begin
  insert into public.payments (
    id, school_year_id, reference, amount, status, method,
    authorized_amount, captured_amount, refunded_amount
  ) values (
    v_payment, v_year, 'isk-release-2098', 400000, 'fanget', 'vipps',
    400000, 400000, 0
  );

  insert into public.student_applications (id, child_first_name, payment_id, status, created_at)
  values
    (v_pending, 'ZZTEST Release A', v_payment, 'ny', now() - interval '1 minute'),
    (v_linked, 'ZZTEST Release B', v_payment, 'ny', now());

  insert into public.students (id, child_first_name, child_last_name, application_id)
  values (v_student, 'ZZTEST Release', 'B', v_linked);

  insert into public.student_fees (student_id, school_year_id, amount)
  values (v_student, v_year, 500000);

  insert into release_ids values (v_payment, v_pending, v_linked, v_student);
end
$$;

select public.replace_payment_allocations((select payment_id from release_ids), null);

select is(
  (select sum(amount)::integer from public.payment_allocations where payment_id = (select payment_id from release_ids)),
  200000,
  'share of a pending sibling application is held back'
);

update public.student_applications set status = 'avslatt'
where id = (select pending_app from release_ids);

select is(
  (select sum(amount)::integer from public.payment_allocations where payment_id = (select payment_id from release_ids)),
  400000,
  'rejecting the sibling application releases the held share'
);

update public.student_applications set status = 'arkivert'
where id = (select linked_app from release_ids);

select is(
  (select amount from public.payment_allocations where payment_id = (select payment_id from release_ids) and student_id = (select student_id from release_ids)),
  400000,
  'archiving an application with a linked student keeps that child credited'
);

select is(public.claim_payment_request_run(), true, 'first cron run claims the lease');
select is(public.claim_payment_request_run(), null, 'a concurrent cron run is refused');

select public.release_payment_request_run();

select is(
  (select enabled from public.payment_request_settings where id),
  false,
  'automatic payment requests start switched off'
);

select * from finish();

rollback;
