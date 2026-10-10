do $$
declare
  v_definition text;
  v_condition text := 'if nullif(btrim(v_keep.child_email), '''') is not null and nullif(btrim(v_source ->> ''child_email''), '''') is not null';
begin
  select pg_get_functiondef('public.admin_merge_children(uuid, uuid, uuid, boolean, text)'::regprocedure) into v_definition;
  if position(v_condition in v_definition) = 0 then
    raise exception 'Fant ikke forventet e-postkontroll i sammenslåingen.';
  end if;
  execute replace(v_definition, v_condition,
    'if p_student is not null and nullif(btrim(v_keep.child_email), '''') is not null and nullif(btrim(v_source ->> ''child_email''), '''') is not null');
end;
$$;
