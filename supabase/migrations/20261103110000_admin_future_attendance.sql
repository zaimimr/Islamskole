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
    and (public.is_admin() or d.date <= (now() at time zone 'Europe/Oslo')::date)
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
    and (public.is_admin() or d.date <= (now() at time zone 'Europe/Oslo')::date);

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
