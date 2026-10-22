begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(16);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into auth.users (id, email, raw_app_meta_data)
values
  ('e1000000-0000-0000-0000-0000000000a1', 'zz-e1-admin@zztest.local', '{"role":"admin"}'),
  ('e1000000-0000-0000-0000-0000000000a2', 'zz-e1-teacher@zztest.local', '{"role":"member"}'),
  ('e1000000-0000-0000-0000-0000000000a3', 'zz-e1-sub@zztest.local', '{"role":"member"}'),
  ('e1000000-0000-0000-0000-0000000000a4', 'zz-e1-parent@zztest.local', '{"role":"member"}');

update public.school_years set is_active = false where is_active;

insert into public.school_years (id, label, starts_on, ends_on, is_active)
values (
  'e1000000-0000-0000-0000-000000000001',
  'ZZTEST E1 aktiv',
  (now() at time zone 'Europe/Oslo')::date - 60,
  (now() at time zone 'Europe/Oslo')::date + 200,
  true
);

insert into public.school_days (id, school_year_id, date, cancelled)
values ('e1000000-0000-0000-0000-0000000000d1', 'e1000000-0000-0000-0000-000000000001', (now() at time zone 'Europe/Oslo')::date, false);

insert into public.classes (id, slug, name_no, name_en)
values
  ('e1000000-0000-0000-0000-0000000000c1', 'zztest-e1-a', 'ZZTEST E1 A', 'ZZTEST E1 A'),
  ('e1000000-0000-0000-0000-0000000000c2', 'zztest-e1-b', 'ZZTEST E1 B', 'ZZTEST E1 B');

insert into public.families (id, origin)
values ('e1000000-0000-0000-0000-0000000000f1', 'test');

insert into public.guardians (id, first_name, last_name, email)
values
  ('e1000000-0000-0000-0000-000000000061', 'ZZTEST', 'Laerer', 'zz-e1-teacher@zztest.local'),
  ('e1000000-0000-0000-0000-000000000062', 'ZZTEST', 'Vikar', 'zz-e1-sub@zztest.local'),
  ('e1000000-0000-0000-0000-000000000063', 'ZZTEST', 'Forelder', 'zz-e1-parent@zztest.local');
insert into public.person_roles (guardian_id, role_key) values ('e1000000-0000-0000-0000-000000000061', 'teacher'), ('e1000000-0000-0000-0000-000000000062', 'teacher');

insert into public.family_guardians (family_id, guardian_id, is_primary_contact)
values ('e1000000-0000-0000-0000-0000000000f1', 'e1000000-0000-0000-0000-000000000063', true);

insert into public.students (id, family_id, child_first_name, child_last_name)
values
  ('e1000000-0000-0000-0000-000000000051', 'e1000000-0000-0000-0000-0000000000f1', 'ZZTEST', 'Elev A'),
  ('e1000000-0000-0000-0000-000000000052', 'e1000000-0000-0000-0000-0000000000f1', 'ZZTEST', 'Elev B');

insert into public.enrollments (student_id, class_id, school_year_id, status)
values
  ('e1000000-0000-0000-0000-000000000051', 'e1000000-0000-0000-0000-0000000000c1', 'e1000000-0000-0000-0000-000000000001', 'aktiv'),
  ('e1000000-0000-0000-0000-000000000052', 'e1000000-0000-0000-0000-0000000000c2', 'e1000000-0000-0000-0000-000000000001', 'aktiv');

insert into public.class_teachers (class_id, guardian_id, school_year_id)
values ('e1000000-0000-0000-0000-0000000000c1', 'e1000000-0000-0000-0000-000000000061', 'e1000000-0000-0000-0000-000000000001');

select set_config('request.jwt.claims', '{"sub":"e1000000-0000-0000-0000-0000000000a3","email":"zz-e1-sub@zztest.local","role":"authenticated"}', true);
set local role authenticated;

select throws_ok(
  $$ select * from public.portal_class_roster('e1000000-0000-0000-0000-0000000000c2', 'e1000000-0000-0000-0000-0000000000d1') $$,
  '42501',
  null,
  'teacher without a class cannot open another class'
);

select ok(
  exists (select 1 from public.portal_substitute_options() where class_id = 'e1000000-0000-0000-0000-0000000000c2'),
  'teacher sees other classes to substitute in'
);

select is(
  public.portal_start_substitute('e1000000-0000-0000-0000-0000000000c2'),
  (now() at time zone 'Europe/Oslo')::date + 7,
  'substitute access lasts seven days'
);

select is(
  (select count(*) from public.portal_class_roster('e1000000-0000-0000-0000-0000000000c2', 'e1000000-0000-0000-0000-0000000000d1')),
  1::bigint,
  'substitute sees the class roster'
);

select lives_ok(
  $$
    insert into public.attendance (student_id, school_day_id, status)
    values ('e1000000-0000-0000-0000-000000000052', 'e1000000-0000-0000-0000-0000000000d1', 'til_stede')
  $$,
  'substitute can mark attendance'
);

select lives_ok(
  $$
    insert into public.class_notes (class_id, school_day_id, homework, author_guardian_id)
    values ('e1000000-0000-0000-0000-0000000000c2', 'e1000000-0000-0000-0000-0000000000d1', 'ZZTEST lekse', 'e1000000-0000-0000-0000-000000000062')
  $$,
  'substitute can write the class note'
);

select is(
  (select role from public.portal_my_classes() where class_id = 'e1000000-0000-0000-0000-0000000000c2'),
  'vikar',
  'substitute class is listed as vikar'
);

select throws_ok(
  $$
    insert into public.attendance (student_id, school_day_id, status)
    values ('e1000000-0000-0000-0000-000000000051', 'e1000000-0000-0000-0000-0000000000d1', 'til_stede')
  $$,
  '42501',
  null,
  'substitute cannot mark a class they are not substituting in'
);

select throws_ok(
  $$
    insert into public.class_substitutes (class_id, guardian_id, school_year_id, until)
    values ('e1000000-0000-0000-0000-0000000000c1', 'e1000000-0000-0000-0000-000000000062', 'e1000000-0000-0000-0000-000000000001', '2099-01-01')
  $$,
  '42501',
  null,
  'teacher cannot write substitute rows directly'
);

select public.portal_end_substitute('e1000000-0000-0000-0000-0000000000c2');

select throws_ok(
  $$ select * from public.portal_class_roster('e1000000-0000-0000-0000-0000000000c2', 'e1000000-0000-0000-0000-0000000000d1') $$,
  '42501',
  null,
  'ending substitute access removes it'
);

select public.portal_start_substitute('e1000000-0000-0000-0000-0000000000c2');

reset role;
update public.class_substitutes
set until = (now() at time zone 'Europe/Oslo')::date - 1
where guardian_id = 'e1000000-0000-0000-0000-000000000062';
set local role authenticated;

select ok(
  not public.portal_is_teacher_of('e1000000-0000-0000-0000-0000000000c2'),
  'expired substitute access no longer counts'
);

select set_config('request.jwt.claims', '{"sub":"e1000000-0000-0000-0000-0000000000a4","email":"zz-e1-parent@zztest.local","role":"authenticated"}', true);

select throws_ok(
  $$ select public.portal_start_substitute('e1000000-0000-0000-0000-0000000000c2') $$,
  '42501',
  null,
  'a parent cannot make themselves a substitute'
);

select is(
  (select count(*) from public.portal_substitute_options()),
  0::bigint,
  'a parent sees no substitute options'
);

select set_config('request.jwt.claims', '{"sub":"e1000000-0000-0000-0000-0000000000a1","email":"zz-e1-admin@zztest.local","role":"authenticated"}', true);

select is(
  (select count(*) from public.portal_class_roster('e1000000-0000-0000-0000-0000000000c2', 'e1000000-0000-0000-0000-0000000000d1')),
  1::bigint,
  'admin sees the roster of any class'
);

select lives_ok(
  $$
    insert into public.attendance (student_id, school_day_id, status)
    values ('e1000000-0000-0000-0000-000000000051', 'e1000000-0000-0000-0000-0000000000d1', 'sent')
  $$,
  'admin can mark attendance in any class'
);

select lives_ok(
  $$
    insert into public.class_notes (class_id, school_day_id, summary)
    values ('e1000000-0000-0000-0000-0000000000c1', 'e1000000-0000-0000-0000-0000000000d1', 'ZZTEST admin')
  $$,
  'admin can write a note in any class'
);

reset role;

select * from finish();

rollback;
