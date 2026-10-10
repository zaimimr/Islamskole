alter table public.attendance_followups add column student_name text not null default '';
update public.attendance_followups f set student_name=concat_ws(' ',s.child_first_name,s.child_last_name) from public.students s where s.id=f.student_id;
do $$
declare v_definition text;
begin
  select pg_get_functiondef('public.record_attendance_followup(uuid, uuid, uuid, uuid, date, text, text, text)'::regprocedure) into v_definition;
  v_definition:=replace(v_definition,'message,recorded_by,recorded_by_name)','message,recorded_by,recorded_by_name,student_name)');
  v_definition:=replace(v_definition,'auth.uid(),public.learning_teacher_name());','auth.uid(),public.learning_teacher_name(),v_streak.student_name);');
  execute v_definition;
end;
$$;
