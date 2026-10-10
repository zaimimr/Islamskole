begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select is(public.normalize_search('  ÅSE, Bjørn Sæther José  '), 'ase bjorn saether jose', 'normalizes Norwegian letters and accents');
select ok(public.search_matches('Amira Solberg', 'Amira Solberg'), 'finds full names');
select ok(public.search_matches(' solberg   AMIRA ', 'Amira Solberg'), 'ignores order, case and extra spaces');
select ok(public.search_matches('ami sol', 'Amira Solberg'), 'finds partial names');
select ok(public.search_matches('Amria Solber', 'Amira Solberg'), 'allows transposed and missing letters');
select ok(public.search_matches('Solbrexg', 'Amira Solberg'), 'allows two errors in longer words');
select ok(public.search_matches('aase bjorn', 'Åse Bjørn'), 'finds names without Norwegian letters');
select ok(public.search_matches('saether', 'Sæther'), 'finds alternate spelling of ae');
select ok(public.search_matches('amira@school.no', 'Amira Solberg amira@school.no'), 'finds email addresses');
select ok(public.search_matches('+47 123 45 678', '+47 123 45 678'), 'finds phone numbers');
select ok(not public.search_matches('12345679', '12345678'), 'phone numbers require matching digits');
select ok(not public.search_matches('ISK12346', 'ISK12345'), 'reference numbers require matching digits');
select ok(not public.search_matches('Per', 'Pål Solberg'), 'short names do not match unrelated names');
select ok(not public.search_matches('Amira Jensen', 'Amira Solberg'), 'every word must match');
select ok(not public.search_matches('zzzzzzzz', 'Amira Solberg'), 'unrelated words do not match');
select ok(public.search_matches('', 'Amira Solberg'), 'empty query keeps all rows');
select ok(public.search_matches('%,()', 'Amira Solberg'), 'punctuation is treated as whitespace');
select ok(public.search_matches('amira("solberg")', 'Amira Solberg'), 'punctuation cannot alter the query');
select ok(not public.search_word_matches(repeat('a', 121), repeat('a', 121)), 'direct word comparison has bounded input');

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
insert into auth.users (id, email, raw_app_meta_data) values
  ('f5000000-0000-0000-0000-0000000000a1', 'zz-f5-admin@zztest.local', '{"role":"admin"}'),
  ('f5000000-0000-0000-0000-0000000000a2', 'zz-f5-member@zztest.local', '{"role":"member"}');
insert into public.families (id, display_name, origin) values
  ('f5000000-0000-0000-0000-0000000000f1', 'ZZTEST Solberg', 'test');
insert into public.student_applications (id, family_id, child_first_name, child_last_name, status, terms_accepted) values
  ('f5000000-0000-0000-0000-000000000071', 'f5000000-0000-0000-0000-0000000000f1', 'ZZTEST Amira', 'Solberg', 'ny', true);
insert into public.students (id, family_id, child_first_name, child_last_name) values
  ('f5000000-0000-0000-0000-000000000051', 'f5000000-0000-0000-0000-0000000000f1', 'ZZTEST Amira', 'Solberg');
insert into public.guardians (id, first_name, last_name, email) values
  ('f5000000-0000-0000-0000-000000000061', 'ZZTEST Åse', 'Sæther', 'zz-f5-guardian@zztest.local');
insert into public.teacher_applications (id, full_name, email, status) values
  ('f5000000-0000-0000-0000-000000000062', 'ZZTEST Åse Sæther', 'zz-f5-teacher@zztest.local', 'ny');
insert into public.classes (id, slug, name_no, name_en) values
  ('f5000000-0000-0000-0000-0000000000c1', 'zztest-f5-class', 'ZZTEST Nybegynner', 'ZZTEST Beginner');
insert into public.payments (id, reference, amount) values
  ('f5000000-0000-0000-0000-000000000091', 'ZZTEST-F5-PAYMENT', 200000);
insert into public.payments (id, reference, amount, student_id) values
  ('f5000000-0000-0000-0000-000000000092', 'ZZTEST-F5-STUDENT-PAYMENT', 200000, 'f5000000-0000-0000-0000-000000000051');
insert into public.audit_log (id, action, entity_type, entity_id, metadata) values
  ('f5000000-0000-0000-0000-000000000093', 'student.create', 'students', 'f5000000-0000-0000-0000-000000000051', '{"name":"ZZTEST Amira Solberg"}');
update public.student_applications set payment_id='f5000000-0000-0000-0000-000000000091'
  where id='f5000000-0000-0000-0000-000000000071';

set local role anon;
select throws_ok($$select public.search_matches('Amira', 'Amira')$$, '42501', null, 'anonymous users cannot invoke search helpers');
select throws_ok($$select public.admin_search_student_applications('Amira Solberg')$$, '42501', null, 'anonymous users cannot search applications');
reset role;
select set_config('request.jwt.claims', '{"sub":"f5000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*) from public.admin_search_student_applications('Amira Solberg')), 0::bigint, 'members cannot search applications');
select is((select count(*) from public.admin_search_payments('Amira Solberg')), 0::bigint, 'members cannot search payments');
select set_config('request.jwt.claims', '{"sub":"f5000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
select ok(exists(select 1 from public.admin_search_student_applications('solberg amria') where id='f5000000-0000-0000-0000-000000000071'), 'admin finds application across separate name fields with typo');
select ok(exists(select 1 from public.admin_search_students('Amira Solber') where id='f5000000-0000-0000-0000-000000000051'), 'admin finds student with partial last name');
select ok(exists(select 1 from public.admin_search_families('Solbrexg') where id='f5000000-0000-0000-0000-0000000000f1'), 'admin finds family with typo');
select ok(exists(select 1 from public.admin_search_payments('Amria Solberg') where id='f5000000-0000-0000-0000-000000000091'), 'payment search finds linked application child');
select ok(exists(select 1 from public.admin_search_payments('Amria Solberg') where id='f5000000-0000-0000-0000-000000000092'), 'payment search finds directly linked child');
select ok(exists(select 1 from public.admin_search_guardians('ase saether') where id='f5000000-0000-0000-0000-000000000061'), 'guardian search normalizes Norwegian letters');
select ok(exists(select 1 from public.admin_search_teacher_applications('saehter ase') where id='f5000000-0000-0000-0000-000000000062'), 'teacher application search allows reordered names with typo');
select ok(exists(select 1 from public.admin_search_classes('begnner') where id='f5000000-0000-0000-0000-0000000000c1'), 'class search allows typo');
select ok(exists(select 1 from public.admin_search_audit_log('Amria Solberg') where id='f5000000-0000-0000-0000-000000000093'), 'audit search finds metadata with typo');
select ok(exists(select 1 from public.admin_search_audit_log('Opprett elev', array['student.create']) where id='f5000000-0000-0000-0000-000000000093'), 'audit search retains translated action matches');
select is((select count(*) from public.admin_search_student_applications('Amira Solberg') where status='arkivert'), 0::bigint, 'status filters apply to search results');

select * from finish();
rollback;
