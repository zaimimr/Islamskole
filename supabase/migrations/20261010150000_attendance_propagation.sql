alter table public.attendance
  add column if not exists inherited_from_lesson_id uuid references public.lessons(id) on delete set null;

create or replace function public.attendance_clear_inheritance()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if pg_trigger_depth() = 1 then
    new.inherited_from_lesson_id := null;
  end if;
  return new;
end;
$$;

revoke all on function public.attendance_clear_inheritance() from public, anon, authenticated;

drop trigger if exists attendance_clear_inheritance on public.attendance;
create trigger attendance_clear_inheritance
  before insert or update on public.attendance
  for each row execute function public.attendance_clear_inheritance();

create or replace function public.attendance_propagate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lesson public.lessons%rowtype;
begin
  if pg_trigger_depth() > 1 or auth.uid() is null or new.lesson_id is null then
    return new;
  end if;

  if not (public.is_admin() or public.portal_can_write_lesson_attendance(new.student_id, new.lesson_id)) then
    return new;
  end if;

  select l.* into v_lesson
  from public.lessons l
  join public.school_days d on d.id = l.school_day_id
  where l.id = new.lesson_id
    and not l.cancelled
    and not d.cancelled
    and d.date <= (now() at time zone 'Europe/Oslo')::date;

  if not found then
    return new;
  end if;

  insert into public.attendance as a (
    student_id, school_day_id, lesson_id, status, marked_by, marked_at, inherited_from_lesson_id
  )
  select new.student_id, new.school_day_id, l.id, new.status, new.marked_by, new.marked_at, new.lesson_id
  from public.lessons l
  join public.school_days d on d.id = l.school_day_id
  join public.enrollments e
    on e.class_id = l.class_id
   and e.school_year_id = d.school_year_id
   and e.student_id = new.student_id
   and e.status = 'aktiv'
  where l.school_day_id = v_lesson.school_day_id
    and l.start_position > v_lesson.end_position
    and not l.cancelled
    and not d.cancelled
  on conflict (student_id, lesson_id) do update
    set status = excluded.status,
        marked_by = excluded.marked_by,
        marked_at = excluded.marked_at,
        inherited_from_lesson_id = excluded.inherited_from_lesson_id
    where (a.inherited_from_lesson_id is not null
      and exists (
        select 1 from public.lessons origin
        where origin.id = a.inherited_from_lesson_id
          and origin.start_position <= v_lesson.start_position
      ))
      or (a.status = 'meldt_fravaer' and new.status <> 'meldt_fravaer'
        and exists (
          select 1 from public.absence_reports r
          where r.student_id = new.student_id
            and r.school_day_id = new.school_day_id
            and r.withdrawn_at is null
        ));

  return new;
end;
$$;

revoke all on function public.attendance_propagate() from public, anon, authenticated;

drop trigger if exists attendance_propagate on public.attendance;
create trigger attendance_propagate
  after insert or update of status on public.attendance
  for each row execute function public.attendance_propagate();
