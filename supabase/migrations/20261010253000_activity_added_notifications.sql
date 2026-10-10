create table public.activity_added_invitations(
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.school_activities(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  created_at timestamptz not null default statement_timestamp()
);
alter table public.activity_added_invitations enable row level security;
revoke all on public.activity_added_invitations from public,anon,authenticated;
grant all on public.activity_added_invitations to service_role;

alter table public.school_email_deliveries drop constraint school_email_deliveries_kind_check;
alter table public.school_email_deliveries add constraint school_email_deliveries_kind_check check(kind in(
  'signup_parent','signup_student','welcome_parent','welcome_student','plan_confirmed','payment_reminder','installment_due','installment_reminder','report_published','attendance_followup','activity_consent','activity_cancelled','activity_added'));

create or replace function public.add_activity_students(p_id uuid)
returns integer language plpgsql security definer set search_path=public
as $$
declare v_activity public.school_activities; v_count integer:=0; v_added record; v_invitation uuid;
begin
  select * into v_activity from public.school_activities where id=p_id for update;
  if not public.activity_can_staff(p_id) then raise exception 'Activity access denied' using errcode='42501'; end if;
  if v_activity.status<>'published' or v_activity.respond_by < (now() at time zone 'Europe/Oslo')::date then raise exception 'Responses closed' using errcode='22023'; end if;
  for v_added in
    insert into public.activity_students(activity_id,student_id,student_name)
      select p_id,s.id,concat_ws(' ',s.child_first_name,s.child_last_name) from public.enrollments e join public.students s on s.id=e.student_id
      where e.class_id=v_activity.class_id and e.school_year_id=v_activity.school_year_id and e.status='aktiv' on conflict do nothing returning student_id
  loop
    insert into public.activity_added_invitations(activity_id,student_id) values(p_id,v_added.student_id) returning id into v_invitation;
    perform public.queue_family_school_email('activity_added',v_invitation,s.family_id) from public.students s where s.id=v_added.student_id;
    v_count:=v_count+1;
  end loop;
  return v_count;
end;
$$;

do $$
declare v_definition text; v_tables text:='''activity_response_history'']';
  v_move text:='    update public.activity_response_history set student_id=p_keep where student_id=p_student;';
begin
  select pg_get_functiondef('public.admin_merge_children(uuid, uuid, uuid, boolean, text)'::regprocedure) into v_definition;
  if position(v_tables in v_definition)=0 or position(v_move in v_definition)=0 then raise exception 'Expected child merge definition was not found'; end if;
  v_definition:=replace(v_definition,v_tables,'''activity_response_history'', ''activity_added_invitations'']');
  execute replace(v_definition,v_move,v_move || E'\n    update public.activity_added_invitations set student_id=p_keep where student_id=p_student;');
end;
$$;
