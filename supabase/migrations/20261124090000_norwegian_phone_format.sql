create or replace function public.format_phone(p_phone text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := regexp_replace(coalesce(p_phone, ''), '[\s().-]', '', 'g');
begin
  if v ~ '^(\+47|0047|47)?\d{8}$' then
    return '+47 ' || right(v, 8);
  end if;
  return nullif(btrim(p_phone), '');
end;
$$;

create or replace function public.format_phone_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_column text;
  v_row jsonb := to_jsonb(new);
begin
  foreach v_column in array tg_argv loop
    if v_row ? v_column then
      v_row := jsonb_set(v_row, array[v_column], to_jsonb(public.format_phone(v_row ->> v_column)));
    end if;
  end loop;
  return jsonb_populate_record(new, v_row);
end;
$$;

drop trigger if exists format_phone on public.guardians;
create trigger format_phone before insert or update of phone on public.guardians
  for each row execute function public.format_phone_columns('phone');

drop trigger if exists format_phone on public.students;
create trigger format_phone before insert or update of child_phone, mother_phone, father_phone on public.students
  for each row execute function public.format_phone_columns('child_phone', 'mother_phone', 'father_phone');

drop trigger if exists format_phone on public.student_applications;
create trigger format_phone before insert or update of child_phone, mother_phone, father_phone on public.student_applications
  for each row execute function public.format_phone_columns('child_phone', 'mother_phone', 'father_phone');

drop trigger if exists format_phone on public.family_pickup_persons;
create trigger format_phone before insert or update of phone on public.family_pickup_persons
  for each row execute function public.format_phone_columns('phone');

drop trigger if exists format_phone on public.teacher_applications;
create trigger format_phone before insert or update of phone on public.teacher_applications
  for each row execute function public.format_phone_columns('phone');

drop trigger if exists format_phone on public.payments;
create trigger format_phone before insert or update of payer_phone on public.payments
  for each row execute function public.format_phone_columns('payer_phone');

update public.guardians set phone = public.format_phone(phone)
  where phone is distinct from public.format_phone(phone);
update public.students set
    child_phone = public.format_phone(child_phone),
    mother_phone = public.format_phone(mother_phone),
    father_phone = public.format_phone(father_phone)
  where child_phone is distinct from public.format_phone(child_phone)
    or mother_phone is distinct from public.format_phone(mother_phone)
    or father_phone is distinct from public.format_phone(father_phone);
update public.student_applications set
    child_phone = public.format_phone(child_phone),
    mother_phone = public.format_phone(mother_phone),
    father_phone = public.format_phone(father_phone)
  where child_phone is distinct from public.format_phone(child_phone)
    or mother_phone is distinct from public.format_phone(mother_phone)
    or father_phone is distinct from public.format_phone(father_phone);
update public.family_pickup_persons set phone = public.format_phone(phone)
  where phone is distinct from public.format_phone(phone);
update public.teacher_applications set phone = public.format_phone(phone)
  where phone is distinct from public.format_phone(phone);
update public.payments set payer_phone = public.format_phone(payer_phone)
  where payer_phone is distinct from public.format_phone(payer_phone);
