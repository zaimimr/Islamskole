begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(36);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into auth.users (id, email, raw_app_meta_data)
values
  ('5e000000-0000-0000-0000-0000000000a1', 'zz-se-parent@zztest.local', '{"role":"member"}'),
  ('5e000000-0000-0000-0000-0000000000a2', 'zz-se-other@zztest.local', '{"role":"member"}');

update public.school_years set is_active = false where is_active;

insert into public.school_years (id, label, starts_on, ends_on, is_active)
values (
  '5e000000-0000-0000-0000-000000000001',
  'ZZTEST SE aktiv',
  (now() at time zone 'Europe/Oslo')::date - 60,
  (now() at time zone 'Europe/Oslo')::date + 200,
  true
);

insert into public.classes (id, slug, name_no, name_en)
values
  ('5e000000-0000-0000-0000-0000000000c1', 'zztest-se-a', 'ZZTEST SE A', 'ZZTEST SE A'),
  ('5e000000-0000-0000-0000-0000000000c2', 'zztest-se-b', 'ZZTEST SE B', 'ZZTEST SE B');

insert into public.families (id, origin, display_name, address, postal_code, city)
values
  ('5e000000-0000-0000-0000-0000000000f1', 'test', 'ZZTEST Familie A', 'Gammel vei 1', '1300', 'Sandvika'),
  ('5e000000-0000-0000-0000-0000000000f2', 'test', 'ZZTEST Familie B', 'Annen vei 2', '1337', 'Sandvika');

insert into public.guardians (id, first_name, last_name, email, phone)
values
  ('5e000000-0000-0000-0000-000000000061', 'ZZTEST', 'Forelder A', 'zz-se-parent@zztest.local', '11111111'),
  ('5e000000-0000-0000-0000-000000000062', 'ZZTEST', 'Forelder B', 'zz-se-other@zztest.local', '22222222'),
  ('5e000000-0000-0000-0000-000000000063', 'ZZTEST', 'Medforelder A', null, '33333333');

insert into public.family_guardians (family_id, guardian_id, relationship_label, is_primary_contact, is_billing_contact, sort_order)
values
  ('5e000000-0000-0000-0000-0000000000f1', '5e000000-0000-0000-0000-000000000061', 'mor', true, true, 0),
  ('5e000000-0000-0000-0000-0000000000f1', '5e000000-0000-0000-0000-000000000063', 'far', false, false, 1),
  ('5e000000-0000-0000-0000-0000000000f2', '5e000000-0000-0000-0000-000000000062', 'mor', true, true, 0);

insert into public.students (id, family_id, child_first_name, child_last_name, child_birth_date, child_gender)
values
  ('5e000000-0000-0000-0000-000000000051', '5e000000-0000-0000-0000-0000000000f1', 'ZZTEST', 'Barn A1', '2018-01-01', 'gutt'),
  ('5e000000-0000-0000-0000-000000000053', '5e000000-0000-0000-0000-0000000000f2', 'ZZTEST', 'Barn B1', '2017-01-01', 'jente');

insert into public.enrollments (student_id, class_id, school_year_id, status)
values ('5e000000-0000-0000-0000-000000000051', '5e000000-0000-0000-0000-0000000000c1', '5e000000-0000-0000-0000-000000000001', 'aktiv');

insert into public.student_fees (student_id, school_year_id, amount)
values ('5e000000-0000-0000-0000-000000000051', '5e000000-0000-0000-0000-000000000001', 500000);

insert into public.family_pickup_persons (id, family_id, name)
values ('5e000000-0000-0000-0000-0000000000b2', '5e000000-0000-0000-0000-0000000000f2', 'ZZTEST Hentes B');

select set_config('request.jwt.claims', '{"sub":"5e000000-0000-0000-0000-0000000000a1","email":"zz-se-parent@zztest.local","role":"authenticated"}', true);
set local role authenticated;

select lives_ok(
  $$ select public.portal_update_child('5e000000-0000-0000-0000-000000000051', ' ZZTEST ', ' Nytt Navn ', '2018-05-04', 'jente', ' Barn@ZZtest.local ', '+47 912 34 567', 'god', '', 'litt') $$,
  'parent can edit own child'
);

select is(
  (
    select child ->> 'last_name' || '|' || (child ->> 'birth_date') || '|' || (child ->> 'gender') || '|' || (child ->> 'email') || '|' || coalesce(child ->> 'level_arabic', 'null')
    from jsonb_array_elements(public.portal_my_families() -> 0 -> 'children') child
    where child ->> 'id' = '5e000000-0000-0000-0000-000000000051'
  ),
  'Nytt Navn|2018-05-04|jente|barn@zztest.local|null',
  'child edits are trimmed, lowercased and saved'
);

select lives_ok(
  $$ select public.portal_update_child('5e000000-0000-0000-0000-000000000051', 'ZZTEST', 'Nytt Navn', '2018-05-04', 'jente', 'barn@zztest.local', '+47 912 34 567', 'god', null, 'litt') $$,
  'saving the same values again works'
);

select throws_ok(
  $$ select public.portal_update_child('5e000000-0000-0000-0000-000000000053', 'ZZTEST', 'Hack', '2017-01-01', 'gutt', null, null, null, null, null) $$,
  '42501',
  null,
  'parent cannot edit another family child'
);

select throws_ok(
  $$ select public.portal_update_child('5e000000-0000-0000-0000-000000000051', 'ZZTEST', 'Barn', '2018-01-01', 'annet', null, null, null, null, null) $$,
  '22023',
  null,
  'unknown gender is rejected'
);

select throws_ok(
  $$ select public.portal_update_child('5e000000-0000-0000-0000-000000000051', 'ZZTEST', 'Barn', current_date + 1, 'gutt', null, null, null, null, null) $$,
  '22023',
  null,
  'birth date in the future is rejected'
);

select throws_ok(
  $$ select public.portal_update_child('5e000000-0000-0000-0000-000000000051', 'ZZTEST', 'Barn', '2018-01-01', 'gutt', 'ikke-epost', null, null, null, null) $$,
  '22023',
  null,
  'invalid child email is rejected'
);

select throws_ok(
  $$ select public.portal_update_child('5e000000-0000-0000-0000-000000000051', 'ZZTEST', 'Barn', '2018-01-01', 'gutt', null, '12', null, null, null) $$,
  '22023',
  null,
  'invalid child phone is rejected'
);

select throws_ok(
  $$ select public.portal_update_child('5e000000-0000-0000-0000-000000000051', 'ZZTEST', 'Barn', '2018-01-01', 'gutt', null, null, 'ekspert', null, null) $$,
  '22023',
  null,
  'unknown level is rejected'
);

do $$
begin
  begin
    update public.enrollments set class_id = '5e000000-0000-0000-0000-0000000000c2'
    where student_id = '5e000000-0000-0000-0000-000000000051';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.student_fees set amount = 1
    where student_id = '5e000000-0000-0000-0000-000000000051';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.students set notes = 'hack', child_first_name = 'Hack'
    where id = '5e000000-0000-0000-0000-000000000051';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select lives_ok(
  $$ select public.portal_update_child_health('5e000000-0000-0000-0000-000000000051', 'Nøtter', null, true) $$,
  'parent can update child health'
);

select lives_ok(
  $$ select public.portal_update_family_guardian('5e000000-0000-0000-0000-0000000000f1', '5e000000-0000-0000-0000-000000000063', 'ZZTEST', 'Ny Far', '44 44 44 44', 'steforelder', false) $$,
  'parent can edit a co-guardian'
);

select throws_ok(
  $$ select public.portal_update_family_guardian('5e000000-0000-0000-0000-0000000000f1', '5e000000-0000-0000-0000-000000000061', 'ZZTEST', 'Forelder A', '11111111', 'mor', false) $$,
  '22023',
  null,
  'at least one guardian must keep receiving messages'
);

select throws_ok(
  $$ select public.portal_update_family_guardian('5e000000-0000-0000-0000-0000000000f2', '5e000000-0000-0000-0000-000000000062', 'ZZTEST', 'Hack', null, 'mor', true) $$,
  '42501',
  null,
  'parent cannot edit a guardian in another family'
);

select throws_ok(
  $$ select public.portal_update_family_guardian('5e000000-0000-0000-0000-0000000000f1', '5e000000-0000-0000-0000-000000000062', 'ZZTEST', 'Hack', null, 'mor', true) $$,
  '42501',
  null,
  'parent cannot edit an outside guardian through their own family'
);

select throws_ok(
  $$ select public.portal_update_family_guardian('5e000000-0000-0000-0000-0000000000f1', '5e000000-0000-0000-0000-000000000063', 'ZZTEST', 'Ny Far', 'abc', 'far', true) $$,
  '22023',
  null,
  'invalid guardian phone is rejected'
);

select lives_ok(
  $$ select public.portal_update_guardian('5e000000-0000-0000-0000-000000000061', 'ZZTEST', 'Forelder A2', '11111111') $$,
  'legacy guardian update still works'
);

select throws_ok(
  $$ select public.portal_remove_guardian('5e000000-0000-0000-0000-0000000000f1', '5e000000-0000-0000-0000-000000000061') $$,
  '22023',
  null,
  'parent cannot remove themselves'
);

select throws_ok(
  $$ select public.portal_remove_guardian('5e000000-0000-0000-0000-0000000000f2', '5e000000-0000-0000-0000-000000000062') $$,
  '42501',
  null,
  'parent cannot remove a guardian in another family'
);

select lives_ok(
  $$ select public.portal_update_family_preferences('5e000000-0000-0000-0000-0000000000f1', 'en') $$,
  'parent can change family language'
);

select throws_ok(
  $$ select public.portal_update_family_preferences('5e000000-0000-0000-0000-0000000000f1', 'de') $$,
  '22023',
  null,
  'unknown language is rejected'
);

select isnt(
  public.portal_add_pickup('5e000000-0000-0000-0000-0000000000f1', 'ZZTEST Bestemor', '55555555', 'bestemor'),
  null,
  'parent can add a pickup person'
);

select lives_ok(
  $$ select public.portal_update_pickup((public.portal_my_families() -> 0 -> 'pickup' -> 0 ->> 'id')::uuid, 'ZZTEST Bestefar', null, 'bestefar') $$,
  'parent can edit own pickup person'
);

select throws_ok(
  $$ select public.portal_update_pickup('5e000000-0000-0000-0000-0000000000b2', 'Hack', null, null) $$,
  '42501',
  null,
  'parent cannot edit another family pickup person'
);

reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select is(
  (select class_id from public.enrollments where student_id = '5e000000-0000-0000-0000-000000000051'),
  '5e000000-0000-0000-0000-0000000000c1'::uuid,
  'parent cannot change class placement'
);

select is(
  (select amount from public.student_fees where student_id = '5e000000-0000-0000-0000-000000000051'),
  500000,
  'parent cannot change fees'
);

select is(
  (select coalesce(notes, '') || '|' || child_first_name from public.students where id = '5e000000-0000-0000-0000-000000000051'),
  '|ZZTEST',
  'parent cannot write students directly'
);

select is(
  (
    select count(*)
    from public.audit_log
    where action = 'portal.child.update'
      and entity_id = '5e000000-0000-0000-0000-000000000051'
  ),
  1::bigint,
  'one audit row per real child change'
);

select is(
  (
    select (metadata -> 'changes' -> 'child_last_name' ->> 'from') || '>' || (metadata -> 'changes' -> 'child_last_name' ->> 'to')
      || '|' || (metadata ->> 'source') || '|' || actor_email || '|' || (metadata ->> 'family_id')
    from public.audit_log
    where action = 'portal.child.update'
      and entity_id = '5e000000-0000-0000-0000-000000000051'
  ),
  'Barn A1>Nytt Navn|parent|zz-se-parent@zztest.local|5e000000-0000-0000-0000-0000000000f1',
  'audit row stores old and new value and who changed it'
);

select ok(
  not ((select metadata -> 'changes' from public.audit_log where action = 'portal.child.update' and entity_id = '5e000000-0000-0000-0000-000000000051') ? 'child_first_name'),
  'unchanged fields are left out of the audit row'
);

select is(
  (
    select metadata -> 'changes' -> 'receives_communication' ->> 'to'
    from public.audit_log
    where action = 'portal.guardian.update'
      and entity_id = '5e000000-0000-0000-0000-000000000063'
  ),
  'false',
  'guardian contact preference change is audited'
);

select is(
  (select mother_last_name || '|' || father_last_name || '|' || father_phone from public.students where id = '5e000000-0000-0000-0000-000000000051'),
  'Forelder A2|Ny Far|44 44 44 44',
  'student contact mirror follows guardian edits'
);

select set_config('request.jwt.claims', '{"sub":"5e000000-0000-0000-0000-0000000000a1","email":"zz-se-parent@zztest.local","role":"authenticated"}', true);
set local role authenticated;

select is(
  public.portal_remove_guardian('5e000000-0000-0000-0000-0000000000f1', '5e000000-0000-0000-0000-000000000063'),
  'deleted',
  'parent can remove a co-guardian'
);

select is(
  jsonb_array_length(public.portal_my_families() -> 0 -> 'guardians'),
  1,
  'removed co-guardian is gone from the family'
);

reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select is(
  (select father_last_name from public.students where id = '5e000000-0000-0000-0000-000000000051'),
  null,
  'mirror is cleared for the removed guardian'
);

select is(
  (select metadata -> 'removed' ->> 'last_name' from public.audit_log where action = 'portal.guardian.remove' and actor_id = '5e000000-0000-0000-0000-0000000000a1' and entity_id = '5e000000-0000-0000-0000-000000000063'),
  'Ny Far',
  'removal is audited with the removed values'
);

set local role anon;

select throws_ok(
  $$ select public.portal_update_child('5e000000-0000-0000-0000-000000000051', 'ZZTEST', 'Anon', '2018-01-01', 'gutt', null, null, null, null, null) $$,
  '42501',
  null,
  'anon cannot call parent edit functions'
);

reset role;

select * from finish();
rollback;
