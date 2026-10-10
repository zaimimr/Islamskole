alter table public.class_notes add column homework_version integer not null default 1 check (homework_version > 0);
create function public.class_notes_homework_version()
returns trigger language plpgsql set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.homework_version := 1;
  else
    new.homework_version := old.homework_version + case when btrim(coalesce(new.homework, '')) is distinct from btrim(coalesce(old.homework, '')) then 1 else 0 end;
  end if;
  return new;
end;
$$;
revoke all on function public.class_notes_homework_version() from public, anon, authenticated;
create trigger class_notes_homework_version before insert or update on public.class_notes
  for each row execute function public.class_notes_homework_version();

create function public.homework_is_assigned(p_note_id uuid, p_student_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.class_notes n join public.school_days d on d.id = n.school_day_id
    join public.school_years sy on sy.id = d.school_year_id and sy.is_active
    join public.enrollments e on e.class_id = n.class_id and e.school_year_id = sy.id and e.student_id = p_student_id and e.status = 'aktiv'
    left join public.lessons l on l.id = n.lesson_id
    where n.id = p_note_id and nullif(btrim(n.homework), '') is not null and not d.cancelled
      and d.date <= (statement_timestamp() at time zone 'Europe/Oslo')::date
      and not coalesce(l.cancelled, false)
      and d.date >= (e.created_at at time zone 'Europe/Oslo')::date
  );
$$;
create function public.homework_can_respond(p_note_id uuid, p_student_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.homework_is_assigned(p_note_id, p_student_id) and (
    public.portal_is_guardian_of(p_student_id) or p_student_id in (select public.portal_student_ids())
  );
$$;
create function public.homework_staff_can_read(p_note_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.is_admin() or exists (
    select 1 from public.class_notes n join public.school_days d on d.id = n.school_day_id
    where n.id = p_note_id and (public.portal_can_edit_week_plan(n.class_id, d.school_year_id) or public.portal_teaches_lesson(n.lesson_id))
  );
$$;
revoke all on function public.homework_is_assigned(uuid, uuid), public.homework_can_respond(uuid, uuid), public.homework_staff_can_read(uuid) from public, anon;
grant execute on function public.homework_is_assigned(uuid, uuid), public.homework_can_respond(uuid, uuid), public.homework_staff_can_read(uuid) to authenticated;

create table public.homework_responses (
  note_id uuid not null references public.class_notes(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  status text not null check (status in ('not_started', 'completed', 'needs_help')),
  homework_version integer not null,
  responded_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (note_id, student_id)
);
create index homework_responses_student_idx on public.homework_responses(student_id);
alter table public.homework_responses enable row level security;
revoke all on public.homework_responses from public, anon;
grant select, insert, update on public.homework_responses to authenticated;
grant all on public.homework_responses to service_role;
create policy "family reads homework response" on public.homework_responses for select to authenticated using (
  public.portal_is_guardian_of(student_id) or student_id in (select public.portal_student_ids())
);
create policy "staff reads homework responses" on public.homework_responses for select to authenticated using (public.homework_staff_can_read(note_id));
create policy "family inserts homework response" on public.homework_responses for insert to authenticated with check (public.homework_can_respond(note_id, student_id));
create policy "family updates homework response" on public.homework_responses for update to authenticated
  using (public.homework_can_respond(note_id, student_id)) with check (public.homework_can_respond(note_id, student_id));
create function public.homework_response_stamp()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and (new.note_id, new.student_id) is distinct from (old.note_id, old.student_id) then
    raise exception 'Response scope is immutable' using errcode = '23514';
  end if;
  select n.homework_version into new.homework_version from public.class_notes n where n.id = new.note_id;
  new.responded_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.homework_response_stamp() from public, anon, authenticated;
create trigger homework_response_stamp before insert or update on public.homework_responses
  for each row execute function public.homework_response_stamp();

create function public.student_homework(p_student_id uuid)
returns table (note_id uuid, homework text, homework_version integer, date date, subject text, status text, updated_at timestamptz)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not (public.learning_can_manage_student(p_student_id) or public.portal_is_guardian_of(p_student_id) or p_student_id in (select public.portal_student_ids())) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  return query select n.id, n.homework, n.homework_version, d.date, l.subject,
    case when r.homework_version = n.homework_version then r.status else 'not_started' end,
    case when r.homework_version = n.homework_version then r.updated_at else null end
  from public.class_notes n join public.school_days d on d.id = n.school_day_id
  left join public.lessons l on l.id = n.lesson_id
  left join public.homework_responses r on r.note_id = n.id and r.student_id = p_student_id
  where public.homework_is_assigned(n.id, p_student_id)
  order by d.date desc, n.created_at desc limit 40;
end;
$$;
revoke all on function public.student_homework(uuid) from public, anon;
grant execute on function public.student_homework(uuid) to authenticated;
