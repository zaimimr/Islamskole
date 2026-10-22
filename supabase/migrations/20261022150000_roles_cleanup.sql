drop trigger if exists guardians_sync_person_roles on public.guardians;
drop trigger if exists person_roles_sync_guardians on public.person_roles;
drop trigger if exists profiles_sync_admin_role on public.profiles;
drop trigger if exists guardians_drop_class_links on public.guardians;
drop trigger if exists profiles_keep_last_admin on public.profiles;
drop function if exists public.guardians_sync_person_roles();
drop function if exists public.person_roles_sync_guardians();
drop function if exists public.profiles_sync_admin_role();
drop function if exists public.guardians_drop_class_links();
drop function if exists public.profiles_keep_last_admin();

create or replace function public.admin_merge_families(p_keep uuid, p_merge uuid)
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
        source_application_id = coalesce(g.source_application_id, o.source_application_id)
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
$function$;

insert into public.person_roles (guardian_id, role_key, granted_by, granted_at)
select public.ensure_guardian_for_email(u.email, p.full_name), 'admin', 'migrering', p.created_at
from public.profiles p
join auth.users u on u.id = p.id
where p.role = 'admin' and u.email is not null
on conflict (guardian_id, role_key) do nothing;

update public.profiles set role = 'member' where role = 'admin';
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('member', 'developer'));

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare desired_role text;
begin
  desired_role := coalesce(new.raw_app_meta_data ->> 'role', 'member');
  if desired_role = 'developer' and (lower(new.email) <> 'zaim.imran@gmail.com' or new.email_confirmed_at is null) then
    desired_role := 'member';
  end if;
  insert into public.profiles (id, full_name, role)
    values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''), case when desired_role = 'developer' then 'developer' else 'member' end)
    on conflict (id) do nothing;
  if desired_role = 'admin' and new.email is not null then
    insert into public.person_roles (guardian_id, role_key, granted_by)
    values (public.ensure_guardian_for_email(new.email, new.raw_user_meta_data ->> 'full_name'), 'admin', 'system')
    on conflict (guardian_id, role_key) do nothing;
  end if;
  return new;
end;
$function$;

drop index if exists public.guardians_is_teacher_idx;
drop index if exists public.guardians_is_volunteer_idx;
alter table public.guardians
  drop column if exists is_teacher,
  drop column if exists is_volunteer,
  drop column if exists teacher_suspended_at,
  drop column if exists teacher_suspended_reason,
  drop column if exists teacher_suspended_by,
  drop column if exists teacher_note;
