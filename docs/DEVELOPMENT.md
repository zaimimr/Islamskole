# Development

## Run

```bash
npm ci
cp .env.example .env.local
supabase start
npm run dev -- -p 3100
```

Fill `.env.local` from `supabase status -o env` for a local stack. `.env.example` lists every variable the app and scripts read. `VERCEL_URL` and `VERCEL_PROJECT_PRODUCTION_URL` are set by Vercel.

## Check

| Command | What it runs |
| --- | --- |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Every `tests/*.test.mjs` with the Node test runner |
| `npm run test:e2e` | Playwright specs in `tests/*.spec.ts` |
| `npm run test:db` | pgTAP suites in `supabase/tests` (needs a running local stack) |
| `npm run build` | Production build, needs no env vars |

CI (`.github/workflows/ci.yml`) runs lint, typecheck, tests, build and pgTAP on every push to `main` and every pull request.

## Migrations

Never apply a migration straight to production.

1. `supabase migration new <name>` and write idempotent SQL. Keep money history append-only.
2. Test it on the local stack (`supabase db reset`, then `npm run test:db`) or on a Supabase branch.
3. Apply to production with `supabase db push`, so the recorded version matches the file name.
4. `npm run db:types` regenerates `src/lib/supabase/types.ts`.
5. `npm run db:drift` compares `supabase/migrations` with the production history. It needs `SUPABASE_ACCESS_TOKEN` and skips without it.

## Developer impersonation

The verified owner account has the `developer` profile role, which includes administrative access. Only that account, with a live original Supabase session, can start impersonation from `/admin/brukere`. Ordinary admins cannot grant, remove or use this role.

`src/lib/impersonation` creates a separate Supabase session for the selected verified account without sending an email. Its tokens stay in HttpOnly cookies; the original account cookies remain intact. `createClient()` resolves the selected identity for server reads and actions, so existing RLS and application permission checks apply. Media uploads use a signed upload URL authorized by the effective account.

Impersonation lasts one hour and is bound to both the developer's original session and the selected account's session. Expired, ended or mismatched contexts resolve to an anonymous client, never silently to the developer. The marker remains until explicitly cleared, preserving this behavior after expiry. A return control stays in the portal and admin headers, including the signed-out portal. Signing out uses local session scope and preserves the selected user's other sessions.

`developer_impersonations` is accessible only to the service role. The audit trigger attributes database writes to the developer and preserves `impersonated_user_id`, `impersonated_email` and `impersonation_id` in metadata. `writeAudit()` does the same for server actions. Start and end events appear in `/admin/revisjon`. Saved changes and emails are real actions under the selected user's permissions. Generating the login token updates the selected account's sign-in history and can replace a pending magic link.

The local-only browser suite covers account switching, parent boundaries, writes and attribution, direct unauthorized action calls, copied-cookie rejection, expiry and session restoration. Database checks cover the owner-only role, original-session validity and audit attribution. No extra environment variables are required.

The upload check needs Supabase Storage running. Restart a local stack that was previously started with Storage excluded. A reused local stack can retain an older `storage.idx_objects_current_version` definition; Storage then returns `42P10` on upload. Its current definition is a unique index on `(bucket_id, name COLLATE "C") WHERE archived_at IS NULL`. Check the installed Storage migration before repairing this local index.

## Announcements

Announcements live in `src/lib/announcements` and `src/components/announcements`, with shared views at `/admin/beskjeder` and `/min-side/beskjeder`. Database functions enforce publishing scope, snapshot recipients, and record one acknowledgement per family. Published text is immutable. Recipient families come from active enrollments in the active school year; emails respect `receives_communication` and are deduplicated by normalized address.

Email uses the existing `EMAILS_ENABLED`/Edge Config switch, Resend configuration, and `NEXT_PUBLIC_SITE_URL`. Set `EMAIL_OUTBOX_DIR` to capture email locally. Publication remains available without email. Resend batches use durable idempotency keys; the database prevents concurrent claims, completes batches atomically, and recovers interrupted claims after 15 minutes. `sent` means the provider accepted the email. Later bounces and inbox delivery are not tracked.

Publishing starts delivery after the response. Senders can retry failed email or process queued email from the recipient overview. `/api/cron/announcements`, protected by the existing `CRON_SECRET`, recovers pending or interrupted delivery daily. Failed email is retried explicitly by the sender.

Run the local acceptance checks with:

```bash
supabase migration up --local
supabase test db supabase/tests/announcements.sql
npm run test:e2e -- --project=e2e tests/e2e/announcements.spec.ts
```

The browser tests use test families and the local email outbox. The database tests cover role isolation, shared-email deduplication, sibling acknowledgement, opt-outs, retry permissions, and interrupted delivery.

## School email and first-use guidance

`src/lib/school-emails` handles signup confirmation, separate parent/student welcome, installment-plan confirmation, installment requests and overdue reminders. Database triggers enqueue new events. Server actions start processing after the response; `/api/cron/school-emails` and the existing installment cron recover pending deliveries. Both cron routes require `CRON_SECRET`. Delivery uses the existing email switch, provider and local outbox settings.

Only service-role functions claim and complete email jobs. Claims expire after 15 minutes; failed messages retry up to five times. Provider requests carry a delivery ID as their idempotency key. `/admin/beskjeder/epost` shows delivery state and lets admins process the queue or retry failures. Recipients, current enrollment, outstanding balances and communication preferences are checked again before sending. Disabled email leaves jobs pending. Installment reminder timestamps are written only after accepted delivery.

Signup confirms receipt of an application, without granting access or promising admission/payment. Parent onboarding begins with active-year placement, and student onboarding requires the actual student login address. Signup language follows the application locale; later messages use the family's current language. First-use Min side guidance is dismissed per account and role in `portal_onboarding`.

```bash
supabase test db supabase/tests/school_emails.sql
node --conditions=react-server --test tests/school-emails.test.mjs
npm run test:e2e -- --project=e2e tests/e2e/school-emails.spec.ts
```

## Learning progress

Learning progress lives in `src/lib/learning-progress` and `src/components/learning-progress`. Teachers open a child from the class's learning list. Administrators use the student record. Guardians read progress on the child page, and children read their own progress on Min side. Saved goals and updates are visible immediately, without email notifications or a separate publishing step.

`learning_goals` stores the current goal and latest progress. `learning_progress_updates` stores its dated history. Database functions create both atomically, preserve idempotency on retries, reject updates based on stale versions, and audit changes without duplicating feedback in the audit log. Published goal definitions are fixed; later updates change status, feedback and next target. Surah names are teacher-written, and ayah ranges require positive ordered integers and a surah. They are not checked against a Quran catalogue.

Teacher access follows the child's current active enrollment and existing class/slot teacher permissions, including valid class substitutes. Administrators can manage any child, including those without an active enrollment. Suspended teachers have no teaching access. New class teachers can continue earlier goals; former class teachers lose access. Guardians and the child retain read access to earlier learning history. Portal users cannot directly insert, edit or delete learning records. Feedback and targets are corrected through a new dated update.

Goals and history load in pages of 20. History is fetched only when opened. No extra configuration is required. Generated RPC argument types are widened where the database accepts nullable reference, feedback and target fields.

```bash
supabase migration up --local
supabase test db supabase/tests/learning_progress.sql
node --conditions=react-server --test tests/learning-progress.test.mjs
npm run test:e2e -- --project=e2e tests/e2e/learning-progress.spec.ts
```

These checks cover validation, family and teacher isolation, immediate visibility, dated history, class transfers, previous school years, retries, concurrent updates, pagination, mobile layouts and English labels.

## Admin session for local testing

With the local stack running:

```bash
SERVICE_KEY=<service_role key> ANON_KEY=<anon key> node scripts/mint-local-session.mjs
```

It creates `test-admin@islamskole.no` with the admin role and prints a cookie value. Set it as cookie `sb-127-auth-token` on `localhost` (path `/`, SameSite Lax), then open `http://localhost:3100/no/admin`.
