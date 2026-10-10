do $$
declare v_function record; v_count integer := 0;
begin
  for v_function in
    select p.oid, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'record_learning_progress', 'record_homework_response', 'save_term_report', 'publish_term_report',
      'record_attendance_followup', 'save_school_activity', 'publish_school_activity',
      'cancel_school_activity', 'respond_school_activity'
    )
  loop
    if position('40001' in pg_get_functiondef(v_function.oid)) = 0 then
      raise exception 'Expected conflict check missing in %', v_function.proname;
    end if;
    execute replace(pg_get_functiondef(v_function.oid), '40001', 'PT409');
    v_count := v_count + 1;
  end loop;
  if v_count <> 9 then raise exception 'Expected nine conflict functions, found %', v_count; end if;
end;
$$;
