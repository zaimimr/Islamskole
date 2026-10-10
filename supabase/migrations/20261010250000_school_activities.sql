create table public.school_activities (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id),
  school_year_id uuid not null references public.school_years(id),
  title text not null check(length(btrim(title)) between 1 and 200),
  description text not null default '' check(length(description) <= 4000),
  consent_text text not null check(length(btrim(consent_text)) between 1 and 4000),
  event_date date not null,
  respond_by date not null check(respond_by <= event_date),
  status text not null default 'draft' check(status in('draft','published','cancelled')),
  updated_at timestamptz not null default statement_timestamp(),
  updated_by uuid references auth.users(id) on delete set null
);
create index school_activities_class_idx on public.school_activities(class_id,school_year_id,event_date);
create table public.activity_students (
  activity_id uuid not null references public.school_activities(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  student_name text not null,
  participation text not null default 'unrecorded' check(participation in('unrecorded','participated','absent')),
  participation_by uuid references auth.users(id) on delete set null,
  participation_at timestamptz,
  primary key(activity_id,student_id)
);
create index activity_students_child_idx on public.activity_students(student_id,activity_id);
create table public.activity_responses (
  activity_id uuid not null,
  student_id uuid not null,
  consent text not null check(consent in('granted','declined')),
  going boolean not null check(not going or consent='granted'),
  responded_by uuid references auth.users(id) on delete set null,
  guardian_name text not null,
  responded_at timestamptz not null default statement_timestamp(),
  primary key(activity_id,student_id),
  foreign key(activity_id,student_id) references public.activity_students(activity_id,student_id) on delete cascade deferrable initially deferred
);
create table public.activity_response_history (
  id uuid primary key,
  activity_id uuid not null references public.school_activities(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  consent text not null check(consent in('granted','declined')),
  going boolean not null check(not going or consent='granted'),
  consent_text text not null,
  responded_by uuid references auth.users(id) on delete set null,
  guardian_name text not null,
  responded_at timestamptz not null default statement_timestamp()
);
create index activity_response_history_child_idx on public.activity_response_history(student_id,activity_id,responded_at desc);

create function public.activity_can_staff(p_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.school_activities a where a.id=p_id and (public.is_admin() or public.sunday_class_staff(a.class_id,a.school_year_id))); $$;
create function public.activity_owns_child(p_student uuid,p_guardian_only boolean default false)
returns boolean language sql stable security definer set search_path = public
as $$ select auth.uid() is not null and (exists(select 1 from public.students s where s.id=p_student and s.family_id in(select public.portal_my_family_ids()))
  or (not p_guardian_only and p_student in(select public.portal_student_ids()))); $$;
create function public.activity_can_read(p_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select public.activity_can_staff(p_id) or exists(select 1 from public.school_activities a join public.activity_students s on s.activity_id=a.id
  where a.id=p_id and a.status in('published','cancelled') and public.activity_owns_child(s.student_id)); $$;

alter table public.school_activities enable row level security;
alter table public.activity_students enable row level security;
alter table public.activity_responses enable row level security;
alter table public.activity_response_history enable row level security;
revoke all on public.school_activities,public.activity_students,public.activity_responses,public.activity_response_history from anon,authenticated;
grant select on public.school_activities,public.activity_students,public.activity_responses,public.activity_response_history to authenticated;
grant all on public.school_activities,public.activity_students,public.activity_responses,public.activity_response_history to service_role;
create policy "read relevant activity" on public.school_activities for select to authenticated using(public.activity_can_read(id));
create policy "read invited children" on public.activity_students for select to authenticated using(public.activity_can_staff(activity_id) or (public.activity_can_read(activity_id) and public.activity_owns_child(student_id)));
create policy "read activity responses" on public.activity_responses for select to authenticated using(public.activity_can_staff(activity_id) or (public.activity_can_read(activity_id) and public.activity_owns_child(student_id)));
create policy "read consent history" on public.activity_response_history for select to authenticated using(public.activity_can_staff(activity_id) or (public.activity_can_read(activity_id) and public.activity_owns_child(student_id)));

create function public.save_school_activity(p_id uuid,p_class_id uuid,p_year uuid,p_expected timestamptz,p_title text,p_description text,p_consent text,p_date date,p_respond_by date)
returns public.school_activities language plpgsql security definer set search_path=public
as $$
declare v_activity public.school_activities;
begin
  if not public.sunday_class_staff(p_class_id,p_year) then raise exception 'Class access denied' using errcode='42501'; end if;
  if p_date < (now() at time zone 'Europe/Oslo')::date or p_respond_by < (now() at time zone 'Europe/Oslo')::date
    or not exists(select 1 from public.school_days d where d.school_year_id=p_year and d.date=p_date and not d.cancelled and extract(isodow from d.date)=7)
    then raise exception 'Choose a future school Sunday and response deadline' using errcode='22023'; end if;
  select * into v_activity from public.school_activities where id=p_id for update;
  if v_activity.id is not null then
    if v_activity.class_id<>p_class_id or v_activity.school_year_id<>p_year or v_activity.status<>'draft' then raise exception 'Published activity is immutable' using errcode='23514'; end if;
    if v_activity.updated_at is distinct from p_expected then raise exception 'Activity changed' using errcode='40001'; end if;
    update public.school_activities set title=btrim(p_title),description=btrim(p_description),consent_text=btrim(p_consent),event_date=p_date,respond_by=p_respond_by,
      updated_at=clock_timestamp(),updated_by=auth.uid() where id=p_id returning * into v_activity;
  else
    if p_expected is not null then raise exception 'Activity missing' using errcode='40001'; end if;
    insert into public.school_activities(id,class_id,school_year_id,title,description,consent_text,event_date,respond_by,updated_by)
      values(p_id,p_class_id,p_year,btrim(p_title),btrim(p_description),btrim(p_consent),p_date,p_respond_by,auth.uid()) returning * into v_activity;
  end if;
  return v_activity;
end;
$$;

alter table public.school_email_deliveries drop constraint school_email_deliveries_kind_check;
alter table public.school_email_deliveries add constraint school_email_deliveries_kind_check check(kind in(
  'signup_parent','signup_student','welcome_parent','welcome_student','plan_confirmed','payment_reminder','installment_due','installment_reminder','report_published','attendance_followup','activity_consent','activity_cancelled'));

create function public.publish_school_activity(p_id uuid,p_expected timestamptz)
returns uuid language plpgsql security definer set search_path=public
as $$
declare v_activity public.school_activities;
begin
  select * into v_activity from public.school_activities where id=p_id for update;
  if v_activity.id is null or not public.activity_can_staff(p_id) then raise exception 'Activity access denied' using errcode='42501'; end if;
  if v_activity.status='published' then return p_id; end if;
  if v_activity.status<>'draft' or v_activity.updated_at is distinct from p_expected then raise exception 'Activity changed' using errcode='40001'; end if;
  if v_activity.respond_by < (now() at time zone 'Europe/Oslo')::date or not exists(select 1 from public.school_days d where d.school_year_id=v_activity.school_year_id and d.date=v_activity.event_date and not d.cancelled and extract(isodow from d.date)=7)
    then raise exception 'Activity date unavailable' using errcode='22023'; end if;
  insert into public.activity_students(activity_id,student_id,student_name)
    select p_id,s.id,concat_ws(' ',s.child_first_name,s.child_last_name) from public.enrollments e join public.students s on s.id=e.student_id
      where e.class_id=v_activity.class_id and e.school_year_id=v_activity.school_year_id and e.status='aktiv' on conflict do nothing;
  if not exists(select 1 from public.activity_students where activity_id=p_id) then raise exception 'Activity has no students' using errcode='22023'; end if;
  update public.school_activities set status='published',updated_at=clock_timestamp(),updated_by=auth.uid() where id=p_id;
  perform public.queue_family_school_email('activity_consent',p_id,f.family_id) from(select distinct s.family_id from public.activity_students x join public.students s on s.id=x.student_id where x.activity_id=p_id) f;
  return p_id;
end;
$$;

create function public.add_activity_students(p_id uuid)
returns integer language plpgsql security definer set search_path=public
as $$
declare v_activity public.school_activities; v_count integer;
begin
  select * into v_activity from public.school_activities where id=p_id for update;
  if not public.activity_can_staff(p_id) then raise exception 'Activity access denied' using errcode='42501'; end if;
  if v_activity.status<>'published' or v_activity.respond_by < (now() at time zone 'Europe/Oslo')::date then raise exception 'Responses closed' using errcode='22023'; end if;
  insert into public.activity_students(activity_id,student_id,student_name)
    select p_id,s.id,concat_ws(' ',s.child_first_name,s.child_last_name) from public.enrollments e join public.students s on s.id=e.student_id
    where e.class_id=v_activity.class_id and e.school_year_id=v_activity.school_year_id and e.status='aktiv' on conflict do nothing;
  get diagnostics v_count=row_count;
  perform public.queue_family_school_email('activity_consent',p_id,f.family_id) from(select distinct s.family_id from public.activity_students x join public.students s on s.id=x.student_id where x.activity_id=p_id) f;
  return v_count;
end;
$$;

create function public.cancel_school_activity(p_id uuid,p_expected timestamptz)
returns uuid language plpgsql security definer set search_path=public
as $$
declare v_activity public.school_activities;
begin
  select * into v_activity from public.school_activities where id=p_id for update;
  if not public.activity_can_staff(p_id) then raise exception 'Activity access denied' using errcode='42501'; end if;
  if v_activity.status='cancelled' then return p_id; end if;
  if v_activity.updated_at is distinct from p_expected then raise exception 'Activity changed' using errcode='40001'; end if;
  update public.school_activities set status='cancelled',updated_at=clock_timestamp(),updated_by=auth.uid() where id=p_id;
  if v_activity.status='published' then
    perform public.queue_family_school_email('activity_cancelled',p_id,f.family_id) from(select distinct s.family_id from public.activity_students x join public.students s on s.id=x.student_id where x.activity_id=p_id) f;
  end if;
  return p_id;
end;
$$;

create function public.respond_school_activity(p_request_id uuid,p_id uuid,p_student uuid,p_expected timestamptz,p_consent text,p_going boolean)
returns uuid language plpgsql security definer set search_path=public
as $$
declare v_activity public.school_activities; v_existing public.activity_response_history; v_name text;
begin
  if not public.activity_owns_child(p_student,true) then raise exception 'Guardian access required' using errcode='42501'; end if;
  select * into v_activity from public.school_activities where id=p_id for update;
  select * into v_existing from public.activity_response_history where id=p_request_id;
  if v_existing.id is not null then
    if v_existing.activity_id=p_id and v_existing.student_id=p_student and v_existing.consent=p_consent and v_existing.going=p_going and v_existing.responded_by=auth.uid() then return p_request_id; end if;
    raise exception 'Conflicting response request' using errcode='23514';
  end if;
  if v_activity.id is null or not exists(select 1 from public.activity_students where activity_id=p_id and student_id=p_student) then raise exception 'Child is not invited' using errcode='42501'; end if;
  if v_activity.status<>'published' or v_activity.updated_at is distinct from p_expected or v_activity.respond_by < (now() at time zone 'Europe/Oslo')::date
    or v_activity.event_date < (now() at time zone 'Europe/Oslo')::date then raise exception 'Responses closed or activity changed' using errcode='40001'; end if;
  if exists(select 1 from public.activity_students where activity_id=p_id and student_id=p_student and participation<>'unrecorded') then raise exception 'Participation already recorded' using errcode='22023'; end if;
  select concat_ws(' ',g.first_name,g.last_name) into v_name from public.guardians g where g.id in(select public.portal_guardian_ids()) order by g.id limit 1;
  insert into public.activity_response_history(id,activity_id,student_id,consent,going,consent_text,responded_by,guardian_name)
    values(p_request_id,p_id,p_student,p_consent,p_going,v_activity.consent_text,auth.uid(),v_name);
  insert into public.activity_responses(activity_id,student_id,consent,going,responded_by,guardian_name,responded_at)
    values(p_id,p_student,p_consent,p_going,auth.uid(),v_name,clock_timestamp())
    on conflict(activity_id,student_id) do update set consent=excluded.consent,going=excluded.going,responded_by=excluded.responded_by,guardian_name=excluded.guardian_name,responded_at=excluded.responded_at;
  return p_request_id;
end;
$$;

create function public.record_activity_participation(p_id uuid,p_student uuid,p_participation text)
returns void language plpgsql security definer set search_path=public
as $$
declare v_activity public.school_activities;
begin
  select * into v_activity from public.school_activities where id=p_id for update;
  if not public.activity_can_staff(p_id) then raise exception 'Activity access denied' using errcode='42501'; end if;
  if v_activity.status<>'published' or v_activity.event_date>(now() at time zone 'Europe/Oslo')::date then raise exception 'Activity has not taken place' using errcode='22023'; end if;
  if p_participation not in('unrecorded','participated','absent') or not exists(select 1 from public.activity_responses where activity_id=p_id and student_id=p_student and consent='granted' and going)
    then raise exception 'Participation requires consent and planned attendance' using errcode='22023'; end if;
  update public.activity_students set participation=p_participation,participation_by=auth.uid(),participation_at=clock_timestamp() where activity_id=p_id and student_id=p_student;
end;
$$;

revoke all on function public.activity_can_staff(uuid),public.activity_owns_child(uuid,boolean),public.activity_can_read(uuid),
 public.save_school_activity(uuid,uuid,uuid,timestamptz,text,text,text,date,date),public.publish_school_activity(uuid,timestamptz),public.add_activity_students(uuid),
 public.cancel_school_activity(uuid,timestamptz),public.respond_school_activity(uuid,uuid,uuid,timestamptz,text,boolean),public.record_activity_participation(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.activity_can_staff(uuid),public.activity_owns_child(uuid,boolean),public.activity_can_read(uuid),
 public.save_school_activity(uuid,uuid,uuid,timestamptz,text,text,text,date,date),public.publish_school_activity(uuid,timestamptz),public.add_activity_students(uuid),
 public.cancel_school_activity(uuid,timestamptz),public.respond_school_activity(uuid,uuid,uuid,timestamptz,text,boolean),public.record_activity_participation(uuid,uuid,text) to authenticated;

do $$
declare v_definition text; v_tables text := '''attendance_followups'']';
 v_move text := '    update public.attendance_followups set student_id = p_keep where student_id = p_student;';
begin
  select pg_get_functiondef('public.admin_merge_children(uuid, uuid, uuid, boolean, text)'::regprocedure) into v_definition;
  if position(v_tables in v_definition)=0 or position(v_move in v_definition)=0 then raise exception 'Expected merge definition was not found'; end if;
  v_definition:=replace(v_definition,v_tables,'''attendance_followups'', ''activity_students'', ''activity_responses'', ''activity_response_history'']');
  v_definition:=replace(v_definition,v_move,v_move || $move$
    insert into public.activity_students(activity_id,student_id,student_name,participation,participation_by,participation_at)
      select activity_id,p_keep,student_name,participation,participation_by,participation_at from public.activity_students where student_id=p_student on conflict do nothing;
    delete from public.activity_responses k using public.activity_responses o where k.student_id=p_keep and o.student_id=p_student and k.activity_id=o.activity_id and o.responded_at>k.responded_at;
    delete from public.activity_responses o where o.student_id=p_student and exists(select 1 from public.activity_responses k where k.student_id=p_keep and k.activity_id=o.activity_id);
    update public.activity_responses set student_id=p_keep where student_id=p_student;
    update public.activity_response_history set student_id=p_keep where student_id=p_student;
    update public.activity_students k set participation=o.participation,participation_by=o.participation_by,participation_at=o.participation_at from public.activity_students o
      where k.student_id=p_keep and o.student_id=p_student and k.activity_id=o.activity_id and k.participation='unrecorded' and o.participation<>'unrecorded';
    delete from public.activity_students where student_id=p_student;
$move$);
  execute v_definition;
end;
$$;
