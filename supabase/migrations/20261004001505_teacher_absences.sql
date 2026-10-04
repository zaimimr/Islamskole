create table if not exists public.teacher_absences (
  id uuid primary key default gen_random_uuid(),
  guardian_id uuid not null references public.guardians(id) on delete cascade,
  school_day_id uuid not null references public.school_days(id) on delete cascade,
  notified boolean not null default true,
  source text not null default 'laerer' check (source in ('laerer', 'admin')),
  reason text check (reason is null or char_length(reason) <= 500),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (guardian_id, school_day_id)
);

create index if not exists teacher_absences_school_day_idx on public.teacher_absences (school_day_id);

alter table public.teacher_absences enable row level security;

create or replace function public.portal_teacher_guardian_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select g.id
  from public.guardians g
  where g.id in (select public.portal_guardian_ids())
    and g.is_teacher
  order by g.created_at
  limit 1;
$$;

revoke all on function public.portal_teacher_guardian_id() from public, anon;
grant execute on function public.portal_teacher_guardian_id() to authenticated;

drop policy if exists "admin manages teacher absences" on public.teacher_absences;
create policy "admin manages teacher absences" on public.teacher_absences
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "teacher reads own absences" on public.teacher_absences;
create policy "teacher reads own absences" on public.teacher_absences
  for select to authenticated
  using (guardian_id in (select public.portal_guardian_ids()));

drop policy if exists "teacher reports own absence" on public.teacher_absences;
create policy "teacher reports own absence" on public.teacher_absences
  for insert to authenticated
  with check (
    source = 'laerer'
    and notified
    and created_by = auth.uid()
    and guardian_id = public.portal_teacher_guardian_id()
    and public.portal_is_open_school_day(school_day_id)
  );

drop policy if exists "teacher withdraws own absence" on public.teacher_absences;
create policy "teacher withdraws own absence" on public.teacher_absences
  for delete to authenticated
  using (
    source = 'laerer'
    and guardian_id in (select public.portal_guardian_ids())
    and public.portal_is_open_school_day(school_day_id)
  );

grant select, insert, update, delete on public.teacher_absences to authenticated;

drop trigger if exists teacher_absences_updated_at on public.teacher_absences;
create trigger teacher_absences_updated_at
  before update on public.teacher_absences
  for each row execute function public.set_updated_at();
