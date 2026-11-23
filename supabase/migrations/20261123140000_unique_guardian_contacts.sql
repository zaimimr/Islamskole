alter table public.guardians
  add column if not exists contact_pending boolean not null default false;

create or replace function public.normalize_login_email(p_email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when lower(btrim(coalesce(p_email, ''))) in ('', 'mangler@islamskole.no') then null
    else lower(btrim(p_email))
  end;
$$;

with ranked as (
  select id,
    row_number() over (partition by public.normalize_login_email(email) order by created_at, id) as email_rank,
    public.normalize_login_email(email) as login_email
  from public.guardians
)
update public.guardians g
set contact_pending = true
from ranked r
where r.id = g.id and r.login_email is not null and r.email_rank > 1;

with ranked as (
  select id,
    row_number() over (partition by public.normalize_login_phone(phone) order by created_at, id) as phone_rank,
    public.normalize_login_phone(phone) as login_phone
  from public.guardians
  where not contact_pending
)
update public.guardians g
set contact_pending = true
from ranked r
where r.id = g.id and r.login_phone is not null and r.phone_rank > 1;

create unique index if not exists guardians_login_email_unique
  on public.guardians (public.normalize_login_email(email))
  where not contact_pending and public.normalize_login_email(email) is not null;

create unique index if not exists guardians_login_phone_unique
  on public.guardians (public.normalize_login_phone(phone))
  where not contact_pending and public.normalize_login_phone(phone) is not null;

create index if not exists guardians_contact_pending_idx
  on public.guardians (id) where contact_pending;

create or replace function public.guardian_contact_conflict(
  p_guardian_id uuid,
  p_email text,
  p_phone text,
  p_strict boolean
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_email text := public.normalize_login_email(p_email);
  v_phone text := public.normalize_login_phone(p_phone);
begin
  if v_email is not null and exists (
    select 1 from public.guardians g
    where g.id is distinct from p_guardian_id
      and not g.contact_pending
      and public.normalize_login_email(g.email) = v_email
  ) then
    return 'email';
  end if;

  if v_phone is not null and exists (
    select 1 from public.guardians g
    where g.id is distinct from p_guardian_id
      and not g.contact_pending
      and public.normalize_login_phone(g.phone) = v_phone
  ) then
    return 'phone';
  end if;

  if p_strict and v_email is not null
    and exists (select 1 from auth.users u where lower(u.email) = v_email)
    and not exists (
      select 1 from public.students s where lower(btrim(s.child_email)) = v_email
    ) then
    return 'email';
  end if;

  return null;
end;
$$;

revoke all on function public.guardian_contact_conflict(uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.guardian_contact_conflict(uuid, text, text, boolean) to service_role;

create or replace function public.guardians_contact_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conflict text;
begin
  if tg_op = 'UPDATE'
    and not new.contact_pending
    and not old.contact_pending
    and public.normalize_login_email(new.email) is not distinct from public.normalize_login_email(old.email)
    and public.normalize_login_phone(new.phone) is not distinct from public.normalize_login_phone(old.phone) then
    return new;
  end if;

  v_conflict := public.guardian_contact_conflict(
    new.id,
    new.email,
    new.phone,
    coalesce(auth.role(), '') in ('anon', 'authenticated')
      and not public.is_admin()
      and (tg_op = 'INSERT' or public.normalize_login_email(new.email) is distinct from public.normalize_login_email(old.email))
  );

  if v_conflict is null then
    if tg_op = 'UPDATE' then
      new.contact_pending := false;
    end if;
    return new;
  end if;

  if new.contact_pending and (tg_op = 'INSERT' or old.contact_pending) then
    return new;
  end if;

  if v_conflict = 'email' then
    raise exception 'E-postadressen er allerede registrert på en annen person.';
  end if;
  raise exception 'Telefonnummeret er allerede registrert på en annen person.';
end;
$$;

drop trigger if exists guardians_contact_guard on public.guardians;
create trigger guardians_contact_guard
  before insert or update of email, phone, contact_pending on public.guardians
  for each row execute function public.guardians_contact_guard();

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

  if exists (
    select 1 from public.guardians g
    where g.contact_pending
      and public.normalize_login_phone(g.phone) = v_phone
  ) then
    return null;
  end if;

  select array_agg(distinct e) into v_emails
  from (
    select public.normalize_login_email(g.email) as e
    from public.guardians g
    where public.normalize_login_phone(g.phone) = v_phone
      and public.normalize_login_email(g.email) is not null
    union
    select public.normalize_login_email(s.child_email)
    from public.students s
    where public.normalize_login_phone(s.child_phone) = v_phone
      and public.normalize_login_email(s.child_email) is not null
  ) matches;

  if coalesce(array_length(v_emails, 1), 0) <> 1 then return null; end if;
  v_email := v_emails[1];

  if exists (
    select 1 from public.guardians g
    where public.normalize_login_email(g.email) = v_email
      and (g.contact_pending or public.normalize_login_phone(g.phone) is distinct from v_phone)
  ) or exists (
    select 1 from public.students s
    where public.normalize_login_email(s.child_email) = v_email
      and public.normalize_login_phone(s.child_phone) is distinct from v_phone
  ) then
    return null;
  end if;

  return v_email;
end;
$$;

revoke all on function public.vipps_login_email_for_phone(text) from public, anon, authenticated;
grant execute on function public.vipps_login_email_for_phone(text) to service_role;

create or replace function public.create_public_family_enrollment(
  p_school_year_id uuid,
  p_reference text,
  p_amount integer,
  p_description text,
  p_address text,
  p_postal_code text,
  p_city text,
  p_guardians jsonb,
  p_children jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
  v_payment_id uuid;
  v_guardian_id uuid;
  v_guardian jsonb;
  v_child jsonb;
  v_guardian_count integer;
  v_child_count integer;
  v_sort_order integer := 0;
  v_candidate_family_ids uuid[];
  v_primary_guardian jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if p_amount <= 0
    or nullif(btrim(p_reference), '') is null
    or nullif(btrim(p_address), '') is null
    or nullif(btrim(p_postal_code), '') is null
    or nullif(btrim(p_city), '') is null then
    raise exception 'Invalid enrollment payment or address' using errcode = '22023';
  end if;

  if jsonb_typeof(p_guardians) <> 'array'
    or jsonb_typeof(p_children) <> 'array' then
    raise exception 'Guardians and children must be arrays' using errcode = '22023';
  end if;

  v_guardian_count := jsonb_array_length(p_guardians);
  v_child_count := jsonb_array_length(p_children);

  if v_guardian_count < 1 or v_guardian_count > 6 then
    raise exception 'Invalid guardian count' using errcode = '22023';
  end if;

  if v_child_count < 1 or v_child_count > 10 then
    raise exception 'Invalid child count' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.school_years
    where id = p_school_year_id
  ) then
    raise exception 'School year not found' using errcode = '23503';
  end if;

  insert into public.families (
    address,
    postal_code,
    city,
    origin
  ) values (
    btrim(p_address),
    btrim(p_postal_code),
    btrim(p_city),
    'public_enrollment'
  )
  returning id into v_family_id;

  for v_guardian in
    select value from jsonb_array_elements(p_guardians)
  loop
    if nullif(btrim(v_guardian ->> 'first_name'), '') is null
      or nullif(btrim(v_guardian ->> 'last_name'), '') is null
      or nullif(btrim(v_guardian ->> 'email'), '') is null
      or nullif(btrim(v_guardian ->> 'phone'), '') is null then
      raise exception 'Guardian contact is incomplete' using errcode = '22023';
    end if;

    insert into public.guardians (
      first_name,
      last_name,
      email,
      phone,
      contact_pending
    ) values (
      btrim(v_guardian ->> 'first_name'),
      btrim(v_guardian ->> 'last_name'),
      lower(btrim(v_guardian ->> 'email')),
      btrim(v_guardian ->> 'phone'),
      public.guardian_contact_conflict(
        null,
        v_guardian ->> 'email',
        v_guardian ->> 'phone',
        true
      ) is not null
    )
    returning id into v_guardian_id;

    insert into public.family_guardians (
      family_id,
      guardian_id,
      relationship_label,
      is_primary_contact,
      is_billing_contact,
      receives_communication,
      sort_order
    ) values (
      v_family_id,
      v_guardian_id,
      coalesce(nullif(btrim(v_guardian ->> 'role'), ''), 'foresatt'),
      v_sort_order = 0,
      v_sort_order = 0,
      true,
      v_sort_order
    );

    if v_sort_order = 0 then
      v_primary_guardian := v_guardian;
    end if;

    v_sort_order := v_sort_order + 1;
  end loop;

  select array_agg(distinct existing.family_id order by existing.family_id)
  into v_candidate_family_ids
  from public.family_guardians current_membership
  join public.guardians current_guardian
    on current_guardian.id = current_membership.guardian_id
  join public.guardians existing_guardian
    on (
      nullif(lower(btrim(current_guardian.email)), '') is not null
      and lower(btrim(existing_guardian.email)) = lower(btrim(current_guardian.email))
    )
    or (
      nullif(regexp_replace(current_guardian.phone, '[^0-9+]', '', 'g'), '') is not null
      and regexp_replace(existing_guardian.phone, '[^0-9+]', '', 'g') =
        regexp_replace(current_guardian.phone, '[^0-9+]', '', 'g')
    )
  join public.family_guardians existing
    on existing.guardian_id = existing_guardian.id
  where current_membership.family_id = v_family_id
    and existing.family_id <> v_family_id;

  if cardinality(v_candidate_family_ids) > 0 then
    insert into public.family_data_reviews (
      family_id,
      category,
      source_entity,
      source_entity_id,
      details
    ) values (
      v_family_id,
      'possible_duplicate_family',
      'family',
      v_family_id,
      jsonb_build_object(
        'candidateFamilyIds', to_jsonb(v_candidate_family_ids),
        'source', 'public_enrollment'
      )
    )
    on conflict do nothing;
  end if;

  insert into public.payments (
    school_year_id,
    reference,
    amount,
    currency,
    method,
    status,
    description,
    payer_name,
    payer_email,
    payer_phone
  ) values (
    p_school_year_id,
    btrim(p_reference),
    p_amount,
    'NOK',
    'vipps',
    'opprettet',
    nullif(btrim(p_description), ''),
    nullif(
      btrim(concat_ws(
        ' ',
        v_primary_guardian ->> 'first_name',
        v_primary_guardian ->> 'last_name'
      )),
      ''
    ),
    lower(nullif(btrim(v_primary_guardian ->> 'email'), '')),
    nullif(btrim(v_primary_guardian ->> 'phone'), '')
  )
  returning id into v_payment_id;

  for v_child in
    select value from jsonb_array_elements(p_children)
  loop
    if nullif(btrim(v_child ->> 'child_first_name'), '') is null
      or nullif(btrim(v_child ->> 'child_last_name'), '') is null
      or nullif(btrim(v_child ->> 'child_birth_date'), '') is null
      or nullif(btrim(v_child ->> 'child_gender'), '') is null
      or coalesce((v_child ->> 'terms_accepted')::boolean, false) is false then
      raise exception 'Child enrollment is incomplete' using errcode = '22023';
    end if;

    insert into public.student_applications (
      child_first_name,
      child_last_name,
      child_birth_date,
      child_gender,
      child_address,
      child_postal_code,
      child_city,
      child_email,
      child_phone,
      mother_first_name,
      mother_last_name,
      mother_phone,
      mother_email,
      father_first_name,
      father_last_name,
      father_phone,
      father_email,
      desired_class,
      child_level_quran,
      child_level_arabic,
      child_level_islam,
      message,
      terms_accepted,
      family_id,
      payment_id
    ) values (
      btrim(v_child ->> 'child_first_name'),
      btrim(v_child ->> 'child_last_name'),
      (v_child ->> 'child_birth_date')::date,
      btrim(v_child ->> 'child_gender'),
      btrim(p_address),
      btrim(p_postal_code),
      btrim(p_city),
      nullif(btrim(v_child ->> 'child_email'), ''),
      nullif(btrim(v_child ->> 'child_phone'), ''),
      nullif(btrim(v_child ->> 'mother_first_name'), ''),
      nullif(btrim(v_child ->> 'mother_last_name'), ''),
      nullif(btrim(v_child ->> 'mother_phone'), ''),
      lower(nullif(btrim(v_child ->> 'mother_email'), '')),
      nullif(btrim(v_child ->> 'father_first_name'), ''),
      nullif(btrim(v_child ->> 'father_last_name'), ''),
      nullif(btrim(v_child ->> 'father_phone'), ''),
      lower(nullif(btrim(v_child ->> 'father_email'), '')),
      nullif(btrim(v_child ->> 'desired_class'), ''),
      nullif(btrim(v_child ->> 'child_level_quran'), ''),
      nullif(btrim(v_child ->> 'child_level_arabic'), ''),
      nullif(btrim(v_child ->> 'child_level_islam'), ''),
      nullif(btrim(v_child ->> 'message'), ''),
      true,
      v_family_id,
      v_payment_id
    );
  end loop;

  return jsonb_build_object(
    'family_id', v_family_id,
    'payment_id', v_payment_id
  );
end
$$;

create or replace function public.admin_merge_families(p_keep uuid, p_merge uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_pair record;
  v_actor uuid;
  v_old_phone text;
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
        source_application_id = coalesce(g.source_application_id, o.source_application_id)
    from public.guardians o
    where g.id = v_pair.new_id
      and o.id = v_pair.old_id;

    select phone into v_old_phone from public.guardians where id = v_pair.old_id;

    delete from public.guardians where id = v_pair.old_id;

    update public.guardians
    set phone = v_old_phone
    where id = v_pair.new_id
      and nullif(btrim(phone), '') is null
      and nullif(btrim(v_old_phone), '') is not null
      and public.guardian_contact_conflict(id, null, v_old_phone, false) is null;

    update public.guardians
    set contact_pending = true
    where id = v_pair.new_id
      and contact_pending;
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
