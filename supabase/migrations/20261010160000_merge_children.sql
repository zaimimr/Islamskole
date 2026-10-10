alter table public.student_applications
  add column merged_into_student_id uuid references public.students(id) on delete restrict;

create function public.prevent_merged_application_conversion()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if exists (select 1 from public.student_applications
    where id = new.application_id and merged_into_student_id is not null
      and merged_into_student_id <> new.id) then
    raise exception 'Denne innmeldingen er allerede slått sammen med en elev.';
  end if;
  return new;
end;
$$;
revoke all on function public.prevent_merged_application_conversion() from public, anon, authenticated;
create trigger students_prevent_merged_application before insert or update of application_id on public.students
  for each row execute function public.prevent_merged_application_conversion();

alter table public.learning_progress_updates
  drop constraint learning_progress_updates_goal_id_student_id_fkey,
  add constraint learning_progress_updates_goal_id_student_id_fkey
    foreign key (goal_id, student_id) references public.learning_goals(id, student_id)
    on update cascade on delete cascade;

drop trigger attendance_stamp_marker on public.attendance;
create trigger attendance_stamp_marker before insert or update of status on public.attendance
  for each row execute function public.attendance_stamp_marker();

create function public.admin_merge_children(
  p_keep uuid,
  p_student uuid default null,
  p_application uuid default null,
  p_confirm boolean default false,
  p_expected text default null
)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_keep public.students;
  v_source jsonb;
  v_app public.student_applications;
  v_payment public.payments;
  v_ids uuid[];
  v_app_ids uuid[];
  v_payment_ids uuid[];
  v_snapshot jsonb;
  v_rows jsonb;
  v_result jsonb;
  v_conflicts jsonb := '[]';
  v_fields jsonb := '[]';
  v_finances jsonb;
  v_classes jsonb;
  v_token text;
  v_table text;
  v_field text;
  v_pair record;
  v_share integer := 0;
  v_available integer;
  v_children integer;
  v_paid_year uuid;
  v_allocations jsonb;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Du har ikke tilgang til å gjøre dette.' using errcode = '42501';
  end if;
  if p_keep is null or (p_student is null) = (p_application is null) or p_student = p_keep then
    raise exception 'Velg en elev og én annen elev eller innmelding.';
  end if;

  select * into v_keep from public.students where id = p_keep;
  if not found or v_keep.family_id is null then raise exception 'Fant ikke eleven eller familien.'; end if;
  perform 1 from public.families where id = v_keep.family_id for update;
  v_ids := array_remove(array[p_keep, p_student], null);
  perform 1 from public.students where id = any(v_ids) order by id for update;
  select * into v_keep from public.students where id = p_keep;
  if p_student is not null then
    select to_jsonb(s) into v_source from public.students s
      where s.id = p_student and s.family_id = v_keep.family_id;
    if v_source is null then raise exception 'Barna må tilhøre samme familie. Slå sammen familiene først.'; end if;
    p_application := (v_source ->> 'application_id')::uuid;
  else
    select * into v_app from public.student_applications where id = p_application for update;
    if not found or v_app.family_id is distinct from v_keep.family_id then
      raise exception 'Innmeldingen må tilhøre samme familie.';
    end if;
    if v_app.merged_into_student_id is not null or exists (
      select 1 from public.students where application_id = p_application
    ) then raise exception 'Innmeldingen er allerede knyttet til en elev. Velg elevoppføringen.'; end if;
    v_source := to_jsonb(v_app) || jsonb_build_object('notes', v_app.message);
  end if;

  select coalesce(array_agg(a.id order by a.id), array[]::uuid[]) into v_app_ids
    from public.student_applications a
    where a.id in (v_keep.application_id, p_application) or a.merged_into_student_id = any(v_ids);
  perform 1 from public.student_applications where id = any(v_app_ids) order by id for update;
  select coalesce(array_agg(p.id order by p.id), array[]::uuid[]) into v_payment_ids
    from public.payments p where p.student_id = any(v_ids)
      or p.id in (select payment_id from public.student_applications where id = any(v_app_ids))
      or p.id in (select payment_id from public.payment_allocations where student_id = any(v_ids))
      or p.id in (select payment_id from public.payment_targets where student_id = any(v_ids))
      or p.id in (select payment_id from public.installments where student_id = any(v_ids))
      or p.id in (select payment_id from public.refunds where student_id = any(v_ids));
  perform 1 from public.payments where id = any(v_payment_ids) order by id for update;
  v_snapshot := jsonb_build_object('students', (select jsonb_agg(to_jsonb(s) order by s.id) from public.students s where s.id = any(v_ids)),
    'applications', (select jsonb_agg(to_jsonb(a) order by a.id) from public.student_applications a where a.id = any(v_app_ids)),
    'payments', (select jsonb_agg(to_jsonb(p) order by p.id) from public.payments p where p.id = any(v_payment_ids)));
  foreach v_table in array array['enrollments', 'student_fees', 'payment_allocations', 'payment_targets',
    'student_guardians', 'student_fee_adjustments', 'refunds', 'installments', 'attendance', 'absence_reports',
    'learning_goals', 'learning_progress_updates']
  loop
    execute format('select 1 from public.%I where student_id = any($1) for update', v_table) using v_ids;
    execute format('select coalesce(jsonb_agg(row_data order by row_data::text), ''[]''::jsonb) from (select to_jsonb(t) row_data from public.%I t where student_id = any($1)) rows', v_table)
      into v_rows using v_ids;
    v_snapshot := v_snapshot || jsonb_build_object(v_table, v_rows);
  end loop;

  if v_keep.child_birth_date is not null and nullif(v_source ->> 'child_birth_date', '') is not null
    and v_keep.child_birth_date::text <> v_source ->> 'child_birth_date' then
    v_conflicts := v_conflicts || jsonb_build_array('Fødselsdatoene er ulike. Kontroller og rett dem før sammenslåing.');
  end if;
  if nullif(btrim(v_keep.child_email), '') is not null and nullif(btrim(v_source ->> 'child_email'), '') is not null
    and lower(btrim(v_keep.child_email)) <> lower(btrim(v_source ->> 'child_email')) then
    v_conflicts := v_conflicts || jsonb_build_array('Barna har ulike e-poster for innlogging. Velg riktig e-post på elevsidene først.');
  end if;
  if exists (select 1 from public.enrollments where student_id = any(v_ids) and status = 'aktiv'
    group by school_year_id having count(distinct class_id) > 1) then
    v_conflicts := v_conflicts || jsonb_build_array('Barna har ulike aktive klasser i samme skoleår. Avslutt feil plassering først.');
  end if;
  if exists (select 1 from public.student_fees where student_id = any(v_ids)
    group by school_year_id having count(distinct (amount, discount)) > 1) then
    v_conflicts := v_conflicts || jsonb_build_array('Kontingentkravene er ulike i samme skoleår. Avklar riktig krav på elevsidene først.');
  end if;
  if exists (select 1 from public.student_fee_adjustments where student_id = any(v_ids) and revoked_at is null
    group by school_year_id having count(distinct student_id) > 1) then
    v_conflicts := v_conflicts || jsonb_build_array('Begge barna har aktive kontingentjusteringer i samme skoleår. Avklar justeringene først.');
  end if;
  if exists (select 1 from public.installments where student_id = any(v_ids) and status in ('planlagt', 'sendt')
    group by school_year_id having count(distinct student_id) > 1) then
    v_conflicts := v_conflicts || jsonb_build_array('Begge barna har ubetalte avdrag i samme skoleår. Avklar betalingsplanene først.');
  end if;
  if exists (select 1 from public.attendance where student_id = any(v_ids)
    group by lesson_id having count(distinct status) > 1) then
    v_conflicts := v_conflicts || jsonb_build_array('Oppmøteregistreringene er ulike for samme time. Rett oppmøtet først.');
  end if;
  if exists (select 1 from public.absence_reports where student_id = any(v_ids) and withdrawn_at is null
    group by school_day_id having count(*) > 1) then
    v_conflicts := v_conflicts || jsonb_build_array('Begge barna har aktivt meldt fravær samme dag. Trekk tilbake duplikatet først.');
  end if;
  if exists (select 1 from public.payments p where p.id = any(v_payment_ids) and p.refunded_amount > 0
    and (select count(*) from public.payment_allocations a where a.payment_id = p.id and a.student_id = any(v_ids)) > 1) then
    v_conflicts := v_conflicts || jsonb_build_array('En delt betaling har refusjon på begge elevoppføringene. Avklar fordelingen først.');
  end if;
  if exists (select 1 from public.payments p where p.id in
    (select payment_id from public.student_applications where id = any(v_app_ids))
    and p.student_id is not null and not (p.student_id = any(v_ids))) then
    v_conflicts := v_conflicts || jsonb_build_array('En innmeldingsbetaling er knyttet til en annen elev. Avklar fordelingen først.');
  end if;
  if exists (select 1 from public.payment_allocations a where a.payment_id = any(v_payment_ids)
    and not exists (select 1 from public.student_fees f
      where f.student_id = a.student_id and f.school_year_id = a.school_year_id)) then
    v_conflicts := v_conflicts || jsonb_build_array('En betalingsfordeling mangler kontingentkrav. Fastsett kontingenten først.');
  end if;
  if exists (select 1 from public.payment_allocations where student_id = any(v_ids)
    group by payment_id having count(distinct school_year_id) > 1) then
    v_conflicts := v_conflicts || jsonb_build_array('Samme betaling er fordelt på ulike skoleår. Avklar fordelingen først.');
  end if;

  foreach v_field in array array['child_first_name', 'child_last_name', 'child_birth_date', 'child_gender',
    'child_email', 'child_phone', 'child_address', 'child_postal_code', 'child_city',
    'child_level_quran', 'child_level_arabic', 'child_level_islam',
    'mother_first_name', 'mother_last_name', 'mother_phone', 'mother_email',
    'father_first_name', 'father_last_name', 'father_phone', 'father_email']
  loop
    if nullif(btrim(v_source ->> v_field), '') is not null and
      nullif(btrim(to_jsonb(v_keep) ->> v_field), '') is distinct from nullif(btrim(v_source ->> v_field), '') then
      v_fields := v_fields || jsonb_build_array(jsonb_build_object('field', v_field,
        'kept', coalesce(nullif(btrim(to_jsonb(v_keep) ->> v_field), ''), v_source ->> v_field),
        'other', v_source ->> v_field));
    end if;
  end loop;

  if p_student is null then
    select * into v_payment from public.payments where id = v_app.payment_id;
    if found and v_payment.voided_at is null and v_payment.captured_amount > 0 then
      v_paid_year := v_payment.school_year_id;
      if v_paid_year is null or v_payment.refunded_amount > 0 then
        v_conflicts := v_conflicts || jsonb_build_array('Betalingen mangler skoleår eller har refusjon. Avklar betalingen først.');
      elsif not exists (select 1 from public.payment_allocations where payment_id = v_payment.id and student_id = p_keep) then
        select greatest(v_payment.captured_amount - coalesce(sum(amount), 0), 0)::integer into v_available
          from public.payment_allocations where payment_id = v_payment.id;
        select count(distinct coalesce(a.merged_into_student_id, s.id,
          case when a.id = p_application then p_keep else a.id end))::integer into v_children
          from public.student_applications a left join public.students s on s.application_id = a.id
          where a.payment_id = v_payment.id;
        if v_payment.student_id is not null and v_payment.student_id <> p_keep then
          v_conflicts := v_conflicts || jsonb_build_array('Betalingen er knyttet til en annen elev. Avklar fordelingen først.');
        else
          select least(v_available, coalesce(
            (select amount from public.payment_targets where payment_id = v_payment.id and student_id = p_keep),
            v_payment.captured_amount / greatest(v_children, 1))) into v_share;
        end if;
      end if;
    end if;
  end if;

  if v_share > 0 and not exists (select 1 from public.student_fees
    where student_id = p_keep and school_year_id = v_paid_year) then
    v_conflicts := v_conflicts || jsonb_build_array('Eleven mangler kontingentkrav for betalingsåret. Fastsett kontingenten først.');
  end if;
  for v_pair in select p.id, p.captured_amount from public.payments p where p.id in
    (select payment_id from public.student_applications where id = any(v_app_ids))
    and p.voided_at is null
  loop
    select count(distinct case when coalesce(a.merged_into_student_id, s.id, a.id) = p_student
      or a.id = p_application then p_keep else coalesce(a.merged_into_student_id, s.id, a.id) end)::integer into v_children
      from public.student_applications a left join public.students s on s.application_id = a.id
      where a.payment_id = v_pair.id;
    if v_children > 1 and (
      exists (select 1 from public.student_applications a left join public.students s on s.application_id = a.id
        where a.payment_id = v_pair.id and not (a.id = any(v_app_ids)) and (
          coalesce(a.merged_into_student_id, s.id) is null or not exists (
            select 1 from public.payment_targets t where t.payment_id = v_pair.id
              and t.student_id = coalesce(a.merged_into_student_id, s.id) and t.amount > 0)))
      or coalesce((select sum(amount) from public.payment_allocations where payment_id = v_pair.id), 0)
        + case when v_pair.id = v_payment.id then v_share else 0 end < v_pair.captured_amount
    ) then
      v_conflicts := v_conflicts || jsonb_build_array('En innmeldingsbetaling gjelder flere barn. Registrer de andre barna og avklar hele betalingsfordelingen først.');
    end if;
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('year', y.label, 'owed', totals.owed, 'paid', totals.paid,
    'remaining', greatest(totals.owed - totals.paid, 0)) order by y.starts_on), '[]') into v_finances
  from (
    select years.school_year_id,
      greatest(coalesce((select max(f.amount - f.discount) from public.student_fees f
        where f.student_id = any(v_ids) and f.school_year_id = years.school_year_id),
        (select fee * 100 from public.school_years where id = years.school_year_id), 0)
        - coalesce((select sum(a.amount) from public.student_fee_adjustments a where a.student_id = any(v_ids)
          and a.school_year_id = years.school_year_id and a.revoked_at is null), 0), 0) as owed,
      coalesce((select sum(b.paid) from public.student_balances b where b.student_id = any(v_ids)
        and b.school_year_id = years.school_year_id), 0) + case when years.school_year_id = v_paid_year then v_share else 0 end as paid
    from (select school_year_id from public.student_fees where student_id = any(v_ids)
      union select v_paid_year where v_share > 0) years
  ) totals join public.school_years y on y.id = totals.school_year_id;
  select coalesce(jsonb_agg(jsonb_build_object('year', y.label, 'class', c.name_no) order by y.starts_on, c.name_no), '[]') into v_classes
    from (select distinct school_year_id, class_id from public.enrollments where student_id = any(v_ids) and status = 'aktiv') e
    join public.classes c on c.id = e.class_id join public.school_years y on y.id = e.school_year_id;
  v_token := md5(v_snapshot::text || v_finances::text || v_classes::text);
  v_result := jsonb_build_object('token', v_token, 'keepName', concat_ws(' ', v_keep.child_first_name, v_keep.child_last_name),
    'otherName', concat_ws(' ', v_source ->> 'child_first_name', v_source ->> 'child_last_name'),
    'conflicts', v_conflicts, 'fields', v_fields, 'finances', v_finances, 'classes', v_classes);
  if not p_confirm then return v_result; end if;
  if p_expected is distinct from v_token then raise exception 'Opplysningene er endret. Vis forhåndsvisningen på nytt.'; end if;
  if jsonb_array_length(v_conflicts) > 0 then raise exception '%', v_conflicts ->> 0; end if;

  foreach v_field in array array['child_first_name', 'child_last_name', 'child_birth_date', 'child_gender',
    'child_email', 'child_phone', 'child_address', 'child_postal_code', 'child_city',
    'child_level_quran', 'child_level_arabic', 'child_level_islam',
    'mother_first_name', 'mother_last_name', 'mother_phone', 'mother_email',
    'father_first_name', 'father_last_name', 'father_phone', 'father_email']
  loop
    if nullif(btrim(to_jsonb(v_keep) ->> v_field), '') is null and nullif(btrim(v_source ->> v_field), '') is not null then
      execute format('update public.students set %I = (jsonb_populate_record(null::public.students, $1)).%I where id = $2', v_field, v_field)
        using v_source, p_keep;
    end if;
  end loop;
  update public.students set notes = nullif(concat_ws(E'\n\n', nullif(notes, ''),
    case when notes is distinct from v_source ->> 'notes' then nullif(v_source ->> 'notes', '') end), '') where id = p_keep;

  if p_student is not null then
    update public.students set
      allergies = nullif(concat_ws(E'\n\n', nullif(allergies, ''), case when allergies is distinct from v_source ->> 'allergies' then nullif(v_source ->> 'allergies', '') end), ''),
      medical_notes = nullif(concat_ws(E'\n\n', nullif(medical_notes, ''), case when medical_notes is distinct from v_source ->> 'medical_notes' then nullif(v_source ->> 'medical_notes', '') end), ''),
      photo_consent = photo_consent and (v_source ->> 'photo_consent')::boolean,
      health_updated_at = greatest(health_updated_at, (v_source ->> 'health_updated_at')::timestamptz),
      continues_next_year = case when coalesce((v_source ->> 'continues_answered_at')::timestamptz, '-infinity') > coalesce(continues_answered_at, '-infinity')
        then (v_source ->> 'continues_next_year')::boolean else continues_next_year end,
      continues_answered_at = greatest(continues_answered_at, (v_source ->> 'continues_answered_at')::timestamptz)
      where id = p_keep;
    for v_pair in select o.id old_id, k.id new_id, o.status from public.enrollments o join public.enrollments k
      on k.student_id = p_keep and k.class_id = o.class_id and k.school_year_id = o.school_year_id where o.student_id = p_student
    loop
      update public.payments set enrollment_id = v_pair.new_id where enrollment_id = v_pair.old_id;
      update public.enrollments set status = 'aktiv' where id = v_pair.new_id and v_pair.status = 'aktiv';
      delete from public.enrollments where id = v_pair.old_id;
    end loop;
    update public.enrollments set student_id = p_keep where student_id = p_student;
    delete from public.student_fees o where o.student_id = p_student and exists (
      select 1 from public.student_fees k where k.student_id = p_keep and k.school_year_id = o.school_year_id);
    update public.student_fees set student_id = p_keep where student_id = p_student;
    for v_pair in select o.id old_id, k.id new_id, o.amount from public.payment_allocations o join public.payment_allocations k
      on k.student_id = p_keep and k.payment_id = o.payment_id where o.student_id = p_student
    loop
      update public.payment_allocations set amount = amount + v_pair.amount where id = v_pair.new_id;
      delete from public.payment_allocations where id = v_pair.old_id;
    end loop;
    update public.payment_allocations set student_id = p_keep where student_id = p_student;
    insert into public.payment_allocation_locks (payment_id, locked_by)
      select distinct payment_id, auth.jwt() ->> 'email' from public.payment_allocations
      where student_id = p_keep and payment_id = any(v_payment_ids) on conflict (payment_id) do nothing;
    insert into public.payment_targets (payment_id, student_id, amount, created_at)
      select payment_id, p_keep, amount, created_at from public.payment_targets where student_id = p_student
      on conflict (payment_id, student_id) do update set amount = public.payment_targets.amount + excluded.amount;
    delete from public.payment_targets where student_id = p_student;
    update public.payments set student_id = p_keep where student_id = p_student;
    update public.refunds set student_id = p_keep where student_id = p_student;
    update public.installments set student_id = p_keep where student_id = p_student;
    update public.student_fee_adjustments set student_id = p_keep where student_id = p_student;
    insert into public.student_guardians (student_id, family_id, guardian_id, relationship_label, is_primary,
      has_legal_guardianship, can_pick_up, receives_communication, sort_order, created_at)
      select p_keep, family_id, guardian_id, relationship_label, false,
        has_legal_guardianship, can_pick_up, receives_communication, sort_order, created_at
        from public.student_guardians where student_id = p_student on conflict (student_id, guardian_id) do nothing;
    delete from public.attendance o where o.student_id = p_student and exists (
      select 1 from public.attendance k where k.student_id = p_keep and k.lesson_id = o.lesson_id);
    update public.attendance set student_id = p_keep where student_id = p_student;
    update public.absence_reports set student_id = p_keep where student_id = p_student;
    update public.learning_goals set student_id = p_keep where student_id = p_student;
    update public.student_applications set merged_into_student_id = p_keep where merged_into_student_id = p_student;
  end if;
  if p_application is not null then
    update public.student_applications set merged_into_student_id = p_keep, status = 'arkivert' where id = p_application;
  end if;
  for v_pair in select p.id, p.amount from public.payments p where p.id in
    (select payment_id from public.student_applications where id = any(v_app_ids))
    and p.voided_at is null and p.amount > 0
  loop
    select count(distinct coalesce(a.merged_into_student_id, s.id, a.id))::integer into v_children
      from public.student_applications a left join public.students s on s.application_id = a.id
      where a.payment_id = v_pair.id;
    if v_pair.amount / greatest(v_children, 1) > 0 then
      insert into public.payment_targets (payment_id, student_id, amount)
        values (v_pair.id, p_keep, v_pair.amount / greatest(v_children, 1))
        on conflict (payment_id, student_id) do nothing;
    end if;
  end loop;
  if v_share > 0 then
    insert into public.payment_targets (payment_id, student_id, amount) values (v_payment.id, p_keep, v_share)
      on conflict (payment_id, student_id) do nothing;
    select coalesce(jsonb_agg(jsonb_build_object('student_id', student_id, 'amount', amount)), '[]')
      || jsonb_build_array(jsonb_build_object('student_id', p_keep, 'amount', v_share)) into v_allocations
      from public.payment_allocations where payment_id = v_payment.id;
    perform public.replace_payment_allocations(v_payment.id, v_allocations);
  end if;
  insert into public.audit_log (actor_id, actor_email, action, entity_type, entity_id, metadata)
    values (auth.uid(), auth.jwt() ->> 'email', 'student.merged', 'students', p_keep::text,
      jsonb_build_object('mergedStudentId', p_student, 'mergedApplicationId', p_application, 'before', v_snapshot, 'result', v_result));
  if p_student is not null then delete from public.students where id = p_student; end if;
  return v_result || jsonb_build_object('merged', true);
end;
$$;

revoke all on function public.admin_merge_children(uuid, uuid, uuid, boolean, text) from public, anon;
grant execute on function public.admin_merge_children(uuid, uuid, uuid, boolean, text) to authenticated;
