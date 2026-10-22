drop function if exists public.publish_school_activity(uuid, timestamptz);
create function public.publish_school_activity(p_id uuid, p_expected timestamptz, p_notify boolean default true) returns uuid language plpgsql security definer set search_path = public
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
  if p_notify then perform public.queue_family_school_email('activity_consent', p_id, f.family_id)
    from (select distinct s.family_id from public.activity_students x join public.students s on s.id = x.student_id where x.activity_id = p_id and s.family_id is not null) f; end if;
  return p_id;
end;
$$;
revoke all on function public.publish_school_activity(uuid, timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.publish_school_activity(uuid, timestamptz, boolean) to authenticated;
