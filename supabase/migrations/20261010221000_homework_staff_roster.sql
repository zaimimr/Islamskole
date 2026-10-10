create or replace function public.homework_staff_can_read(p_note_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.is_admin() or exists (
    select 1 from public.class_notes n join public.school_days note_day on note_day.id = n.school_day_id
    where n.id = p_note_id and (public.portal_can_edit_week_plan(n.class_id, note_day.school_year_id) or exists (
      select 1 from public.lessons l join public.school_days d on d.id = l.school_day_id
      where l.class_id = n.class_id and d.school_year_id = note_day.school_year_id and public.portal_teaches_lesson(l.id)
    ))
  );
$$;

create function public.homework_class_responses(p_note_id uuid)
returns table (student_id uuid, student_name text, status text, updated_at timestamptz)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.homework_staff_can_read(p_note_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  return query select s.id, btrim(concat_ws(' ', s.child_first_name, s.child_last_name)),
    case when r.homework_version = n.homework_version then r.status else 'not_started' end,
    case when r.homework_version = n.homework_version then r.updated_at else null end
  from public.class_notes n join public.school_days d on d.id = n.school_day_id
  join public.enrollments e on e.class_id = n.class_id and e.school_year_id = d.school_year_id and e.status = 'aktiv'
  join public.students s on s.id = e.student_id
  left join public.homework_responses r on r.note_id = n.id and r.student_id = s.id
  where n.id = p_note_id and public.homework_is_assigned(n.id, s.id)
  order by s.child_first_name, s.child_last_name, s.id;
end;
$$;
revoke all on function public.homework_class_responses(uuid) from public, anon;
grant execute on function public.homework_class_responses(uuid) to authenticated;
