begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(27);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into auth.users (id, email, raw_app_meta_data)
values
  ('d7000000-0000-0000-0000-0000000000a1', 'zz-d7-admin@zztest.local', '{"role":"admin"}'),
  ('d7000000-0000-0000-0000-0000000000a2', 'zz-d7-teacher@zztest.local', '{"role":"member"}'),
  ('d7000000-0000-0000-0000-0000000000a3', 'zz-d7-parent@zztest.local', '{"role":"member"}');

update public.school_years set is_active = false where is_active;

insert into public.school_years (id, label, starts_on, ends_on, is_active)
values
  (
    'd7000000-0000-0000-0000-000000000001',
    'ZZTEST D7 aktiv',
    (now() at time zone 'Europe/Oslo')::date - 60,
    (now() at time zone 'Europe/Oslo')::date + 200,
    true
  ),
  (
    'd7000000-0000-0000-0000-000000000000',
    'ZZTEST D7 i fjor',
    (now() at time zone 'Europe/Oslo')::date - 500,
    (now() at time zone 'Europe/Oslo')::date - 300,
    false
  );

insert into public.school_days (id, school_year_id, date, cancelled)
values
  ('d7000000-0000-0000-0000-0000000000d0', 'd7000000-0000-0000-0000-000000000000', (now() at time zone 'Europe/Oslo')::date - 400, false),
  ('d7000000-0000-0000-0000-0000000000d1', 'd7000000-0000-0000-0000-000000000001', (now() at time zone 'Europe/Oslo')::date - 7, false),
  ('d7000000-0000-0000-0000-0000000000d2', 'd7000000-0000-0000-0000-000000000001', (now() at time zone 'Europe/Oslo')::date, false),
  ('d7000000-0000-0000-0000-0000000000d3', 'd7000000-0000-0000-0000-000000000001', (now() at time zone 'Europe/Oslo')::date + 7, false),
  ('d7000000-0000-0000-0000-0000000000d4', 'd7000000-0000-0000-0000-000000000001', (now() at time zone 'Europe/Oslo')::date - 14, true),
  ('d7000000-0000-0000-0000-0000000000d5', 'd7000000-0000-0000-0000-000000000001', (now() at time zone 'Europe/Oslo')::date - 21, true);

insert into public.classes (id, slug, name_no, name_en)
values
  ('d7000000-0000-0000-0000-0000000000c1', 'zztest-d7-a', 'ZZTEST D7 A', 'ZZTEST D7 A'),
  ('d7000000-0000-0000-0000-0000000000c2', 'zztest-d7-b', 'ZZTEST D7 B', 'ZZTEST D7 B');

insert into public.families (id, origin)
values
  ('d7000000-0000-0000-0000-0000000000f1', 'test'),
  ('d7000000-0000-0000-0000-0000000000f2', 'test');

insert into public.guardians (id, first_name, last_name, email)
values
  ('d7000000-0000-0000-0000-000000000061', 'ZZTEST', 'Laerer', 'zz-d7-teacher@zztest.local'),
  ('d7000000-0000-0000-0000-000000000062', 'ZZTEST', 'Forelder', 'zz-d7-parent@zztest.local'),
  ('d7000000-0000-0000-0000-000000000063', 'ZZTEST', 'Annen Forelder', 'zz-d7-other@zztest.local');
insert into public.person_roles (guardian_id, role_key) values ('d7000000-0000-0000-0000-000000000061', 'teacher');

insert into public.family_guardians (family_id, guardian_id, is_primary_contact)
values
  ('d7000000-0000-0000-0000-0000000000f1', 'd7000000-0000-0000-0000-000000000062', true),
  ('d7000000-0000-0000-0000-0000000000f2', 'd7000000-0000-0000-0000-000000000063', true);

insert into public.students (id, family_id, child_first_name, child_last_name)
values
  ('d7000000-0000-0000-0000-000000000051', 'd7000000-0000-0000-0000-0000000000f1', 'ZZTEST', 'Elev A'),
  ('d7000000-0000-0000-0000-000000000052', 'd7000000-0000-0000-0000-0000000000f2', 'ZZTEST', 'Elev A To'),
  ('d7000000-0000-0000-0000-000000000053', 'd7000000-0000-0000-0000-0000000000f2', 'ZZTEST', 'Elev B');

insert into public.enrollments (student_id, class_id, school_year_id, status)
values
  ('d7000000-0000-0000-0000-000000000051', 'd7000000-0000-0000-0000-0000000000c1', 'd7000000-0000-0000-0000-000000000001', 'aktiv'),
  ('d7000000-0000-0000-0000-000000000051', 'd7000000-0000-0000-0000-0000000000c1', 'd7000000-0000-0000-0000-000000000000', 'aktiv'),
  ('d7000000-0000-0000-0000-000000000052', 'd7000000-0000-0000-0000-0000000000c1', 'd7000000-0000-0000-0000-000000000001', 'aktiv'),
  ('d7000000-0000-0000-0000-000000000053', 'd7000000-0000-0000-0000-0000000000c2', 'd7000000-0000-0000-0000-000000000001', 'aktiv');

insert into public.class_teachers (class_id, guardian_id, school_year_id)
values
  ('d7000000-0000-0000-0000-0000000000c1', 'd7000000-0000-0000-0000-000000000061', 'd7000000-0000-0000-0000-000000000001'),
  ('d7000000-0000-0000-0000-0000000000c1', 'd7000000-0000-0000-0000-000000000061', 'd7000000-0000-0000-0000-000000000000');

insert into public.attendance (student_id, school_day_id, status)
values
  ('d7000000-0000-0000-0000-000000000052', 'd7000000-0000-0000-0000-0000000000d3', 'fravaer'),
  ('d7000000-0000-0000-0000-000000000051', 'd7000000-0000-0000-0000-0000000000d1', 'fravaer');

insert into public.class_notes (id, class_id, school_day_id, homework)
values
  ('d7000000-0000-0000-0000-0000000000e0', 'd7000000-0000-0000-0000-0000000000c1', 'd7000000-0000-0000-0000-0000000000d0', 'ZZTEST i fjor'),
  ('d7000000-0000-0000-0000-0000000000e1', 'd7000000-0000-0000-0000-0000000000c1', 'd7000000-0000-0000-0000-0000000000d1', 'ZZTEST forrige uke'),
  ('d7000000-0000-0000-0000-0000000000e4', 'd7000000-0000-0000-0000-0000000000c1', 'd7000000-0000-0000-0000-0000000000d4', 'ZZTEST avlyst'),
  ('d7000000-0000-0000-0000-0000000000e5', 'd7000000-0000-0000-0000-0000000000c2', 'd7000000-0000-0000-0000-0000000000d1', 'ZZTEST klasse B');

select set_config('request.jwt.claims', '{"sub":"d7000000-0000-0000-0000-0000000000a2","email":"zz-d7-teacher@zztest.local","role":"authenticated"}', true);
set local role authenticated;

select lives_ok(
  $$
    insert into public.attendance (student_id, school_day_id, status)
    values ('d7000000-0000-0000-0000-000000000051', 'd7000000-0000-0000-0000-0000000000d2', 'til_stede')
  $$,
  'D7 SEC-08: teacher can still mark today''s open day'
);

update public.attendance
set status = 'sent'
where student_id = 'd7000000-0000-0000-0000-000000000051'
  and school_day_id = 'd7000000-0000-0000-0000-0000000000d1';

select throws_ok(
  $$
    insert into public.attendance (student_id, school_day_id, status)
    values ('d7000000-0000-0000-0000-000000000051', 'd7000000-0000-0000-0000-0000000000d3', 'fravaer')
  $$,
  '42501',
  null,
  'D7 CLS-23: teacher cannot mark a future school day'
);

select throws_ok(
  $$
    insert into public.attendance (student_id, school_day_id, status)
    values ('d7000000-0000-0000-0000-000000000051', 'd7000000-0000-0000-0000-0000000000d4', 'fravaer')
  $$,
  '42501',
  null,
  'D7 SEC-08: teacher cannot mark a cancelled school day'
);

do $$
begin
  update public.attendance
  set status = 'til_stede'
  where student_id = 'd7000000-0000-0000-0000-000000000052'
    and school_day_id = 'd7000000-0000-0000-0000-0000000000d3';
exception when insufficient_privilege then
  null;
end;
$$;

reset role;

select is(
  (
    select status from public.attendance
    where student_id = 'd7000000-0000-0000-0000-000000000051'
      and school_day_id = 'd7000000-0000-0000-0000-0000000000d1'
  ),
  'sent',
  'D7 CLS-23: teacher can correct a past day in the active year'
);

select is(
  (
    select status from public.attendance
    where student_id = 'd7000000-0000-0000-0000-000000000052'
      and school_day_id = 'd7000000-0000-0000-0000-0000000000d3'
  ),
  'fravaer',
  'D7 CLS-23: teacher cannot change attendance on a future day'
);

select set_config('request.jwt.claims', '{"sub":"d7000000-0000-0000-0000-0000000000a1","email":"zz-d7-admin@zztest.local","role":"authenticated"}', true);
set local role authenticated;

select lives_ok(
  $$
    insert into public.attendance (student_id, school_day_id, status)
    values ('d7000000-0000-0000-0000-000000000053', 'd7000000-0000-0000-0000-0000000000d4', 'fravaer')
  $$,
  'D7 SEC-08: admin can still mark any school day'
);

select set_config('request.jwt.claims', '{"sub":"d7000000-0000-0000-0000-0000000000a3","email":"zz-d7-parent@zztest.local","role":"authenticated"}', true);

select is(
  (
    select count(*) from public.class_notes
    where class_id = 'd7000000-0000-0000-0000-0000000000c1'
      and school_day_id = 'd7000000-0000-0000-0000-0000000000d0'
  ),
  0::bigint,
  'D8 CLS-25: guardian cannot read last year''s notes'
);

select is(
  (
    select count(*) from public.class_notes n
    join public.school_days d on d.id = n.school_day_id
    where n.class_id = 'd7000000-0000-0000-0000-0000000000c1'
      and d.school_year_id = 'd7000000-0000-0000-0000-000000000001'
  ),
  2::bigint,
  'D8 CLS-25: guardian can read this year''s notes'
);

select is(
  (select count(*) from public.class_notes where class_id = 'd7000000-0000-0000-0000-0000000000c2'),
  0::bigint,
  'D8 CLS-25: guardian cannot read notes of a class without their child'
);

select set_config('request.jwt.claims', '{"sub":"d7000000-0000-0000-0000-0000000000a2","email":"zz-d7-teacher@zztest.local","role":"authenticated"}', true);

select throws_ok(
  $$
    insert into public.class_notes (class_id, school_day_id, homework)
    values ('d7000000-0000-0000-0000-0000000000c1', 'd7000000-0000-0000-0000-0000000000d5', 'ZZTEST ny avlyst')
  $$,
  '42501',
  null,
  'D8 CLS-24: teacher cannot write a note on a cancelled day'
);

do $$
begin
  update public.class_notes
  set homework = 'ZZTEST endret'
  where id = 'd7000000-0000-0000-0000-0000000000e4';
exception when insufficient_privilege then
  null;
end;
$$;

reset role;

select is(
  (select homework from public.class_notes where id = 'd7000000-0000-0000-0000-0000000000e4'),
  'ZZTEST avlyst',
  'D8 CLS-24: teacher cannot edit a note on a cancelled day'
);

set local role authenticated;

select lives_ok(
  $$
    insert into public.class_notes (class_id, school_day_id, homework)
    values ('d7000000-0000-0000-0000-0000000000c1', 'd7000000-0000-0000-0000-0000000000d2', 'ZZTEST i dag')
  $$,
  'D8 CLS-24: teacher can still write a note for today'
);

delete from public.class_notes where id = 'd7000000-0000-0000-0000-0000000000e1';

reset role;

select is(
  (select count(*) from public.class_notes where id = 'd7000000-0000-0000-0000-0000000000e1'),
  0::bigint,
  'D8 CLS-24: teacher can delete a note of their class'
);

select set_config('request.jwt.claims', '{"sub":"d7000000-0000-0000-0000-0000000000a1","email":"zz-d7-admin@zztest.local","role":"authenticated"}', true);
set local role authenticated;

select is(
  (select count(*) from public.portal_class_roster('d7000000-0000-0000-0000-0000000000c1', 'd7000000-0000-0000-0000-0000000000d2')),
  2::bigint,
  'D10 CLS-26: admin can open the roster of any class'
);

select lives_ok(
  $$
    insert into public.class_notes (class_id, school_day_id, homework)
    values ('d7000000-0000-0000-0000-0000000000c2', 'd7000000-0000-0000-0000-0000000000d2', 'ZZTEST admin')
  $$,
  'D10 CLS-26: admin can write a note for any class'
);

insert into public.class_notes (class_id, school_day_id, homework)
values ('d7000000-0000-0000-0000-0000000000c2', 'd7000000-0000-0000-0000-0000000000d2', 'ZZTEST admin endret')
on conflict (lesson_id) do update set homework = excluded.homework;

select is(
  (select homework from public.class_notes where class_id = 'd7000000-0000-0000-0000-0000000000c2' and school_day_id = 'd7000000-0000-0000-0000-0000000000d2'),
  'ZZTEST admin endret',
  'D10 CLS-26: admin can update a note for any class with the app upsert'
);

insert into public.attendance (student_id, school_day_id, status)
values ('d7000000-0000-0000-0000-000000000053', 'd7000000-0000-0000-0000-0000000000d4', 'til_stede')
on conflict (student_id, lesson_id) do update set status = excluded.status;

select is(
  (select status::text from public.attendance where student_id = 'd7000000-0000-0000-0000-000000000053' and school_day_id = 'd7000000-0000-0000-0000-0000000000d4'),
  'til_stede',
  'D10 CLS-26: admin can change attendance with the app upsert'
);

delete from public.class_notes where class_id = 'd7000000-0000-0000-0000-0000000000c2' and school_day_id = 'd7000000-0000-0000-0000-0000000000d2';

select is(
  (select count(*) from public.class_notes where class_id = 'd7000000-0000-0000-0000-0000000000c2' and school_day_id = 'd7000000-0000-0000-0000-0000000000d2'),
  0::bigint,
  'D10 CLS-24: admin can delete a note for any class'
);

select is(
  (select count(*) from public.portal_my_classes()),
  0::bigint,
  'D10 CLS-26: portal_my_classes stays classes I teach for an admin'
);

select set_config('request.jwt.claims', '{"sub":"d7000000-0000-0000-0000-00000000dead","email":"zz-d7-parent@zztest.local","role":"authenticated"}', true);

select is(
  (select count(*) from public.portal_guardian_ids()),
  0::bigint,
  'D13 SEC-17: portal_guardian_ids is empty for a deleted user with a live JWT'
);

select is(
  public.portal_is_guardian_of('d7000000-0000-0000-0000-000000000051'),
  false,
  'D13 SEC-17: portal_is_guardian_of is false for a deleted user'
);

select is(
  (select count(*) from public.portal_my_children()),
  0::bigint,
  'D13 SEC-17: portal_my_children is empty for a deleted user'
);

select is(
  (select count(*) from public.attendance where student_id = 'd7000000-0000-0000-0000-000000000051'),
  0::bigint,
  'D13 SEC-17: a deleted parent cannot read the child attendance'
);

select set_config('request.jwt.claims', '{"sub":"d7000000-0000-0000-0000-00000000beef","email":"zz-d7-teacher@zztest.local","role":"authenticated"}', true);

select is(
  public.portal_is_teacher_of('d7000000-0000-0000-0000-0000000000c1'),
  false,
  'D13 SEC-17: portal_is_teacher_of is false for a deleted teacher'
);

select is(
  (select count(*) from public.portal_my_classes()),
  0::bigint,
  'D13 SEC-17: portal_my_classes is empty for a deleted teacher'
);

select set_config('request.jwt.claims', '{"sub":"d7000000-0000-0000-0000-0000000000a3","email":"zz-d7-parent@zztest.local","role":"authenticated"}', true);

select is(
  (select count(*) from public.portal_my_children()),
  1::bigint,
  'D13 SEC-17: a live parent still sees their child'
);

select set_config('request.jwt.claims', '{"sub":"d7000000-0000-0000-0000-0000000000a2","email":"zz-d7-teacher@zztest.local","role":"authenticated"}', true);

select is(
  (select count(*) from public.portal_my_classes()),
  1::bigint,
  'D13 SEC-17: a live teacher still sees their class'
);

reset role;

select * from finish();

rollback;
