alter table public.class_week_plans
  add column goals text check (goals is null or length(goals) <= 2000),
  add column completed_at timestamptz,
  add column completed_by uuid references auth.users(id) on delete set null;

create or replace function public.class_week_plans_stamp()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.created_at := now();
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  if new.completed_at is null then
    new.completed_by := null;
  elsif tg_op = 'INSERT' or old.completed_at is null then
    new.completed_at := now();
    new.completed_by := auth.uid();
  else
    new.completed_at := old.completed_at;
    new.completed_by := old.completed_by;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create function public.copy_teaching_year(p_class_id uuid, p_source_year_id uuid, p_target_year_id uuid)
returns integer language plpgsql security definer set search_path = public
as $$
declare v_count integer;
begin
  if not (public.is_admin() or public.portal_can_edit_week_plan(p_class_id, p_target_year_id)) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.school_years source join public.school_years target on target.id = p_target_year_id
    where source.id = p_source_year_id and source.starts_on < target.starts_on and target.is_active
  ) then
    raise exception 'Invalid school year' using errcode = '23514';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_class_id::text || p_target_year_id::text, 0));
  with weeks as (
    select school_year_id, date_trunc('week', date)::date as week_start,
      row_number() over (partition by school_year_id order by date_trunc('week', date)) as position
    from public.school_days where school_year_id in (p_source_year_id, p_target_year_id)
      and not cancelled and extract(isodow from date) = 7
    group by school_year_id, date_trunc('week', date)
  )
  insert into public.class_week_plans (class_id, school_year_id, week_start, start_position, end_position, subject, title, description, goals, resource_url, sort_order)
  select p_class_id, p_target_year_id, target.week_start, p.start_position, p.end_position, p.subject, p.title, p.description, p.goals, p.resource_url, p.sort_order
  from public.class_week_plans p join weeks source on source.school_year_id = p_source_year_id and source.week_start = p.week_start
  join weeks target on target.school_year_id = p_target_year_id and target.position = source.position
  where p.class_id = p_class_id and p.school_year_id = p_source_year_id
    and not exists (
      select 1 from public.class_week_plans existing
      where existing.class_id = p_class_id and existing.school_year_id = p_target_year_id
        and existing.week_start = target.week_start
        and existing.start_position is not distinct from p.start_position
        and existing.end_position is not distinct from p.end_position
        and lower(btrim(existing.title)) = lower(btrim(p.title))
    );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.copy_teaching_year(uuid, uuid, uuid) from public, anon;
grant execute on function public.copy_teaching_year(uuid, uuid, uuid) to authenticated;

create function public.can_manage_lesson_material(p_class_id uuid, p_school_year_id uuid, p_lesson_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.is_admin() or public.portal_can_edit_week_plan(p_class_id, p_school_year_id)
    or (p_lesson_id is not null and public.portal_teaches_lesson(p_lesson_id));
$$;
revoke all on function public.can_manage_lesson_material(uuid, uuid, uuid) from public, anon;
grant execute on function public.can_manage_lesson_material(uuid, uuid, uuid) to authenticated;

create table public.lesson_materials (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  school_year_id uuid not null references public.school_years(id) on delete cascade,
  lesson_id uuid references public.lessons(id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 200),
  kind text not null check (kind in ('link', 'file')),
  url text check (url is null or (length(url) <= 2000 and url ~* '^https?://')),
  file_path text unique,
  file_name text check (length(file_name) between 1 and 200),
  mime_type text check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/webm')),
  file_size bigint check (file_size between 1 and 20971520),
  status text not null default 'ready' check (status in ('uploading', 'ready')),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind = 'link' and url is not null and file_path is null and status = 'ready')
    or (kind = 'file' and url is null and file_path = class_id::text || '/' || id::text || '/resource' and file_name is not null and mime_type is not null and file_size is not null))
);
create index lesson_materials_scope_idx on public.lesson_materials(class_id, school_year_id, lesson_id);
alter table public.lesson_materials enable row level security;
revoke all on public.lesson_materials from public, anon;
grant select, insert, update, delete on public.lesson_materials to authenticated;
grant all on public.lesson_materials to service_role;
create policy "staff manages materials" on public.lesson_materials for all to authenticated
  using (public.can_manage_lesson_material(class_id, school_year_id, lesson_id))
  with check (public.can_manage_lesson_material(class_id, school_year_id, lesson_id));
create policy "class reads ready materials" on public.lesson_materials for select to authenticated
  using (status = 'ready' and public.portal_can_read_week_plan(class_id, school_year_id));

create function public.lesson_materials_validate()
returns trigger language plpgsql security definer set search_path = public, storage
as $$
begin
  if new.lesson_id is not null and not exists (
    select 1 from public.lessons l join public.school_days d on d.id = l.school_day_id
    where l.id = new.lesson_id and l.class_id = new.class_id and d.school_year_id = new.school_year_id
  ) then
    raise exception 'Lesson does not match material' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' then
    if (new.id, new.class_id, new.school_year_id, new.lesson_id, new.kind, new.file_path, new.file_name, new.mime_type, new.file_size)
      is distinct from (old.id, old.class_id, old.school_year_id, old.lesson_id, old.kind, old.file_path, old.file_name, old.mime_type, old.file_size) then
      raise exception 'Material scope is immutable' using errcode = '23514';
    end if;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  else
    new.created_by := coalesce(auth.uid(), new.created_by);
  end if;
  if new.kind = 'file' and new.status = 'ready' and not exists (
    select 1 from storage.objects o where o.bucket_id = 'lesson-materials' and o.name = new.file_path
      and (o.metadata->>'size')::bigint = new.file_size and o.metadata->>'mimetype' = new.mime_type
  ) then
    raise exception 'Upload is missing or invalid' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.lesson_materials_validate() from public, anon, authenticated;
create trigger lesson_materials_validate before insert or update on public.lesson_materials
  for each row execute function public.lesson_materials_validate();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lesson-materials', 'lesson-materials', false, 20971520,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/webm']);
create policy "staff uploads lesson material" on storage.objects for insert to authenticated with check (
  bucket_id = 'lesson-materials' and exists (
    select 1 from public.lesson_materials m where m.file_path = name and m.status = 'uploading'
      and public.can_manage_lesson_material(m.class_id, m.school_year_id, m.lesson_id)
  )
);
create policy "class downloads lesson material" on storage.objects for select to authenticated using (
  bucket_id = 'lesson-materials' and exists (select 1 from public.lesson_materials m where m.file_path = name)
);
create policy "staff removes lesson material" on storage.objects for delete to authenticated using (
  bucket_id = 'lesson-materials' and exists (
    select 1 from public.lesson_materials m where m.file_path = name
      and public.can_manage_lesson_material(m.class_id, m.school_year_id, m.lesson_id)
  )
);

create table public.lesson_handovers (
  lesson_id uuid primary key references public.lessons(id) on delete cascade,
  instructions text not null check (length(instructions) <= 6000),
  updated_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.lesson_handovers enable row level security;
revoke all on public.lesson_handovers from public, anon;
grant select, insert, update, delete on public.lesson_handovers to authenticated;
grant all on public.lesson_handovers to service_role;
create policy "staff manages handover" on public.lesson_handovers for all to authenticated
  using (public.is_admin() or public.portal_teaches_lesson(lesson_id) or exists (
    select 1 from public.lessons l join public.school_days d on d.id = l.school_day_id
    where l.id = lesson_id and public.portal_can_edit_week_plan(l.class_id, d.school_year_id)
  ))
  with check (public.is_admin() or public.portal_teaches_lesson(lesson_id) or exists (
    select 1 from public.lessons l join public.school_days d on d.id = l.school_day_id
    where l.id = lesson_id and public.portal_can_edit_week_plan(l.class_id, d.school_year_id)
  ));
create function public.lesson_handovers_stamp()
returns trigger language plpgsql set search_path = public
as $$
begin
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.lesson_handovers_stamp() from public, anon, authenticated;
create trigger lesson_handovers_stamp before insert or update on public.lesson_handovers
  for each row execute function public.lesson_handovers_stamp();
