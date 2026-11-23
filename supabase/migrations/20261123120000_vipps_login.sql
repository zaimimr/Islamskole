create table if not exists public.vipps_logins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  sub text not null unique,
  name text,
  given_name text,
  family_name text,
  phone text,
  email text,
  email_verified boolean not null default false,
  address jsonb,
  birthdate date,
  created_at timestamptz not null default now(),
  last_login_at timestamptz not null default now()
);

alter table public.vipps_logins enable row level security;
revoke all on public.vipps_logins from anon, authenticated;
grant select on public.vipps_logins to authenticated;
grant all on public.vipps_logins to service_role;
drop policy if exists "admin reads vipps logins" on public.vipps_logins;
create policy "admin reads vipps logins" on public.vipps_logins
  for select to authenticated using (public.is_admin());
drop policy if exists "user reads own vipps login" on public.vipps_logins;
create policy "user reads own vipps login" on public.vipps_logins
  for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.normalize_login_phone(p_phone text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
begin
  if v like '0047%' and length(v) = 12 then
    v := substr(v, 5);
  elsif v like '47%' and length(v) = 10 then
    v := substr(v, 3);
  end if;
  return nullif(v, '');
end;
$$;

create or replace function public.vipps_login_email_for_phone(p_phone text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_phone text := public.normalize_login_phone(p_phone);
  v_emails text[];
  v_email text;
begin
  if v_phone is null then return null; end if;

  select array_agg(distinct e) into v_emails
  from (
    select lower(btrim(g.email)) as e
    from public.guardians g
    where public.normalize_login_phone(g.phone) = v_phone
      and nullif(btrim(g.email), '') is not null
    union
    select lower(btrim(s.child_email))
    from public.students s
    where public.normalize_login_phone(s.child_phone) = v_phone
      and nullif(btrim(s.child_email), '') is not null
  ) matches;

  if coalesce(array_length(v_emails, 1), 0) <> 1 then return null; end if;
  v_email := v_emails[1];

  if exists (
    select 1 from public.guardians g
    where lower(btrim(g.email)) = v_email
      and public.normalize_login_phone(g.phone) is distinct from v_phone
  ) or exists (
    select 1 from public.students s
    where lower(btrim(s.child_email)) = v_email
      and public.normalize_login_phone(s.child_phone) is distinct from v_phone
  ) then
    return null;
  end if;

  return v_email;
end;
$$;

revoke all on function public.vipps_login_email_for_phone(text) from public, anon, authenticated;
grant execute on function public.vipps_login_email_for_phone(text) to service_role;
