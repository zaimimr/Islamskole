create table public.school_email_deliveries (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('signup_parent', 'signup_student', 'welcome_parent', 'welcome_student', 'plan_confirmed', 'payment_reminder')),
  entity_id uuid not null,
  family_id uuid references public.families(id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and email like '%@%' and email <> 'mangler@islamskole.no'),
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0,
  attempted_at timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default statement_timestamp(),
  unique (kind, entity_id, email)
);

create index school_email_deliveries_pending_idx on public.school_email_deliveries (status, created_at);
alter table public.school_email_deliveries enable row level security;
revoke all on public.school_email_deliveries from anon, authenticated;
grant select on public.school_email_deliveries to authenticated;
grant all on public.school_email_deliveries to service_role;
create policy "admin reads school email delivery" on public.school_email_deliveries
  for select to authenticated using (public.is_admin());

create table public.portal_onboarding (
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('parent', 'student')),
  completed_at timestamptz not null default statement_timestamp(),
  primary key (user_id, role)
);

alter table public.portal_onboarding enable row level security;
revoke all on public.portal_onboarding from anon, authenticated;
grant select, insert on public.portal_onboarding to authenticated;
grant all on public.portal_onboarding to service_role;
create policy "read own portal onboarding" on public.portal_onboarding for select to authenticated
  using (user_id = (select auth.uid()));
create policy "complete own portal onboarding" on public.portal_onboarding for insert to authenticated
  with check (user_id = (select auth.uid()));

create function public.queue_school_email(p_kind text, p_entity_id uuid, p_family_id uuid, p_email text)
returns void language sql security definer set search_path = public
as $$
  insert into public.school_email_deliveries (kind, entity_id, family_id, email)
  select p_kind, p_entity_id, p_family_id, lower(btrim(p_email))
  where nullif(btrim(p_email), '') is not null and p_email like '%@%'
    and lower(btrim(p_email)) <> 'mangler@islamskole.no'
  on conflict (kind, entity_id, email) do nothing;
$$;

create function public.queue_family_school_email(p_kind text, p_entity_id uuid, p_family_id uuid)
returns void language sql security definer set search_path = public
as $$
  select public.queue_school_email(p_kind, p_entity_id, p_family_id, g.email)
  from public.family_guardians fg join public.guardians g on g.id = fg.guardian_id
  where fg.family_id = p_family_id and fg.receives_communication;
$$;

create function public.queue_application_school_email()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.status = 'ny' and new.family_id is not null then
    perform public.queue_family_school_email('signup_parent', coalesce(new.payment_id, new.id), new.family_id);
    perform public.queue_school_email('signup_student', coalesce(new.payment_id, new.id), new.family_id, new.child_email);
  end if;
  return new;
end;
$$;

create trigger application_school_email after insert on public.student_applications
  for each row execute function public.queue_application_school_email();

create function public.queue_student_welcome(p_student_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare v_student public.students;
begin
  select s.* into v_student from public.students s
  where s.id = p_student_id and exists (
    select 1 from public.enrollments e join public.school_years sy on sy.id = e.school_year_id
    where e.student_id = s.id and e.status = 'aktiv' and sy.is_active
  );
  if found then
    perform public.queue_family_school_email('welcome_parent', v_student.family_id, v_student.family_id);
    perform public.queue_school_email('welcome_student', v_student.id, v_student.family_id, v_student.child_email);
  end if;
end;
$$;

create function public.queue_enrollment_welcome()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.status = 'aktiv' then
    perform public.queue_student_welcome(new.student_id);
  end if;
  return new;
end;
$$;

create trigger enrollment_school_email after insert or update of status, class_id, school_year_id on public.enrollments
  for each row execute function public.queue_enrollment_welcome();

create function public.queue_student_email_change()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.child_email is distinct from old.child_email or new.family_id is distinct from old.family_id then
    perform public.queue_student_welcome(new.id);
  end if;
  return new;
end;
$$;

create trigger student_welcome_email_change after update of child_email, family_id on public.students
  for each row execute function public.queue_student_email_change();

create function public.queue_guardian_welcome()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.receives_communication then
    perform public.queue_student_welcome(s.id) from public.students s where s.family_id = new.family_id;
  end if;
  return new;
end;
$$;

create trigger guardian_welcome_email after insert or update of receives_communication on public.family_guardians
  for each row execute function public.queue_guardian_welcome();

create function public.queue_installment_plan_email()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  perform public.queue_family_school_email('plan_confirmed', new.plan_id, pp.family_id)
  from public.payment_plans pp where pp.id = new.plan_id and pp.status = 'aktiv';
  return new;
end;
$$;

create trigger installment_plan_email after insert on public.installments
  for each row execute function public.queue_installment_plan_email();

create function public.claim_school_emails(p_limit integer default 20, p_family_id uuid default null)
returns setof public.school_email_deliveries language plpgsql security definer set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  return query
  with available as (
    select d.id from public.school_email_deliveries d
    where (p_family_id is null or d.family_id = p_family_id) and d.attempts < 5
      and (d.status = 'pending' or (d.status in ('sending', 'failed')
        and d.attempted_at < statement_timestamp() - interval '15 minutes'))
    order by d.created_at, d.id for update skip locked limit least(greatest(p_limit, 1), 50)
  )
  update public.school_email_deliveries d set status = 'sending',
    attempts = d.attempts + 1, attempted_at = statement_timestamp(), last_error = null
  from available a where d.id = a.id returning d.*;
end;
$$;

create function public.finish_school_email(p_id uuid, p_attempted_at timestamptz, p_status text, p_error text default null)
returns boolean language plpgsql security definer set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' or p_status not in ('sent', 'failed', 'skipped') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  update public.school_email_deliveries set status = p_status,
    sent_at = case when p_status = 'sent' then statement_timestamp() else null end,
    last_error = left(p_error, 300)
  where id = p_id and status = 'sending' and attempted_at = p_attempted_at;
  return found;
end;
$$;

create function public.queue_overdue_payment_emails()
returns void language plpgsql security definer set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  perform public.queue_family_school_email('payment_reminder', p.id, s.family_id)
  from public.payments p join public.students s on s.id = p.student_id
  where p.status = 'autorisert' and p.voided_at is null and p.amount > 0
    and p.due_date <= (statement_timestamp() at time zone 'Europe/Oslo')::date - 7
    and p.created_at >= '2026-10-10 21:00:00+00'::timestamptz
    and not exists (select 1 from public.installments i where i.payment_id = p.id);
end;
$$;

revoke all on function public.queue_school_email(text, uuid, uuid, text),
  public.queue_family_school_email(text, uuid, uuid), public.queue_student_welcome(uuid),
  public.queue_application_school_email(), public.queue_enrollment_welcome(), public.queue_student_email_change(),
  public.queue_guardian_welcome(), public.queue_installment_plan_email(),
  public.claim_school_emails(integer, uuid), public.finish_school_email(uuid, timestamptz, text, text),
  public.queue_overdue_payment_emails() from public, anon, authenticated;
grant execute on function public.claim_school_emails(integer, uuid),
  public.finish_school_email(uuid, timestamptz, text, text), public.queue_overdue_payment_emails() to service_role;
