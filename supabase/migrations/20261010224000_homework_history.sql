create or replace function public.student_homework(p_student_id uuid)
returns table (note_id uuid, homework text, homework_version integer, date date, subject text, status text, updated_at timestamptz)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not (public.learning_can_manage_student(p_student_id) or public.portal_is_guardian_of(p_student_id) or p_student_id in (select public.portal_student_ids())) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  return query select n.id, n.homework, n.homework_version, d.date, l.subject,
    case when r.homework_version = n.homework_version then r.status else 'not_started' end,
    case when r.homework_version = n.homework_version then r.updated_at else null end
  from public.class_notes n join public.school_days d on d.id = n.school_day_id
  join public.enrollments e on e.student_id = p_student_id and e.class_id = n.class_id and e.school_year_id = d.school_year_id and e.status = 'aktiv'
  left join public.lessons l on l.id = n.lesson_id
  left join public.homework_responses r on r.note_id = n.id and r.student_id = p_student_id
  where public.homework_is_assigned(n.id, p_student_id)
  order by d.date desc, n.created_at desc;
end;
$$;
