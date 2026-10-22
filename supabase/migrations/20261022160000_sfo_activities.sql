alter table public.school_activities
  add column if not exists owner text not null default 'class',
  add column if not exists location text,
  add column if not exists start_time time,
  add column if not exists end_time time,
  add column if not exists capacity integer,
  add column if not exists min_age integer,
  add column if not exists max_age integer,
  add column if not exists price_ore integer,
  add column if not exists payment_due date,
  add column if not exists show_on_website boolean not null default false,
  add column if not exists needs_consent boolean not null default true,
  add column if not exists cancel_refund text,
  add column if not exists cancel_refund_ore integer;

alter table public.school_activities alter column class_id drop not null;

alter table public.school_activities
  drop constraint if exists school_activities_consent_text_check,
  drop constraint if exists school_activities_owner_check,
  drop constraint if exists school_activities_class_owner_check,
  drop constraint if exists school_activities_location_check,
  drop constraint if exists school_activities_time_check,
  drop constraint if exists school_activities_capacity_check,
  drop constraint if exists school_activities_age_check,
  drop constraint if exists school_activities_price_check,
  drop constraint if exists school_activities_refund_check;

alter table public.school_activities
  add constraint school_activities_consent_text_check check (length(consent_text) <= 4000 and (not needs_consent or length(btrim(consent_text)) >= 1)),
  add constraint school_activities_owner_check check (owner in ('class', 'sfo')),
  add constraint school_activities_class_owner_check check (owner = 'sfo' or (class_id is not null and needs_consent)),
  add constraint school_activities_location_check check (location is null or length(location) <= 200),
  add constraint school_activities_time_check check (end_time is null or start_time is null or end_time > start_time),
  add constraint school_activities_capacity_check check (capacity is null or capacity > 0),
  add constraint school_activities_age_check check ((min_age is null or min_age between 0 and 30) and (max_age is null or max_age between 0 and 30) and (min_age is null or max_age is null or max_age >= min_age)),
  add constraint school_activities_price_check check ((price_ore is null or price_ore > 0) and (payment_due is null or price_ore is not null)),
  add constraint school_activities_refund_check check ((cancel_refund is null or cancel_refund in ('full', 'amount', 'none')) and ((cancel_refund = 'amount') = (cancel_refund_ore is not null)) and (cancel_refund_ore is null or cancel_refund_ore > 0));

create index if not exists school_activities_owner_idx on public.school_activities (owner, event_date desc);

create table if not exists public.activity_audience (
  activity_id uuid not null references public.school_activities(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  primary key (activity_id, class_id)
);

create table if not exists public.activity_changes (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.school_activities(id) on delete cascade,
  changed_by uuid,
  changed_at timestamptz not null default statement_timestamp(),
  previous jsonb not null
);
create index if not exists activity_changes_activity_idx on public.activity_changes (activity_id);

create table if not exists public.activity_payment_targets (
  payment_id uuid not null references public.payments(id) on delete cascade,
  activity_id uuid not null references public.school_activities(id),
  student_id uuid not null references public.students(id),
  amount integer not null check (amount > 0),
  primary key (payment_id, student_id)
);
create index if not exists activity_payment_targets_activity_idx on public.activity_payment_targets (activity_id);

alter table public.sadaqa_gifts
  add column if not exists activity_id uuid references public.school_activities(id),
  add column if not exists student_id uuid references public.students(id) on delete set null;
create index if not exists sadaqa_gifts_activity_idx on public.sadaqa_gifts (activity_id, student_id) where activity_id is not null;
create unique index if not exists sadaqa_gifts_activity_payment_key on public.sadaqa_gifts (source_payment_id, student_id) where activity_id is not null and source_payment_id is not null;

alter table public.school_email_deliveries drop constraint if exists school_email_deliveries_kind_check;
alter table public.school_email_deliveries add constraint school_email_deliveries_kind_check check (kind in (
  'signup_parent', 'signup_student', 'welcome_parent', 'welcome_student', 'plan_confirmed', 'payment_reminder', 'installment_due',
  'installment_reminder', 'report_published', 'attendance_followup', 'activity_consent', 'activity_cancelled', 'activity_added',
  'activity_changed', 'activity_respond_reminder', 'activity_payment_reminder'));

create or replace function public.oslo_today() returns date language sql stable set search_path = public
as $$ select (now() at time zone 'Europe/Oslo')::date $$;

create or replace function public.activity_can_staff(p_id uuid) returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.school_activities a where a.id = p_id and (public.is_admin()
  or (a.owner = 'class' and public.sunday_class_staff(a.class_id, a.school_year_id))
  or (a.owner = 'sfo' and public.has_permission('activities.sfo.manage')))) $$;

create or replace function public.activity_can_roster(p_id uuid) returns boolean language sql stable security definer set search_path = public
as $$ select public.activity_can_staff(p_id) or exists(select 1 from public.school_activities a where a.id = p_id and a.owner = 'sfo' and public.has_permission('activities.sfo.roster')) $$;

create or replace function public.activity_can_read(p_id uuid) returns boolean language sql stable security definer set search_path = public
as $$ select public.activity_can_staff(p_id)
  or exists(select 1 from public.school_activities a where a.id = p_id and (
    (a.owner = 'class' and public.has_permission('activities.class.read'))
    or (a.owner = 'sfo' and (public.has_permission('activities.sfo.roster') or public.has_permission('activities.sfo.payments')))))
  or exists(select 1 from public.school_activities a join public.activity_students s on s.activity_id = a.id
    where a.id = p_id and a.status in ('published', 'cancelled') and public.activity_owns_child(s.student_id)) $$;

alter table public.activity_audience enable row level security;
drop policy if exists "activity audience read" on public.activity_audience;
create policy "activity audience read" on public.activity_audience for select to authenticated using (public.activity_can_read(activity_id));

alter table public.activity_changes enable row level security;
drop policy if exists "activity changes read" on public.activity_changes;
create policy "activity changes read" on public.activity_changes for select to authenticated using (public.activity_can_staff(activity_id));

alter table public.activity_payment_targets enable row level security;
drop policy if exists "activity payment targets read" on public.activity_payment_targets;
create policy "activity payment targets read" on public.activity_payment_targets for select to authenticated using (public.is_admin() or public.activity_owns_child(student_id, true));

drop policy if exists "activity students roster read" on public.activity_students;
create policy "activity students roster read" on public.activity_students for select to authenticated using (public.activity_can_roster(activity_id));
drop policy if exists "activity responses roster read" on public.activity_responses;
create policy "activity responses roster read" on public.activity_responses for select to authenticated using (public.activity_can_roster(activity_id));

create or replace function public.activity_child_age(p_birth date, p_on date) returns integer language sql immutable
as $$ select case when p_birth is null then null else extract(year from p_on)::int - extract(year from p_birth)::int end $$;

create or replace function public.sfo_activity_eligible(p_id uuid) returns table(student_id uuid) language sql stable security definer set search_path = public
as $$
  select distinct s.id from public.school_activities a
  join public.enrollments e on e.school_year_id = a.school_year_id and e.status = 'aktiv'
  join public.students s on s.id = e.student_id
  where a.id = p_id and a.owner = 'sfo'
    and (not exists(select 1 from public.activity_audience au where au.activity_id = a.id)
      or e.class_id in (select au.class_id from public.activity_audience au where au.activity_id = a.id))
    and (s.child_birth_date is null or (
      (a.min_age is null or public.activity_child_age(s.child_birth_date, a.event_date) >= a.min_age)
      and (a.max_age is null or public.activity_child_age(s.child_birth_date, a.event_date) <= a.max_age)))
$$;
revoke all on function public.sfo_activity_eligible(uuid) from public, anon, authenticated;

create or replace function public.activity_going_count(p_id uuid) returns integer language sql stable security definer set search_path = public
as $$ select count(*)::int from public.activity_responses r where r.activity_id = p_id and r.going $$;
revoke all on function public.activity_going_count(uuid) from public, anon, authenticated;

create or replace function public.activity_spots_left(p_id uuid) returns integer language sql stable security definer set search_path = public
as $$ select case when a.capacity is null then null else greatest(a.capacity - public.activity_going_count(a.id), 0) end
  from public.school_activities a where a.id = p_id and a.status = 'published' $$;
grant execute on function public.activity_spots_left(uuid) to anon, authenticated;

create or replace function public.activity_paid_ore(p_id uuid, p_student uuid) returns integer language sql stable security definer set search_path = public
as $$ select coalesce(sum(g.amount), 0)::int from public.sadaqa_gifts g where g.activity_id = p_id and g.student_id = p_student and g.voided_at is null $$;
revoke all on function public.activity_paid_ore(uuid, uuid) from public, anon, authenticated;

create or replace function public.save_sfo_activity(
  p_id uuid, p_expected timestamptz, p_title text, p_description text, p_needs_consent boolean, p_consent text, p_date date, p_respond_by date,
  p_location text, p_start time, p_end time, p_capacity integer, p_min_age integer, p_max_age integer, p_price_ore integer, p_payment_due date,
  p_show_on_website boolean, p_audience uuid[]
) returns public.school_activities language plpgsql security definer set search_path = public
as $$
declare
  v_activity public.school_activities;
  v_year uuid;
  v_today date := public.oslo_today();
  v_audience uuid[] := coalesce((select array_agg(distinct x order by x) from unnest(coalesce(p_audience, '{}')) x), '{}');
  v_current uuid[];
  v_change uuid;
begin
  if not public.has_permission('activities.sfo.manage') then raise exception 'SFO access denied' using errcode = '42501'; end if;
  if exists(select 1 from unnest(v_audience) x where not exists(select 1 from public.classes c where c.id = x)) then raise exception 'Unknown class' using errcode = '22023'; end if;
  select * into v_activity from public.school_activities where id = p_id for update;
  if v_activity.id is not null and v_activity.owner <> 'sfo' then raise exception 'SFO access denied' using errcode = '42501'; end if;
  if v_activity.id is null or v_activity.status = 'draft' then
    if p_date < v_today or p_respond_by < v_today then raise exception 'Choose a future date and response deadline' using errcode = '22023'; end if;
  end if;
  if v_activity.id is not null then
    if p_expected is null and v_activity.updated_by = auth.uid() and v_activity.title = btrim(p_title) and v_activity.event_date = p_date then return v_activity; end if;
    if v_activity.updated_at is distinct from p_expected then raise exception 'Activity changed' using errcode = 'PT409'; end if;
    if v_activity.status = 'cancelled' then raise exception 'Cancelled activity is immutable' using errcode = '23514'; end if;
    if v_activity.status = 'published' then
      select coalesce(array_agg(class_id order by class_id), '{}') into v_current from public.activity_audience where activity_id = p_id;
      if v_current <> v_audience or v_activity.price_ore is distinct from p_price_ore or v_activity.needs_consent <> p_needs_consent
        or v_activity.consent_text <> btrim(coalesce(p_consent, '')) or v_activity.min_age is distinct from p_min_age or v_activity.max_age is distinct from p_max_age
        then raise exception 'Published activity terms are immutable' using errcode = '23514'; end if;
      if p_date < v_today then raise exception 'Choose a future date' using errcode = '22023'; end if;
      if p_capacity is not null and p_capacity < public.activity_going_count(p_id) then raise exception 'Capacity below sign-ups' using errcode = '22023'; end if;
      if v_activity.event_date <> p_date or v_activity.start_time is distinct from p_start or v_activity.end_time is distinct from p_end
        or v_activity.location is distinct from nullif(btrim(coalesce(p_location, '')), '') then
        insert into public.activity_changes(activity_id, changed_by, previous)
          values (p_id, auth.uid(), jsonb_build_object('event_date', v_activity.event_date, 'start_time', v_activity.start_time, 'end_time', v_activity.end_time, 'location', v_activity.location))
          returning id into v_change;
        perform public.queue_family_school_email('activity_changed', v_change, f.family_id)
          from (select distinct s.family_id from public.activity_responses r join public.students s on s.id = r.student_id where r.activity_id = p_id and r.going and s.family_id is not null) f;
      end if;
    end if;
    update public.school_activities set title = btrim(p_title), description = btrim(coalesce(p_description, '')), needs_consent = p_needs_consent,
      consent_text = btrim(coalesce(p_consent, '')), event_date = p_date, respond_by = p_respond_by, location = nullif(btrim(coalesce(p_location, '')), ''),
      start_time = p_start, end_time = p_end, capacity = p_capacity, min_age = p_min_age, max_age = p_max_age, price_ore = p_price_ore,
      payment_due = p_payment_due, show_on_website = p_show_on_website, updated_at = clock_timestamp(), updated_by = auth.uid()
      where id = p_id returning * into v_activity;
    if v_activity.status = 'draft' then
      delete from public.activity_audience where activity_id = p_id and class_id <> all(v_audience);
      insert into public.activity_audience(activity_id, class_id) select p_id, x from unnest(v_audience) x on conflict do nothing;
    end if;
  else
    if p_expected is not null then raise exception 'Activity missing' using errcode = 'PT409'; end if;
    select id into v_year from public.school_years where is_active limit 1;
    if v_year is null then raise exception 'No active school year' using errcode = '22023'; end if;
    insert into public.school_activities(id, owner, class_id, school_year_id, title, description, needs_consent, consent_text, event_date, respond_by,
      location, start_time, end_time, capacity, min_age, max_age, price_ore, payment_due, show_on_website, updated_by)
      values (p_id, 'sfo', null, v_year, btrim(p_title), btrim(coalesce(p_description, '')), p_needs_consent, btrim(coalesce(p_consent, '')), p_date, p_respond_by,
        nullif(btrim(coalesce(p_location, '')), ''), p_start, p_end, p_capacity, p_min_age, p_max_age, p_price_ore, p_payment_due, p_show_on_website, auth.uid())
      returning * into v_activity;
    insert into public.activity_audience(activity_id, class_id) select p_id, x from unnest(v_audience) x;
  end if;
  return v_activity;
end;
$$;

create or replace function public.add_activity_students(p_id uuid) returns integer language plpgsql security definer set search_path = public
as $$
declare v_activity public.school_activities; v_count integer := 0; v_added record; v_invitation uuid;
begin
  select * into v_activity from public.school_activities where id = p_id for update;
  if not public.activity_can_staff(p_id) then raise exception 'Activity access denied' using errcode = '42501'; end if;
  if v_activity.status <> 'published' or v_activity.respond_by < public.oslo_today() then raise exception 'Responses closed' using errcode = '22023'; end if;
  for v_added in
    insert into public.activity_students(activity_id, student_id, student_name)
      select p_id, s.id, concat_ws(' ', s.child_first_name, s.child_last_name) from public.students s
      where (v_activity.owner = 'sfo' and s.id in (select student_id from public.sfo_activity_eligible(p_id)))
        or (v_activity.owner = 'class' and s.id in (select e.student_id from public.enrollments e where e.class_id = v_activity.class_id and e.school_year_id = v_activity.school_year_id and e.status = 'aktiv'))
      on conflict do nothing returning student_id
  loop
    insert into public.activity_added_invitations(activity_id, student_id) values (p_id, v_added.student_id) returning id into v_invitation;
    perform public.queue_family_school_email('activity_added', v_invitation, s.family_id) from public.students s where s.id = v_added.student_id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.publish_school_activity(p_id uuid, p_expected timestamptz) returns uuid language plpgsql security definer set search_path = public
as $$
declare v_activity public.school_activities;
begin
  select * into v_activity from public.school_activities where id = p_id for update;
  if v_activity.id is null or not public.activity_can_staff(p_id) then raise exception 'Activity access denied' using errcode = '42501'; end if;
  if v_activity.status = 'published' then return p_id; end if;
  if v_activity.status <> 'draft' or v_activity.updated_at is distinct from p_expected then raise exception 'Activity changed' using errcode = 'PT409'; end if;
  if v_activity.respond_by < public.oslo_today() or v_activity.event_date < public.oslo_today() or (v_activity.owner = 'class' and not exists(select 1 from public.school_days d
    where d.school_year_id = v_activity.school_year_id and d.date = v_activity.event_date and not d.cancelled and extract(isodow from d.date) = 7))
    then raise exception 'Activity date unavailable' using errcode = '22023'; end if;
  insert into public.activity_students(activity_id, student_id, student_name)
    select p_id, s.id, concat_ws(' ', s.child_first_name, s.child_last_name) from public.students s
    where (v_activity.owner = 'sfo' and s.id in (select student_id from public.sfo_activity_eligible(p_id)))
      or (v_activity.owner = 'class' and s.id in (select e.student_id from public.enrollments e where e.class_id = v_activity.class_id and e.school_year_id = v_activity.school_year_id and e.status = 'aktiv'))
    on conflict do nothing;
  if not exists(select 1 from public.activity_students where activity_id = p_id) then raise exception 'Activity has no students' using errcode = '22023'; end if;
  update public.school_activities set status = 'published', updated_at = clock_timestamp(), updated_by = auth.uid() where id = p_id;
  perform public.queue_family_school_email('activity_consent', p_id, f.family_id)
    from (select distinct s.family_id from public.activity_students x join public.students s on s.id = x.student_id where x.activity_id = p_id and s.family_id is not null) f;
  return p_id;
end;
$$;

drop function if exists public.cancel_school_activity(uuid, timestamptz);
create or replace function public.cancel_school_activity(p_id uuid, p_expected timestamptz, p_refund text default null, p_refund_ore integer default null)
returns uuid language plpgsql security definer set search_path = public
as $$
declare v_activity public.school_activities;
begin
  select * into v_activity from public.school_activities where id = p_id for update;
  if not public.activity_can_staff(p_id) then raise exception 'Activity access denied' using errcode = '42501'; end if;
  if v_activity.status = 'cancelled' then return p_id; end if;
  if v_activity.updated_at is distinct from p_expected then raise exception 'Activity changed' using errcode = 'PT409'; end if;
  if v_activity.owner = 'sfo' and v_activity.price_ore is not null and v_activity.status = 'published' then
    if p_refund is null or p_refund not in ('full', 'amount', 'none') or (p_refund = 'amount' and (p_refund_ore is null or p_refund_ore <= 0 or p_refund_ore > v_activity.price_ore))
      then raise exception 'Choose a refund' using errcode = '22023'; end if;
  end if;
  update public.school_activities set status = 'cancelled',
    cancel_refund = case when v_activity.owner = 'sfo' and v_activity.price_ore is not null and v_activity.status = 'published' then p_refund end,
    cancel_refund_ore = case when v_activity.owner = 'sfo' and v_activity.price_ore is not null and v_activity.status = 'published' and p_refund = 'amount' then p_refund_ore end,
    updated_at = clock_timestamp(), updated_by = auth.uid() where id = p_id;
  if v_activity.status = 'published' then
    perform public.queue_family_school_email('activity_cancelled', p_id, f.family_id)
      from (select distinct s.family_id from public.activity_students x join public.students s on s.id = x.student_id
        where x.activity_id = p_id and s.family_id is not null
          and (v_activity.owner = 'class' or exists(select 1 from public.activity_responses r where r.activity_id = p_id and r.student_id = x.student_id and r.going))) f;
  end if;
  return p_id;
end;
$$;
grant execute on function public.cancel_school_activity(uuid, timestamptz, text, integer) to authenticated;

drop function if exists public.respond_school_activity(uuid, uuid, uuid, timestamptz, text, boolean);
create or replace function public.respond_school_activity(p_request_id uuid, p_id uuid, p_student uuid, p_expected timestamptz, p_consent text, p_going boolean, p_health_confirmed boolean default false)
returns uuid language plpgsql security definer set search_path = public
as $$
declare v_activity public.school_activities; v_existing public.activity_response_history; v_name text; v_health timestamptz; v_year_start date;
begin
  if not public.activity_owns_child(p_student, true) then raise exception 'Guardian access required' using errcode = '42501'; end if;
  select * into v_activity from public.school_activities where id = p_id for update;
  select * into v_existing from public.activity_response_history where id = p_request_id;
  if v_existing.id is not null then
    if v_existing.activity_id = p_id and v_existing.student_id = p_student and v_existing.consent = p_consent and v_existing.going = p_going and v_existing.responded_by = auth.uid() then return p_request_id; end if;
    raise exception 'Conflicting response request' using errcode = '23514';
  end if;
  if v_activity.id is null or not exists(select 1 from public.activity_students where activity_id = p_id and student_id = p_student) then raise exception 'Child is not invited' using errcode = '42501'; end if;
  if v_activity.status <> 'published' or v_activity.updated_at is distinct from p_expected or v_activity.respond_by < public.oslo_today()
    or v_activity.event_date < public.oslo_today() then raise exception 'Responses closed or activity changed' using errcode = 'PT409'; end if;
  if exists(select 1 from public.activity_students where activity_id = p_id and student_id = p_student and participation <> 'unrecorded') then raise exception 'Participation already recorded' using errcode = '22023'; end if;
  if not v_activity.needs_consent and p_consent <> 'granted' then raise exception 'Consent not used' using errcode = '22023'; end if;
  if p_going and v_activity.capacity is not null and (select count(*) from public.activity_responses r where r.activity_id = p_id and r.going and r.student_id <> p_student) >= v_activity.capacity
    then raise exception 'Activity is full' using errcode = 'PT422'; end if;
  if p_going and v_activity.owner = 'sfo' then
    select s.health_updated_at into v_health from public.students s where s.id = p_student;
    select y.starts_on into v_year_start from public.school_years y where y.id = v_activity.school_year_id;
    if v_health is null or (v_health at time zone 'Europe/Oslo')::date < v_year_start then
      if not coalesce(p_health_confirmed, false) then raise exception 'Confirm health information' using errcode = 'PT428'; end if;
      update public.students set health_updated_at = now() where id = p_student;
    end if;
  end if;
  select concat_ws(' ', g.first_name, g.last_name) into v_name from public.guardians g where g.id in (select public.portal_guardian_ids()) order by g.id limit 1;
  insert into public.activity_response_history(id, activity_id, student_id, consent, going, consent_text, responded_by, guardian_name)
    values (p_request_id, p_id, p_student, p_consent, p_going, v_activity.consent_text, auth.uid(), v_name);
  insert into public.activity_responses(activity_id, student_id, consent, going, responded_by, guardian_name, responded_at)
    values (p_id, p_student, p_consent, p_going, auth.uid(), v_name, clock_timestamp())
    on conflict (activity_id, student_id) do update set consent = excluded.consent, going = excluded.going, responded_by = excluded.responded_by,
      guardian_name = excluded.guardian_name, responded_at = excluded.responded_at;
  return p_request_id;
end;
$$;
grant execute on function public.respond_school_activity(uuid, uuid, uuid, timestamptz, text, boolean, boolean) to authenticated;

create or replace function public.record_activity_participation(p_id uuid, p_student uuid, p_participation text) returns void language plpgsql security definer set search_path = public
as $$
declare v_activity public.school_activities;
begin
  select * into v_activity from public.school_activities where id = p_id for update;
  if not public.activity_can_roster(p_id) then raise exception 'Activity access denied' using errcode = '42501'; end if;
  if v_activity.status <> 'published' or v_activity.event_date > public.oslo_today() then raise exception 'Activity has not taken place' using errcode = '22023'; end if;
  if p_participation not in ('unrecorded', 'participated', 'absent') or not exists(select 1 from public.activity_responses where activity_id = p_id and student_id = p_student and consent = 'granted' and going)
    then raise exception 'Participation requires consent and planned attendance' using errcode = '22023'; end if;
  update public.activity_students set participation = p_participation, participation_by = auth.uid(), participation_at = clock_timestamp() where activity_id = p_id and student_id = p_student;
end;
$$;

create or replace function public.class_activity_overview() returns table(id uuid, title text, class_name text, event_date date, respond_by date, status text, invited integer, going integer, not_going integer, missing integer)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.has_permission('activities.class.read') then raise exception 'Access denied' using errcode = '42501'; end if;
  return query select a.id, a.title, c.name_no, a.event_date, a.respond_by, a.status,
    (select count(*)::int from public.activity_students x where x.activity_id = a.id),
    (select count(*)::int from public.activity_responses r where r.activity_id = a.id and r.going),
    (select count(*)::int from public.activity_responses r where r.activity_id = a.id and not r.going),
    (select count(*)::int from public.activity_students x where x.activity_id = a.id and not exists(select 1 from public.activity_responses r where r.activity_id = a.id and r.student_id = x.student_id))
  from public.school_activities a join public.classes c on c.id = a.class_id join public.school_years y on y.id = a.school_year_id and y.is_active
  where a.owner = 'class' and a.status in ('published', 'cancelled') order by a.event_date desc;
end;
$$;

create or replace function public.sfo_activity_roster(p_id uuid) returns table(
  student_id uuid, name text, age integer, classes text, allergies text, medical_notes text, photo_consent boolean, health_updated_at timestamptz,
  pickup jsonb, guardians jsonb, consent text, going boolean, participation text, paid_ore integer
) language plpgsql security definer set search_path = public
as $$
declare v_activity public.school_activities;
begin
  select * into v_activity from public.school_activities a where a.id = p_id;
  if v_activity.id is null or v_activity.owner <> 'sfo' or not public.has_permission('activities.sfo.roster') then raise exception 'Roster access denied' using errcode = '42501'; end if;
  if public.oslo_today() > v_activity.event_date + 30 then raise exception 'Roster closed' using errcode = '42501'; end if;
  insert into public.audit_log(actor_id, actor_email, action, entity_type, entity_id, metadata)
    values (auth.uid(), auth.jwt() ->> 'email', 'sfo.roster.read', 'school_activity', p_id::text, jsonb_build_object('title', v_activity.title));
  return query select s.id, concat_ws(' ', s.child_first_name, s.child_last_name), public.activity_child_age(s.child_birth_date, v_activity.event_date),
    (select string_agg(distinct c.name_no, ', ') from public.enrollments e join public.classes c on c.id = e.class_id where e.student_id = s.id and e.school_year_id = v_activity.school_year_id and e.status = 'aktiv'),
    s.allergies, s.medical_notes, s.photo_consent, s.health_updated_at,
    coalesce((select jsonb_agg(jsonb_build_object('name', p.name, 'phone', p.phone, 'relation', p.relation) order by p.name) from public.family_pickup_persons p where p.family_id = s.family_id), '[]'),
    coalesce((select jsonb_agg(jsonb_build_object('name', concat_ws(' ', g.first_name, g.last_name), 'phone', g.phone) order by fg.is_primary_contact desc, g.first_name)
      from public.family_guardians fg join public.guardians g on g.id = fg.guardian_id where fg.family_id = s.family_id), '[]'),
    r.consent, r.going, x.participation, public.activity_paid_ore(p_id, s.id)
  from public.activity_responses r join public.activity_students x on x.activity_id = r.activity_id and x.student_id = r.student_id join public.students s on s.id = r.student_id
  where r.activity_id = p_id order by r.going desc, s.child_first_name, s.child_last_name;
end;
$$;

create or replace function public.sfo_activity_payments(p_id uuid) returns table(student_id uuid, name text, going boolean, paid_ore integer, last_paid_on date, methods text)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not exists(select 1 from public.school_activities a where a.id = p_id and a.owner = 'sfo') or not public.has_permission('activities.sfo.payments') then raise exception 'Payments access denied' using errcode = '42501'; end if;
  return query select x.student_id, x.student_name, coalesce(r.going, false), public.activity_paid_ore(p_id, x.student_id),
    (select max(g.received_on) from public.sadaqa_gifts g where g.activity_id = p_id and g.student_id = x.student_id and g.voided_at is null),
    (select string_agg(distinct g.method, ', ') from public.sadaqa_gifts g where g.activity_id = p_id and g.student_id = x.student_id and g.voided_at is null)
  from public.activity_students x left join public.activity_responses r on r.activity_id = x.activity_id and r.student_id = x.student_id
  where x.activity_id = p_id and (coalesce(r.going, false) or exists(select 1 from public.sadaqa_gifts g where g.activity_id = p_id and g.student_id = x.student_id and g.voided_at is null))
  order by x.student_name;
end;
$$;

create or replace function public.register_activity_cash(p_id uuid, p_student uuid, p_amount integer, p_date date) returns uuid language plpgsql security definer set search_path = public
as $$
declare v_activity public.school_activities; v_family uuid; v_gift uuid;
begin
  select * into v_activity from public.school_activities a where a.id = p_id;
  if v_activity.id is null or v_activity.owner <> 'sfo' or not public.has_permission('activities.sfo.payments') then raise exception 'Payments access denied' using errcode = '42501'; end if;
  if v_activity.price_ore is null or p_amount is null or p_amount <= 0 or p_amount > 10000000 or p_date is null or p_date > public.oslo_today() then raise exception 'Invalid payment' using errcode = '22023'; end if;
  if not exists(select 1 from public.activity_students x where x.activity_id = p_id and x.student_id = p_student) then raise exception 'Child is not invited' using errcode = '22023'; end if;
  select s.family_id into v_family from public.students s where s.id = p_student;
  insert into public.sadaqa_gifts(amount, received_on, method, family_id, school_year_id, activity_id, student_id, created_by, note)
    values (p_amount, p_date, 'kontant', v_family, v_activity.school_year_id, p_id, p_student, coalesce(auth.jwt() ->> 'email', 'sfo'), v_activity.title)
    returning id into v_gift;
  insert into public.audit_log(actor_id, actor_email, action, entity_type, entity_id, metadata)
    values (auth.uid(), auth.jwt() ->> 'email', 'sfo.cash.registered', 'sadaqa_gift', v_gift::text, jsonb_build_object('activity_id', p_id, 'student_id', p_student, 'amount', p_amount));
  return v_gift;
end;
$$;

create or replace function public.activity_refunds(p_id uuid) returns table(student_id uuid, name text, family_id uuid, paid_ore integer, refund_ore integer)
language plpgsql stable security definer set search_path = public
as $$
declare v_activity public.school_activities;
begin
  if not public.is_admin() then raise exception 'Admin only' using errcode = '42501'; end if;
  select * into v_activity from public.school_activities a where a.id = p_id;
  return query select x.student_id, x.student_name, s.family_id, public.activity_paid_ore(p_id, x.student_id),
    case v_activity.cancel_refund when 'full' then public.activity_paid_ore(p_id, x.student_id) when 'amount' then least(v_activity.cancel_refund_ore, public.activity_paid_ore(p_id, x.student_id)) else 0 end
  from public.activity_students x join public.students s on s.id = x.student_id
  where x.activity_id = p_id and v_activity.status = 'cancelled' and public.activity_paid_ore(p_id, x.student_id) > 0 order by x.student_name;
end;
$$;

create or replace function public.create_activity_payment(p_id uuid, p_students uuid[]) returns table(payment_id uuid, reference text, amount integer)
language plpgsql security definer set search_path = public
as $$
declare v_activity public.school_activities; v_payment uuid := gen_random_uuid(); v_reference text; v_total integer;
begin
  select * into v_activity from public.school_activities a where a.id = p_id for update;
  if v_activity.id is null or v_activity.owner <> 'sfo' or v_activity.status <> 'published' or v_activity.price_ore is null or v_activity.event_date < public.oslo_today()
    then raise exception 'Payment unavailable' using errcode = '22023'; end if;
  if coalesce(array_length(p_students, 1), 0) = 0 or exists(select 1 from unnest(p_students) s where not public.activity_owns_child(s, true)
    or not exists(select 1 from public.activity_responses r where r.activity_id = p_id and r.student_id = s and r.going))
    then raise exception 'Guardian access required' using errcode = '42501'; end if;
  select coalesce(sum(greatest(v_activity.price_ore - public.activity_paid_ore(p_id, s), 0)), 0) into v_total from (select distinct unnest(p_students) s) t;
  if v_total <= 0 then raise exception 'Already paid' using errcode = '22023'; end if;
  v_reference := 'isk-akt-' || substr(replace(v_payment::text, '-', ''), 1, 20);
  insert into public.payments(id, reference, amount, description, status, school_year_id, method)
    values (v_payment, v_reference, v_total, left(v_activity.title, 100), 'opprettet', v_activity.school_year_id, 'vipps');
  insert into public.activity_payment_targets(payment_id, activity_id, student_id, amount)
    select v_payment, p_id, t.s, v_activity.price_ore - public.activity_paid_ore(p_id, t.s) from (select distinct unnest(p_students) s) t
    where v_activity.price_ore - public.activity_paid_ore(p_id, t.s) > 0;
  return query select v_payment, v_reference, v_total;
end;
$$;

create or replace function public.record_activity_payment(p_payment uuid) returns integer language plpgsql security definer set search_path = public
as $$
declare v_payment public.payments; v_count integer;
begin
  select * into v_payment from public.payments where id = p_payment for update;
  if v_payment.id is null or v_payment.voided_at is not null or v_payment.captured_amount < v_payment.amount then return 0; end if;
  insert into public.sadaqa_gifts(amount, received_on, method, family_id, school_year_id, source_payment_id, activity_id, student_id, created_by, note, donor_name)
    select t.amount, coalesce((v_payment.captured_at at time zone 'Europe/Oslo')::date, public.oslo_today()), 'vipps', s.family_id, a.school_year_id, v_payment.id, t.activity_id, t.student_id, 'vipps', a.title, v_payment.payer_name
    from public.activity_payment_targets t join public.students s on s.id = t.student_id join public.school_activities a on a.id = t.activity_id
    where t.payment_id = p_payment
    on conflict (source_payment_id, student_id) where activity_id is not null and source_payment_id is not null do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.record_activity_payment(uuid) from public, anon, authenticated;
grant execute on function public.record_activity_payment(uuid) to service_role;

create or replace function public.public_sfo_activities() returns table(id uuid, title text, description text, event_date date, start_time time, end_time time,
  location text, min_age integer, max_age integer, price_ore integer, respond_by date, capacity integer, spots_left integer)
language sql stable security definer set search_path = public
as $$
  select a.id, a.title, a.description, a.event_date, a.start_time, a.end_time, a.location, a.min_age, a.max_age, a.price_ore, a.respond_by, a.capacity, public.activity_spots_left(a.id)
  from public.school_activities a
  where a.owner = 'sfo' and a.status = 'published' and a.show_on_website and a.event_date >= public.oslo_today()
  order by a.event_date, a.start_time nulls first
$$;
grant execute on function public.public_sfo_activities() to anon, authenticated;

create or replace function public.queue_activity_reminders() returns integer language plpgsql security definer set search_path = public
as $$
declare v_before integer; v_after integer; v_today date := public.oslo_today();
begin
  select count(*) into v_before from public.school_email_deliveries where kind in ('activity_respond_reminder', 'activity_payment_reminder');
  perform public.queue_family_school_email('activity_respond_reminder', f.activity_id, f.family_id)
    from (select distinct a.id activity_id, s.family_id from public.school_activities a join public.activity_students x on x.activity_id = a.id join public.students s on s.id = x.student_id
      where a.owner = 'sfo' and a.status = 'published' and a.respond_by between v_today and v_today + 2 and s.family_id is not null
        and not exists(select 1 from public.activity_responses r where r.activity_id = a.id and r.student_id = x.student_id)
        and (a.capacity is null or public.activity_going_count(a.id) < a.capacity)) f;
  perform public.queue_family_school_email('activity_payment_reminder', f.activity_id, f.family_id)
    from (select distinct a.id activity_id, s.family_id from public.school_activities a join public.activity_responses r on r.activity_id = a.id and r.going join public.students s on s.id = r.student_id
      where a.owner = 'sfo' and a.status = 'published' and a.price_ore is not null and a.payment_due between v_today and v_today + 2 and s.family_id is not null
        and public.activity_paid_ore(a.id, r.student_id) < a.price_ore) f;
  select count(*) into v_after from public.school_email_deliveries where kind in ('activity_respond_reminder', 'activity_payment_reminder');
  return v_after - v_before;
end;
$$;
revoke all on function public.queue_activity_reminders() from public, anon, authenticated;
grant execute on function public.queue_activity_reminders() to service_role;

revoke all on function public.save_sfo_activity(uuid, timestamptz, text, text, boolean, text, date, date, text, time, time, integer, integer, integer, integer, date, boolean, uuid[]) from public, anon;
grant execute on function public.save_sfo_activity(uuid, timestamptz, text, text, boolean, text, date, date, text, time, time, integer, integer, integer, integer, date, boolean, uuid[]) to authenticated;
revoke all on function public.class_activity_overview() from public, anon;
grant execute on function public.class_activity_overview() to authenticated;
revoke all on function public.sfo_activity_roster(uuid) from public, anon;
grant execute on function public.sfo_activity_roster(uuid) to authenticated;
revoke all on function public.sfo_activity_payments(uuid) from public, anon;
grant execute on function public.sfo_activity_payments(uuid) to authenticated;
revoke all on function public.register_activity_cash(uuid, uuid, integer, date) from public, anon;
grant execute on function public.register_activity_cash(uuid, uuid, integer, date) to authenticated;
revoke all on function public.activity_refunds(uuid) from public, anon;
grant execute on function public.activity_refunds(uuid) to authenticated;
revoke all on function public.create_activity_payment(uuid, uuid[]) from public, anon;
grant execute on function public.create_activity_payment(uuid, uuid[]) to authenticated;
revoke all on function public.activity_can_roster(uuid) from public, anon;
grant execute on function public.activity_can_roster(uuid) to authenticated;
revoke all on function public.cancel_school_activity(uuid, timestamptz, text, integer) from public, anon;
revoke all on function public.respond_school_activity(uuid, uuid, uuid, timestamptz, text, boolean, boolean) from public, anon;

drop function if exists public.my_activity_status(uuid);
create function public.my_activity_status(p_student uuid) returns table(activity_id uuid, paid_ore integer, spots_left integer, health_confirm_needed boolean, allergies text, medical_notes text)
language sql stable security definer set search_path = public
as $$
  select a.id, public.activity_paid_ore(a.id, p_student), public.activity_spots_left(a.id),
    a.owner = 'sfo' and (s.health_updated_at is null or (s.health_updated_at at time zone 'Europe/Oslo')::date < y.starts_on),
    s.allergies, s.medical_notes
  from public.activity_students st
  join public.school_activities a on a.id = st.activity_id and a.status in ('published', 'cancelled')
  join public.students s on s.id = st.student_id
  join public.school_years y on y.id = a.school_year_id
  where st.student_id = p_student and public.activity_owns_child(p_student)
$$;
revoke all on function public.my_activity_status(uuid) from public, anon;
grant execute on function public.my_activity_status(uuid) to authenticated;

notify pgrst, 'reload schema';
