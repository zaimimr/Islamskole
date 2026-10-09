create table if not exists public.school_announcements (
  id uuid primary key,
  school_year_id uuid not null references public.school_years(id) on delete restrict,
  class_id uuid references public.classes(id) on delete restrict,
  title text not null check (length(btrim(title)) between 1 and 160),
  body text not null check (length(btrim(body)) between 1 and 5000),
  requires_acknowledgement boolean not null default false,
  email_enabled boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  published_at timestamptz not null default now()
);

create table if not exists public.announcement_families (
  announcement_id uuid not null references public.school_announcements(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  family_name text not null,
  acknowledged_at timestamptz,
  acknowledged_by uuid references auth.users(id) on delete set null,
  primary key (announcement_id, family_id)
);

create table if not exists public.announcement_deliveries (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.school_announcements(id) on delete cascade,
  email text not null,
  family_ids uuid[] not null,
  language text not null check (language in ('no', 'en')),
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed')),
  attempts integer not null default 0,
  attempted_at timestamptz,
  sent_at timestamptz,
  error text,
  unique (announcement_id, email)
);

create index if not exists school_announcements_published_idx on public.school_announcements (published_at desc);
alter table public.school_announcements add column if not exists class_name_no text, add column if not exists class_name_en text;
alter table public.announcement_deliveries add column if not exists batch_id uuid;
create index if not exists announcement_deliveries_batch_idx on public.announcement_deliveries (batch_id);
create index if not exists school_announcements_class_year_idx on public.school_announcements (class_id, school_year_id);
create index if not exists announcement_families_family_idx on public.announcement_families (family_id);
create index if not exists announcement_deliveries_status_idx on public.announcement_deliveries (status, attempted_at);

create or replace function public.announcement_can_publish(p_class_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select auth.uid() is not null and (
    public.is_admin() or (p_class_id is not null and public.portal_is_teacher_of(p_class_id))
  );
$$;

create or replace function public.announcement_can_manage(p_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.school_announcements a
    join public.school_years y on y.id = a.school_year_id
    where a.id = p_id and (
      public.is_admin() or (y.is_active and a.class_id is not null and public.portal_is_teacher_of(a.class_id))
    )
  );
$$;

create or replace function public.announcement_target_families(p_class_id uuid)
returns table (family_id uuid, family_name text)
language sql stable security definer set search_path = public
as $$
  select f.id, coalesce(nullif(btrim(f.display_name), ''), string_agg(distinct concat_ws(' ', s.child_first_name, s.child_last_name), ', '))
  from public.families f
  join public.students s on s.family_id = f.id
  join public.enrollments e on e.student_id = s.id and e.status = 'aktiv'
  join public.school_years y on y.id = e.school_year_id and y.is_active
  where p_class_id is null or e.class_id = p_class_id
  group by f.id;
$$;

create or replace function public.announcement_target_emails(p_class_id uuid)
returns table (email text, family_ids uuid[], language text)
language sql stable security definer set search_path = public
as $$
  select lower(btrim(g.email)), array_agg(distinct t.family_id),
    case when bool_and(f.preferred_language = 'en') then 'en' else 'no' end
  from public.announcement_target_families(p_class_id) t
  join public.families f on f.id = t.family_id
  join public.family_guardians fg on fg.family_id = t.family_id and fg.receives_communication
  join public.guardians g on g.id = fg.guardian_id
  where btrim(g.email) ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    and lower(btrim(g.email)) <> 'mangler@islamskole.no'
  group by lower(btrim(g.email));
$$;

create or replace function public.announcement_audience(p_class_id uuid default null)
returns table (family_count bigint, email_count bigint, missing_email_count bigint)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.announcement_can_publish(p_class_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  return query
    select (select count(*) from public.announcement_target_families(p_class_id)),
      (select count(*) from public.announcement_target_emails(p_class_id)),
      (select count(*) from public.announcement_target_families(p_class_id) f
        where not exists (select 1 from public.announcement_target_emails(p_class_id) e where f.family_id = any(e.family_ids)));
end;
$$;

create or replace function public.publish_announcement(
  p_id uuid, p_class_id uuid, p_title text, p_body text,
  p_email_enabled boolean default true, p_requires_acknowledgement boolean default false
)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  v_year uuid;
  v_existing public.school_announcements;
begin
  if not public.announcement_can_publish(p_class_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_id::text, 0));
  select * into v_existing from public.school_announcements where id = p_id;
  if found then
    if v_existing.created_by = auth.uid()
      and v_existing.class_id is not distinct from p_class_id
      and v_existing.title = btrim(p_title) and v_existing.body = btrim(p_body)
      and v_existing.email_enabled = p_email_enabled
      and v_existing.requires_acknowledgement = p_requires_acknowledgement then
      return p_id;
    end if;
    raise exception 'Announcement already exists' using errcode = '23505';
  end if;
  select id into v_year from public.school_years where is_active;
  if v_year is null then raise exception 'No active year' using errcode = '23514'; end if;
  if not exists (select 1 from public.announcement_target_families(p_class_id)) then
    raise exception 'No recipient families' using errcode = '23514';
  end if;
  insert into public.school_announcements (id, school_year_id, class_id, class_name_no, class_name_en, title, body, email_enabled, requires_acknowledgement, created_by)
    values (p_id, v_year, p_class_id,
      (select name_no from public.classes where id = p_class_id),
      (select name_en from public.classes where id = p_class_id),
      btrim(p_title), btrim(p_body), p_email_enabled, p_requires_acknowledgement, auth.uid());
  insert into public.announcement_families (announcement_id, family_id, family_name)
    select p_id, t.family_id, t.family_name from public.announcement_target_families(p_class_id) t;
  if p_email_enabled then
    insert into public.announcement_deliveries (announcement_id, email, family_ids, language)
      select p_id, t.email, t.family_ids, t.language from public.announcement_target_emails(p_class_id) t;
  end if;
  insert into public.audit_log (actor_id, actor_email, action, entity_type, entity_id, metadata)
    values (auth.uid(), auth.jwt() ->> 'email', 'publish', 'school_announcements', p_id::text,
      jsonb_build_object('class_id', p_class_id, 'email_enabled', p_email_enabled, 'requires_acknowledgement', p_requires_acknowledgement));
  return p_id;
end;
$$;

create or replace function public.acknowledge_announcement(p_id uuid, p_family_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from public.portal_my_family_ids() f where f = p_family_id)
    or not exists (select 1 from public.school_announcements a where a.id = p_id and a.requires_acknowledgement)
    or not exists (select 1 from public.announcement_families f where f.announcement_id = p_id and f.family_id = p_family_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  update public.announcement_families
    set acknowledged_at = now(), acknowledged_by = auth.uid()
    where announcement_id = p_id and family_id = p_family_id and acknowledged_at is null;
end;
$$;

create or replace function public.announcement_family_status(p_id uuid)
returns table (family_id uuid, family_name text, acknowledged_at timestamptz, email_status text)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.announcement_can_manage(p_id) then raise exception 'Forbidden' using errcode = '42501'; end if;
  return query
    select f.family_id, f.family_name, f.acknowledged_at,
      case when not a.email_enabled then 'portal_only'
        when exists (select 1 from public.announcement_deliveries d where d.announcement_id = p_id and f.family_id = any(d.family_ids) and d.status = 'failed') then 'failed'
        when exists (select 1 from public.announcement_deliveries d where d.announcement_id = p_id and f.family_id = any(d.family_ids) and d.status in ('pending', 'sending')) then 'pending'
        when exists (select 1 from public.announcement_deliveries d where d.announcement_id = p_id and f.family_id = any(d.family_ids) and d.status = 'sent') then 'sent'
        else 'missing_email' end
    from public.announcement_families f
    join public.school_announcements a on a.id = f.announcement_id
    where f.announcement_id = p_id order by f.family_name;
end;
$$;

create or replace function public.retry_announcement_emails(p_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.announcement_can_manage(p_id) then raise exception 'Forbidden' using errcode = '42501'; end if;
  update public.announcement_deliveries set status = 'pending', error = null, batch_id = null
    where announcement_id = p_id and status = 'failed';
end;
$$;

create or replace function public.claim_announcement_emails(p_id uuid default null, p_limit integer default 25)
returns setof public.announcement_deliveries
language plpgsql security definer set search_path = public
as $$
declare
  v_batch uuid;
begin
  select batch_id into v_batch from public.announcement_deliveries
    where (p_id is null or announcement_id = p_id)
      and status = 'sending' and attempted_at < now() - interval '15 minutes'
    order by attempted_at, id limit 1 for update skip locked;
  if v_batch is not null then
    return query update public.announcement_deliveries
      set attempts = attempts + 1, attempted_at = statement_timestamp()
      where batch_id = v_batch and status = 'sending' and attempted_at < now() - interval '15 minutes'
      returning *;
    return;
  end if;
  v_batch := gen_random_uuid();
  return query
    with queued as (
      select id from public.announcement_deliveries
      where (p_id is null or announcement_id = p_id) and status = 'pending'
      order by attempted_at nulls first, id limit greatest(1, least(p_limit, 50)) for update skip locked
    )
    update public.announcement_deliveries d
      set status = 'sending', attempts = attempts + 1, attempted_at = statement_timestamp(), error = null, batch_id = v_batch
      from queued q where d.id = q.id returning d.*;
end;
$$;

create or replace function public.finish_announcement_email_batch(p_batch_id uuid, p_attempted_at timestamptz, p_failed_ids uuid[], p_error text default null)
returns void language sql security definer set search_path = public
as $$
  update public.announcement_deliveries
    set status = case when id = any(p_failed_ids) then 'failed' else 'sent' end,
      sent_at = case when id = any(p_failed_ids) then null else now() end,
      error = case when id = any(p_failed_ids) then coalesce(p_error, 'Email provider did not accept delivery') else null end
    where batch_id = p_batch_id and status = 'sending' and attempted_at = p_attempted_at;
$$;

alter table public.school_announcements enable row level security;
alter table public.announcement_families enable row level security;
alter table public.announcement_deliveries enable row level security;
revoke all on public.school_announcements, public.announcement_families, public.announcement_deliveries from public, anon, authenticated;
grant select on public.school_announcements, public.announcement_families to authenticated;
grant all on public.school_announcements, public.announcement_families, public.announcement_deliveries to service_role;

drop policy if exists "announcement recipients read" on public.school_announcements;
create policy "announcement recipients read" on public.school_announcements for select to authenticated using (
  public.announcement_can_manage(id) or exists (
    select 1 from public.announcement_families f where f.announcement_id = id and f.family_id in (select public.portal_my_family_ids())
  )
);
drop policy if exists "announcement families read" on public.announcement_families;
create policy "announcement families read" on public.announcement_families for select to authenticated using (
  public.announcement_can_manage(announcement_id) or family_id in (select public.portal_my_family_ids())
);

revoke all on function public.announcement_can_publish(uuid), public.announcement_can_manage(uuid), public.announcement_audience(uuid), public.publish_announcement(uuid, uuid, text, text, boolean, boolean), public.acknowledge_announcement(uuid, uuid), public.announcement_family_status(uuid), public.retry_announcement_emails(uuid), public.claim_announcement_emails(uuid, integer), public.announcement_target_families(uuid), public.announcement_target_emails(uuid) from public, anon, authenticated;
grant execute on function public.announcement_can_publish(uuid), public.announcement_can_manage(uuid), public.announcement_audience(uuid), public.publish_announcement(uuid, uuid, text, text, boolean, boolean), public.acknowledge_announcement(uuid, uuid), public.announcement_family_status(uuid), public.retry_announcement_emails(uuid) to authenticated;
grant execute on function public.claim_announcement_emails(uuid, integer) to service_role;
revoke all on function public.finish_announcement_email_batch(uuid, timestamptz, uuid[], text) from public, anon, authenticated;
grant execute on function public.finish_announcement_email_batch(uuid, timestamptz, uuid[], text) to service_role;
