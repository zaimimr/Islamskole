do $$
declare v_definition text; v_check text:='    if v_activity.updated_at is distinct from p_expected then raise exception ''Activity changed'' using errcode=''40001''; end if;';
begin
  select pg_get_functiondef('public.save_school_activity(uuid, uuid, uuid, timestamptz, text, text, text, date, date)'::regprocedure) into v_definition;
  if position(v_check in v_definition)=0 then raise exception 'Expected activity draft definition was not found'; end if;
  execute replace(v_definition,v_check,$check$
    if p_expected is null and v_activity.title=btrim(p_title) and v_activity.description=btrim(p_description)
      and v_activity.consent_text=btrim(p_consent) and v_activity.event_date=p_date and v_activity.respond_by=p_respond_by then return v_activity; end if;
    if v_activity.updated_at is distinct from p_expected then raise exception 'Activity changed' using errcode='40001'; end if;
$check$);
end;
$$;
