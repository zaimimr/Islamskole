create table public.email_send_logs (
  id uuid primary key,
  recipients text[] not null check (cardinality(recipients) between 1 and 100),
  subject text not null,
  locale text not null check (locale in ('no', 'en')),
  transport text not null check (transport in ('resend', 'outbox')),
  status text not null default 'sending' check (status in ('sending', 'sent', 'failed', 'disabled')),
  provider_id text,
  created_at timestamptz not null default statement_timestamp(),
  completed_at timestamptz,
  check ((status = 'sending' and completed_at is null) or (status <> 'sending' and completed_at is not null)),
  check (provider_id is null or (status = 'sent' and transport = 'resend'))
);

create index email_send_logs_created_idx on public.email_send_logs (created_at desc, id);
alter table public.email_send_logs enable row level security;
revoke all on public.email_send_logs from anon, authenticated;
grant select on public.email_send_logs to authenticated;
grant all on public.email_send_logs to service_role;
create policy "admin reads email send logs" on public.email_send_logs
  for select to authenticated using (public.is_admin());
