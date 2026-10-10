alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('admin', 'member', 'developer'));

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'developer'));
$$;

create or replace function public.profiles_keep_last_admin()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if old.role in ('admin', 'developer') and (tg_op = 'DELETE' or new.role not in ('admin', 'developer')) then
    perform pg_advisory_xact_lock(hashtext('public.profiles_keep_last_admin'));
    if not exists (select 1 from public.profiles where role in ('admin', 'developer')) then
      raise exception 'Det må finnes minst én administrator.';
    end if;
  end if;
  return null;
end;
$$;

create or replace function public.profiles_protect_developer()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_op <> 'INSERT' and old.role = 'developer'
    and (tg_op = 'DELETE' or new.role <> 'developer' or new.id <> old.id) then
    raise exception 'Utviklertilgangen kan ikke endres her.' using errcode = '42501';
  end if;
  if tg_op <> 'DELETE' and new.role = 'developer' and not exists (
    select 1 from auth.users where id = new.id and lower(email) = 'zaim.imran@gmail.com'
      and email_confirmed_at is not null
  ) then
    raise exception 'Utviklertilgang er begrenset til utviklerkontoen.' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
revoke all on function public.profiles_protect_developer() from public, anon, authenticated;
create trigger profiles_protect_developer before insert or update or delete on public.profiles
  for each row execute function public.profiles_protect_developer();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
declare desired_role text;
begin
  desired_role := coalesce(new.raw_app_meta_data ->> 'role', 'member');
  if desired_role = 'developer' and (lower(new.email) <> 'zaim.imran@gmail.com' or new.email_confirmed_at is null) then
    desired_role := 'member';
  end if;
  if desired_role not in ('admin', 'member', 'developer') then desired_role := 'member'; end if;
  insert into public.profiles (id, full_name, role)
    values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''), desired_role)
    on conflict (id) do nothing;
  return new;
end;
$$;

update public.profiles set role = 'developer'
  where id in (select id from auth.users where lower(email) = 'zaim.imran@gmail.com' and email_confirmed_at is not null);
update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"developer"}'::jsonb
  where id in (select id from public.profiles where role = 'developer');

create or replace function public.developer_can_impersonate()
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles p join auth.users u on u.id = p.id
    join auth.sessions s on s.user_id = u.id
    where p.id = auth.uid() and p.role = 'developer'
      and lower(u.email) = 'zaim.imran@gmail.com' and u.email_confirmed_at is not null
      and (u.banned_until is null or u.banned_until <= now())
      and s.id::text = auth.jwt() ->> 'session_id'
      and (s.not_after is null or s.not_after > now())
  );
$$;
revoke all on function public.developer_can_impersonate() from public, anon;
grant execute on function public.developer_can_impersonate() to authenticated;

create table public.developer_impersonations (
  id uuid primary key default gen_random_uuid(),
  developer_id uuid not null references auth.users(id),
  developer_email text not null,
  developer_session_id uuid not null,
  target_id uuid not null references auth.users(id) on delete cascade,
  target_email text not null,
  target_session_id uuid not null unique,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '1 hour'),
  ended_at timestamptz,
  check (developer_id <> target_id),
  check (expires_at > started_at and expires_at <= started_at + interval '1 hour')
);
alter table public.developer_impersonations enable row level security;
revoke all on public.developer_impersonations from anon, authenticated;
grant select, insert, update, delete on public.developer_impersonations to service_role;

create or replace function public.audit_impersonation_actor()
returns trigger language plpgsql security definer set search_path = public
as $$
declare impersonation public.developer_impersonations;
begin
  select * into impersonation from public.developer_impersonations
    where target_session_id::text = auth.jwt() ->> 'session_id' and target_id = auth.uid();
  if found then
    new.actor_id := impersonation.developer_id;
    new.actor_email := impersonation.developer_email;
    new.metadata := coalesce(new.metadata, '{}'::jsonb) || jsonb_build_object(
      'impersonation_id', impersonation.id,
      'impersonated_user_id', impersonation.target_id,
      'impersonated_email', impersonation.target_email
    );
  end if;
  return new;
end;
$$;
revoke all on function public.audit_impersonation_actor() from public, anon, authenticated;
create trigger audit_impersonation_actor before insert on public.audit_log
  for each row execute function public.audit_impersonation_actor();
