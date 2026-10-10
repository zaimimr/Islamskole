begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(24);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into auth.users (id, email, raw_app_meta_data)
values
  ('f8000000-0000-0000-0000-0000000000a2', 'zz-f8-teacher@zztest.local', '{"role":"member"}'),
  ('f8000000-0000-0000-0000-0000000000a3', 'zz-f8-other-teacher@zztest.local', '{"role":"member"}'),
  ('f8000000-0000-0000-0000-0000000000a4', 'zz-f8-parent@zztest.local', '{"role":"member"}');

update public.school_years set is_active = false where is_active;

insert into public.school_years (id, label, starts_on, ends_on, is_active)
values ('f8000000-0000-0000-0000-000000000001', 'ZZTEST F8 aktiv',
  (now() at time zone 'Europe/Oslo')::date - 60, (now() at time zone 'Europe/Oslo')::date + 200, true);

insert into public.classes (id, slug, name_no, name_en)
values
  ('f8000000-0000-0000-0000-0000000000c1', 'zztest-f8-a', 'ZZTEST F8 A', 'ZZTEST F8 A'),
  ('f8000000-0000-0000-0000-0000000000c2', 'zztest-f8-b', 'ZZTEST F8 B', 'ZZTEST F8 B');

insert into public.families (id, origin)
values ('f8000000-0000-0000-0000-0000000000f1', 'test');

insert into public.guardians (id, first_name, last_name, email, is_teacher)
values
  ('f8000000-0000-0000-0000-000000000061', 'ZZTEST', 'Laerer', 'zz-f8-teacher@zztest.local', true),
  ('f8000000-0000-0000-0000-000000000062', 'ZZTEST', 'Annen laerer', 'zz-f8-other-teacher@zztest.local', true),
  ('f8000000-0000-0000-0000-000000000063', 'ZZTEST', 'Forelder', 'zz-f8-parent@zztest.local', false);

insert into public.students (id, family_id, child_first_name, child_last_name)
values
  ('f8000000-0000-0000-0000-000000000051', 'f8000000-0000-0000-0000-0000000000f1', 'ZZTEST', 'Elev A'),
  ('f8000000-0000-0000-0000-000000000052', 'f8000000-0000-0000-0000-0000000000f1', 'ZZTEST', 'Elev B');

insert into public.family_guardians (family_id, guardian_id, is_primary_contact)
values ('f8000000-0000-0000-0000-0000000000f1', 'f8000000-0000-0000-0000-000000000063', true);

insert into public.student_guardians (student_id, family_id, guardian_id)
values
  ('f8000000-0000-0000-0000-000000000051', 'f8000000-0000-0000-0000-0000000000f1', 'f8000000-0000-0000-0000-000000000063'),
  ('f8000000-0000-0000-0000-000000000052', 'f8000000-0000-0000-0000-0000000000f1', 'f8000000-0000-0000-0000-000000000063')
on conflict do nothing;

insert into public.enrollments (student_id, class_id, school_year_id, status)
values
  ('f8000000-0000-0000-0000-000000000051', 'f8000000-0000-0000-0000-0000000000c1', 'f8000000-0000-0000-0000-000000000001', 'aktiv'),
  ('f8000000-0000-0000-0000-000000000052', 'f8000000-0000-0000-0000-0000000000c1', 'f8000000-0000-0000-0000-000000000001', 'aktiv');

insert into public.class_teachers (class_id, guardian_id, school_year_id)
values
  ('f8000000-0000-0000-0000-0000000000c1', 'f8000000-0000-0000-0000-000000000061', 'f8000000-0000-0000-0000-000000000001'),
  ('f8000000-0000-0000-0000-0000000000c2', 'f8000000-0000-0000-0000-000000000062', 'f8000000-0000-0000-0000-000000000001');

insert into public.school_days (id, school_year_id, date)
values
  ('f8000000-0000-0000-0000-0000000000d1', 'f8000000-0000-0000-0000-000000000001', (now() at time zone 'Europe/Oslo')::date - 7),
  ('f8000000-0000-0000-0000-0000000000d3', 'f8000000-0000-0000-0000-000000000001', (now() at time zone 'Europe/Oslo')::date + 7);

insert into auth.users (id, email, raw_app_meta_data)
values ('f8000000-0000-0000-0000-0000000000a1', 'zz-f8-admin@zztest.local', '{"role":"admin"}');

delete from public.lessons where school_day_id in ('f8000000-0000-0000-0000-0000000000d1', 'f8000000-0000-0000-0000-0000000000d3');

insert into public.lessons (class_id, school_day_id, start_position, end_position, cancelled)
select c.id, d.id, p, p, c.slug = 'zztest-f8-b' and p = 2
from public.classes c
cross join public.school_days d
cross join generate_series(1, 3) p
where c.slug in ('zztest-f8-a', 'zztest-f8-b')
  and d.school_year_id = 'f8000000-0000-0000-0000-000000000001';

create temporary table propagation_lessons as
select l.id, l.start_position, l.cancelled,
  case when l.class_id = 'f8000000-0000-0000-0000-0000000000c1' then 'a' else 'b' end as class,
  case when l.school_day_id = 'f8000000-0000-0000-0000-0000000000d1' then 'past' else 'future' end as day
from public.lessons l
where l.school_day_id in ('f8000000-0000-0000-0000-0000000000d1', 'f8000000-0000-0000-0000-0000000000d3');
grant select on propagation_lessons to authenticated;

select set_config('request.jwt.claims', '{"sub":"f8000000-0000-0000-0000-0000000000a2","email":"zz-f8-teacher@zztest.local","role":"authenticated"}', true);
set local role authenticated;

insert into public.attendance (student_id, lesson_id, status) values ('f8000000-0000-0000-0000-000000000051', (select id from propagation_lessons where class = 'a' and day = 'past' and start_position = 1), 'fravaer') on conflict (student_id, lesson_id) do update set status = excluded.status;
select is((select status from public.attendance where student_id = 'f8000000-0000-0000-0000-000000000051' and lesson_id = (select id from propagation_lessons where class = 'a' and day = 'past' and start_position = 2)), 'fravaer', 'the first lesson fills the next lesson');

select is((select status from public.attendance where student_id = 'f8000000-0000-0000-0000-000000000051' and lesson_id = (select id from propagation_lessons where class = 'a' and day = 'past' and start_position = 3)), 'fravaer', 'the first lesson fills the last lesson');

select is((select inherited_from_lesson_id from public.attendance where student_id = 'f8000000-0000-0000-0000-000000000051' and lesson_id = (select id from propagation_lessons where class = 'a' and day = 'past' and start_position = 2)), (select id from propagation_lessons where class = 'a' and day = 'past' and start_position = 1), 'inherited attendance identifies its source');

select is((select count(*) from public.attendance where student_id = 'f8000000-0000-0000-0000-000000000052'), 0::bigint, 'other students are unchanged');

select is((select count(*) from public.attendance where student_id = 'f8000000-0000-0000-0000-000000000051' and school_day_id = 'f8000000-0000-0000-0000-0000000000d3'), 0::bigint, 'later school days are unchanged');

reset role;
select is((select status from public.attendance where student_id = 'f8000000-0000-0000-0000-000000000051' and lesson_id = (select id from propagation_lessons where class = 'b' and day = 'past' and start_position = 3)), null::text, 'attendance does not reach a class without active enrollment');

select is((select count(*) from public.attendance where lesson_id = (select id from propagation_lessons where class = 'b' and day = 'past' and start_position = 2)), 0::bigint, 'cancelled lessons are skipped');

select is((select count(*) from public.attendance where lesson_id = (select id from propagation_lessons where class = 'b' and day = 'past' and start_position = 1)), 0::bigint, 'simultaneous lessons are skipped');

set local role authenticated;
select is(public.portal_can_write_lesson_attendance('f8000000-0000-0000-0000-000000000051', (select id from propagation_lessons where class = 'b' and day = 'past' and start_position = 3)), false, 'the source teacher still cannot mark the other class directly');

insert into public.attendance (student_id, lesson_id, status) values ('f8000000-0000-0000-0000-000000000051', (select id from propagation_lessons where class = 'a' and day = 'past' and start_position = 1), 'til_stede') on conflict (student_id, lesson_id) do update set status = excluded.status;
select is((select status from public.attendance where student_id = 'f8000000-0000-0000-0000-000000000051' and lesson_id = (select id from propagation_lessons where class = 'a' and day = 'past' and start_position = 2)), 'til_stede', 'correcting the first lesson updates its inherited attendance');

insert into public.attendance (student_id, lesson_id, status) values ('f8000000-0000-0000-0000-000000000051', (select id from propagation_lessons where class = 'a' and day = 'past' and start_position = 2), 'sent') on conflict (student_id, lesson_id) do update set status = excluded.status;
select is((select inherited_from_lesson_id from public.attendance where student_id = 'f8000000-0000-0000-0000-000000000051' and lesson_id = (select id from propagation_lessons where class = 'a' and day = 'past' and start_position = 2)) is null, true, 'a later manual correction clears inheritance');

select is((select status from public.attendance where student_id = 'f8000000-0000-0000-0000-000000000051' and lesson_id = (select id from propagation_lessons where class = 'a' and day = 'past' and start_position = 3)), 'sent', 'arrival in a later lesson updates subsequent attendance');

insert into public.attendance (student_id, lesson_id, status) values ('f8000000-0000-0000-0000-000000000051', (select id from propagation_lessons where class = 'a' and day = 'past' and start_position = 1), 'fravaer') on conflict (student_id, lesson_id) do update set status = excluded.status;
select is((select status from public.attendance where student_id = 'f8000000-0000-0000-0000-000000000051' and lesson_id = (select id from propagation_lessons where class = 'a' and day = 'past' and start_position = 2)), 'sent', 'earlier corrections preserve a later manual arrival');

select is((select status from public.attendance where student_id = 'f8000000-0000-0000-0000-000000000051' and lesson_id = (select id from propagation_lessons where class = 'a' and day = 'past' and start_position = 3)), 'sent', 'earlier corrections preserve values inherited from a later correction');

insert into public.attendance (student_id, lesson_id, status) values ('f8000000-0000-0000-0000-000000000051', (select id from propagation_lessons where class = 'a' and day = 'past' and start_position = 3), 'fravaer') on conflict (student_id, lesson_id) do update set status = excluded.status;
insert into public.attendance (student_id, lesson_id, status) values ('f8000000-0000-0000-0000-000000000051', (select id from propagation_lessons where class = 'a' and day = 'past' and start_position = 2), 'til_stede') on conflict (student_id, lesson_id) do update set status = excluded.status;
select is((select status from public.attendance where student_id = 'f8000000-0000-0000-0000-000000000051' and lesson_id = (select id from propagation_lessons where class = 'a' and day = 'past' and start_position = 3)), 'fravaer', 'a manually recorded departure is preserved');

update public.attendance set inherited_from_lesson_id = (select id from propagation_lessons where class = 'a' and day = 'past' and start_position = 1) where student_id = 'f8000000-0000-0000-0000-000000000051' and lesson_id = (select id from propagation_lessons where class = 'a' and day = 'past' and start_position = 3);
select is((select inherited_from_lesson_id from public.attendance where student_id = 'f8000000-0000-0000-0000-000000000051' and lesson_id = (select id from propagation_lessons where class = 'a' and day = 'past' and start_position = 3)) is null, true, 'clients cannot forge inherited attendance');

select set_config('request.jwt.claims', '{"sub":"f8000000-0000-0000-0000-0000000000a4","email":"zz-f8-parent@zztest.local","role":"authenticated"}', true);
select throws_ok($$ insert into public.attendance (student_id, lesson_id, status) values ('f8000000-0000-0000-0000-000000000052', (select id from propagation_lessons where class = 'a' and day = 'past' and start_position = 1), 'til_stede') on conflict (student_id, lesson_id) do update set status = excluded.status; $$, '42501', null, 'parents cannot record or propagate attendance');

select set_config('request.jwt.claims', '{"sub":"f8000000-0000-0000-0000-0000000000a1","email":"zz-f8-admin@zztest.local","role":"authenticated"}', true);
insert into public.attendance (student_id, lesson_id, status) values ('f8000000-0000-0000-0000-000000000052', (select id from propagation_lessons where class = 'a' and day = 'past' and start_position = 1), 'til_stede') on conflict (student_id, lesson_id) do update set status = excluded.status;
select is((select status from public.attendance where student_id = 'f8000000-0000-0000-0000-000000000052' and lesson_id = (select id from propagation_lessons where class = 'a' and day = 'past' and start_position = 3)), 'til_stede', 'an admin without a teaching assignment propagates attendance');

insert into public.attendance (student_id, lesson_id, status) values ('f8000000-0000-0000-0000-000000000052', (select id from propagation_lessons where class = 'a' and day = 'future' and start_position = 1), 'til_stede') on conflict (student_id, lesson_id) do update set status = excluded.status;
select is((select count(*) from public.attendance where student_id = 'f8000000-0000-0000-0000-000000000052' and lesson_id = (select id from propagation_lessons where class = 'a' and day = 'future' and start_position = 3)), 0::bigint, 'future attendance is not propagated');

reset role;
update public.attendance set inherited_from_lesson_id = null where student_id = 'f8000000-0000-0000-0000-000000000052' and lesson_id = (select id from propagation_lessons where class = 'a' and day = 'past' and start_position = 2);
select set_config('request.jwt.claims', '{"sub":"f8000000-0000-0000-0000-0000000000a1","email":"zz-f8-admin@zztest.local","role":"authenticated"}', true);
set local role authenticated;
insert into public.attendance (student_id, lesson_id, status) values ('f8000000-0000-0000-0000-000000000052', (select id from propagation_lessons where class = 'a' and day = 'past' and start_position = 1), 'fravaer') on conflict (student_id, lesson_id) do update set status = excluded.status;
select is((select status from public.attendance where student_id = 'f8000000-0000-0000-0000-000000000052' and lesson_id = (select id from propagation_lessons where class = 'a' and day = 'past' and start_position = 2)), 'til_stede', 'pre-existing explicit attendance is preserved');

reset role;
update public.school_days set date = (now() at time zone 'Europe/Oslo')::date - 6 where id = 'f8000000-0000-0000-0000-0000000000d3';
delete from public.attendance where student_id = 'f8000000-0000-0000-0000-000000000052' and school_day_id = 'f8000000-0000-0000-0000-0000000000d3';
insert into public.absence_reports (student_id, school_day_id, source, reported_by_guardian_id) values ('f8000000-0000-0000-0000-000000000052', 'f8000000-0000-0000-0000-0000000000d3', 'app', 'f8000000-0000-0000-0000-000000000063');
select set_config('request.jwt.claims', '{"sub":"f8000000-0000-0000-0000-0000000000a2","email":"zz-f8-teacher@zztest.local","role":"authenticated"}', true);
set local role authenticated;
insert into public.attendance (student_id, lesson_id, status) values ('f8000000-0000-0000-0000-000000000052', (select id from propagation_lessons where class = 'a' and day = 'future' and start_position = 1), 'til_stede') on conflict (student_id, lesson_id) do update set status = excluded.status;
select is((select status from public.attendance where student_id = 'f8000000-0000-0000-0000-000000000052' and lesson_id = (select id from propagation_lessons where class = 'a' and day = 'future' and start_position = 3)), 'til_stede', 'verified presence supersedes an automatically reported absence');

select is((select count(*) from public.absence_reports where student_id = 'f8000000-0000-0000-0000-000000000052' and withdrawn_at is null), 1::bigint, 'the guardian report is retained as history');

reset role;
delete from public.attendance where student_id = 'f8000000-0000-0000-0000-000000000052' and school_day_id = 'f8000000-0000-0000-0000-0000000000d3';
update public.school_days set cancelled = true where id = 'f8000000-0000-0000-0000-0000000000d3';
select set_config('request.jwt.claims', '{"sub":"f8000000-0000-0000-0000-0000000000a1","email":"zz-f8-admin@zztest.local","role":"authenticated"}', true);
set local role authenticated;
insert into public.attendance (student_id, lesson_id, status) values ('f8000000-0000-0000-0000-000000000052', (select id from propagation_lessons where class = 'a' and day = 'future' and start_position = 1), 'til_stede') on conflict (student_id, lesson_id) do update set status = excluded.status;
select is((select count(*) from public.attendance where student_id = 'f8000000-0000-0000-0000-000000000052' and school_day_id = 'f8000000-0000-0000-0000-0000000000d3'), 1::bigint, 'a cancelled school day is not propagated');


reset role;
delete from public.attendance where student_id = 'f8000000-0000-0000-0000-000000000052'
  and lesson_id = (select id from propagation_lessons where class = 'a' and day = 'past' and start_position = 3);
update public.lessons set cancelled = true
where id = (select id from propagation_lessons where class = 'a' and day = 'past' and start_position = 3);
set local role authenticated;
update public.attendance set status = 'til_stede'
where student_id = 'f8000000-0000-0000-0000-000000000052'
  and lesson_id = (select id from propagation_lessons where class = 'a' and day = 'past' and start_position = 1);
select is((select count(*) from public.attendance where student_id = 'f8000000-0000-0000-0000-000000000052'
  and lesson_id = (select id from propagation_lessons where class = 'a' and day = 'past' and start_position = 3)),
  0::bigint, 'later cancelled lessons are skipped even with active enrollment');

select * from finish();
rollback;
