begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(17);

insert into public.guardians (first_name, email, phone) values
  ('ZZ', 'zz-vl-ok@zztest.local', '912 34 567'),
  ('ZZ', 'zz-vl-victim@zztest.local', null),
  ('ZZ', 'zz-vl-a@zztest.local', '45454545');

insert into public.guardians (first_name, email, phone, contact_pending) values
  ('ZZ', 'zz-vl-victim@zztest.local', '+47 99988877', true),
  ('ZZ', 'zz-vl-b@zztest.local', '45454545', true);

select is(public.normalize_login_phone('4791234567'), '91234567', 'strips 47 prefix');
select is(public.normalize_login_phone('+47 912 34 567'), '91234567', 'strips +47 and spaces');
select is(public.normalize_login_email(' MANGLER@islamskole.no '), null, 'placeholder email is ignored');
select is(public.vipps_login_email_for_phone('4791234567'), 'zz-vl-ok@zztest.local', 'matches a unique phone');
select is(public.vipps_login_email_for_phone('4799988877'), null, 'rejects a phone added on someone else''s email');
select is(public.vipps_login_email_for_phone('4745454545'), null, 'rejects a phone in conflict');
select is(public.vipps_login_email_for_phone('4711111111'), null, 'no match for unknown phone');

select throws_ok(
  $$ insert into public.guardians (first_name, email) values ('ZZ', 'ZZ-VL-OK@zztest.local') $$,
  'P0001', 'E-postadressen er allerede registrert på en annen person.', 'duplicate email is blocked'
);
select throws_ok(
  $$ insert into public.guardians (first_name, phone) values ('ZZ', '+47 91234567') $$,
  'P0001', 'Telefonnummeret er allerede registrert på en annen person.', 'duplicate phone is blocked'
);
select throws_ok(
  $$ update public.guardians set phone = '91234567' where email = 'zz-vl-a@zztest.local' $$,
  'P0001', 'Telefonnummeret er allerede registrert på en annen person.', 'changing to a taken phone is blocked'
);
select throws_ok(
  $$ update public.guardians set contact_pending = false where email = 'zz-vl-b@zztest.local' $$,
  'P0001', 'Telefonnummeret er allerede registrert på en annen person.', 'a conflict cannot be cleared while it exists'
);
select lives_ok(
  $$ update public.guardians set first_name = 'ZZX' where email = 'mangler@islamskole.no' or email = 'zz-vl-ok@zztest.local' $$,
  'unrelated edits still work'
);
select lives_ok(
  $$ insert into public.guardians (first_name, email) values ('ZZ', 'mangler@islamskole.no'), ('ZZ', 'mangler@islamskole.no') $$,
  'placeholder email may repeat'
);

update public.guardians set phone = '45454546' where email = 'zz-vl-b@zztest.local';
select is(
  (select contact_pending from public.guardians where email = 'zz-vl-b@zztest.local'),
  false,
  'resolving the conflict clears the flag'
);
select is(public.vipps_login_email_for_phone('4745454545'), 'zz-vl-a@zztest.local', 'resolved phone matches again');

select is(
  public.guardian_contact_conflict(null, 'zz-vl-ok@zztest.local', null, true),
  'email',
  'conflict check sees the taken email'
);

set local role anon;
select throws_ok($$ select public.vipps_login_email_for_phone('4791234567') $$, '42501', null, 'anon cannot call the matcher');
reset role;

select * from finish();
rollback;
