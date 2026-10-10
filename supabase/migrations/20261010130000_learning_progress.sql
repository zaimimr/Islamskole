create table public.learning_goals (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  subject text not null check (subject in ('quran', 'arabic', 'islam')),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  surah text check (surah is null or char_length(btrim(surah)) between 1 and 120),
  ayah_from integer,
  ayah_to integer,
  status text not null check (status in ('practising', 'achieved', 'needs_revision')),
  feedback text check (feedback is null or char_length(feedback) <= 2000),
  next_target text check (next_target is null or char_length(next_target) <= 1000),
  latest_update_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  updated_by_name text not null,
  unique (id, student_id),
  check (subject = 'quran' or (surah is null and ayah_from is null and ayah_to is null)),
  check ((ayah_from is null and ayah_to is null) or
    (surah is not null and ayah_from is not null and ayah_to is not null and ayah_from > 0 and ayah_to >= ayah_from))
);

create table public.learning_progress_updates (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null,
  student_id uuid not null,
  status text not null check (status in ('practising', 'achieved', 'needs_revision')),
  feedback text check (feedback is null or char_length(feedback) <= 2000),
  next_target text check (next_target is null or char_length(next_target) <= 1000),
  recorded_by uuid references auth.users(id) on delete set null,
  teacher_name text not null,
  created_at timestamptz not null default statement_timestamp(),
  foreign key (goal_id, student_id) references public.learning_goals(id, student_id) on delete cascade
);

create index learning_goals_student_idx on public.learning_goals (student_id, updated_at desc, id);
create index learning_progress_updates_goal_idx on public.learning_progress_updates (goal_id, created_at desc, id);

create function public.learning_can_manage_student(p_student_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.students s where s.id = p_student_id)
    and (public.is_admin() or exists (
      select 1 from public.enrollments e
      join public.school_years sy on sy.id = e.school_year_id and sy.is_active
      where e.student_id = p_student_id and e.status = 'aktiv'
        and public.portal_can_edit_week_plan(e.class_id, sy.id)
    ));
$$;

create function public.learning_can_read_student(p_student_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.learning_can_manage_student(p_student_id)
    or p_student_id in (select public.portal_student_ids())
    or exists (select 1 from public.students s where s.id = p_student_id
      and s.family_id in (select public.portal_my_family_ids()));
$$;

create function public.learning_teacher_name()
returns text language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select nullif(btrim(concat_ws(' ', g.first_name, g.last_name)), '') from public.guardians g
      where g.id in (select public.portal_guardian_ids()) order by g.id limit 1),
    (select nullif(btrim(p.full_name), '') from public.profiles p where p.id = auth.uid()),
    'Islamskole');
$$;

alter table public.learning_goals enable row level security;
alter table public.learning_progress_updates enable row level security;
revoke all on public.learning_goals, public.learning_progress_updates from anon, authenticated;
grant select on public.learning_goals, public.learning_progress_updates to authenticated;
grant all on public.learning_goals, public.learning_progress_updates to service_role;
create policy "read own learning goals" on public.learning_goals for select to authenticated
  using (public.learning_can_read_student(student_id));
create policy "read own learning history" on public.learning_progress_updates for select to authenticated
  using (public.learning_can_read_student(student_id));

create function public.learning_class_students(p_class_id uuid)
returns table (student_id uuid, first_name text, last_name text)
language sql stable security definer set search_path = public
as $$
  select distinct s.id, s.child_first_name, s.child_last_name
  from public.enrollments e
  join public.school_years sy on sy.id = e.school_year_id and sy.is_active
  join public.students s on s.id = e.student_id
  where e.class_id = p_class_id and e.status = 'aktiv'
    and (public.is_admin() or public.portal_can_edit_week_plan(p_class_id, sy.id))
  order by s.child_first_name, s.child_last_name, s.id;
$$;

create function public.create_learning_goal(
  p_id uuid, p_student_id uuid, p_class_id uuid, p_subject text, p_title text,
  p_surah text, p_ayah_from integer, p_ayah_to integer,
  p_status text, p_feedback text, p_next_target text
)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  v_existing public.learning_goals;
  v_initial public.learning_progress_updates;
  v_name text;
begin
  if auth.uid() is null or not public.learning_can_manage_student(p_student_id)
    or (not public.is_admin() and not exists (select 1 from public.enrollments e
      join public.school_years sy on sy.id = e.school_year_id and sy.is_active
      where e.student_id = p_student_id and e.class_id = p_class_id and e.status = 'aktiv'
        and public.portal_can_edit_week_plan(p_class_id, sy.id))) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_id::text, 1));
  select * into v_existing from public.learning_goals where id = p_id;
  if found then
    select * into v_initial from public.learning_progress_updates where id = p_id;
    if v_existing.created_by = auth.uid() and v_existing.student_id = p_student_id
      and v_existing.subject = p_subject and v_existing.title = btrim(p_title)
      and v_existing.surah is not distinct from nullif(btrim(p_surah), '')
      and v_existing.ayah_from is not distinct from p_ayah_from
      and v_existing.ayah_to is not distinct from p_ayah_to
      and v_initial.status = p_status
      and v_initial.feedback is not distinct from nullif(btrim(p_feedback), '')
      and v_initial.next_target is not distinct from nullif(btrim(p_next_target), '') then
      return p_id;
    end if;
    raise exception 'Conflicting request' using errcode = '23514';
  end if;
  v_name := public.learning_teacher_name();
  insert into public.learning_goals
    (id, student_id, subject, title, surah, ayah_from, ayah_to, status, feedback, next_target, latest_update_id, created_by, updated_by_name)
  values (p_id, p_student_id, p_subject, btrim(p_title), nullif(btrim(p_surah), ''), p_ayah_from, p_ayah_to,
    p_status, nullif(btrim(p_feedback), ''), nullif(btrim(p_next_target), ''), p_id, auth.uid(), v_name);
  insert into public.learning_progress_updates (id, goal_id, student_id, status, feedback, next_target, recorded_by, teacher_name)
  values (p_id, p_id, p_student_id, p_status, nullif(btrim(p_feedback), ''), nullif(btrim(p_next_target), ''), auth.uid(), v_name);
  insert into public.audit_log (actor_id, actor_email, action, entity_type, entity_id, metadata)
  values (auth.uid(), auth.jwt() ->> 'email', 'create', 'learning_goals', p_id::text,
    jsonb_build_object('student_id', p_student_id, 'subject', p_subject, 'status', p_status));
  return p_id;
end;
$$;

create function public.record_learning_progress(
  p_id uuid, p_goal_id uuid, p_expected_update_id uuid, p_status text, p_feedback text, p_next_target text
)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  v_goal public.learning_goals;
  v_existing public.learning_progress_updates;
  v_name text;
begin
  select * into v_goal from public.learning_goals where id = p_goal_id for update;
  if auth.uid() is null or not found or not public.learning_can_manage_student(v_goal.student_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  select * into v_existing from public.learning_progress_updates where id = p_id;
  if found then
    if v_existing.recorded_by = auth.uid() and v_existing.goal_id = p_goal_id
      and v_existing.status = p_status
      and v_existing.feedback is not distinct from nullif(btrim(p_feedback), '')
      and v_existing.next_target is not distinct from nullif(btrim(p_next_target), '') then
      return p_id;
    end if;
    raise exception 'Conflicting request' using errcode = '23514';
  end if;
  if v_goal.latest_update_id is distinct from p_expected_update_id then
    raise exception 'Progress changed' using errcode = '40001';
  end if;
  v_name := public.learning_teacher_name();
  insert into public.learning_progress_updates (id, goal_id, student_id, status, feedback, next_target, recorded_by, teacher_name)
  values (p_id, p_goal_id, v_goal.student_id, p_status, nullif(btrim(p_feedback), ''), nullif(btrim(p_next_target), ''), auth.uid(), v_name);
  update public.learning_goals set status = p_status, feedback = nullif(btrim(p_feedback), ''),
    next_target = nullif(btrim(p_next_target), ''), latest_update_id = p_id,
    updated_at = statement_timestamp(), updated_by_name = v_name where id = p_goal_id;
  insert into public.audit_log (actor_id, actor_email, action, entity_type, entity_id, metadata)
  values (auth.uid(), auth.jwt() ->> 'email', 'update', 'learning_goals', p_goal_id::text,
    jsonb_build_object('student_id', v_goal.student_id, 'status', p_status, 'update_id', p_id));
  return p_id;
end;
$$;

revoke all on function public.learning_teacher_name() from public, anon, authenticated;
revoke all on function public.learning_can_manage_student(uuid), public.learning_can_read_student(uuid),
  public.learning_class_students(uuid),
  public.create_learning_goal(uuid, uuid, uuid, text, text, text, integer, integer, text, text, text),
  public.record_learning_progress(uuid, uuid, uuid, text, text, text) from public, anon;
grant execute on function public.learning_can_manage_student(uuid), public.learning_can_read_student(uuid),
  public.learning_class_students(uuid),
  public.create_learning_goal(uuid, uuid, uuid, text, text, text, integer, integer, text, text, text),
  public.record_learning_progress(uuid, uuid, uuid, text, text, text) to authenticated;
