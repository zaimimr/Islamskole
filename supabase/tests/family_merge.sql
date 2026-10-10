begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(18);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into auth.users (id, email, raw_app_meta_data)
values
  ('d4000000-0000-0000-0000-0000000000a1', 'zz-d4-admin@zztest.local', '{"role":"admin"}'),
  ('d4000000-0000-0000-0000-0000000000a2', 'zz-d4-member@zztest.local', '{"role":"member"}');

update public.school_years set is_active = false where is_active;

insert into public.school_years (id, label, starts_on, ends_on, is_active)
values ('d4000000-0000-0000-0000-000000000001', 'ZZTEST D4 aktiv', '2026-08-01', '2027-06-30', true);

insert into public.classes (id, slug, name_no, name_en)
values ('d4000000-0000-0000-0000-0000000000c1', 'zztest-d4', 'ZZTEST D4', 'ZZTEST D4');

insert into public.families (id, origin)
values
  ('d4000000-0000-0000-0000-0000000000e1', 'test'),
  ('d4000000-0000-0000-0000-0000000000e2', 'test');

insert into public.guardians (id, first_name, last_name, email, phone, is_teacher)
values
  ('d4000000-0000-0000-0000-000000000061', 'ZZTEST', 'Dup Behold', 'zz-d4-dup@zztest.local', null, false),
  ('d4000000-0000-0000-0000-000000000062', 'ZZTEST', 'Dup Slett', 'ZZ-D4-Dup@zztest.local', '+4790000004', true),
  ('d4000000-0000-0000-0000-000000000063', 'ZZTEST', 'Annen', 'zz-d4-c@zztest.local', null, false);

insert into public.family_guardians (family_id, guardian_id, is_primary_contact)
values
  ('d4000000-0000-0000-0000-0000000000e1', 'd4000000-0000-0000-0000-000000000061', true),
  ('d4000000-0000-0000-0000-0000000000e2', 'd4000000-0000-0000-0000-000000000062', true),
  ('d4000000-0000-0000-0000-0000000000e2', 'd4000000-0000-0000-0000-000000000063', false);

insert into public.students (id, family_id, child_first_name, child_last_name)
values
  ('d4000000-0000-0000-0000-000000000051', 'd4000000-0000-0000-0000-0000000000e1', 'ZZTEST', 'Barn Behold'),
  ('d4000000-0000-0000-0000-000000000052', 'd4000000-0000-0000-0000-0000000000e2', 'ZZTEST', 'Barn Flytt');

insert into public.class_teachers (class_id, guardian_id, school_year_id)
values ('d4000000-0000-0000-0000-0000000000c1', 'd4000000-0000-0000-0000-000000000062', 'd4000000-0000-0000-0000-000000000001');

insert into public.payment_plans (id, family_id, school_year_id, plan_type, created_by)
values ('d4000000-0000-0000-0000-0000000000b1', 'd4000000-0000-0000-0000-0000000000e2', 'd4000000-0000-0000-0000-000000000001', 'full', 'zztest');

insert into public.student_applications (id, family_id, child_first_name, child_last_name)
values ('d4000000-0000-0000-0000-0000000000b2', 'd4000000-0000-0000-0000-0000000000e2', 'ZZTEST', 'Barn Flytt');

insert into public.sadaqa_gifts (id, family_id, amount, method)
values ('d4000000-0000-0000-0000-0000000000b3', 'd4000000-0000-0000-0000-0000000000e2', 10000, 'bank');

insert into public.school_email_deliveries(id,kind,entity_id,family_id,email,status) values
('d4000000-0000-0000-0000-0000000000b5','report_published',gen_random_uuid(),'d4000000-0000-0000-0000-0000000000e2','zz-d4-c@zztest.local','pending');

insert into public.family_data_reviews (id, family_id, category, details)
values (
  'd4000000-0000-0000-0000-0000000000b4',
  'd4000000-0000-0000-0000-0000000000e1',
  'possible_duplicate_family',
  jsonb_build_object('candidateFamilyIds', jsonb_build_array('d4000000-0000-0000-0000-0000000000e2'))
);

select has_function(
  'public',
  'admin_merge_families',
  array['uuid', 'uuid'],
  'D4 FAM-10: admin_merge_families(uuid, uuid) exists'
);

select set_config('request.jwt.claims', '{"sub":"d4000000-0000-0000-0000-0000000000a2","email":"zz-d4-member@zztest.local","role":"authenticated"}', true);
set local role authenticated;

select throws_ok(
  $$ select public.admin_merge_families('d4000000-0000-0000-0000-0000000000e1', 'd4000000-0000-0000-0000-0000000000e2') $$,
  '42501',
  null,
  'D4 FAM-10: a non-admin cannot merge families'
);

select set_config('request.jwt.claims', '{"sub":"d4000000-0000-0000-0000-0000000000a1","email":"zz-d4-admin@zztest.local","role":"authenticated"}', true);

select lives_ok(
  $$ select public.admin_merge_families('d4000000-0000-0000-0000-0000000000e1', 'd4000000-0000-0000-0000-0000000000e2') $$,
  'D4 FAM-10: an admin merges two families'
);

reset role;

select is((select family_id from public.school_email_deliveries where id='d4000000-0000-0000-0000-0000000000b5'),'d4000000-0000-0000-0000-0000000000e1'::uuid,'queued school email follows merged family');
select is((select status from public.school_email_deliveries where id='d4000000-0000-0000-0000-0000000000b5'),'pending','family merge preserves pending delivery');

select is(
  (select family_id from public.students where id = 'd4000000-0000-0000-0000-000000000052'),
  'd4000000-0000-0000-0000-0000000000e1'::uuid,
  'D4 FAM-10: the child of the merged family moves to the kept family'
);

select ok(
  not exists (select 1 from public.families where id = 'd4000000-0000-0000-0000-0000000000e2'),
  'D4 FAM-10: the merged family is deleted'
);

select is(
  (select count(*) from public.guardians where lower(email) = 'zz-d4-dup@zztest.local'),
  1::bigint,
  'D4 FAM-22: guardians with the same email are merged into one row'
);

select is(
  (
    select bool_or(g.is_teacher)
    from public.guardians g
    join public.family_guardians fg on fg.guardian_id = g.id and fg.family_id = 'd4000000-0000-0000-0000-0000000000e1'
    where lower(g.email) = 'zz-d4-dup@zztest.local'
  ),
  true,
  'D4 FAM-22: the merged guardian keeps is_teacher when either row had it'
);

select is(
  (
    select min(g.phone)
    from public.guardians g
    join public.family_guardians fg on fg.guardian_id = g.id and fg.family_id = 'd4000000-0000-0000-0000-0000000000e1'
    where lower(g.email) = 'zz-d4-dup@zztest.local'
  ),
  '+4790000004',
  'D4 FAM-22: the merged guardian keeps a non-empty phone'
);

select is(
  (
    select count(*)
    from public.class_teachers ct
    join public.guardians g on g.id = ct.guardian_id
    join public.family_guardians fg on fg.guardian_id = g.id and fg.family_id = 'd4000000-0000-0000-0000-0000000000e1'
    where lower(g.email) = 'zz-d4-dup@zztest.local'
      and ct.class_id = 'd4000000-0000-0000-0000-0000000000c1'
  ),
  1::bigint,
  'D4 SEC-24: class_teachers is repointed to the merged guardian'
);

select ok(
  exists (
    select 1 from public.family_guardians
    where family_id = 'd4000000-0000-0000-0000-0000000000e1'
      and guardian_id = 'd4000000-0000-0000-0000-000000000063'
  ),
  'D4 FAM-10: the other guardian of the merged family joins the kept family'
);

select is(
  (select count(*) from public.student_guardians where student_id = 'd4000000-0000-0000-0000-000000000051'),
  2::bigint,
  'D4 FAM-10: the kept child is linked to both guardians once'
);

select is(
  (
    select count(*) from public.student_guardians
    where student_id = 'd4000000-0000-0000-0000-000000000052'
      and family_id = 'd4000000-0000-0000-0000-0000000000e1'
  ),
  2::bigint,
  'D4 FAM-10: the moved child is linked to both guardians once'
);

select is(
  (select family_id from public.payment_plans where id = 'd4000000-0000-0000-0000-0000000000b1'),
  'd4000000-0000-0000-0000-0000000000e1'::uuid,
  'D4 FAM-10: the payment plan moves to the kept family'
);

select is(
  (select family_id from public.student_applications where id = 'd4000000-0000-0000-0000-0000000000b2'),
  'd4000000-0000-0000-0000-0000000000e1'::uuid,
  'D4 FAM-10: the application moves to the kept family'
);

select is(
  (select family_id from public.sadaqa_gifts where id = 'd4000000-0000-0000-0000-0000000000b3'),
  'd4000000-0000-0000-0000-0000000000e1'::uuid,
  'D4 FAM-10: the sadaqa gift moves to the kept family'
);

select is(
  (select status from public.family_data_reviews where id = 'd4000000-0000-0000-0000-0000000000b4'),
  'resolved',
  'D4 FAM-03: the open duplicate review for the pair is resolved'
);

select * from finish();

rollback;
