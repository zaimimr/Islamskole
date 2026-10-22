begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(14);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into auth.users (id, email, raw_app_meta_data)
values
  ('f2000000-0000-0000-0000-0000000000a2', 'zz-f2-teacher@zztest.local', '{"role":"member"}');

update public.school_years set is_active = false where is_active;

insert into public.school_years (id, label, starts_on, ends_on, is_active)
values (
  'f2000000-0000-0000-0000-000000000001',
  'ZZTEST F2 aktiv',
  (now() at time zone 'Europe/Oslo')::date - 60,
  (now() at time zone 'Europe/Oslo')::date + 200,
  true
);

insert into public.school_days (id, school_year_id, date, cancelled)
values ('f2000000-0000-0000-0000-0000000000d1', 'f2000000-0000-0000-0000-000000000001', (now() at time zone 'Europe/Oslo')::date, false);

insert into public.classes (id, slug, name_no, name_en, published)
values
  ('f2000000-0000-0000-0000-0000000000c1', 'zztest-f2-a', 'ZZTEST F2 A', 'ZZTEST F2 A', true),
  ('f2000000-0000-0000-0000-0000000000c2', 'zztest-f2-b', 'ZZTEST F2 B', 'ZZTEST F2 B', true);

insert into public.families (id, origin)
values ('f2000000-0000-0000-0000-0000000000f1', 'test'), ('f2000000-0000-0000-0000-0000000000f2', 'test');

insert into public.guardians (id, first_name, last_name, email)
values ('f2000000-0000-0000-0000-000000000061', 'ZZTEST', 'Laerer', 'zz-f2-teacher@zztest.local');
insert into public.person_roles (guardian_id, role_key) values ('f2000000-0000-0000-0000-000000000061', 'teacher');

insert into public.family_guardians (family_id, guardian_id, is_primary_contact)
values ('f2000000-0000-0000-0000-0000000000f1', 'f2000000-0000-0000-0000-000000000061', true);

insert into public.students (id, family_id, child_first_name, child_last_name)
values
  ('f2000000-0000-0000-0000-000000000051', 'f2000000-0000-0000-0000-0000000000f1', 'ZZTEST', 'Eget barn'),
  ('f2000000-0000-0000-0000-000000000052', 'f2000000-0000-0000-0000-0000000000f2', 'ZZTEST', 'Elev');

insert into public.student_guardians (student_id, family_id, guardian_id, is_primary)
values ('f2000000-0000-0000-0000-000000000051', 'f2000000-0000-0000-0000-0000000000f1', 'f2000000-0000-0000-0000-000000000061', true)
on conflict do nothing;

insert into public.enrollments (student_id, class_id, school_year_id, status)
values
  ('f2000000-0000-0000-0000-000000000051', 'f2000000-0000-0000-0000-0000000000c2', 'f2000000-0000-0000-0000-000000000001', 'aktiv'),
  ('f2000000-0000-0000-0000-000000000052', 'f2000000-0000-0000-0000-0000000000c1', 'f2000000-0000-0000-0000-000000000001', 'aktiv');

insert into public.class_teachers (class_id, guardian_id, school_year_id)
values ('f2000000-0000-0000-0000-0000000000c1', 'f2000000-0000-0000-0000-000000000061', 'f2000000-0000-0000-0000-000000000001');

select set_config('request.jwt.claims', '{"sub":"f2000000-0000-0000-0000-0000000000a2","email":"zz-f2-teacher@zztest.local","role":"authenticated"}', true);
set local role authenticated;

select ok(
  public.portal_is_teacher_of('f2000000-0000-0000-0000-0000000000c1'),
  'an active teacher teaches the class'
);

reset role;
update public.person_roles set suspended_at = now(), suspended_reason = 'ZZTEST', suspended_by = 'zz-f2-admin@zztest.local' where guardian_id = 'f2000000-0000-0000-0000-000000000061' and role_key = 'teacher';
set local role authenticated;

select ok(
  not public.portal_is_teacher_of('f2000000-0000-0000-0000-0000000000c1'),
  'a suspended teacher fails portal_is_teacher_of'
);

select is(
  (select count(*) from public.portal_my_classes()),
  0::bigint,
  'a suspended teacher has no classes'
);

select throws_ok(
  $$ select * from public.portal_class_roster('f2000000-0000-0000-0000-0000000000c1', 'f2000000-0000-0000-0000-0000000000d1') $$,
  '42501',
  null,
  'a suspended teacher cannot open the class roster'
);

select throws_ok(
  $$
    insert into public.attendance (student_id, school_day_id, status)
    values ('f2000000-0000-0000-0000-000000000052', 'f2000000-0000-0000-0000-0000000000d1', 'til_stede')
  $$,
  '42501',
  null,
  'a suspended teacher cannot mark attendance'
);

select throws_ok(
  $$
    insert into public.class_notes (class_id, school_day_id, homework, author_guardian_id)
    values ('f2000000-0000-0000-0000-0000000000c1', 'f2000000-0000-0000-0000-0000000000d1', 'ZZTEST lekse', 'f2000000-0000-0000-0000-000000000061')
  $$,
  '42501',
  null,
  'a suspended teacher cannot write a class note'
);

select is(
  (select count(*) from public.portal_substitute_options()),
  0::bigint,
  'a suspended teacher sees no substitute options'
);

select throws_ok(
  $$ select public.portal_start_substitute('f2000000-0000-0000-0000-0000000000c2') $$,
  '42501',
  null,
  'a suspended teacher cannot become a substitute'
);

reset role;
insert into public.class_substitutes (class_id, guardian_id, school_year_id, until)
values ('f2000000-0000-0000-0000-0000000000c2', 'f2000000-0000-0000-0000-000000000061', 'f2000000-0000-0000-0000-000000000001', (now() at time zone 'Europe/Oslo')::date + 7);
set local role authenticated;

select ok(
  not public.portal_is_substitute_of('f2000000-0000-0000-0000-0000000000c2'),
  'an existing substitute row does not count while suspended'
);

select ok(
  public.portal_is_guardian_of('f2000000-0000-0000-0000-000000000051'),
  'a suspended teacher is still guardian of their own child'
);

select is(
  (select count(*) from public.portal_my_children()),
  1::bigint,
  'a suspended teacher still sees their own children'
);

select ok(
  'f2000000-0000-0000-0000-0000000000f1'::uuid in (select public.portal_my_family_ids()),
  'a suspended teacher still reaches their family'
);

reset role;
update public.person_roles set suspended_at = null, suspended_reason = null, suspended_by = null where guardian_id = 'f2000000-0000-0000-0000-000000000061' and role_key = 'teacher';
delete from public.class_substitutes where guardian_id = 'f2000000-0000-0000-0000-000000000061';
set local role authenticated;

select ok(
  public.portal_is_teacher_of('f2000000-0000-0000-0000-0000000000c1'),
  'lifting the suspension restores teacher access'
);

select ok(
  exists (select 1 from public.portal_substitute_options() where class_id = 'f2000000-0000-0000-0000-0000000000c2'),
  'lifting the suspension restores substitute options'
);

reset role;

select * from finish();

rollback;
