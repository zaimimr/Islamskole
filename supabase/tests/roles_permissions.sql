begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select no_plan();

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into auth.users (id, email, raw_app_meta_data)
values
  ('fa000000-0000-0000-0000-0000000000a1', 'zz-fa-admin@zztest.local', '{"role":"admin"}'),
  ('fa000000-0000-0000-0000-0000000000a2', 'zz-fa-sfo@zztest.local', '{"role":"member"}'),
  ('fa000000-0000-0000-0000-0000000000a3', 'zz-fa-teacher@zztest.local', '{"role":"member"}'),
  ('fa000000-0000-0000-0000-0000000000a4', 'zz-fa-parent@zztest.local', '{"role":"member"}'),
  ('fa000000-0000-0000-0000-0000000000a5', 'zz-fa-sfo-teacher@zztest.local', '{"role":"member"}');

update public.school_years set is_active = false where is_active;
insert into public.school_years (id, label, starts_on, ends_on, is_active)
values ('fa000000-0000-0000-0000-000000000001', 'ZZTEST FA', current_date - 60, current_date + 200, true);

insert into public.classes (id, slug, name_no, name_en)
values ('fa000000-0000-0000-0000-0000000000c1', 'zztest-fa-a', 'ZZTEST FA A', 'ZZTEST FA A');

insert into public.families (id, origin) values ('fa000000-0000-0000-0000-0000000000f1', 'test');

insert into public.guardians (id, first_name, last_name, email)
values
  ('fa000000-0000-0000-0000-000000000062', 'ZZTEST', 'SFO', 'zz-fa-sfo@zztest.local'),
  ('fa000000-0000-0000-0000-000000000063', 'ZZTEST', 'Laerer', 'zz-fa-teacher@zztest.local'),
  ('fa000000-0000-0000-0000-000000000064', 'ZZTEST', 'Forelder', 'zz-fa-parent@zztest.local'),
  ('fa000000-0000-0000-0000-000000000065', 'ZZTEST', 'SFO Laerer', 'zz-fa-sfo-teacher@zztest.local');

insert into public.students (id, family_id, child_first_name, child_last_name)
values ('fa000000-0000-0000-0000-000000000051', 'fa000000-0000-0000-0000-0000000000f1', 'ZZTEST', 'Elev FA');

insert into public.family_guardians (family_id, guardian_id, is_primary_contact)
values
  ('fa000000-0000-0000-0000-0000000000f1', 'fa000000-0000-0000-0000-000000000064', true),
  ('fa000000-0000-0000-0000-0000000000f1', 'fa000000-0000-0000-0000-000000000065', false);

insert into public.student_guardians (student_id, family_id, guardian_id)
values
  ('fa000000-0000-0000-0000-000000000051', 'fa000000-0000-0000-0000-0000000000f1', 'fa000000-0000-0000-0000-000000000064'),
  ('fa000000-0000-0000-0000-000000000051', 'fa000000-0000-0000-0000-0000000000f1', 'fa000000-0000-0000-0000-000000000065')
on conflict do nothing;

insert into public.enrollments (student_id, class_id, school_year_id, status)
values ('fa000000-0000-0000-0000-000000000051', 'fa000000-0000-0000-0000-0000000000c1', 'fa000000-0000-0000-0000-000000000001', 'aktiv');

insert into public.person_roles (guardian_id, role_key)
values
  ('fa000000-0000-0000-0000-000000000062', 'sfo'),
  ('fa000000-0000-0000-0000-000000000063', 'teacher'),
  ('fa000000-0000-0000-0000-000000000065', 'sfo'),
  ('fa000000-0000-0000-0000-000000000065', 'teacher');

insert into public.class_teachers (class_id, guardian_id, school_year_id)
values
  ('fa000000-0000-0000-0000-0000000000c1', 'fa000000-0000-0000-0000-000000000063', 'fa000000-0000-0000-0000-000000000001'),
  ('fa000000-0000-0000-0000-0000000000c1', 'fa000000-0000-0000-0000-000000000065', 'fa000000-0000-0000-0000-000000000001');

select ok(
  exists (
    select 1 from public.person_roles r join public.guardians g on g.id = r.guardian_id
    where r.role_key = 'admin' and lower(g.email) = 'zz-fa-admin@zztest.local'
  ),
  'a new admin account gets a person and an admin role'
);

select ok(
  exists (
    select 1 from public.profiles p
    where p.id = 'fa000000-0000-0000-0000-0000000000a1' and p.role = 'member'
  ),
  'a new admin account keeps a member profile'
);

select throws_ok(
  $$ update public.profiles set role = 'admin' where id = 'fa000000-0000-0000-0000-0000000000a4' $$,
  '23514', null, 'profiles no longer accept the admin role'
);

select ok(
  exists (select 1 from public.audit_log where action = 'role.granted' and entity_id = 'fa000000-0000-0000-0000-000000000062'),
  'granting a role is audit-logged'
);

set local role authenticated;

select set_config('request.jwt.claims', '{"sub":"fa000000-0000-0000-0000-0000000000a1","email":"zz-fa-admin@zztest.local","role":"authenticated"}', true);
select ok(public.is_admin(), 'admin role makes is_admin() true');
select ok(public.has_permission('activities.sfo.roster'), 'admin has every permission');
select is(
  (public.my_access() -> 'permissions')::jsonb @> '["activities.sfo.manage","activities.sfo.payments","activities.class.read"]'::jsonb,
  true,
  'my_access lists every permission for admin'
);
select ok((select count(*) from public.person_roles) > 0, 'admin can read person_roles');

select set_config('request.jwt.claims', '{"sub":"fa000000-0000-0000-0000-0000000000a2","email":"zz-fa-sfo@zztest.local","role":"authenticated"}', true);
select ok(not public.is_admin(), 'sfo is not admin');
select ok(public.has_permission('activities.sfo.manage'), 'sfo can manage sfo activities');
select ok(public.has_permission('activities.sfo.roster'), 'sfo can read sfo roster');
select ok(public.has_permission('activities.sfo.payments'), 'sfo can see sfo payments');
select ok(public.has_permission('activities.class.read'), 'sfo can read class activities');
select is((public.my_access() ->> 'admin')::boolean, false, 'my_access says sfo is not admin');
select is(public.my_access() -> 'roles', '["sfo"]'::jsonb, 'my_access lists the sfo role');
select is((select count(*)::int from public.students where id = 'fa000000-0000-0000-0000-000000000051'), 0, 'sfo cannot read students');
select is((select count(*)::int from public.student_fees), 0, 'sfo cannot read tuition fees');
select is((select count(*)::int from public.sadaqa_gifts), 0, 'sfo cannot read sadaqa');
select is((select count(*)::int from public.person_roles), 0, 'sfo cannot read person_roles');
select is((select count(*)::int from public.role_permissions), 0, 'sfo cannot read role_permissions');
select throws_ok(
  $$ insert into public.person_roles (guardian_id, role_key) values ('fa000000-0000-0000-0000-000000000062', 'admin') $$,
  '42501', null, 'sfo cannot grant itself admin'
);
select ok(not public.portal_is_teacher_of('fa000000-0000-0000-0000-0000000000c1'), 'sfo is not a teacher');

select set_config('request.jwt.claims', '{"sub":"fa000000-0000-0000-0000-0000000000a3","email":"zz-fa-teacher@zztest.local","role":"authenticated"}', true);
select ok(public.portal_is_teacher_of('fa000000-0000-0000-0000-0000000000c1'), 'teacher role gives class access');
select ok(not public.has_permission('activities.sfo.manage'), 'teacher has no sfo permission');
select ok(not public.is_admin(), 'teacher is not admin');

select set_config('request.jwt.claims', '{"sub":"fa000000-0000-0000-0000-0000000000a5","email":"zz-fa-sfo-teacher@zztest.local","role":"authenticated"}', true);
select ok(public.portal_is_teacher_of('fa000000-0000-0000-0000-0000000000c1'), 'sfo + teacher keeps teacher access');
select ok(public.has_permission('activities.sfo.manage'), 'sfo + teacher keeps sfo access');
select ok(
  'fa000000-0000-0000-0000-000000000051'::uuid in (select student_id from public.portal_my_children()),
  'sfo + teacher + parent still sees own child'
);

select set_config('request.jwt.claims', '{"sub":"fa000000-0000-0000-0000-0000000000a4","email":"zz-fa-parent@zztest.local","role":"authenticated"}', true);
select ok(not public.has_permission('activities.sfo.manage'), 'plain parent has no sfo permission');
select is(public.my_access() -> 'permissions', '[]'::jsonb, 'plain parent has no permissions');

reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

update public.person_roles set suspended_at = now(), suspended_reason = 'test'
where guardian_id = 'fa000000-0000-0000-0000-000000000063' and role_key = 'teacher';
select ok(
  exists (select 1 from public.audit_log where action = 'role.suspended' and entity_id = 'fa000000-0000-0000-0000-000000000063'),
  'suspension is audit-logged'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"fa000000-0000-0000-0000-0000000000a3","email":"zz-fa-teacher@zztest.local","role":"authenticated"}', true);
select ok(not public.portal_is_teacher_of('fa000000-0000-0000-0000-0000000000c1'), 'suspended teacher loses class access');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

update public.person_roles set suspended_at = null, suspended_reason = null
where guardian_id = 'fa000000-0000-0000-0000-000000000063' and role_key = 'teacher';
select ok(
  public.guardian_has_role('fa000000-0000-0000-0000-000000000063', 'teacher'),
  'reactivating the teacher role restores it'
);
update public.person_roles set suspended_at = now()
where guardian_id = 'fa000000-0000-0000-0000-000000000063' and role_key = 'teacher';
select ok(
  public.guardian_has_role('fa000000-0000-0000-0000-000000000063', 'teacher', true),
  'a suspended teacher still holds the role'
);

delete from public.person_roles where guardian_id = 'fa000000-0000-0000-0000-000000000063' and role_key = 'teacher';
select is(
  (select count(*)::int from public.class_teachers where guardian_id = 'fa000000-0000-0000-0000-000000000063'),
  0,
  'removing the teacher role drops class links'
);
select ok(
  exists (select 1 from public.audit_log where action = 'role.removed' and entity_id = 'fa000000-0000-0000-0000-000000000063'),
  'removal is audit-logged'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"fa000000-0000-0000-0000-0000000000a1","email":"zz-fa-admin@zztest.local","role":"authenticated"}', true);
select is(
  public.admin_remove_guardian_from_family('fa000000-0000-0000-0000-0000000000f1', 'fa000000-0000-0000-0000-000000000065'),
  'unlinked',
  'removing a guardian with a role from a family keeps the person'
);
select ok(
  public.guardian_has_role('fa000000-0000-0000-0000-000000000065', 'sfo'),
  'the removed guardian keeps the sfo role'
);
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

delete from public.person_roles where role_key = 'admin'
  and guardian_id not in (select g.id from public.guardians g where lower(g.email) = 'zz-fa-admin@zztest.local');
select throws_ok(
  $$ delete from public.person_roles where role_key = 'admin' $$,
  null, 'Det må finnes minst én administrator.', 'the last admin role cannot be removed'
);
select throws_ok(
  $$ update public.person_roles set suspended_at = now() where role_key = 'admin' $$,
  null, 'Det må finnes minst én administrator.', 'the last admin role cannot be suspended'
);

select * from finish();
rollback;
