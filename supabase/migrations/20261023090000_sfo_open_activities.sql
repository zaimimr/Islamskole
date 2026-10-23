alter table public.school_activities add column if not exists signup boolean not null default true;

alter table public.school_activities drop constraint if exists school_activities_signup_check;
alter table public.school_activities add constraint school_activities_signup_check
  check (signup or (owner = 'sfo' and not needs_consent and price_ore is null and capacity is null and respond_by = event_date));

insert into public.permissions (key, name) values ('students.allergies.read', 'Allergiliste for alle elever')
on conflict (key) do update set name = excluded.name;
insert into public.role_permissions (role_key, permission_key) values ('sfo', 'students.allergies.read') on conflict do nothing;

drop function if exists public.save_sfo_activity(uuid, timestamptz, text, text, boolean, text, date, date, text, time, time, integer, integer, integer, integer, date, boolean, uuid[]);
create or replace function public.save_sfo_activity(
  p_id uuid, p_expected timestamptz, p_title text, p_description text, p_needs_consent boolean, p_consent text, p_date date, p_respond_by date,
  p_location text, p_start time, p_end time, p_capacity integer, p_min_age integer, p_max_age integer, p_price_ore integer, p_payment_due date,
  p_show_on_website boolean, p_audience uuid[], p_signup boolean default true
) returns public.school_activities language plpgsql security definer set search_path = public
as $$
declare
  v_activity public.school_activities;
  v_year uuid;
  v_today date := public.oslo_today();
  v_audience uuid[] := coalesce((select array_agg(distinct x order by x) from unnest(coalesce(p_audience, '{}')) x), '{}');
  v_current uuid[];
  v_change uuid;
  v_signup boolean := coalesce(p_signup, true);
  v_respond_by date := case when coalesce(p_signup, true) then p_respond_by else p_date end;
begin
  if not public.has_permission('activities.sfo.manage') then raise exception 'SFO access denied' using errcode = '42501'; end if;
  if exists(select 1 from unnest(v_audience) x where not exists(select 1 from public.classes c where c.id = x)) then raise exception 'Unknown class' using errcode = '22023'; end if;
  if not v_signup and (p_needs_consent or p_price_ore is not null or p_capacity is not null) then raise exception 'Open activity cannot have consent, price or capacity' using errcode = '22023'; end if;
  select * into v_activity from public.school_activities where id = p_id for update;
  if v_activity.id is not null and v_activity.owner <> 'sfo' then raise exception 'SFO access denied' using errcode = '42501'; end if;
  if v_activity.id is null or v_activity.status = 'draft' then
    if p_date < v_today or v_respond_by < v_today then raise exception 'Choose a future date and response deadline' using errcode = '22023'; end if;
  end if;
  if v_activity.id is not null then
    if p_expected is null and v_activity.updated_by = auth.uid() and v_activity.title = btrim(p_title) and v_activity.event_date = p_date then return v_activity; end if;
    if v_activity.updated_at is distinct from p_expected then raise exception 'Activity changed' using errcode = 'PT409'; end if;
    if v_activity.status = 'cancelled' then raise exception 'Cancelled activity is immutable' using errcode = '23514'; end if;
    if v_activity.status = 'published' then
      select coalesce(array_agg(class_id order by class_id), '{}') into v_current from public.activity_audience where activity_id = p_id;
      if v_current <> v_audience or v_activity.price_ore is distinct from p_price_ore or v_activity.needs_consent <> p_needs_consent
        or v_activity.consent_text <> btrim(coalesce(p_consent, '')) or v_activity.min_age is distinct from p_min_age or v_activity.max_age is distinct from p_max_age
        or v_activity.signup <> v_signup
        then raise exception 'Published activity terms are immutable' using errcode = '23514'; end if;
      if p_date < v_today then raise exception 'Choose a future date' using errcode = '22023'; end if;
      if p_capacity is not null and p_capacity < public.activity_going_count(p_id) then raise exception 'Capacity below sign-ups' using errcode = '22023'; end if;
      if v_activity.event_date <> p_date or v_activity.start_time is distinct from p_start or v_activity.end_time is distinct from p_end
        or v_activity.location is distinct from nullif(btrim(coalesce(p_location, '')), '') then
        insert into public.activity_changes(activity_id, changed_by, previous)
          values (p_id, auth.uid(), jsonb_build_object('event_date', v_activity.event_date, 'start_time', v_activity.start_time, 'end_time', v_activity.end_time, 'location', v_activity.location))
          returning id into v_change;
        perform public.queue_family_school_email('activity_changed', v_change, f.family_id)
          from (select distinct s.family_id from public.activity_students x join public.students s on s.id = x.student_id
            where x.activity_id = p_id and s.family_id is not null
              and (not v_signup or exists(select 1 from public.activity_responses r where r.activity_id = p_id and r.student_id = x.student_id and r.going))) f;
      end if;
    end if;
    update public.school_activities set title = btrim(p_title), description = btrim(coalesce(p_description, '')), needs_consent = p_needs_consent,
      consent_text = btrim(coalesce(p_consent, '')), event_date = p_date, respond_by = v_respond_by, location = nullif(btrim(coalesce(p_location, '')), ''),
      start_time = p_start, end_time = p_end, capacity = p_capacity, min_age = p_min_age, max_age = p_max_age, price_ore = p_price_ore,
      payment_due = p_payment_due, show_on_website = p_show_on_website, signup = v_signup, updated_at = clock_timestamp(), updated_by = auth.uid()
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
      location, start_time, end_time, capacity, min_age, max_age, price_ore, payment_due, show_on_website, signup, updated_by)
      values (p_id, 'sfo', null, v_year, btrim(p_title), btrim(coalesce(p_description, '')), p_needs_consent, btrim(coalesce(p_consent, '')), p_date, v_respond_by,
        nullif(btrim(coalesce(p_location, '')), ''), p_start, p_end, p_capacity, p_min_age, p_max_age, p_price_ore, p_payment_due, p_show_on_website, v_signup, auth.uid())
      returning * into v_activity;
    insert into public.activity_audience(activity_id, class_id) select p_id, x from unnest(v_audience) x;
  end if;
  return v_activity;
end;
$$;
revoke all on function public.save_sfo_activity(uuid, timestamptz, text, text, boolean, text, date, date, text, time, time, integer, integer, integer, integer, date, boolean, uuid[], boolean) from public, anon;
grant execute on function public.save_sfo_activity(uuid, timestamptz, text, text, boolean, text, date, date, text, time, time, integer, integer, integer, integer, date, boolean, uuid[], boolean) to authenticated;

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
  if not v_activity.signup then raise exception 'Activity has no sign-up' using errcode = '22023'; end if;
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

create or replace function public.record_activity_participation(p_id uuid, p_student uuid, p_participation text) returns void language plpgsql security definer set search_path = public
as $$
declare v_activity public.school_activities;
begin
  select * into v_activity from public.school_activities where id = p_id for update;
  if not public.activity_can_roster(p_id) then raise exception 'Activity access denied' using errcode = '42501'; end if;
  if v_activity.status <> 'published' or v_activity.event_date > public.oslo_today() then raise exception 'Activity has not taken place' using errcode = '22023'; end if;
  if p_participation not in ('unrecorded', 'participated', 'absent')
    or not exists(select 1 from public.activity_students where activity_id = p_id and student_id = p_student)
    or (v_activity.signup and not exists(select 1 from public.activity_responses where activity_id = p_id and student_id = p_student and consent = 'granted' and going))
    then raise exception 'Participation requires consent and planned attendance' using errcode = '22023'; end if;
  update public.activity_students set participation = p_participation, participation_by = auth.uid(), participation_at = clock_timestamp() where activity_id = p_id and student_id = p_student;
end;
$$;

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
          and (v_activity.owner = 'class' or not v_activity.signup or exists(select 1 from public.activity_responses r where r.activity_id = p_id and r.student_id = x.student_id and r.going))) f;
  end if;
  return p_id;
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
    r.consent, case when v_activity.signup then coalesce(r.going, false) else true end, x.participation, public.activity_paid_ore(p_id, s.id)
  from public.activity_students x join public.students s on s.id = x.student_id
  left join public.activity_responses r on r.activity_id = x.activity_id and r.student_id = x.student_id
  where x.activity_id = p_id and (not v_activity.signup or r.student_id is not null)
  order by coalesce(r.going, not v_activity.signup) desc, s.child_first_name, s.child_last_name;
end;
$$;

drop function if exists public.public_sfo_activities();
create function public.public_sfo_activities() returns table(id uuid, title text, description text, event_date date, start_time time, end_time time,
  location text, min_age integer, max_age integer, price_ore integer, respond_by date, capacity integer, spots_left integer, signup boolean)
language sql stable security definer set search_path = public
as $$
  select a.id, a.title, a.description, a.event_date, a.start_time, a.end_time, a.location, a.min_age, a.max_age, a.price_ore, a.respond_by, a.capacity, public.activity_spots_left(a.id), a.signup
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
      where a.owner = 'sfo' and a.signup and a.status = 'published' and a.respond_by between v_today and v_today + 2 and s.family_id is not null
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

create or replace function public.sfo_allergy_list() returns table(student_id uuid, name text, classes text, allergies text)
language plpgsql security definer set search_path = public
as $$
begin
  if not public.has_permission('students.allergies.read') then raise exception 'Access denied' using errcode = '42501'; end if;
  insert into public.audit_log(actor_id, actor_email, action, entity_type, entity_id, metadata)
    values (auth.uid(), auth.jwt() ->> 'email', 'sfo.allergies.read', 'students', 'allergies', '{}'::jsonb);
  return query select s.id, concat_ws(' ', s.child_first_name, s.child_last_name),
    string_agg(distinct c.name_no, ', '), s.allergies
  from public.students s
  join public.enrollments e on e.student_id = s.id and e.status = 'aktiv'
  join public.school_years y on y.id = e.school_year_id and y.is_active
  join public.classes c on c.id = e.class_id
  where nullif(btrim(coalesce(s.allergies, '')), '') is not null
  group by s.id
  order by min(c.sort_order), s.child_first_name, s.child_last_name;
end;
$$;
revoke all on function public.sfo_allergy_list() from public, anon;
grant execute on function public.sfo_allergy_list() to authenticated;

notify pgrst, 'reload schema';
