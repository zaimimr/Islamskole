create function public.portal_active_school_year()
returns table (id uuid, label text) language sql stable security definer set search_path = public
as $$
  select sy.id, sy.label from public.school_years sy where sy.is_active and auth.uid() is not null;
$$;
revoke all on function public.portal_active_school_year() from public, anon;
grant execute on function public.portal_active_school_year() to authenticated;

create function public.teaching_previous_years(p_class_id uuid, p_school_year_id uuid)
returns table (id uuid, label text) language plpgsql stable security definer set search_path = public
as $$
begin
  if not (public.is_admin() or public.portal_can_edit_week_plan(p_class_id, p_school_year_id)) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  return query select sy.id, sy.label from public.school_years sy
    join public.school_years target on target.id = p_school_year_id and target.is_active
    where sy.starts_on < target.starts_on
      and exists (select 1 from public.class_week_plans p where p.class_id = p_class_id and p.school_year_id = sy.id)
    order by sy.starts_on desc;
end;
$$;
revoke all on function public.teaching_previous_years(uuid, uuid) from public, anon;
grant execute on function public.teaching_previous_years(uuid, uuid) to authenticated;
