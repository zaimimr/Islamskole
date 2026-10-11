begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, email, raw_app_meta_data) values
  ('e9000000-0000-0000-0000-0000000000a1', 'zz-log-admin@zztest.local', '{"role":"admin"}'),
  ('e9000000-0000-0000-0000-0000000000a2', 'zz-log-parent@zztest.local', '{"role":"member"}');
set local role service_role;
select lives_ok($$insert into public.email_send_logs(id,recipients,subject,locale,transport) values
  ('e9000000-0000-0000-0000-000000000001',array['zz-log-parent@zztest.local'],'Logg inn','no','resend')$$,'service starts an email log');
select throws_ok($$insert into public.email_send_logs(id,recipients,subject,locale,transport) values
  (gen_random_uuid(),array[]::text[],'Empty','no','resend')$$,'23514',null,'recipient is required');
select throws_ok($$update public.email_send_logs set status='sent'$$,'23514',null,'sent result requires completion time');
select lives_ok($$update public.email_send_logs set status='sent',completed_at=now(),provider_id='provider-id'$$,'service records provider acceptance');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"e9000000-0000-0000-0000-0000000000a1"}',true);
select is((select count(*) from public.email_send_logs),1::bigint,'admin reads system email logs');
select throws_ok($$update public.email_send_logs set subject='Changed'$$,'42501',null,'admin cannot rewrite logs');
select throws_ok($$delete from public.email_send_logs$$,'42501',null,'admin cannot delete logs');
select throws_ok($$insert into public.email_send_logs(id,recipients,subject,locale,transport) values
  (gen_random_uuid(),array['zz-test@zztest.local'],'Forged','no','resend')$$,'42501',null,'authenticated users cannot forge logs');
select set_config('request.jwt.claims','{"role":"authenticated","sub":"e9000000-0000-0000-0000-0000000000a2"}',true);
select is((select count(*) from public.email_send_logs),0::bigint,'parent cannot read system email logs');
reset role;
set local role anon;
select throws_ok($$select * from public.email_send_logs$$,'42501',null,'anonymous users cannot read logs');
reset role;
select * from finish();
rollback;
