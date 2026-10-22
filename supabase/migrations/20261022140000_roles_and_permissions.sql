create table if not exists public.roles (
  key text primary key,
  name text not null
);

create table if not exists public.permissions (
  key text primary key,
  name text not null
);

create table if not exists public.role_permissions (
  role_key text not null references public.roles(key) on delete cascade,
  permission_key text not null references public.permissions(key) on delete cascade,
  primary key (role_key, permission_key)
);

create table if not exists public.person_roles (
  guardian_id uuid not null references public.guardians(id) on delete cascade,
  role_key text not null references public.roles(key),
  granted_by text,
  granted_at timestamptz not null default now(),
  suspended_at timestamptz,
  suspended_reason text,
  suspended_by text,
  note text,
  primary key (guardian_id, role_key)
);
create index if not exists person_roles_role_idx on public.person_roles (role_key) where suspended_at is null;

insert into public.roles (key, name) values
  ('admin', 'Administrator'),
  ('sfo', 'SFO/Kantine'),
  ('teacher', 'Lærer'),
  ('volunteer', 'Frivillig')
on conflict (key) do update set name = excluded.name;

insert into public.permissions (key, name) values
  ('activities.sfo.manage', 'Lage og endre SFO-aktiviteter'),
  ('activities.sfo.roster', 'Deltakerliste med helseinfo'),
  ('activities.sfo.payments', 'Betalinger for SFO-aktiviteter'),
  ('activities.class.read', 'Se klasseaktiviteter')
on conflict (key) do update set name = excluded.name;

insert into public.role_permissions (role_key, permission_key) values
  ('sfo', 'activities.sfo.manage'),
  ('sfo', 'activities.sfo.roster'),
  ('sfo', 'activities.sfo.payments'),
  ('sfo', 'activities.class.read')
on conflict do nothing;

alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.person_roles enable row level security;

create or replace function public.my_guardian_ids()
returns setof uuid language sql stable security definer set search_path = public
as $$
  select g.id
  from public.guardians g
  join auth.users u on u.id = auth.uid()
  where nullif(btrim(u.email), '') is not null
    and nullif(btrim(g.email), '') is not null
    and lower(btrim(g.email)) = lower(btrim(u.email))
    and lower(btrim(g.email)) <> 'mangler@islamskole.no';
$$;

create or replace function public.guardian_has_role(p_guardian_id uuid, p_role text, p_include_suspended boolean default false)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.person_roles r
    where r.guardian_id = p_guardian_id
      and r.role_key = p_role
      and (p_include_suspended or r.suspended_at is null)
  );
$$;

create or replace function public.has_role(p_role text)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.person_roles r
    where r.guardian_id in (select public.my_guardian_ids())
      and r.role_key = p_role
      and r.suspended_at is null
  );
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$
  select public.has_role('admin')
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'developer');
$$;

create or replace function public.has_permission(p_permission text)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.is_admin() or exists (
    select 1
    from public.person_roles r
    join public.role_permissions rp on rp.role_key = r.role_key
    where r.guardian_id in (select public.my_guardian_ids())
      and r.suspended_at is null
      and rp.permission_key = p_permission
  );
$$;

create or replace function public.my_access()
returns jsonb language sql stable security definer set search_path = public
as $$
  with me as (select public.is_admin() as admin)
  select jsonb_build_object(
    'admin', me.admin,
    'roles', coalesce((
      select jsonb_agg(distinct r.role_key order by r.role_key)
      from public.person_roles r
      where r.guardian_id in (select public.my_guardian_ids()) and r.suspended_at is null
    ), '[]'::jsonb),
    'permissions', coalesce((
      select jsonb_agg(distinct p.key order by p.key)
      from public.permissions p
      where me.admin or exists (
        select 1
        from public.person_roles r
        join public.role_permissions rp on rp.role_key = r.role_key
        where r.guardian_id in (select public.my_guardian_ids())
          and r.suspended_at is null
          and rp.permission_key = p.key
      )
    ), '[]'::jsonb)
  )
  from me;
$$;

revoke all on function public.my_access() from public, anon;
grant execute on function public.my_access() to authenticated;

drop policy if exists "roles admin all" on public.roles;
create policy "roles admin all" on public.roles for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists "permissions admin all" on public.permissions;
create policy "permissions admin all" on public.permissions for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists "role_permissions admin all" on public.role_permissions;
create policy "role_permissions admin all" on public.role_permissions for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists "person_roles admin all" on public.person_roles;
create policy "person_roles admin all" on public.person_roles for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create or replace function public.ensure_guardian_for_email(p_email text, p_name text default null)
returns uuid language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  if nullif(btrim(p_email), '') is null then return null; end if;
  select id into v_id from public.guardians
    where nullif(btrim(email), '') is not null and lower(btrim(email)) = lower(btrim(p_email))
    order by created_at, id limit 1;
  if v_id is null then
    insert into public.guardians (first_name, email)
      values (nullif(btrim(coalesce(p_name, '')), ''), lower(btrim(p_email)))
      returning id into v_id;
  end if;
  return v_id;
end;
$$;
revoke all on function public.ensure_guardian_for_email(text, text) from public, anon, authenticated;

insert into public.person_roles (guardian_id, role_key, granted_by, granted_at)
select public.ensure_guardian_for_email(u.email, p.full_name), 'admin', 'migrering', p.created_at
from public.profiles p
join auth.users u on u.id = p.id
where p.role in ('admin', 'developer') and nullif(btrim(u.email), '') is not null
on conflict (guardian_id, role_key) do nothing;

insert into public.person_roles (guardian_id, role_key, granted_by, granted_at, suspended_at, suspended_reason, suspended_by, note)
select g.id, 'teacher', 'migrering', g.created_at, g.teacher_suspended_at, g.teacher_suspended_reason, g.teacher_suspended_by, g.teacher_note
from public.guardians g
where g.is_teacher
on conflict (guardian_id, role_key) do nothing;

insert into public.person_roles (guardian_id, role_key, granted_by, granted_at)
select g.id, 'volunteer', 'migrering', g.created_at
from public.guardians g
where g.is_volunteer
on conflict (guardian_id, role_key) do nothing;

create or replace function public.person_roles_keep_last_admin()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if old.role_key = 'admin' and old.suspended_at is null
    and (tg_op = 'DELETE' or new.role_key <> 'admin' or new.suspended_at is not null) then
    perform pg_advisory_xact_lock(hashtext('public.person_roles_keep_last_admin'));
    if not exists (select 1 from public.person_roles where role_key = 'admin' and suspended_at is null) then
      raise exception 'Det må finnes minst én administrator.';
    end if;
  end if;
  return null;
end;
$$;
revoke all on function public.person_roles_keep_last_admin() from public, anon, authenticated;
drop trigger if exists person_roles_keep_last_admin on public.person_roles;
create trigger person_roles_keep_last_admin after update or delete on public.person_roles
  for each row execute function public.person_roles_keep_last_admin();

create or replace function public.person_roles_audit()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_row public.person_roles;
  v_action text;
begin
  v_row := case when tg_op = 'DELETE' then old else new end;
  v_action := case
    when tg_op = 'INSERT' then 'role.granted'
    when tg_op = 'DELETE' then 'role.removed'
    when old.suspended_at is null and new.suspended_at is not null then 'role.suspended'
    when old.suspended_at is not null and new.suspended_at is null then 'role.reactivated'
    else 'role.updated'
  end;
  if tg_op = 'UPDATE' and old is not distinct from new then return null; end if;
  insert into public.audit_log (actor_id, actor_email, action, entity_type, entity_id, metadata)
  values (
    auth.uid(),
    nullif(auth.jwt() ->> 'email', ''),
    v_action,
    'person_role',
    v_row.guardian_id::text,
    jsonb_build_object('guardian_id', v_row.guardian_id, 'role', v_row.role_key)
      || case when v_row.suspended_reason is not null then jsonb_build_object('reason', v_row.suspended_reason) else '{}'::jsonb end
  );
  return null;
end;
$$;
revoke all on function public.person_roles_audit() from public, anon, authenticated;
drop trigger if exists person_roles_audit on public.person_roles;
create trigger person_roles_audit after insert or update or delete on public.person_roles
  for each row execute function public.person_roles_audit();

create or replace function public.person_roles_drop_class_links()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if old.role_key = 'teacher' then
    delete from public.class_teachers where guardian_id = old.guardian_id;
  end if;
  return null;
end;
$$;
revoke all on function public.person_roles_drop_class_links() from public, anon, authenticated;
drop trigger if exists person_roles_drop_class_links on public.person_roles;
create trigger person_roles_drop_class_links after delete on public.person_roles
  for each row execute function public.person_roles_drop_class_links();

create or replace function public.guardians_sync_person_roles()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.is_teacher then
    insert into public.person_roles (guardian_id, role_key, granted_by, suspended_at, suspended_reason, suspended_by, note)
    values (new.id, 'teacher', nullif(auth.jwt() ->> 'email', ''), new.teacher_suspended_at, new.teacher_suspended_reason, new.teacher_suspended_by, new.teacher_note)
    on conflict (guardian_id, role_key) do update
      set suspended_at = excluded.suspended_at,
          suspended_reason = excluded.suspended_reason,
          suspended_by = excluded.suspended_by,
          note = excluded.note
      where (person_roles.suspended_at, person_roles.suspended_reason, person_roles.suspended_by, person_roles.note)
        is distinct from (excluded.suspended_at, excluded.suspended_reason, excluded.suspended_by, excluded.note);
  else
    delete from public.person_roles where guardian_id = new.id and role_key = 'teacher';
  end if;
  if new.is_volunteer then
    insert into public.person_roles (guardian_id, role_key, granted_by)
    values (new.id, 'volunteer', nullif(auth.jwt() ->> 'email', ''))
    on conflict (guardian_id, role_key) do nothing;
  else
    delete from public.person_roles where guardian_id = new.id and role_key = 'volunteer';
  end if;
  return null;
end;
$$;
revoke all on function public.guardians_sync_person_roles() from public, anon, authenticated;
drop trigger if exists guardians_sync_person_roles on public.guardians;
create trigger guardians_sync_person_roles
  after insert or update of is_teacher, is_volunteer, teacher_suspended_at, teacher_suspended_reason, teacher_suspended_by, teacher_note
  on public.guardians
  for each row execute function public.guardians_sync_person_roles();

create or replace function public.person_roles_sync_guardians()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_guardian uuid;
  v_role text;
  v_row public.person_roles;
begin
  v_guardian := case when tg_op = 'DELETE' then old.guardian_id else new.guardian_id end;
  v_role := case when tg_op = 'DELETE' then old.role_key else new.role_key end;
  if v_role = 'teacher' then
    select * into v_row from public.person_roles where guardian_id = v_guardian and role_key = 'teacher';
    update public.guardians g
    set is_teacher = v_row.guardian_id is not null,
        teacher_suspended_at = v_row.suspended_at,
        teacher_suspended_reason = v_row.suspended_reason,
        teacher_suspended_by = v_row.suspended_by,
        teacher_note = case when v_row.guardian_id is null then g.teacher_note else v_row.note end
    where g.id = v_guardian
      and (g.is_teacher, g.teacher_suspended_at, g.teacher_suspended_reason, g.teacher_suspended_by,
           case when v_row.guardian_id is null then g.teacher_note else g.teacher_note end)
        is distinct from (v_row.guardian_id is not null, v_row.suspended_at, v_row.suspended_reason, v_row.suspended_by,
           case when v_row.guardian_id is null then g.teacher_note else v_row.note end);
  elsif v_role = 'volunteer' then
    update public.guardians g
    set is_volunteer = exists (select 1 from public.person_roles where guardian_id = v_guardian and role_key = 'volunteer')
    where g.id = v_guardian
      and g.is_volunteer is distinct from exists (select 1 from public.person_roles where guardian_id = v_guardian and role_key = 'volunteer');
  end if;
  return null;
end;
$$;
revoke all on function public.person_roles_sync_guardians() from public, anon, authenticated;
drop trigger if exists person_roles_sync_guardians on public.person_roles;
create trigger person_roles_sync_guardians after insert or update or delete on public.person_roles
  for each row execute function public.person_roles_sync_guardians();

create or replace function public.profiles_sync_admin_role()
returns trigger language plpgsql security definer set search_path = public
as $$
declare v_email text;
begin
  if tg_op = 'DELETE' then
    select email into v_email from auth.users where id = old.id;
    if old.role in ('admin', 'developer') and v_email is not null then
      delete from public.person_roles
      where role_key = 'admin'
        and guardian_id in (
          select id from public.guardians
          where nullif(btrim(email), '') is not null and lower(btrim(email)) = lower(btrim(v_email))
        );
    end if;
    return null;
  end if;
  select email into v_email from auth.users where id = new.id;
  if v_email is null then return null; end if;
  if new.role in ('admin', 'developer') and (tg_op = 'INSERT' or old.role not in ('admin', 'developer')) then
    insert into public.person_roles (guardian_id, role_key, granted_by)
    values (public.ensure_guardian_for_email(v_email, new.full_name), 'admin', nullif(auth.jwt() ->> 'email', ''))
    on conflict (guardian_id, role_key) do update set suspended_at = null, suspended_reason = null, suspended_by = null;
  elsif tg_op = 'UPDATE' and old.role in ('admin', 'developer') and new.role not in ('admin', 'developer') then
    delete from public.person_roles
    where role_key = 'admin'
      and guardian_id in (
        select id from public.guardians
        where nullif(btrim(email), '') is not null and lower(btrim(email)) = lower(btrim(v_email))
      );
  end if;
  return null;
end;
$$;
revoke all on function public.profiles_sync_admin_role() from public, anon, authenticated;
drop trigger if exists profiles_sync_admin_role on public.profiles;
create trigger profiles_sync_admin_role after insert or update of role or delete on public.profiles
  for each row execute function public.profiles_sync_admin_role();

CREATE OR REPLACE FUNCTION public.admin_merge_families(p_keep uuid, p_merge uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_pair record;
  v_actor uuid;
begin
  if not public.is_admin() then
    raise exception 'Du har ikke tilgang til å gjøre dette.' using errcode = '42501';
  end if;

  if p_keep is null or p_merge is null or p_keep = p_merge then
    raise exception 'Velg to ulike familier.';
  end if;

  if (select count(*) from public.families where id in (p_keep, p_merge)) <> 2 then
    raise exception 'Fant ikke familien.';
  end if;

  perform 1 from public.families where id in (p_keep, p_merge) for update;

  if exists (
    select 1
    from public.payment_plans k
    join public.payment_plans m on m.school_year_id = k.school_year_id
    where k.family_id = p_keep
      and m.family_id = p_merge
      and k.status = 'aktiv'
      and m.status = 'aktiv'
  ) then
    raise exception 'Begge familiene har en aktiv betalingsplan for samme skoleår. Avslutt en av dem først.';
  end if;

  select id into v_actor from public.profiles where id = auth.uid();

  for v_pair in
    select distinct on (m.id) m.id as old_id, k.id as new_id
    from public.family_guardians mfg
    join public.guardians m on m.id = mfg.guardian_id
    join public.family_guardians kfg on kfg.family_id = p_keep
    join public.guardians k on k.id = kfg.guardian_id
    where mfg.family_id = p_merge
      and m.id <> k.id
      and nullif(btrim(m.email), '') is not null
      and lower(btrim(m.email)) <> 'mangler@islamskole.no'
      and lower(btrim(m.email)) = lower(btrim(k.email))
    order by m.id, k.created_at, k.id
  loop
    delete from public.family_guardians o
    where o.guardian_id = v_pair.old_id
      and exists (
        select 1 from public.family_guardians n
        where n.family_id = o.family_id
          and n.guardian_id = v_pair.new_id
      );

    update public.family_guardians
    set guardian_id = v_pair.new_id
    where guardian_id = v_pair.old_id;

    delete from public.class_teachers o
    where o.guardian_id = v_pair.old_id
      and exists (
        select 1 from public.class_teachers n
        where n.guardian_id = v_pair.new_id
          and n.class_id = o.class_id
          and n.school_year_id = o.school_year_id
      );

    update public.class_teachers set guardian_id = v_pair.new_id where guardian_id = v_pair.old_id;
    update public.student_fee_adjustments set teacher_guardian_id = v_pair.new_id where teacher_guardian_id = v_pair.old_id;
    update public.class_notes set author_guardian_id = v_pair.new_id where author_guardian_id = v_pair.old_id;
    update public.absence_reports set reported_by_guardian_id = v_pair.new_id where reported_by_guardian_id = v_pair.old_id;

    insert into public.person_roles (guardian_id, role_key, granted_by, granted_at, suspended_at, suspended_reason, suspended_by, note)
    select v_pair.new_id, r.role_key, r.granted_by, r.granted_at, r.suspended_at, r.suspended_reason, r.suspended_by, r.note
    from public.person_roles r
    where r.guardian_id = v_pair.old_id
    on conflict (guardian_id, role_key) do nothing;

    update public.guardians g
    set first_name = coalesce(nullif(btrim(g.first_name), ''), o.first_name),
        last_name = coalesce(nullif(btrim(g.last_name), ''), o.last_name),
        phone = coalesce(nullif(btrim(g.phone), ''), o.phone),
        teacher_note = coalesce(nullif(btrim(g.teacher_note), ''), o.teacher_note),
        source_application_id = coalesce(g.source_application_id, o.source_application_id),
        is_teacher = g.is_teacher or o.is_teacher,
        is_volunteer = g.is_volunteer or o.is_volunteer
    from public.guardians o
    where g.id = v_pair.new_id
      and o.id = v_pair.old_id;

    delete from public.guardians where id = v_pair.old_id;
  end loop;

  insert into public.family_guardians (
    family_id,
    guardian_id,
    relationship_label,
    is_primary_contact,
    is_billing_contact,
    receives_communication,
    sort_order
  )
  select p_keep, guardian_id, relationship_label, false, false, receives_communication, sort_order
  from public.family_guardians
  where family_id = p_merge
  on conflict (family_id, guardian_id) do nothing;

  delete from public.student_guardians where family_id = p_merge;

  update public.students set family_id = p_keep where family_id = p_merge;

  delete from public.family_guardians where family_id = p_merge;

  update public.payment_plans set family_id = p_keep where family_id = p_merge;
  update public.student_applications set family_id = p_keep where family_id = p_merge;
  update public.school_email_deliveries set family_id = p_keep where family_id = p_merge;
  update public.sadaqa_gifts set family_id = p_keep where family_id = p_merge;

  delete from public.sibling_discount_dismissals m
  where m.family_id = p_merge
    and exists (
      select 1 from public.sibling_discount_dismissals k
      where k.family_id = p_keep
        and k.school_year_id = m.school_year_id
    );

  update public.sibling_discount_dismissals set family_id = p_keep where family_id = p_merge;

  update public.family_data_reviews
  set status = 'resolved',
      resolved_at = now(),
      resolved_by = v_actor,
      updated_at = now()
  where status = 'open'
    and category = 'possible_duplicate_family'
    and (
      (family_id = p_keep and coalesce(details -> 'candidateFamilyIds', '[]'::jsonb) ? p_merge::text)
      or (family_id = p_merge and coalesce(details -> 'candidateFamilyIds', '[]'::jsonb) ? p_keep::text)
    );

  update public.family_data_reviews m
  set status = 'dismissed',
      resolved_at = now(),
      resolved_by = v_actor,
      updated_at = now()
  where m.family_id = p_merge
    and m.status = 'open'
    and exists (
      select 1 from public.family_data_reviews k
      where k.family_id = p_keep
        and k.status = 'open'
        and k.category = m.category
        and coalesce(k.source_entity, '') = coalesce(m.source_entity, '')
        and coalesce(k.source_entity_id, '00000000-0000-0000-0000-000000000000'::uuid)
          = coalesce(m.source_entity_id, '00000000-0000-0000-0000-000000000000'::uuid)
    );

  update public.family_data_reviews set family_id = p_keep where family_id = p_merge;

  delete from public.families where id = p_merge;
end;
$function$

;

CREATE OR REPLACE FUNCTION public.admin_remove_guardian_from_family(p_family_id uuid, p_guardian_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_was_primary boolean;
begin
  if not public.is_admin() then
    raise exception 'Du har ikke tilgang til å gjøre dette.' using errcode = '42501';
  end if;

  select is_primary_contact into v_was_primary
  from public.family_guardians
  where family_id = p_family_id
    and guardian_id = p_guardian_id
  for update;

  if not found then
    raise exception 'Den foresatte er ikke knyttet til familien.';
  end if;

  if not exists (
    select 1 from public.family_guardians
    where family_id = p_family_id
      and guardian_id <> p_guardian_id
  ) then
    raise exception 'Familien må ha minst én foresatt.';
  end if;

  delete from public.student_guardians
  where family_id = p_family_id
    and guardian_id = p_guardian_id;

  delete from public.family_guardians
  where family_id = p_family_id
    and guardian_id = p_guardian_id;

  if v_was_primary then
    update public.family_guardians
    set is_primary_contact = true
    where family_id = p_family_id
      and guardian_id = (
        select guardian_id from public.family_guardians
        where family_id = p_family_id
        order by sort_order, created_at, guardian_id
        limit 1
      );
  end if;

  if exists (select 1 from public.family_guardians where guardian_id = p_guardian_id)
    or exists (select 1 from public.person_roles where guardian_id = p_guardian_id) then
    return 'unlinked';
  end if;

  delete from public.guardians where id = p_guardian_id;
  return 'deleted';
end;
$function$

;

CREATE OR REPLACE FUNCTION public.admin_save_class_slot_plans(p_class_id uuid, p_school_year_id uuid, p_plans jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_count integer;
  v_slots integer;
begin
  if not public.is_admin() then
    raise exception 'Du har ikke tilgang til å gjøre dette.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.classes where id = p_class_id)
    or not exists (select 1 from public.school_years where id = p_school_year_id) then
    raise exception 'Fant ikke klassen eller skoleåret.' using errcode = 'P0001';
  end if;

  if jsonb_typeof(p_plans) <> 'array' then
    raise exception 'Ugyldig timeplan.' using errcode = 'P0001';
  end if;

  select coalesce(max(position), 0) into v_slots
  from public.school_time_slots
  where school_year_id = p_school_year_id;

  if exists (
    select 1
    from jsonb_to_recordset(p_plans) as x(start_position integer, end_position integer, subject text, teacher_guardian_id uuid, co_teacher_guardian_id uuid)
    where x.start_position is null
      or x.end_position is null
      or x.start_position < 1
      or x.end_position < x.start_position
      or x.end_position > v_slots
  ) then
    raise exception 'Timene må ligge innenfor skoledagens timer.' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_plans) as x(start_position integer, end_position integer, subject text, teacher_guardian_id uuid, co_teacher_guardian_id uuid)
    cross join lateral (values (x.teacher_guardian_id), (x.co_teacher_guardian_id)) as t(guardian_id)
    where t.guardian_id is not null
      and not exists (
        select 1 from public.guardians g where g.id = t.guardian_id and public.guardian_has_role(g.id, 'teacher', true)
      )
  ) then
    raise exception 'Personen er ikke registrert som lærer.' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_plans) as x(start_position integer, end_position integer, subject text, teacher_guardian_id uuid, co_teacher_guardian_id uuid)
    where x.co_teacher_guardian_id = x.teacher_guardian_id
  ) then
    raise exception 'Medlæreren kan ikke være den samme som læreren.' using errcode = 'P0001';
  end if;

  delete from public.class_slot_plans
  where class_id = p_class_id
    and school_year_id = p_school_year_id;

  insert into public.class_slot_plans (class_id, school_year_id, start_position, end_position, subject, teacher_guardian_id, co_teacher_guardian_id)
  select p_class_id, p_school_year_id, x.start_position, x.end_position, nullif(btrim(x.subject), ''), x.teacher_guardian_id, x.co_teacher_guardian_id
  from jsonb_to_recordset(p_plans) as x(start_position integer, end_position integer, subject text, teacher_guardian_id uuid, co_teacher_guardian_id uuid)
  order by x.start_position;

  get diagnostics v_count = row_count;

  insert into public.class_teachers (class_id, guardian_id, school_year_id)
  select distinct p_class_id, t.guardian_id, p_school_year_id
  from public.class_slot_plans p
  cross join lateral (values (p.teacher_guardian_id), (p.co_teacher_guardian_id)) as t(guardian_id)
  where p.class_id = p_class_id
    and p.school_year_id = p_school_year_id
    and t.guardian_id is not null
  on conflict (class_id, guardian_id, school_year_id) do nothing;

  perform public.reconcile_lessons(p_school_year_id, p_class_id);
  return v_count;
end;
$function$

;

CREATE OR REPLACE FUNCTION public.admin_update_lesson(p_lesson_id uuid, p_subject text, p_teacher_guardian_id uuid, p_cancelled boolean, p_note text, p_co_teacher_guardian_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_lesson record;
  v_default uuid;
begin
  if not public.is_admin() then
    raise exception 'Du har ikke tilgang til å gjøre dette.' using errcode = '42501';
  end if;

  select l.*, d.school_year_id into v_lesson
  from public.lessons l
  join public.school_days d on d.id = l.school_day_id
  where l.id = p_lesson_id
  for update of l;

  if not found then
    raise exception 'Fant ikke timen.' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from (values (p_teacher_guardian_id), (p_co_teacher_guardian_id)) as t(guardian_id)
    where t.guardian_id is not null
      and not exists (select 1 from public.guardians g where g.id = t.guardian_id and public.guardian_has_role(g.id, 'teacher', true))
  ) then
    raise exception 'Personen er ikke registrert som lærer.' using errcode = 'P0001';
  end if;

  if p_co_teacher_guardian_id = p_teacher_guardian_id then
    raise exception 'Medlæreren kan ikke være den samme som læreren.' using errcode = 'P0001';
  end if;

  select p.teacher_guardian_id into v_default
  from public.class_slot_plans p
  where p.id = v_lesson.plan_id;

  update public.lessons
  set subject = nullif(btrim(p_subject), ''),
      teacher_guardian_id = p_teacher_guardian_id,
      co_teacher_guardian_id = p_co_teacher_guardian_id,
      cancelled = coalesce(p_cancelled, false),
      note = nullif(btrim(p_note), ''),
      is_override = true,
      is_substitute = p_teacher_guardian_id is not null
        and p_teacher_guardian_id is distinct from v_default
        and (
          v_default is not null
          or not exists (
            select 1 from public.class_teachers ct
            where ct.class_id = v_lesson.class_id
              and ct.school_year_id = v_lesson.school_year_id
              and ct.guardian_id = p_teacher_guardian_id
          )
        )
  where id = p_lesson_id;

  if coalesce(p_cancelled, false) then
    delete from public.attendance
    where lesson_id = p_lesson_id
      and status = 'meldt_fravaer';
  else
    perform public.lesson_apply_absences(p_lesson_id);
  end if;
end;
$function$

;

CREATE OR REPLACE FUNCTION public.portal_can_edit_week_plan(p_class_id uuid, p_school_year_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.school_years sy where sy.id = p_school_year_id and sy.is_active
  )
  and (
    public.portal_is_teacher_of(p_class_id)
    or exists (
      select 1
      from public.class_slot_plans p
      join public.guardians g on g.id in (p.teacher_guardian_id, p.co_teacher_guardian_id)
      where p.class_id = p_class_id
        and p.school_year_id = p_school_year_id
        and public.guardian_has_role(g.id, 'teacher')
        and g.id in (select public.portal_guardian_ids())
    )
  );
$function$

;

CREATE OR REPLACE FUNCTION public.portal_is_substitute_of(p_class_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.class_substitutes cs
    join public.guardians g on g.id = cs.guardian_id and public.guardian_has_role(g.id, 'teacher')
    join public.school_years sy on sy.id = cs.school_year_id and sy.is_active
    where cs.class_id = p_class_id
      and cs.until >= (now() at time zone 'Europe/Oslo')::date
      and cs.guardian_id in (select public.portal_guardian_ids())
  );
$function$

;

CREATE OR REPLACE FUNCTION public.portal_is_teacher_of(p_class_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.class_teachers ct
    join public.guardians g on g.id = ct.guardian_id
    join public.school_years sy on sy.id = ct.school_year_id
    where ct.class_id = p_class_id
      and sy.is_active
      and public.guardian_has_role(g.id, 'teacher')
      and ct.guardian_id in (select public.portal_guardian_ids())
  )
  or public.portal_is_substitute_of(p_class_id);
$function$

;

CREATE OR REPLACE FUNCTION public.portal_my_children()
 RETURNS TABLE(student_id uuid, first_name text, last_name text, birth_date date, class_id uuid, class_name_no text, class_name_en text, school_year_id uuid, school_year_label text, teachers jsonb, remaining_ore bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    s.id,
    s.child_first_name,
    s.child_last_name,
    s.child_birth_date,
    c.id,
    c.name_no,
    c.name_en,
    sy.id,
    sy.label,
    coalesce((
      select jsonb_agg(jsonb_build_object('first_name', g.first_name, 'last_name', g.last_name) order by g.first_name, g.last_name)
      from public.class_teachers ct
      join public.guardians g on g.id = ct.guardian_id
      where ct.class_id = c.id
        and ct.school_year_id = sy.id
        and public.guardian_has_role(g.id, 'teacher', true)
    ), '[]'::jsonb),
    (
      select b.remaining::bigint
      from public.student_balances b
      where b.student_id = s.id
        and b.school_year_id = sy.id
    )
  from public.students s
  join public.enrollments e on e.student_id = s.id and e.status = 'aktiv'
  join public.school_years sy on sy.id = e.school_year_id and sy.is_active
  join public.classes c on c.id = e.class_id
  where exists (
    select 1
    from public.student_guardians sg
    where sg.student_id = s.id
      and sg.guardian_id in (select public.portal_guardian_ids())
  )
  order by s.child_birth_date nulls last, s.child_first_name;
$function$

;

CREATE OR REPLACE FUNCTION public.portal_my_classes()
 RETURNS TABLE(class_id uuid, name_no text, name_en text, school_year_id uuid, school_year_label text, role text, student_count integer, substitute_until date)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    c.id,
    c.name_no,
    c.name_en,
    sy.id,
    sy.label,
    coalesce(
      (
        select min(ct.role)
        from public.class_teachers ct
        join public.guardians g on g.id = ct.guardian_id and public.guardian_has_role(g.id, 'teacher', true)
        where ct.class_id = c.id
          and ct.school_year_id = sy.id
          and ct.guardian_id in (select public.portal_guardian_ids())
      ),
      'vikar'
    ),
    (
      select count(*)::integer
      from public.enrollments e
      where e.class_id = c.id
        and e.school_year_id = sy.id
        and e.status = 'aktiv'
    ),
    (
      select max(cs.until)
      from public.class_substitutes cs
      where cs.class_id = c.id
        and cs.school_year_id = sy.id
        and cs.guardian_id in (select public.portal_guardian_ids())
        and cs.until >= (now() at time zone 'Europe/Oslo')::date
    )
  from public.classes c
  cross join public.school_years sy
  where sy.is_active
    and public.portal_is_teacher_of(c.id)
  order by c.sort_order, c.name_no;
$function$

;

CREATE OR REPLACE FUNCTION public.portal_my_self()
 RETURNS TABLE(student_id uuid, first_name text, last_name text, birth_date date, class_id uuid, class_name_no text, class_name_en text, school_year_id uuid, school_year_label text, teachers jsonb, notes jsonb, attendance jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    s.id,
    s.child_first_name,
    s.child_last_name,
    s.child_birth_date,
    c.id,
    c.name_no,
    c.name_en,
    sy.id,
    sy.label,
    coalesce((
      select jsonb_agg(jsonb_build_object('first_name', g.first_name, 'last_name', g.last_name) order by g.first_name, g.last_name)
      from public.class_teachers ct
      join public.guardians g on g.id = ct.guardian_id
      where ct.class_id = c.id
        and ct.school_year_id = sy.id
        and public.guardian_has_role(g.id, 'teacher', true)
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', n.id,
        'date', d.date,
        'homework', n.homework,
        'summary', n.summary,
        'lesson_id', n.lesson_id,
        'subject', l.subject,
        'start_position', l.start_position,
        'end_position', l.end_position
      ) order by d.date desc, l.start_position)
      from public.class_notes n
      join public.school_days d on d.id = n.school_day_id
      left join public.lessons l on l.id = n.lesson_id
      where n.class_id = c.id
        and d.school_year_id = sy.id
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'date', d.date,
        'status', a.status,
        'lesson_id', a.lesson_id,
        'start_position', l.start_position
      ) order by d.date desc, l.start_position)
      from public.attendance a
      join public.school_days d on d.id = a.school_day_id
      join public.school_years y on y.id = d.school_year_id and y.is_active
      left join public.lessons l on l.id = a.lesson_id
      where a.student_id = s.id
    ), '[]'::jsonb)
  from public.students s
  left join public.enrollments e
    on e.student_id = s.id
   and e.status = 'aktiv'
   and e.school_year_id in (select id from public.school_years where is_active)
  left join public.classes c on c.id = e.class_id
  left join public.school_years sy on sy.id = e.school_year_id
  where s.id in (select public.portal_student_ids())
  order by s.child_birth_date nulls last, s.child_first_name, c.sort_order;
$function$

;

CREATE OR REPLACE FUNCTION public.portal_remove_guardian(p_family_id uuid, p_guardian_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_link public.family_guardians%rowtype;
  v_guardian public.guardians%rowtype;
  v_result text;
begin
  if p_family_id is null or p_family_id not in (select public.portal_my_family_ids()) then
    raise exception 'Du har ikke tilgang til å gjøre dette.' using errcode = '42501';
  end if;
  if p_guardian_id in (select public.portal_guardian_ids()) then
    raise exception 'Du kan ikke fjerne deg selv.' using errcode = '22023';
  end if;

  select * into v_link
  from public.family_guardians
  where family_id = p_family_id and guardian_id = p_guardian_id
  for update;

  if not found then
    raise exception 'Du har ikke tilgang til å gjøre dette.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.family_guardians
    where family_id = p_family_id and guardian_id <> p_guardian_id
  ) then
    raise exception 'Familien må ha minst én foresatt.' using errcode = '22023';
  end if;

  select * into v_guardian from public.guardians where id = p_guardian_id for update;

  delete from public.student_guardians
  where family_id = p_family_id and guardian_id = p_guardian_id;

  delete from public.family_guardians
  where family_id = p_family_id and guardian_id = p_guardian_id;

  if v_link.is_primary_contact then
    update public.family_guardians
    set is_primary_contact = true
    where family_id = p_family_id
      and guardian_id = (
        select guardian_id from public.family_guardians
        where family_id = p_family_id
        order by sort_order, created_at, guardian_id
        limit 1
      );
  end if;

  if v_link.is_billing_contact then
    update public.family_guardians
    set is_billing_contact = true
    where family_id = p_family_id
      and guardian_id = (
        select guardian_id from public.family_guardians
        where family_id = p_family_id
        order by is_primary_contact desc, sort_order, created_at, guardian_id
        limit 1
      );
  end if;

  if not exists (
    select 1 from public.family_guardians where family_id = p_family_id and receives_communication
  ) then
    update public.family_guardians
    set receives_communication = true
    where family_id = p_family_id;
  end if;

  perform public.portal_sync_family_contacts(p_family_id);

  if exists (select 1 from public.family_guardians where guardian_id = p_guardian_id)
    or exists (select 1 from public.person_roles where guardian_id = p_guardian_id) then
    v_result := 'unlinked';
  else
    delete from public.guardians where id = p_guardian_id;
    v_result := 'deleted';
  end if;

  perform public.portal_log_change(
    'portal.guardian.remove', 'guardian', p_guardian_id, p_family_id,
    jsonb_build_object(
      'result', v_result,
      'removed', jsonb_build_object(
        'first_name', v_guardian.first_name,
        'last_name', v_guardian.last_name,
        'email', v_guardian.email,
        'phone', v_guardian.phone,
        'relationship_label', v_link.relationship_label
      )
    )
  );

  return v_result;
end;
$function$

;

CREATE OR REPLACE FUNCTION public.portal_start_substitute(p_class_id uuid)
 RETURNS date
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_guardian uuid;
  v_year uuid;
  v_until date := (now() at time zone 'Europe/Oslo')::date + 7;
begin
  select g.id into v_guardian
  from public.guardians g
  where g.id in (select public.portal_guardian_ids())
    and public.guardian_has_role(g.id, 'teacher')
  order by g.created_at
  limit 1;

  if v_guardian is null then
    raise exception 'Bare lærere kan være vikar.' using errcode = '42501';
  end if;

  select sy.id into v_year from public.school_years sy where sy.is_active;
  if v_year is null or not exists (select 1 from public.classes c where c.id = p_class_id) then
    raise exception 'Fant ikke klassen.' using errcode = 'P0001';
  end if;

  insert into public.class_substitutes (class_id, guardian_id, school_year_id, until)
  values (p_class_id, v_guardian, v_year, v_until)
  on conflict (class_id, guardian_id, school_year_id)
  do update set until = excluded.until, created_at = now();

  return v_until;
end;
$function$

;

CREATE OR REPLACE FUNCTION public.portal_substitute_options()
 RETURNS TABLE(class_id uuid, name_no text, name_en text, student_count integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    c.id,
    c.name_no,
    c.name_en,
    count(e.student_id)::integer
  from public.classes c
  join public.school_years sy on sy.is_active
  left join public.enrollments e
    on e.class_id = c.id and e.school_year_id = sy.id and e.status = 'aktiv'
  where exists (
      select 1 from public.guardians g
      where g.id in (select public.portal_guardian_ids())
        and public.guardian_has_role(g.id, 'teacher')
    )
    and not public.portal_is_teacher_of(c.id)
    and (c.published or e.student_id is not null)
  group by c.id
  order by c.sort_order, c.name_no;
$function$

;

CREATE OR REPLACE FUNCTION public.portal_teacher_guardian_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select g.id
  from public.guardians g
  where g.id in (select public.portal_guardian_ids())
    and public.guardian_has_role(g.id, 'teacher', true)
  order by g.created_at
  limit 1;
$function$

;

CREATE OR REPLACE FUNCTION public.portal_teaches_lesson(p_lesson_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.lessons l
    join public.school_days d on d.id = l.school_day_id
    join public.school_years sy on sy.id = d.school_year_id and sy.is_active
    where l.id = p_lesson_id
      and (
        exists (
          select 1
          from public.guardians g
          where g.id in (l.teacher_guardian_id, l.co_teacher_guardian_id)
            and public.guardian_has_role(g.id, 'teacher')
            and g.id in (select public.portal_guardian_ids())
        )
        or public.portal_is_teacher_of(l.class_id)
      )
  );
$function$

;

CREATE OR REPLACE FUNCTION public.set_active_school_year(p_school_year_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_previous uuid;
begin
  if not public.is_admin() then
    raise exception 'Du har ikke tilgang til å gjøre dette.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.school_years where id = p_school_year_id) then
    raise exception 'Fant ikke skoleåret.' using errcode = 'P0001';
  end if;

  select id into v_previous
  from public.school_years
  where is_active
    and id <> p_school_year_id;

  update public.school_years
  set is_active = false
  where is_active
    and id <> p_school_year_id;

  update public.school_years
  set is_active = true
  where id = p_school_year_id
    and not is_active;

  if v_previous is not null then
    insert into public.class_teachers (class_id, guardian_id, school_year_id, role)
    select ct.class_id, ct.guardian_id, p_school_year_id, ct.role
    from public.class_teachers ct
    join public.guardians g on g.id = ct.guardian_id and public.guardian_has_role(g.id, 'teacher', true)
    where ct.school_year_id = v_previous
    on conflict (class_id, guardian_id, school_year_id) do nothing;
  end if;
end;
$function$

;

CREATE OR REPLACE FUNCTION public.sunday_class_staff(p_class_id uuid, p_year uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select auth.uid() is not null and exists(select 1 from public.school_years where id = p_year and is_active)
    and (public.is_admin() or public.portal_can_edit_week_plan(p_class_id, p_year) or exists(
      select 1 from public.lessons l join public.school_days d on d.id = l.school_day_id and d.school_year_id = p_year
      join public.guardians g on g.id in(l.teacher_guardian_id,l.co_teacher_guardian_id)
      where l.class_id = p_class_id and g.id in(select public.portal_guardian_ids()) and public.guardian_has_role(g.id, 'teacher')));
$function$

;
