create or replace function public.lock_student_attendance_day()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_student_id uuid;
  v_day_id uuid;
begin
  if tg_op = 'DELETE' then
    v_student_id := old.student_id;
    v_day_id := old.school_day_id;
  else
    v_student_id := new.student_id;
    v_day_id := new.school_day_id;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_student_id::text || ':' || v_day_id::text, 0));
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.lock_student_attendance_day() from public, anon, authenticated;

drop trigger if exists attendance_student_day_lock on public.attendance;
drop trigger if exists absence_report_student_day_lock on public.absence_reports;
create trigger absence_report_student_day_lock
  before insert or update or delete on public.absence_reports
  for each row execute function public.lock_student_attendance_day();

create or replace function public.portal_mark_unrecorded_present(p_lesson_id uuid, p_student_ids uuid[])
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lesson record;
  v_student_id uuid;
  v_written_id uuid;
  v_written_ids uuid[] := '{}';
begin
  if auth.uid() is null then
    raise exception 'Du må logge inn på nytt.' using errcode = '42501';
  end if;
  if p_student_ids is null or cardinality(p_student_ids) not between 1 and 200 then
    raise exception 'Velg elever.' using errcode = '22023';
  end if;

  select l.id, l.class_id, l.school_day_id, d.school_year_id into v_lesson
  from public.lessons l
  join public.school_days d on d.id = l.school_day_id
  where l.id = p_lesson_id
    and not l.cancelled
    and not d.cancelled
    and d.date <= (now() at time zone 'Europe/Oslo')::date
  for share of l, d;

  if not found then
    raise exception 'Oppmøte kan ikke føres for denne timen.' using errcode = '42501';
  end if;

  for v_student_id in select distinct unnest(p_student_ids) order by 1 loop
    if v_student_id is null or not exists (
      select 1 from public.enrollments e
      where e.student_id = v_student_id
        and e.class_id = v_lesson.class_id
        and e.school_year_id = v_lesson.school_year_id
        and e.status = 'aktiv'
    ) or not (public.is_admin() or public.portal_can_write_lesson_attendance(v_student_id, p_lesson_id)) then
      raise exception 'Du har ikke tilgang til eleven.' using errcode = '42501';
    end if;
  end loop;

  for v_student_id in select distinct unnest(p_student_ids) order by 1 loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_student_id::text || ':' || v_lesson.school_day_id::text, 0));

    insert into public.attendance (student_id, school_day_id, lesson_id, status, marked_by, marked_at)
    select v_student_id, v_lesson.school_day_id, p_lesson_id, 'til_stede', auth.uid(), now()
    where not exists (
      select 1 from public.absence_reports r
      where r.student_id = v_student_id
        and r.school_day_id = v_lesson.school_day_id
        and r.withdrawn_at is null
    )
    on conflict (student_id, lesson_id) do nothing
    returning student_id into v_written_id;

    if found then
      v_written_ids := array_append(v_written_ids, v_written_id);
    end if;
  end loop;

  return v_written_ids;
end;
$$;

revoke all on function public.portal_mark_unrecorded_present(uuid, uuid[]) from public, anon;
grant execute on function public.portal_mark_unrecorded_present(uuid, uuid[]) to authenticated;
