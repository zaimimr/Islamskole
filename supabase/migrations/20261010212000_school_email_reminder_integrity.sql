create or replace function public.queue_overdue_payment_emails()
returns void language plpgsql security definer set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  perform public.queue_family_school_email('payment_reminder', p.id, s.family_id)
  from public.payments p join public.students s on s.id = p.student_id
    or exists (select 1 from public.payment_targets t where t.payment_id = p.id and t.student_id = s.id)
  join public.school_years sy on sy.id = p.school_year_id and sy.is_active
  join public.student_balances b on b.student_id = s.id and b.school_year_id = sy.id and b.remaining > 0
  where p.status = 'opprettet' and p.voided_at is null and p.amount > 0
    and p.due_date <= (statement_timestamp() at time zone 'Europe/Oslo')::date - 7
    and not exists (select 1 from public.installments i where i.payment_id = p.id);

  perform public.queue_family_school_email('installment_reminder', p.id, pp.family_id)
  from public.installments i join public.payment_plans pp on pp.id = i.plan_id
  join public.payments p on p.id = i.payment_id
  join public.school_years sy on sy.id = i.school_year_id and sy.is_active
  join public.student_balances b on b.student_id = i.student_id and b.school_year_id = sy.id and b.remaining > 0
  where i.status = 'sendt' and pp.status = 'aktiv' and pp.paused_at is null
    and p.status = 'opprettet' and p.voided_at is null and i.reminder_sent_at is null
    and i.due_date <= (statement_timestamp() at time zone 'Europe/Oslo')::date - 7;
end;
$$;

create or replace function public.claim_school_emails(p_limit integer default 20, p_family_id uuid default null)
returns setof public.school_email_deliveries language plpgsql security definer set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  update public.school_email_deliveries set status = 'failed', last_error = 'Delivery was interrupted. Retry delivery.'
  where status = 'sending' and attempts >= 5
    and attempted_at < statement_timestamp() - interval '15 minutes';
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
