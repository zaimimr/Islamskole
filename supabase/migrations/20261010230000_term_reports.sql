create table public.term_reports (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  school_year_id uuid not null references public.school_years(id),
  term text not null check (term in ('autumn', 'spring')),
  period_start date not null,
  period_end date not null check (period_end >= period_start),
  summary text not null default '' check (length(summary) <= 6000),
  next_steps text not null default '' check (length(next_steps) <= 4000),
  snapshot jsonb not null,
  updated_at timestamptz not null default statement_timestamp(),
  updated_by uuid references auth.users(id) on delete set null
);
create index term_reports_student_idx on public.term_reports(student_id, school_year_id, term, updated_at desc);
create table public.term_report_publications (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.term_reports(id),
  student_id uuid not null references public.students(id) on delete cascade,
  school_year_id uuid not null references public.school_years(id),
  term text not null check (term in ('autumn', 'spring')),
  version integer not null check (version > 0),
  request_id uuid not null unique,
  snapshot jsonb not null,
  published_at timestamptz not null default statement_timestamp(),
  published_by uuid references auth.users(id) on delete set null,
  unique(report_id, version)
);
create index term_report_publications_student_idx on public.term_report_publications(student_id, published_at desc);

create function public.term_report_can_manage(p_student_id uuid, p_school_year_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select auth.uid() is not null and exists(select 1 from public.students where id = p_student_id)
    and (public.is_admin() or exists(select 1 from public.enrollments e
      where e.student_id = p_student_id and e.school_year_id = p_school_year_id and e.status = 'aktiv'
        and public.portal_can_edit_week_plan(e.class_id, e.school_year_id)));
$$;
alter table public.term_reports enable row level security;
alter table public.term_report_publications enable row level security;
revoke all on public.term_reports, public.term_report_publications from anon, authenticated;
grant select on public.term_reports, public.term_report_publications to authenticated;
grant all on public.term_reports, public.term_report_publications to service_role;
create policy "staff reads report drafts" on public.term_reports for select to authenticated
  using(public.learning_can_manage_student(student_id));
create policy "family reads published reports" on public.term_report_publications for select to authenticated
  using(public.learning_can_read_student(student_id));

create function public.term_report_years(p_student_id uuid)
returns table(id uuid, label text, starts_on date, ends_on date)
language sql stable security definer set search_path = public
as $$
  select sy.id, sy.label, sy.starts_on, sy.ends_on from public.school_years sy
  where public.term_report_can_manage(p_student_id, sy.id)
    and exists(select 1 from public.enrollments e where e.student_id = p_student_id and e.school_year_id = sy.id)
  order by sy.starts_on desc;
$$;

create function public.term_report_snapshot(p_student_id uuid, p_year uuid, p_start date, p_end date)
returns jsonb language sql stable security definer set search_path = public
as $$
  with days as (
    select distinct d.id, d.date from public.school_days d join public.enrollments e on e.school_year_id = d.school_year_id
    where e.student_id = p_student_id and d.school_year_id = p_year
      and d.date between p_start and least(p_end, (now() at time zone 'Europe/Oslo')::date)
      and d.date >= (e.created_at at time zone 'Europe/Oslo')::date
      and (e.status = 'aktiv' or d.date <= (e.updated_at at time zone 'Europe/Oslo')::date)
      and extract(isodow from d.date) = 7 and not d.cancelled
      and exists(select 1 from public.lessons l where l.school_day_id = d.id and l.class_id = e.class_id and not l.cancelled)
  ), statuses as (
    select d.id, max(case a.status when 'fravaer' then 4 when 'meldt_fravaer' then 3 when 'sent' then 2 when 'til_stede' then 1 end) as weight
    from days d left join public.attendance a on a.school_day_id = d.id and a.student_id = p_student_id
      and (a.lesson_id is null or exists(select 1 from public.lessons l where l.id = a.lesson_id and not l.cancelled
        and exists(select 1 from public.enrollments e where e.student_id = p_student_id and e.school_year_id = p_year and e.class_id = l.class_id)))
    group by d.id
  ), goals as (
    select g.id, g.subject, g.title, g.surah, g.ayah_from, g.ayah_to,
      u.status, u.feedback, u.next_target, u.teacher_name
    from public.learning_goals g join lateral (
      select h.status, h.feedback, h.next_target, h.teacher_name from public.learning_progress_updates h
      where h.goal_id = g.id and h.student_id = p_student_id
        and (h.created_at at time zone 'Europe/Oslo')::date <= least(p_end, (now() at time zone 'Europe/Oslo')::date)
      order by h.created_at desc, h.id desc limit 1
    ) u on true
    where g.student_id = p_student_id and (g.created_at at time zone 'Europe/Oslo')::date <= p_end
  )
  select jsonb_build_object(
    'studentName', concat_ws(' ', s.child_first_name, s.child_last_name), 'yearLabel', sy.label,
    'term', '', 'periodStart', p_start, 'periodEnd', p_end,
    'attendance', (select jsonb_build_object('total', count(*), 'present', count(*) filter(where weight = 1),
      'late', count(*) filter(where weight = 2), 'reportedAbsent', count(*) filter(where weight = 3),
      'absent', count(*) filter(where weight = 4), 'unrecorded', count(*) filter(where weight is null)) from statuses),
    'goals', coalesce((select jsonb_agg(to_jsonb(g) order by g.subject, g.title, g.id) from goals g), '[]'::jsonb),
    'generatedAt', statement_timestamp())
  from public.students s cross join public.school_years sy where s.id = p_student_id and sy.id = p_year;
$$;

create function public.prepare_term_report(p_student_id uuid, p_year uuid, p_term text)
returns public.term_reports language plpgsql security definer set search_path = public
as $$
declare v_start date; v_end date; v_year public.school_years; v_report public.term_reports;
begin
  if not public.term_report_can_manage(p_student_id, p_year) then raise exception 'Report access denied' using errcode = '42501'; end if;
  if p_term not in ('autumn', 'spring') then raise exception 'Invalid term' using errcode = '22023'; end if;
  perform 1 from public.students where id = p_student_id for update;
  select * into v_year from public.school_years where id = p_year;
  v_start := case when p_term = 'autumn' then v_year.starts_on else greatest(v_year.starts_on, make_date(extract(year from v_year.ends_on)::int, 1, 1)) end;
  v_end := case when p_term = 'autumn' then least(v_year.ends_on, make_date(extract(year from v_year.starts_on)::int, 12, 31)) else v_year.ends_on end;
  if v_end < v_start then raise exception 'Term outside school year' using errcode = '22023'; end if;
  select * into v_report from public.term_reports where student_id = p_student_id and school_year_id = p_year and term = p_term order by updated_at desc, id limit 1 for update;
  if v_report.id is null then
    insert into public.term_reports(student_id, school_year_id, term, period_start, period_end, snapshot, next_steps, updated_by)
      values(p_student_id, p_year, p_term, v_start, v_end, public.term_report_snapshot(p_student_id, p_year, v_start, v_end),
        coalesce((select string_agg(distinct nullif(btrim(g.next_target), ''), E'\n') from public.learning_goals g where g.student_id = p_student_id), ''), auth.uid()) returning * into v_report;
  end if;
  return v_report;
end;
$$;

create function public.save_term_report(p_id uuid, p_expected timestamptz, p_summary text, p_next_steps text, p_refresh boolean default false)
returns public.term_reports language plpgsql security definer set search_path = public
as $$
declare v_report public.term_reports;
begin
  select * into v_report from public.term_reports where id = p_id for update;
  if v_report.id is null or not public.term_report_can_manage(v_report.student_id, v_report.school_year_id) then raise exception 'Report access denied' using errcode = '42501'; end if;
  if v_report.updated_at <> p_expected then raise exception 'Report has changed' using errcode = '40001'; end if;
  update public.term_reports set summary = btrim(p_summary), next_steps = btrim(p_next_steps), updated_by = auth.uid(), updated_at = clock_timestamp(),
    snapshot = case when p_refresh then public.term_report_snapshot(v_report.student_id, v_report.school_year_id, v_report.period_start, v_report.period_end) else snapshot end
    where id = p_id returning * into v_report;
  return v_report;
end;
$$;

alter table public.school_email_deliveries drop constraint school_email_deliveries_kind_check;
alter table public.school_email_deliveries add constraint school_email_deliveries_kind_check check(kind in(
  'signup_parent','signup_student','welcome_parent','welcome_student','plan_confirmed','payment_reminder','installment_due','installment_reminder','report_published'));

create function public.publish_term_report(p_id uuid, p_expected timestamptz, p_request_id uuid)
returns uuid language plpgsql security definer set search_path = public
as $$
declare v_report public.term_reports; v_existing uuid; v_id uuid; v_version integer;
begin
  select * into v_report from public.term_reports where id = p_id for update;
  if v_report.id is null or not public.term_report_can_manage(v_report.student_id, v_report.school_year_id) then raise exception 'Report access denied' using errcode = '42501'; end if;
  select id into v_existing from public.term_report_publications where request_id = p_request_id and report_id = p_id;
  if v_existing is not null then return v_existing; end if;
  if v_report.updated_at <> p_expected then raise exception 'Report has changed' using errcode = '40001'; end if;
  if nullif(btrim(v_report.summary), '') is null then raise exception 'Review summary before publishing' using errcode = '22023'; end if;
  select coalesce(max(version), 0) + 1 into v_version from public.term_report_publications where report_id = p_id;
  insert into public.term_report_publications(report_id, student_id, school_year_id, term, version, request_id, snapshot, published_by)
    values(p_id, v_report.student_id, v_report.school_year_id, v_report.term, v_version, p_request_id,
      v_report.snapshot || jsonb_build_object('term', v_report.term, 'summary', v_report.summary, 'nextSteps', v_report.next_steps), auth.uid()) returning id into v_id;
  perform public.queue_family_school_email('report_published', v_id, s.family_id) from public.students s where s.id = v_report.student_id;
  return v_id;
end;
$$;

revoke all on function public.term_report_can_manage(uuid,uuid), public.term_report_years(uuid), public.term_report_snapshot(uuid,uuid,date,date),
  public.prepare_term_report(uuid,uuid,text), public.save_term_report(uuid,timestamptz,text,text,boolean), public.publish_term_report(uuid,timestamptz,uuid) from public, anon, authenticated;
grant execute on function public.term_report_can_manage(uuid,uuid), public.term_report_years(uuid), public.prepare_term_report(uuid,uuid,text),
  public.save_term_report(uuid,timestamptz,text,text,boolean), public.publish_term_report(uuid,timestamptz,uuid) to authenticated;

do $$
declare v_definition text; v_tables text := '''homework_responses'']';
  v_move text := '    update public.homework_responses set student_id = p_keep where student_id = p_student;';
begin
  select pg_get_functiondef('public.admin_merge_children(uuid, uuid, uuid, boolean, text)'::regprocedure) into v_definition;
  if position(v_tables in v_definition) = 0 or position(v_move in v_definition) = 0 then raise exception 'Expected merge definition was not found'; end if;
  v_definition := replace(v_definition, v_tables, '''homework_responses'', ''term_reports'', ''term_report_publications'']');
  v_definition := replace(v_definition, v_move, v_move || E'\n    update public.term_reports set student_id = p_keep where student_id = p_student;\n    update public.term_report_publications set student_id = p_keep where student_id = p_student;');
  execute v_definition;
end;
$$;
