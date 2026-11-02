create function public.guard_class_capacity() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_capacity integer;
begin
  if new.status <> 'aktiv' then return new; end if;
  if tg_op = 'UPDATE' then
    if old.status = 'aktiv' and old.class_id = new.class_id and old.school_year_id = new.school_year_id then return new; end if;
  end if;
  select capacity into v_capacity from public.classes where id = new.class_id for update;
  if v_capacity is not null and (select count(*) from public.enrollments
    where class_id = new.class_id and school_year_id = new.school_year_id and status = 'aktiv' and id <> new.id) >= v_capacity then
    raise exception 'Klassen er full. Oppdater kapasiteten i plasseringen og prøv igjen.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger enrollments_guard_class_capacity before insert or update of class_id, school_year_id, status on public.enrollments
for each row execute function public.guard_class_capacity();

create function public.admin_place_student(
  p_student uuid, p_class uuid, p_year uuid, p_enrollment uuid default null,
  p_expected_class uuid default null, p_new_capacity integer default null,
  p_expected_capacity integer default null, p_reprice boolean default false,
  p_expected_price numeric default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_class public.classes;
  v_enrollment public.enrollments;
  v_price numeric;
  v_id uuid;
  v_count integer;
begin
  if not coalesce(public.is_admin(), false) then raise exception 'Access denied' using errcode = '42501'; end if;
  perform 1 from public.students where id = p_student for update;
  if not found then raise exception 'Fant ikke eleven' using errcode = '22023'; end if;
  select * into v_class from public.classes where id = p_class for update;
  if not found then raise exception 'Fant ikke klassen' using errcode = '22023'; end if;
  select coalesce(v_class.price, fee) into v_price from public.school_years where id = p_year;
  if not found then raise exception 'Fant ikke skoleåret' using errcode = '22023'; end if;
  if p_reprice and p_expected_price is distinct from v_price then
    raise exception 'Prisen er endret. Last inn eleven på nytt før du bytter klasse.' using errcode = 'P0001';
  end if;
  if p_enrollment is not null then
    select * into v_enrollment from public.enrollments where id = p_enrollment for update;
    if not found or v_enrollment.student_id <> p_student or v_enrollment.school_year_id <> p_year
      or v_enrollment.status <> 'aktiv' or v_enrollment.class_id is distinct from p_expected_class then
      raise exception 'Plasseringen er endret. Last inn eleven på nytt før du bytter klasse.' using errcode = 'P0001';
    end if;
    if v_enrollment.class_id = p_class then raise exception 'Eleven går allerede i denne klassen' using errcode = '22023'; end if;
  elsif exists(select 1 from public.enrollments where student_id = p_student and school_year_id = p_year and status = 'aktiv') then
    raise exception 'Eleven har allerede en plass dette skoleåret. Bruk Bytt klasse.' using errcode = 'P0001';
  end if;
  select count(*) into v_count from public.enrollments where class_id = p_class and school_year_id = p_year and status = 'aktiv';
  if p_new_capacity is not null then
    if v_class.capacity is distinct from p_expected_capacity then
      raise exception 'Kapasiteten er endret. Kontroller klassens kapasitet før du prøver igjen.' using errcode = 'P0001';
    end if;
    if v_class.capacity is null or p_new_capacity <= v_class.capacity or p_new_capacity < v_count + 1 or p_new_capacity > 10000 then
      raise exception 'Ny kapasitet må være større enn dagens kapasitet og ha plass til eleven.' using errcode = '22023';
    end if;
    update public.classes set capacity = p_new_capacity where id = p_class;
    insert into public.audit_log(actor_id, actor_email, action, entity_type, entity_id, metadata)
      values (auth.uid(), auth.jwt() ->> 'email', 'class.update', 'classes', p_class::text, jsonb_build_object('capacityBefore', v_class.capacity, 'capacity', p_new_capacity, 'source', 'placement', 'studentId', p_student));
  end if;
  if p_enrollment is not null then
    update public.enrollments set class_id = p_class,
      price_snapshot = case when p_reprice then v_price else price_snapshot end
      where id = p_enrollment returning id into v_id;
  else
    select id into v_id from public.enrollments where student_id = p_student and class_id = p_class and school_year_id = p_year;
    if v_id is null then
      insert into public.enrollments(student_id, class_id, school_year_id, status, price_snapshot)
        values(p_student, p_class, p_year, 'aktiv', v_price) returning id into v_id;
    else
      update public.enrollments set status = 'aktiv', price_snapshot = v_price where id = v_id;
    end if;
  end if;
  return v_id;
end;
$$;

create function public.admin_admit_student(
  p_application uuid, p_returning_student uuid default null, p_class uuid default null,
  p_year uuid default null, p_new_capacity integer default null, p_expected_capacity integer default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_app public.student_applications;
  v_student uuid;
  v_enrollment uuid;
begin
  if not coalesce(public.is_admin(), false) then raise exception 'Access denied' using errcode = '42501'; end if;
  select * into v_app from public.student_applications where id = p_application for update;
  if not found or v_app.merged_into_student_id is not null then raise exception 'Fant ikke en tilgjengelig påmelding' using errcode = '22023'; end if;
  if exists(select 1 from public.students where application_id = p_application) then
    raise exception 'Denne påmeldingen er allerede registrert som elev' using errcode = 'P0001';
  end if;
  if p_returning_student is not null then
    select id into v_student from public.students where id = p_returning_student for update;
    if not found then raise exception 'Fant ikke eksisterende elev' using errcode = '22023'; end if;
  else
    insert into public.students(application_id, family_id, child_first_name, child_last_name, child_birth_date, child_gender,
      child_address, child_postal_code, child_city, child_email, child_phone, mother_first_name, mother_last_name, mother_phone,
      mother_email, father_first_name, father_last_name, father_phone, father_email, child_level_quran, child_level_arabic, child_level_islam, notes)
    values(p_application, v_app.family_id, v_app.child_first_name, v_app.child_last_name, v_app.child_birth_date, v_app.child_gender,
      v_app.child_address, v_app.child_postal_code, v_app.child_city, v_app.child_email, v_app.child_phone, v_app.mother_first_name,
      v_app.mother_last_name, v_app.mother_phone, v_app.mother_email, v_app.father_first_name, v_app.father_last_name,
      v_app.father_phone, v_app.father_email, v_app.child_level_quran, v_app.child_level_arabic, v_app.child_level_islam, v_app.message)
    returning id into v_student;
  end if;
  if p_class is not null then
    if p_year is null then raise exception 'Velg skoleår for plasseringen' using errcode = '22023'; end if;
    if exists(select 1 from public.enrollments where student_id = v_student and school_year_id = p_year and status = 'aktiv') then
      raise exception 'Eleven har allerede en plass dette skoleåret. Ta opp uten plass og bruk Bytt klasse.' using errcode = 'P0001';
    end if;
    v_enrollment := public.admin_place_student(v_student, p_class, p_year, null, null, p_new_capacity, p_expected_capacity);
  elsif p_new_capacity is not null then
    raise exception 'Velg klasse før kapasiteten endres' using errcode = '22023';
  end if;
  update public.student_applications set status = 'akseptert' where id = p_application;
  return jsonb_build_object('student_id', v_student, 'enrollment_id', v_enrollment);
end;
$$;

revoke all on function public.guard_class_capacity() from public, anon, authenticated;
revoke all on function public.admin_place_student(uuid, uuid, uuid, uuid, uuid, integer, integer, boolean, numeric) from public, anon;
revoke all on function public.admin_admit_student(uuid, uuid, uuid, uuid, integer, integer) from public, anon;
grant execute on function public.admin_place_student(uuid, uuid, uuid, uuid, uuid, integer, integer, boolean, numeric) to authenticated;
grant execute on function public.admin_admit_student(uuid, uuid, uuid, uuid, integer, integer) to authenticated;
