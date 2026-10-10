do $$
declare v_definition text; v_move text:='  update public.student_applications set family_id = p_keep where family_id = p_merge;';
begin
  select pg_get_functiondef('public.admin_merge_families(uuid, uuid)'::regprocedure) into v_definition;
  if position(v_move in v_definition)=0 then raise exception 'Expected family merge definition was not found'; end if;
  execute replace(v_definition,v_move,v_move || E'\n  update public.school_email_deliveries set family_id = p_keep where family_id = p_merge;');
end;
$$;
