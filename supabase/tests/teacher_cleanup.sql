begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(4);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

update public.school_years set is_active = false where is_active;

insert into public.school_years (id, label, starts_on, ends_on, is_active)
values ('d1000000-0000-0000-0000-000000000001', 'ZZTEST D1 aktiv', '2026-08-01', '2027-06-30', true);

insert into public.classes (id, slug, name_no, name_en)
values
  ('d1000000-0000-0000-0000-0000000000a1', 'zztest-d1-a', 'ZZTEST D1 A', 'ZZTEST D1 A'),
  ('d1000000-0000-0000-0000-0000000000a2', 'zztest-d1-b', 'ZZTEST D1 B', 'ZZTEST D1 B');

insert into public.guardians (id, first_name, last_name, email)
values
  ('d1000000-0000-0000-0000-0000000000f1', 'ZZTEST', 'Laerer En', 'zz-d1-en@zztest.local'),
  ('d1000000-0000-0000-0000-0000000000f2', 'ZZTEST', 'Laerer To', 'zz-d1-to@zztest.local');
insert into public.person_roles (guardian_id, role_key) values ('d1000000-0000-0000-0000-0000000000f1', 'teacher'), ('d1000000-0000-0000-0000-0000000000f2', 'teacher');

insert into public.class_teachers (class_id, guardian_id, school_year_id)
values
  ('d1000000-0000-0000-0000-0000000000a1', 'd1000000-0000-0000-0000-0000000000f1', 'd1000000-0000-0000-0000-000000000001'),
  ('d1000000-0000-0000-0000-0000000000a2', 'd1000000-0000-0000-0000-0000000000f1', 'd1000000-0000-0000-0000-000000000001'),
  ('d1000000-0000-0000-0000-0000000000a1', 'd1000000-0000-0000-0000-0000000000f2', 'd1000000-0000-0000-0000-000000000001');

update public.guardians
set phone = '+4790000001'
where id = 'd1000000-0000-0000-0000-0000000000f2';

select is(
  (select count(*) from public.class_teachers where guardian_id = 'd1000000-0000-0000-0000-0000000000f2'),
  1::bigint,
  'D1 TCH-03: editing a teacher without touching is_teacher keeps the class links'
);

delete from public.person_roles where guardian_id = 'd1000000-0000-0000-0000-0000000000f1' and role_key = 'teacher';

select is(
  (select count(*) from public.class_teachers where guardian_id = 'd1000000-0000-0000-0000-0000000000f1'),
  0::bigint,
  'D1 TCH-03: turning off is_teacher removes class_teachers rows'
);

select is(
  (select count(*) from public.class_teachers where guardian_id = 'd1000000-0000-0000-0000-0000000000f2'),
  1::bigint,
  'D1 TCH-03: other teachers of the same class keep their links'
);

insert into public.person_roles (guardian_id, role_key) values ('d1000000-0000-0000-0000-0000000000f1', 'teacher');

select is(
  (select count(*) from public.class_teachers where guardian_id = 'd1000000-0000-0000-0000-0000000000f1'),
  0::bigint,
  'D1 TCH-04: re-registering a removed teacher does not bring old class links back'
);

select * from finish();

rollback;
