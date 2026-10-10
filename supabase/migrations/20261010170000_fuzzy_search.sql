create extension if not exists unaccent with schema extensions;

create or replace function public.normalize_search(p_text text)
returns text
language sql stable strict
set search_path = public, extensions
as $$
  select trim(regexp_replace(lower(extensions.unaccent(p_text)), '[^[:alnum:]]+', ' ', 'g'));
$$;

create or replace function public.search_word_matches(p_term text, p_word text)
returns boolean
language plpgsql immutable strict
set search_path = public
as $$
declare
  tolerance integer := case when length(p_term) >= 8 then 2 else 1 end;
  previous integer[];
  before_previous integer[];
  current_row integer[];
  row_index integer;
  column_index integer;
  cost integer;
begin
  if position(p_term in p_word) > 0 then return true; end if;
  if length(p_term) < 4 or p_term ~ '[0-9]'
    or abs(length(p_term) - length(p_word)) > tolerance then return false; end if;
  select array_agg(n order by n) into previous from generate_series(0, length(p_word)) n;
  before_previous := previous;
  for row_index in 1..length(p_term) loop
    current_row := array[row_index];
    for column_index in 1..length(p_word) loop
      cost := case when substr(p_term, row_index, 1) = substr(p_word, column_index, 1) then 0 else 1 end;
      current_row := array_append(current_row, least(
        previous[column_index + 1] + 1,
        current_row[column_index] + 1,
        previous[column_index] + cost
      ));
      if row_index > 1 and column_index > 1
        and substr(p_term, row_index, 1) = substr(p_word, column_index - 1, 1)
        and substr(p_term, row_index - 1, 1) = substr(p_word, column_index, 1) then
        current_row[column_index + 1] := least(current_row[column_index + 1], before_previous[column_index - 1] + 1);
      end if;
    end loop;
    before_previous := previous;
    previous := current_row;
  end loop;
  return previous[length(p_word) + 1] <= tolerance;
end;
$$;

create or replace function public.search_matches(p_query text, p_text text)
returns boolean
language sql stable
set search_path = public
as $$
  with document as (select public.normalize_search(coalesce(p_text, '')) as text),
  terms as (select unnest(string_to_array(public.normalize_search(left(coalesce(p_query, ''), 120)), ' ')) as term)
  select not exists (
    select 1 from terms, document
    where term <> '' and position(term in document.text) = 0
      and not exists (
        select 1 from unnest(string_to_array(document.text, ' ')) word
        where public.search_word_matches(term, word)
      )
  );
$$;

do $$
declare
  entity record;
  columns_sql text;
  function_name text;
begin
  for entity in select * from (values
    ('student_applications', array['child_first_name', 'child_last_name', 'mother_first_name', 'mother_last_name', 'father_first_name', 'father_last_name', 'child_email', 'child_phone', 'mother_email', 'mother_phone', 'father_email', 'father_phone']),
    ('students', array['child_first_name', 'child_last_name', 'mother_first_name', 'mother_last_name', 'father_first_name', 'father_last_name', 'child_email', 'child_phone', 'mother_email', 'mother_phone', 'father_email', 'father_phone']),
    ('teacher_applications', array['full_name', 'email', 'phone', 'subjects']),
    ('guardians', array['first_name', 'last_name', 'email', 'phone']),
    ('families', array['display_name', 'city']),
    ('classes', array['name_no', 'name_en'])
  ) as entities(table_name, columns) loop
    function_name := 'admin_search_' || entity.table_name;
    select string_agg(format('%I::text', name), ', ') into columns_sql from unnest(entity.columns) name;
    execute format(
      'create or replace function public.%I(p_query text default '''') returns setof public.%I
       language sql stable security invoker set search_path = public
       as $fn$ select * from public.%I where public.is_admin()
         and public.search_matches(p_query, concat_ws('' '', %s)) $fn$',
      function_name, entity.table_name, entity.table_name, columns_sql
    );
    execute format('revoke all on function public.%I(text) from public, anon', function_name);
    execute format('grant execute on function public.%I(text) to authenticated', function_name);
  end loop;
end;
$$;

create or replace function public.admin_search_payments(p_query text default '')
returns setof public.payments
language sql stable security invoker
set search_path = public
as $$
  select payment.* from public.payments payment
  where public.is_admin() and (
    public.search_matches(p_query, concat_ws(' ', payment.reference, payment.psp_reference,
      payment.payer_name, payment.payer_email, payment.payer_phone, payment.description))
    or exists (
      select 1 from public.student_applications application
      where application.payment_id = payment.id
        and public.search_matches(p_query, concat_ws(' ', application.child_first_name, application.child_last_name))
    )
    or exists (
      select 1 from public.students student
      where (student.id = payment.student_id or exists (
        select 1 from public.payment_allocations allocation
        where allocation.payment_id = payment.id and allocation.student_id = student.id
      )) and public.search_matches(p_query, concat_ws(' ', student.child_first_name, student.child_last_name))
    )
  );
$$;

create or replace function public.admin_search_audit_log(p_query text default '', p_actions text[] default '{}')
returns setof public.audit_log
language sql stable security invoker
set search_path = public
as $$
  select * from public.audit_log
  where public.is_admin() and (
    public.search_matches(p_query, concat_ws(' ', actor_email, action, entity_type, entity_id, metadata))
    or action = any(p_actions)
  );
$$;

revoke all on function public.admin_search_payments(text) from public, anon;
revoke all on function public.admin_search_audit_log(text, text[]) from public, anon;
grant execute on function public.admin_search_payments(text) to authenticated;
grant execute on function public.admin_search_audit_log(text, text[]) to authenticated;
