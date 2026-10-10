create function public.record_homework_response(p_note_id uuid, p_student_id uuid, p_homework_version integer, p_status text)
returns void language plpgsql security definer set search_path = public
as $$
declare v_version integer;
begin
  select n.homework_version into v_version from public.class_notes n where n.id = p_note_id for update;
  if not public.homework_can_respond(p_note_id, p_student_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if v_version is distinct from p_homework_version then
    raise exception 'Homework changed. Reload and try again.' using errcode = '40001';
  end if;
  if p_status is null or p_status not in ('not_started', 'completed', 'needs_help') then
    raise exception 'Invalid response' using errcode = '23514';
  end if;
  insert into public.homework_responses (note_id, student_id, status, homework_version)
  values (p_note_id, p_student_id, p_status, v_version)
  on conflict (note_id, student_id) do update set status = excluded.status;
end;
$$;
revoke all on function public.record_homework_response(uuid, uuid, integer, text) from public, anon;
grant execute on function public.record_homework_response(uuid, uuid, integer, text) to authenticated;
