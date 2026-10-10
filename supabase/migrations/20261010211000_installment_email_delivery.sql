alter table public.school_email_deliveries drop constraint school_email_deliveries_kind_check;
alter table public.school_email_deliveries add constraint school_email_deliveries_kind_check
  check (kind in ('signup_parent', 'signup_student', 'welcome_parent', 'welcome_student', 'plan_confirmed', 'payment_reminder', 'installment_due', 'installment_reminder'));

create function public.queue_installment_due_email()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.status = 'sendt' and new.payment_id is not null then
    perform public.queue_family_school_email('installment_due', new.payment_id, pp.family_id)
    from public.payment_plans pp where pp.id = new.plan_id and pp.status = 'aktiv' and pp.paused_at is null;
  end if;
  return new;
end;
$$;

create trigger installment_due_email after insert or update of status, payment_id on public.installments
  for each row execute function public.queue_installment_due_email();

create function public.queue_guardian_email_change()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.email is distinct from old.email then
    perform public.queue_student_welcome(s.id)
    from public.students s join public.family_guardians fg on fg.family_id = s.family_id
    where fg.guardian_id = new.id and fg.receives_communication;
  end if;
  return new;
end;
$$;

create trigger guardian_contact_welcome_email after update of email on public.guardians
  for each row execute function public.queue_guardian_email_change();

create or replace function public.queue_overdue_payment_emails()
returns void language plpgsql security definer set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  perform public.queue_family_school_email('payment_reminder', p.id, s.family_id)
  from public.payments p join public.students s on s.id = p.student_id
  join public.school_years sy on sy.id = p.school_year_id and sy.is_active
  join public.student_balances b on b.student_id = s.id and b.school_year_id = sy.id and b.remaining > 0
  where p.status in ('opprettet', 'autorisert') and p.voided_at is null and p.amount > 0
    and p.due_date <= (statement_timestamp() at time zone 'Europe/Oslo')::date - 7
    and not exists (select 1 from public.installments i where i.payment_id = p.id);

  perform public.queue_family_school_email('installment_reminder', p.id, pp.family_id)
  from public.installments i join public.payment_plans pp on pp.id = i.plan_id
  join public.payments p on p.id = i.payment_id
  join public.school_years sy on sy.id = i.school_year_id and sy.is_active
  join public.student_balances b on b.student_id = i.student_id and b.school_year_id = sy.id and b.remaining > 0
  where i.status = 'sendt' and pp.status = 'aktiv' and pp.paused_at is null
    and p.status in ('opprettet', 'autorisert') and p.voided_at is null and i.reminder_sent_at is null
    and i.due_date <= (statement_timestamp() at time zone 'Europe/Oslo')::date - 7;
end;
$$;

create or replace function public.finish_school_email(p_id uuid, p_attempted_at timestamptz, p_status text, p_error text default null)
returns boolean language plpgsql security definer set search_path = public
as $$
declare v_delivery public.school_email_deliveries;
begin
  if coalesce(auth.role(), '') <> 'service_role' or p_status not in ('sent', 'failed', 'skipped') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  update public.school_email_deliveries set status = p_status,
    sent_at = case when p_status = 'sent' then statement_timestamp() else null end,
    last_error = left(p_error, 300)
  where id = p_id and status = 'sending' and attempted_at = p_attempted_at returning * into v_delivery;
  if not found then return false; end if;
  if p_status = 'sent' and v_delivery.kind = 'installment_reminder' then
    update public.installments set reminder_sent_at = statement_timestamp()
    where payment_id = v_delivery.entity_id and status = 'sendt';
  end if;
  return true;
end;
$$;

revoke all on function public.queue_installment_due_email(), public.queue_guardian_email_change() from public, anon, authenticated;
