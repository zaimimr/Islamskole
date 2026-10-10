create function public.sunday_class_staff(p_class_id uuid, p_year uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select auth.uid() is not null and exists(select 1 from public.school_years where id = p_year and is_active)
    and (public.is_admin() or public.portal_can_edit_week_plan(p_class_id, p_year) or exists(
      select 1 from public.lessons l join public.school_days d on d.id = l.school_day_id and d.school_year_id = p_year
      join public.guardians g on g.id in(l.teacher_guardian_id,l.co_teacher_guardian_id)
      where l.class_id = p_class_id and g.id in(select public.portal_guardian_ids()) and g.is_teacher and g.teacher_suspended_at is null));
$$;

create table public.attendance_followups (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  class_id uuid not null references public.classes(id),
  school_year_id uuid not null references public.school_years(id),
  streak_ended_on date not null,
  action text not null check(action in('contacted','monitor','resolved','email')),
  note text not null default '' check(length(note) <= 2000),
  message text not null default '' check(length(message) <= 2000),
  recorded_by uuid references auth.users(id) on delete set null,
  recorded_by_name text not null,
  created_at timestamptz not null default statement_timestamp()
);
create index attendance_followups_student_idx on public.attendance_followups(student_id, school_year_id, created_at desc);
alter table public.attendance_followups enable row level security;
revoke all on public.attendance_followups from anon, authenticated;
grant select on public.attendance_followups to authenticated;
grant all on public.attendance_followups to service_role;
create policy "staff reads attendance followup" on public.attendance_followups for select to authenticated
  using(public.is_admin() or public.sunday_class_staff(class_id, school_year_id));

create function public.class_absence_streaks(p_class_id uuid, p_year uuid)
returns table(student_id uuid, student_name text, missed integer, ended_on date, dates date[])
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.sunday_class_staff(p_class_id,p_year) then raise exception 'Class access denied' using errcode = '42501'; end if;
  return query
  with days as (
    select e.student_id, d.date, bool_and(coalesce(coalesce(a.status, da.status) in('fravaer','meldt_fravaer'),false)) as missed
    from public.enrollments e join public.school_days d on d.school_year_id = e.school_year_id
    join public.lessons l on l.school_day_id = d.id and l.class_id = e.class_id and not l.cancelled
    left join public.attendance a on a.lesson_id = l.id and a.student_id = e.student_id
    left join public.attendance da on da.lesson_id is null and da.school_day_id = d.id and da.student_id = e.student_id
    where e.class_id = p_class_id and e.school_year_id = p_year and e.status = 'aktiv'
      and d.date >= (e.created_at at time zone 'Europe/Oslo')::date
      and d.date <= (now() at time zone 'Europe/Oslo')::date and extract(isodow from d.date) = 7 and not d.cancelled
    group by e.student_id, d.date
  ), numbered as (
    select d.*, count(*) filter(where not d.missed) over(partition by d.student_id order by d.date desc) as breaks from days d
  )
  select n.student_id, concat_ws(' ', s.child_first_name,s.child_last_name), count(*)::int, max(n.date), array_agg(n.date order by n.date desc)
    from numbered n join public.students s on s.id = n.student_id where n.breaks = 0 and n.missed
    group by n.student_id,s.child_first_name,s.child_last_name having count(*) >= 3 order by max(n.date) desc,s.child_first_name,s.child_last_name;
end;
$$;

alter table public.school_email_deliveries drop constraint school_email_deliveries_kind_check;
alter table public.school_email_deliveries add constraint school_email_deliveries_kind_check check(kind in(
  'signup_parent','signup_student','welcome_parent','welcome_student','plan_confirmed','payment_reminder','installment_due','installment_reminder','report_published','attendance_followup'));

create function public.record_attendance_followup(p_id uuid,p_student_id uuid,p_class_id uuid,p_year uuid,p_ended_on date,p_action text,p_note text,p_message text)
returns uuid language plpgsql security definer set search_path = public
as $$
declare v_existing public.attendance_followups; v_streak record;
begin
  if not public.sunday_class_staff(p_class_id,p_year) then raise exception 'Class access denied' using errcode='42501'; end if;
  select * into v_existing from public.attendance_followups where id=p_id;
  if v_existing.id is not null then
    if v_existing.student_id=p_student_id and v_existing.class_id=p_class_id and v_existing.school_year_id=p_year
      and v_existing.streak_ended_on=p_ended_on and v_existing.action=p_action and v_existing.note=btrim(p_note) and v_existing.message=btrim(p_message)
      then return p_id; end if;
    raise exception 'Conflicting request' using errcode='23514';
  end if;
  select * into v_streak from public.class_absence_streaks(p_class_id,p_year) where student_id=p_student_id and ended_on=p_ended_on;
  if v_streak.student_id is null then raise exception 'Attendance has changed' using errcode='40001'; end if;
  if p_action='email' and nullif(btrim(p_message),'') is null then raise exception 'Message is required' using errcode='22023'; end if;
  insert into public.attendance_followups(id,student_id,class_id,school_year_id,streak_ended_on,action,note,message,recorded_by,recorded_by_name)
    values(p_id,p_student_id,p_class_id,p_year,p_ended_on,p_action,btrim(p_note),case when p_action='email' then btrim(p_message) else '' end,auth.uid(),public.learning_teacher_name());
  if p_action='email' then perform public.queue_family_school_email('attendance_followup',p_id,s.family_id) from public.students s where s.id=p_student_id; end if;
  return p_id;
end;
$$;
revoke all on function public.sunday_class_staff(uuid,uuid),public.class_absence_streaks(uuid,uuid),public.record_attendance_followup(uuid,uuid,uuid,uuid,date,text,text,text) from public,anon,authenticated;
grant execute on function public.sunday_class_staff(uuid,uuid),public.class_absence_streaks(uuid,uuid),public.record_attendance_followup(uuid,uuid,uuid,uuid,date,text,text,text) to authenticated;

do $$
declare v_definition text; v_tables text := '''term_report_publications'']';
  v_move text := '    update public.term_report_publications set student_id = p_keep where student_id = p_student;';
begin
  select pg_get_functiondef('public.admin_merge_children(uuid, uuid, uuid, boolean, text)'::regprocedure) into v_definition;
  if position(v_tables in v_definition)=0 or position(v_move in v_definition)=0 then raise exception 'Expected merge definition was not found'; end if;
  v_definition := replace(v_definition,v_tables,'''term_report_publications'', ''attendance_followups'']');
  v_definition := replace(v_definition,v_move,v_move || E'\n    update public.attendance_followups set student_id = p_keep where student_id = p_student;');
  execute v_definition;
end;
$$;
