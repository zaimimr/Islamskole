create or replace function public.homework_response_stamp()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.note_id is distinct from old.note_id then
    raise exception 'Response scope is immutable' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and new.student_id is distinct from old.student_id then
    if not public.is_admin() then
      raise exception 'Response scope is immutable' using errcode = '23514';
    end if;
    new.homework_version := old.homework_version;
    new.responded_by := old.responded_by;
    new.updated_at := old.updated_at;
    return new;
  end if;
  select n.homework_version into new.homework_version from public.class_notes n where n.id = new.note_id;
  new.responded_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare
  v_definition text;
  v_tables text := '''learning_goals'', ''learning_progress_updates'']';
  v_move text := '    update public.learning_goals set student_id = p_keep where student_id = p_student;';
begin
  select pg_get_functiondef('public.admin_merge_children(uuid, uuid, uuid, boolean, text)'::regprocedure) into v_definition;
  if position(v_tables in v_definition) = 0 or position(v_move in v_definition) = 0 then
    raise exception 'Expected merge definition was not found';
  end if;
  v_definition := replace(v_definition, v_tables, '''learning_goals'', ''learning_progress_updates'', ''homework_responses'']');
  v_definition := replace(v_definition, v_move, $move$
    delete from public.homework_responses k using public.homework_responses o
      where k.student_id = p_keep and o.student_id = p_student and k.note_id = o.note_id and o.updated_at > k.updated_at;
    delete from public.homework_responses o where o.student_id = p_student and exists (
      select 1 from public.homework_responses k where k.student_id = p_keep and k.note_id = o.note_id);
    update public.homework_responses set student_id = p_keep where student_id = p_student;
    update public.learning_goals set student_id = p_keep where student_id = p_student;
$move$);
  execute v_definition;
end;
$$;
