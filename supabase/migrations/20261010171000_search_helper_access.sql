do $$
declare
  definition text := pg_get_functiondef('public.search_word_matches(text,text)'::regprocedure);
  original text := E'begin\n  if position(p_term in p_word) > 0 then return true; end if;';
begin
  if position(original in definition) = 0 then raise exception 'Search function definition does not match'; end if;
  execute replace(definition, original,
    E'begin\n  if length(p_term) > 120 then return false; end if;\n  if position(p_term in p_word) > 0 then return true; end if;');
end;
$$;

revoke all on function public.normalize_search(text) from public, anon;
revoke all on function public.search_word_matches(text, text) from public, anon;
revoke all on function public.search_matches(text, text) from public, anon;
grant execute on function public.normalize_search(text) to authenticated;
grant execute on function public.search_word_matches(text, text) to authenticated;
grant execute on function public.search_matches(text, text) to authenticated;
