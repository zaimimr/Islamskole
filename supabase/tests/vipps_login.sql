begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(8);

insert into public.guardians (first_name, email, phone) values
  ('ZZ', 'zz-vl-ok@zztest.local', '912 34 567'),
  ('ZZ', 'zz-vl-victim@zztest.local', null),
  ('ZZ', 'zz-vl-victim@zztest.local', '+47 99988877'),
  ('ZZ', 'zz-vl-a@zztest.local', '45454545'),
  ('ZZ', 'zz-vl-b@zztest.local', '45454545'),
  ('ZZ', 'zz-vl-same@zztest.local', '400 00 001'),
  ('ZZ', 'zz-vl-same@zztest.local', '0047 40000001');

select is(public.normalize_login_phone('4791234567'), '91234567', 'strips 47 prefix');
select is(public.normalize_login_phone('+47 912 34 567'), '91234567', 'strips +47 and spaces');
select is(public.vipps_login_email_for_phone('4791234567'), 'zz-vl-ok@zztest.local', 'matches a unique phone');
select is(public.vipps_login_email_for_phone('4799988877'), null, 'rejects a phone added on someone else''s email');
select is(public.vipps_login_email_for_phone('4745454545'), null, 'rejects a phone shared by two people');
select is(public.vipps_login_email_for_phone('4740000001'), 'zz-vl-same@zztest.local', 'accepts one person on several rows');
select is(public.vipps_login_email_for_phone('4711111111'), null, 'no match for unknown phone');

set local role anon;
select throws_ok($$ select public.vipps_login_email_for_phone('4791234567') $$, '42501', null, 'anon cannot call the matcher');
reset role;

select * from finish();
rollback;
