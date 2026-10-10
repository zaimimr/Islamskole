do $$
declare v_definition text;
begin
  select pg_get_functiondef('public.prepare_term_report(uuid, uuid, text)'::regprocedure) into v_definition;
  v_definition := replace(v_definition,
    'from public.learning_goals g where g.student_id = p_student_id',
    'from jsonb_to_recordset(public.term_report_snapshot(p_student_id, p_year, v_start, v_end)->''goals'') as g(next_target text)');
  execute v_definition;
  select pg_get_functiondef('public.save_term_report(uuid, timestamptz, text, text, boolean)'::regprocedure) into v_definition;
  execute replace(v_definition, 'v_report.updated_at <> p_expected', 'v_report.updated_at is distinct from p_expected');
  select pg_get_functiondef('public.publish_term_report(uuid, timestamptz, uuid)'::regprocedure) into v_definition;
  execute replace(v_definition, 'v_report.updated_at <> p_expected', 'v_report.updated_at is distinct from p_expected');
end;
$$;
