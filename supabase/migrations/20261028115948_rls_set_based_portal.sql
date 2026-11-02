create or replace function public.portal_readable_lesson_ids()
returns setof uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  with me as (
    select id from public.portal_guardian_ids() as id where public.guardian_has_role(id, 'teacher')
  ),
  readable_classes as (
    select c.id from public.classes c
    where public.portal_is_teacher_of(c.id) or public.portal_is_guardian_in_class(c.id) or public.portal_is_student_in_class(c.id)
  )
  select l.id
  from public.lessons l
  join public.school_days d on d.id = l.school_day_id
  join public.school_years sy on sy.id = d.school_year_id and sy.is_active
  where l.class_id in (select id from readable_classes)
    or l.teacher_guardian_id in (select id from me)
    or l.co_teacher_guardian_id in (select id from me);
$$;

create or replace function public.portal_taught_lesson_ids()
returns setof uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  with me as (
    select id from public.portal_guardian_ids() as id where public.guardian_has_role(id, 'teacher')
  ),
  taught_classes as (
    select c.id from public.classes c where public.portal_is_teacher_of(c.id)
  )
  select l.id
  from public.lessons l
  join public.school_days d on d.id = l.school_day_id
  join public.school_years sy on sy.id = d.school_year_id and sy.is_active
  where l.class_id in (select id from taught_classes)
    or l.teacher_guardian_id in (select id from me)
    or l.co_teacher_guardian_id in (select id from me);
$$;

create or replace function public.portal_markable_lesson_students()
returns table(student_id uuid, lesson_id uuid)
language sql
stable
security definer
set search_path to 'public'
as $$
  select e.student_id, l.id
  from public.lessons l
  join public.school_days d on d.id = l.school_day_id
  join public.enrollments e on e.class_id = l.class_id and e.school_year_id = d.school_year_id and e.status = 'aktiv'
  where l.id in (select public.portal_taught_lesson_ids());
$$;

create or replace function public.portal_reportable_day_students()
returns table(student_id uuid, school_day_id uuid)
language sql
stable
security definer
set search_path to 'public'
as $$
  select distinct m.student_id, l.school_day_id
  from public.portal_markable_lesson_students() m
  join public.lessons l on l.id = m.lesson_id
  join public.school_days d on d.id = l.school_day_id
  where not d.cancelled;
$$;

create or replace function public.portal_markable_day_students()
returns table(student_id uuid, school_day_id uuid)
language sql
stable
security definer
set search_path to 'public'
as $$
  select e.student_id, d.id
  from public.school_days d
  join public.school_years sy on sy.id = d.school_year_id and sy.is_active
  join public.enrollments e on e.school_year_id = d.school_year_id and e.status = 'aktiv'
  where e.class_id in (select c.id from public.classes c where public.portal_is_teacher_of(c.id));
$$;

create or replace function public.portal_guardian_student_ids()
returns setof uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select sg.student_id from public.student_guardians sg
  where sg.guardian_id in (select public.portal_guardian_ids());
$$;

create or replace function public.activity_staff_ids()
returns setof uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select a.id from public.school_activities a where public.activity_can_staff(a.id);
$$;

create or replace function public.activity_readable_ids()
returns setof uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select a.id from public.school_activities a where public.activity_can_read(a.id);
$$;

create or replace function public.activity_roster_ids()
returns setof uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select a.id from public.school_activities a where public.activity_can_roster(a.id);
$$;

create or replace function public.activity_owned_child_ids()
returns setof uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select s.id from public.students s
  where auth.uid() is not null
    and (s.family_id in (select public.portal_my_family_ids()) or s.id in (select public.portal_student_ids()));
$$;

alter policy "portal reads" on public.lessons
  using (CASE WHEN (SELECT is_admin()) THEN false ELSE id in (select public.portal_readable_lesson_ids()) END);

alter policy "guardian reads child" on public.attendance
  using (CASE WHEN (SELECT is_admin()) THEN false ELSE student_id in (select public.portal_guardian_student_ids()) END);
alter policy "lesson teacher reads" on public.attendance
  using (CASE WHEN (SELECT is_admin()) THEN false ELSE (lesson_id is not null and (student_id, lesson_id) in (select m.student_id, m.lesson_id from public.portal_markable_lesson_students() m)) END);
alter policy "teacher reads class" on public.attendance
  using (CASE WHEN (SELECT is_admin()) THEN false ELSE (student_id, school_day_id) in (select m.student_id, m.school_day_id from public.portal_markable_day_students() m) END);

alter policy "guardian reads child" on public.absence_reports
  using (CASE WHEN (SELECT is_admin()) THEN false ELSE student_id in (select public.portal_guardian_student_ids()) END);
alter policy "lesson teacher reads" on public.absence_reports
  using (CASE WHEN (SELECT is_admin()) THEN false ELSE (student_id, school_day_id) in (select r.student_id, r.school_day_id from public.portal_reportable_day_students() r) END);
alter policy "teacher reads class" on public.absence_reports
  using (CASE WHEN (SELECT is_admin()) THEN false ELSE (student_id, school_day_id) in (select m.student_id, m.school_day_id from public.portal_markable_day_students() m) END);

alter policy "activity students roster read" on public.activity_students
  using (activity_id in (select public.activity_roster_ids()));
alter policy "read invited children" on public.activity_students
  using (activity_id in (select public.activity_staff_ids())
    or (activity_id in (select public.activity_readable_ids()) and student_id in (select public.activity_owned_child_ids())));

do $$
declare
  v_def text;
begin
  select pg_get_functiondef('public.portal_lessons(uuid[])'::regprocedure) into v_def;
  if position('public.portal_can_read_lesson(l.id)' in v_def) > 0 then
    execute replace(v_def, 'public.portal_can_read_lesson(l.id)', 'l.id in (select public.portal_readable_lesson_ids())');
  end if;
end $$;

revoke execute on function
  public.portal_readable_lesson_ids(), public.portal_taught_lesson_ids(), public.portal_markable_lesson_students(),
  public.portal_reportable_day_students(), public.portal_markable_day_students(), public.portal_guardian_student_ids(),
  public.activity_staff_ids(), public.activity_readable_ids(), public.activity_roster_ids(), public.activity_owned_child_ids()
from public, anon;

grant execute on function
  public.portal_readable_lesson_ids(), public.portal_taught_lesson_ids(), public.portal_markable_lesson_students(),
  public.portal_reportable_day_students(), public.portal_markable_day_students(), public.portal_guardian_student_ids(),
  public.activity_staff_ids(), public.activity_readable_ids(), public.activity_roster_ids(), public.activity_owned_child_ids()
to authenticated, service_role;
