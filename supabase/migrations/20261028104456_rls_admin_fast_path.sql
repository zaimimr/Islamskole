do $$
declare
  r record;
  v_qual text;
  v_check text;
  v_admin_tables text[];
begin
  select coalesce(array_agg(distinct tablename), '{}') into v_admin_tables
  from pg_policies
  where schemaname = 'public'
    and cmd = 'ALL'
    and permissive = 'PERMISSIVE'
    and qual in ('is_admin()', '( SELECT is_admin() AS is_admin)');

  for r in
    select * from pg_policies where schemaname = 'public' and permissive = 'PERMISSIVE'
  loop
    v_qual := r.qual;
    if r.qual is null or r.qual = '( SELECT is_admin() AS is_admin)' or r.qual ~ '^CASE\s+WHEN \( SELECT is_admin\(\)' then
      v_qual := null;
    elsif r.qual = 'is_admin()' then
      v_qual := '(SELECT is_admin())';
    elsif r.qual ~ '(?<!SELECT )is_admin\(\)' then
      v_qual := format(
        'CASE WHEN (SELECT is_admin()) THEN true ELSE (%s) END',
        regexp_replace(r.qual, '(?<!SELECT )is_admin\(\)', '(SELECT is_admin())', 'g')
      );
    elsif r.qual !~ 'is_admin' and r.tablename = any (v_admin_tables) then
      v_qual := format('CASE WHEN (SELECT is_admin()) THEN false ELSE (%s) END', r.qual);
    else
      v_qual := null;
    end if;

    v_check := null;
    if r.with_check = 'is_admin()' then
      v_check := '(SELECT is_admin())';
    elsif r.with_check ~ '(?<!SELECT )is_admin\(\)' then
      v_check := format(
        'CASE WHEN (SELECT is_admin()) THEN true ELSE (%s) END',
        regexp_replace(r.with_check, '(?<!SELECT )is_admin\(\)', '(SELECT is_admin())', 'g')
      );
    end if;

    if v_qual is not null then
      execute format('alter policy %I on public.%I using (%s)', r.policyname, r.tablename, v_qual);
    end if;
    if v_check is not null then
      execute format('alter policy %I on public.%I with check (%s)', r.policyname, r.tablename, v_check);
    end if;
  end loop;
end $$;

create or replace function public.portal_my_lessons(p_from date, p_to date)
returns table(
  lesson_id uuid, school_day_id uuid, date date, class_id uuid, class_name_no text, class_name_en text,
  start_position integer, end_position integer, start_label text, end_label text,
  starts_at time without time zone, ends_at time without time zone, subject text,
  teacher_guardian_id uuid, teacher_first_name text, teacher_last_name text,
  co_teacher_guardian_id uuid, co_teacher_first_name text, co_teacher_last_name text,
  is_substitute boolean, cancelled boolean, is_mine boolean, note text
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with me as (
    select id from public.portal_guardian_ids() as id where public.guardian_has_role(id, 'teacher')
  ),
  taught as (
    select c.id from public.classes c where public.portal_is_teacher_of(c.id)
  ),
  mine as (
    select l.id, l.school_day_id
    from public.lessons l
    join public.school_days d on d.id = l.school_day_id
    join public.school_years sy on sy.id = d.school_year_id and sy.is_active
    where d.date between p_from and p_to
      and (
        l.teacher_guardian_id in (select id from me)
        or l.co_teacher_guardian_id in (select id from me)
        or l.class_id in (select id from taught)
      )
  )
  select p.*
  from public.portal_lessons(array(select distinct mine.school_day_id from mine)) p
  where p.lesson_id in (select mine.id from mine);
$function$;
