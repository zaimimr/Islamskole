alter table public.payments
  add column if not exists request_sent_at timestamptz,
  add column if not exists reminder_count integer not null default 0,
  add column if not exists last_reminder_at timestamptz;

create index if not exists payments_open_requests_idx
  on public.payments (school_year_id, status)
  where request_sent_at is not null and voided_at is null;

update public.payments p
set request_sent_at = p.created_at
where p.request_sent_at is null
  and p.method = 'vipps'
  and p.status = 'opprettet'
  and p.voided_at is null
  and (
    p.student_id is not null
    or exists (select 1 from public.payment_targets t where t.payment_id = p.id)
    or exists (select 1 from public.installments i where i.payment_id = p.id)
  );

alter table public.families
  add column if not exists payment_requests_paused_at timestamptz;

create table if not exists public.payment_request_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  lead_days integer not null default 14 check (lead_days between 0 and 60),
  reminder_days integer not null default 7 check (reminder_days between 1 and 60),
  max_reminders integer not null default 3 check (max_reminders between 0 and 10),
  run_started_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.payment_request_settings
  add column if not exists run_started_at timestamptz;

insert into public.payment_request_settings (id) values (true)
on conflict (id) do nothing;

alter table public.payment_request_settings enable row level security;

drop policy if exists "payment request settings admin read" on public.payment_request_settings;
create policy "payment request settings admin read" on public.payment_request_settings
  for select to authenticated using (public.is_admin());

drop policy if exists "payment request settings admin update" on public.payment_request_settings;
create policy "payment request settings admin update" on public.payment_request_settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public.replace_payment_allocations(
  p_payment_id uuid,
  p_allocations jsonb default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments%rowtype;
  v_targets uuid[] := array[]::uuid[];
  v_planned integer[];
  v_target uuid;
  v_row jsonb;
  v_share integer;
  v_remaining integer;
  v_left integer;
  v_total bigint := 0;
  v_count integer := 0;
  v_idx integer;
  v_mode text;
  v_locked_total bigint;
  v_locked_rows integer;
  v_hold boolean := false;
  v_apps integer;
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and not coalesce(public.is_admin(), false) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select *
  into v_payment
  from public.payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'Payment not found' using errcode = 'P0002';
  end if;

  if v_payment.school_year_id is null then
    raise exception 'Payment has no school year' using errcode = '23502';
  end if;

  v_left := case
    when v_payment.voided_at is null then v_payment.captured_amount
    else 0
  end;

  if p_allocations is null
    and exists (
      select 1 from public.payment_allocation_locks lock
      where lock.payment_id = p_payment_id
    ) then
    select coalesce(sum(allocation.amount), 0), count(*)
    into v_locked_total, v_locked_rows
    from public.payment_allocations allocation
    where allocation.payment_id = p_payment_id;

    if v_locked_rows > 0 and v_locked_total <= v_left then
      return v_locked_rows;
    end if;

    delete from public.payment_allocation_locks
    where payment_id = p_payment_id;
  end if;

  if p_allocations is not null then
    if jsonb_typeof(p_allocations) <> 'array' then
      raise exception 'Allocations must be a JSON array' using errcode = '22023';
    end if;

    for v_row in select value from jsonb_array_elements(p_allocations)
    loop
      begin
        if jsonb_typeof(v_row) <> 'object'
          or jsonb_typeof(v_row -> 'amount') <> 'number' then
          raise exception 'Invalid allocation';
        end if;
        v_target := (v_row ->> 'student_id')::uuid;
        v_share := (v_row ->> 'amount')::integer;
      exception when others then
        raise exception 'Invalid allocation row' using errcode = '22023';
      end;

      if v_share <= 0 then
        raise exception 'Allocation amount must be positive' using errcode = '22023';
      end if;
      if v_target = any(v_targets) then
        raise exception 'Duplicate allocation student' using errcode = '23505';
      end if;

      v_targets := array_append(v_targets, v_target);
      v_total := v_total + v_share;
    end loop;

    if v_total > v_left then
      raise exception 'Allocated amount exceeds captured amount' using errcode = '23514';
    end if;

    select count(*)
    into v_count
    from public.students
    where id = any(v_targets);

    if v_count <> cardinality(v_targets) then
      raise exception 'Allocation student not found' using errcode = '23503';
    end if;

    v_mode := 'manual';
  else
    select
      coalesce(array_agg(grouped.student_id), array[]::uuid[]),
      coalesce(array_agg(grouped.total), array[]::integer[])
    into v_targets, v_planned
    from (
      select i.student_id, sum(i.amount)::integer as total
      from public.installments i
      where i.payment_id = p_payment_id
      group by i.student_id
      order by i.student_id
    ) grouped;

    if cardinality(v_targets) = 0 then
      select
        coalesce(array_agg(t.student_id order by t.created_at, t.student_id), array[]::uuid[]),
        coalesce(array_agg(t.amount order by t.created_at, t.student_id), array[]::integer[])
      into v_targets, v_planned
      from public.payment_targets t
      where t.payment_id = p_payment_id;
    end if;

    if cardinality(v_targets) = 0 then
      v_planned := null;
      if v_payment.student_id is not null then
        v_targets := array[v_payment.student_id];
      else
        select count(*)
        into v_apps
        from public.student_applications a
        where a.payment_id = p_payment_id
          and (
            a.status not in ('arkivert', 'avslatt')
            or exists (select 1 from public.students linked where linked.application_id = a.id)
          );

        if v_apps > 0 then
          select
            coalesce(array_agg(linked.student_id order by linked.rn), array[]::uuid[]),
            coalesce(array_agg(linked.share order by linked.rn), array[]::integer[])
          into v_targets, v_planned
          from (
            select
              ordered.student_id,
              ordered.rn,
              (v_left / v_apps)::integer
                + case when ordered.rn = 1 then (v_left % v_apps)::integer else 0 end as share
            from (
              select
                s.id as student_id,
                row_number() over (order by a.created_at, a.id) as rn
              from public.student_applications a
              left join lateral (
                select student.id
                from public.students student
                where student.application_id = a.id
                order by student.created_at
                limit 1
              ) s on true
              where a.payment_id = p_payment_id
                and (a.status not in ('arkivert', 'avslatt') or s.id is not null)
            ) ordered
          ) linked
          where linked.student_id is not null;

          v_hold := cardinality(v_targets) < v_apps;
        end if;
      end if;
    end if;

    v_mode := 'automatic';
  end if;

  foreach v_target in array v_targets
  loop
    insert into public.student_fees (
      student_id,
      school_year_id,
      amount
    )
    select
      v_target,
      v_payment.school_year_id,
      coalesce(e.price_snapshot, c.price, y.fee, 0) * 100
    from public.school_years y
    left join lateral (
      select enrollment.price_snapshot, enrollment.class_id
      from public.enrollments enrollment
      where enrollment.student_id = v_target
        and enrollment.school_year_id = v_payment.school_year_id
        and enrollment.status = 'aktiv'
      order by enrollment.created_at
      limit 1
    ) e on true
    left join public.classes c on c.id = e.class_id
    where y.id = v_payment.school_year_id
    on conflict (student_id, school_year_id) do nothing;
  end loop;

  delete from public.payment_allocations
  where payment_id = p_payment_id;

  if p_allocations is not null then
    insert into public.payment_allocations (
      payment_id,
      student_id,
      school_year_id,
      amount
    )
    select
      p_payment_id,
      (item ->> 'student_id')::uuid,
      v_payment.school_year_id,
      (item ->> 'amount')::integer
    from jsonb_array_elements(p_allocations) item;

    get diagnostics v_count = row_count;

    insert into public.payment_allocation_locks (payment_id, locked_by)
    values (p_payment_id, auth.jwt() ->> 'email')
    on conflict (payment_id) do update
      set locked_at = now(), locked_by = excluded.locked_by;
  elsif v_left > 0 and cardinality(v_targets) > 0 then
    for v_idx in 1..cardinality(v_targets)
    loop
      exit when v_left <= 0;
      v_target := v_targets[v_idx];

      select coalesce(balance.remaining, 0)
      into v_remaining
      from public.student_balances balance
      where balance.student_id = v_target
        and balance.school_year_id = v_payment.school_year_id;

      v_share := least(greatest(coalesce(v_remaining, 0), 0), v_left);

      if v_planned is not null then
        v_share := least(v_share, greatest(v_planned[v_idx], 0));
      end if;

      if v_share > 0 then
        insert into public.payment_allocations (
          payment_id,
          student_id,
          school_year_id,
          amount
        ) values (
          p_payment_id,
          v_target,
          v_payment.school_year_id,
          v_share
        );
        v_left := v_left - v_share;
        v_count := v_count + 1;
      end if;
    end loop;

    if v_left > 0 and v_planned is not null and not v_hold then
      foreach v_target in array v_targets
      loop
        exit when v_left <= 0;

        select coalesce(balance.remaining, 0)
        into v_remaining
        from public.student_balances balance
        where balance.student_id = v_target
          and balance.school_year_id = v_payment.school_year_id;

        v_share := least(greatest(coalesce(v_remaining, 0), 0), v_left);

        if v_share > 0 then
          insert into public.payment_allocations (
            payment_id,
            student_id,
            school_year_id,
            amount
          ) values (
            p_payment_id,
            v_target,
            v_payment.school_year_id,
            v_share
          )
          on conflict (payment_id, student_id)
          do update set amount = public.payment_allocations.amount + excluded.amount;

          v_left := v_left - v_share;
          v_count := v_count + 1;
        end if;
      end loop;
    end if;

    if v_left > 0 and not v_hold and cardinality(v_targets) > 0 then
      insert into public.payment_allocations (
        payment_id,
        student_id,
        school_year_id,
        amount
      ) values (
        p_payment_id,
        v_targets[1],
        v_payment.school_year_id,
        v_left
      )
      on conflict (payment_id, student_id)
      do update set amount = public.payment_allocations.amount + excluded.amount;

      if v_count = 0 then
        v_count := 1;
      end if;
      v_left := 0;
    end if;
  end if;

  insert into public.audit_log (
    actor_id,
    actor_email,
    action,
    entity_type,
    entity_id,
    metadata
  ) values (
    auth.uid(),
    auth.jwt() ->> 'email',
    'payment.allocate',
    'payment',
    p_payment_id::text,
    jsonb_build_object(
      'mode', v_mode,
      'rows', v_count,
      'allocatedAmount', case
        when p_allocations is null then v_payment.captured_amount - v_left
        else v_total
      end,
      'netPaidAmount', v_payment.net_paid_amount
    )
  );

  return v_count;
end
$$;

revoke all on function public.replace_payment_allocations(uuid, jsonb) from public;
revoke all on function public.replace_payment_allocations(uuid, jsonb) from anon;
grant execute on function public.replace_payment_allocations(uuid, jsonb) to authenticated;
grant execute on function public.replace_payment_allocations(uuid, jsonb) to service_role;

create or replace function public.claim_payment_request_run()
returns boolean
language sql
security definer
set search_path = public
as $$
  update public.payment_request_settings
  set run_started_at = now()
  where id
    and (run_started_at is null or run_started_at < now() - interval '10 minutes')
  returning true;
$$;

create or replace function public.release_payment_request_run()
returns void
language sql
security definer
set search_path = public
as $$
  update public.payment_request_settings set run_started_at = null where id;
$$;

revoke all on function public.claim_payment_request_run() from public, anon, authenticated;
revoke all on function public.release_payment_request_run() from public, anon, authenticated;
grant execute on function public.claim_payment_request_run() to service_role;
grant execute on function public.release_payment_request_run() to service_role;

create or replace function public.reallocate_on_application_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.payment_id is null or new.status is not distinct from old.status then
    return new;
  end if;
  if coalesce(auth.role(), '') <> 'service_role'
    and not coalesce(public.is_admin(), false) then
    return new;
  end if;
  if exists (
    select 1 from public.payments p
    where p.id = new.payment_id
      and p.status = 'fanget'
      and p.voided_at is null
      and p.school_year_id is not null
      and p.student_id is null
  ) and not exists (
    select 1 from public.payment_allocation_locks l where l.payment_id = new.payment_id
  ) and not exists (
    select 1 from public.payment_targets t where t.payment_id = new.payment_id
  ) and not exists (
    select 1 from public.installments i where i.payment_id = new.payment_id
  ) then
    perform public.replace_payment_allocations(new.payment_id, null);
  end if;
  return new;
end
$$;

drop trigger if exists student_applications_reallocate on public.student_applications;
create trigger student_applications_reallocate
  after update of status on public.student_applications
  for each row execute function public.reallocate_on_application_status();
