# Test contract: labels, test ids and module paths

The e2e specs in `tests/e2e/` and the unit test `tests/auth-redirect.test.mjs` rely on everything below. All Norwegian labels from the "App contract" in `fix-plan.md` apply exactly. This file lists the extra choices the tests make where the plan does not fix a label.

## Shared patterns

- Row lists (admin users, teachers, teacher applications) render each row as `<li>` containing the person's email.
- A row action is either a button with the exact label in the row, or a menu item behind a row button whose accessible name starts with "Flere valg".
- Confirmations are an `alertdialog`. If none appears within 2 seconds the tests go on without one.
- Toasts are sonner toasts (`[data-sonner-toast]`).
- Family pickers are a combobox labelled "Familie" inside a dialog. Options have the family display name as their accessible name. The combobox may be a Base UI Select or an input combobox; the test types the name when it is an input.

## Login

- `/login` and `/login/nytt-passord` redirect to `/min-side/logg-inn` keeping `next`. Signed out `/admin/...` ends on `/min-side/logg-inn?next=/admin/...`.
- No `input[type="password"]` on `/login`, `/login/nytt-passord`, `/min-side/logg-inn`, `/en/min-side/logg-inn` or `/admin/konto`, nor in the "Gi administratortilgang" form.
- Login page: field labelled "E-post" (English "Email"), button "Send innloggingslenke" (English stays "Send sign-in link"). After submit it always shows "Sjekk e-posten din".
- The page's `main` contains text matching foreldre or foresatte, lærer, elev and administrator.
- The login form keeps its time trap (tests wait 2.3 s) and the rate limit (tests clear `portal_login_throttle` before each request).
- Outbox: with `EMAIL_OUTBOX_DIR` set, each email is one `*.json` file with `{ to, subject, html, text, links }`. `to` is a string or string array. If `links` is empty the tests read `href`s from `html`.
- Login link: `${NEXT_PUBLIC_SITE_URL}[/en]/min-side/auth/bekreft?token_hash=<hashed_token>&type=magiclink[&next=<path>]`. The `next` from the login page URL is copied into the link. A link requested from `/en/min-side/logg-inn` starts with `/en/min-side/auth/bekreft`.
- Links are sent for an admin email, a guardian email, a teacher guardian with no family, and a student `child_email`. Nothing for unknown emails.
- After the link: admin lands on exactly `/admin`, parent on `/min-side`, English parent on `/en/min-side`, safe `next` on that path, unsafe `next` (`//evil.example/x`) on `/min-side`.
- Admin shell (`/admin`) shows a link named "Min side" when the admin is also a guardian.
- Min side shows a link whose name contains "Administrasjon" for an admin who is also a guardian.

## Access, `/admin/brukere`

- `h1` "Brukere og tilganger".
- "Gi administratortilgang": a button that opens a dialog, or a form with that accessible name. Fields "Navn" and "E-post", button "Gi tilgang". Email input is case-insensitive (the test types an uppercase email for an existing login and expects the same auth user id).
- After granting: `profiles.role = 'admin'`, a login link email is in the outbox, and after reload the row shows the email and a badge with the exact text "Admin". A guardian also gets the exact text "Foresatt"; a teacher gets "Lærer".
- Row actions "Fjern administratortilgang" (absent on your own row, present on another admin's row) and "Gjør til lærer".
- "Fjern administratortilgang" confirmation button starts with "Fjern administratortilgang", "Fjern tilgang" or "Fjern". Result: role `member`, auth user kept.
- "Gjør til lærer" confirmation (optional) button starts with "Gjør til lærer" or "Bekreft". Result: exactly one guardian row with that email and `is_teacher = true`, listed on `/admin/laerere`.

## Teachers, `/admin/laerere`

- Button "Legg til lærer" opens a dialog with "Fornavn", "Etternavn", "E-post", "Telefon", checkbox "Send innloggingslenke nå" (checked by default, role `checkbox` with that accessible name). Submit button "Registrer lærer".
- New email: one guardian with `is_teacher = true` and a login link email in the outbox.
- Email matching one existing guardian (case-insensitive): no new guardian row, that guardian gets `is_teacher = true`, and a toast contains the guardian's first name.
- Email matching two guardians: an error toast containing "familie", no guardian changed.
- Row menu items "Rediger", "Send innloggingslenke", "Fjern som lærer" (direct row buttons with these names also work).
- "Rediger" dialog: "Fornavn", "Etternavn", "E-post", "Telefon", "Notat"; save button starts with "Lagre". Saving updates the guardian and moves the existing `auth.users` email to the new address (same user id).
- "Send innloggingslenke" puts a login link email for that teacher in the outbox.
- "Fjern som lærer" confirmation button starts with "Fjern". Result: `is_teacher = false`, zero `class_teachers` rows, and `/admin/klasser/[id]` no longer shows the teacher's first name in `main`.
- Adding the same email again with "Legg til lærer" sets `is_teacher = true` and does not recreate `class_teachers` rows.
- Applications tab: `/admin/laerere?tab=soknader`, row `<li>` with the applicant email and button "Registrer som lærer", which opens the same dialog. After "Registrer lærer" the application status is no longer `ny`.

## Families and students

- Family page `/admin/familier/[id]`: each saved guardian block contains the guardian email and a button "Fjern foresatt". Confirmation button starts with "Fjern". Result per D3.
- Family page button "Slå sammen med annen familie" opens a dialog with the "Familie" picker and confirm button "Slå sammen". Result per D4 (the other family is deleted, its students move, same-email guardians become one row).
- Student page `/admin/elever/[id]`: button "Flytt til annen familie" opens a dialog with the "Familie" picker and confirm button "Flytt". Result per D5.
- Student form field labelled "Elevens e-post (innlogging)" edits `students.child_email`; save button stays "Lagre endringer".
- Student page keeps the heading "Eleven slutter". With payments the page shows "Eleven har betalinger og kan ikke slettes" (either as a static note, or after "Slett elev" and a confirmation button starting with "Slett"), and the student is not deleted.
- "Eleven har sluttet" button plus its alertdialog button "Eleven har sluttet" set the enrollment to `avsluttet`. After reload `main` contains "Utestående", the amount (for example "3 000 kr") and a button or link "Gi fritak".

## Classes and school years

- Class form `/admin/klasser/ny` keeps ids `#name_no`, `#name_en`, `#slug` and button "Opprett klasse", toast "Klasse opprettet". A blank English name saves with `name_en = name_no`.
- School year page `/admin/skolear/[id]`: settings stay inside a `<summary>` "Innstillinger for skoleåret"; switch next to the text "Aktivt skoleår"; button "Lagre endringer".
- Saving a year as active first shows an alertdialog containing "N lærertildeling" (singular or plural), where N is the number of `class_teachers` rows in the currently active year whose guardian has `is_teacher = true`. Confirm button starts with "Aktiver". Only then is the year activated and assignments copied (D6).
- After activation the teacher's `/min-side` shows the heading "Min klasse" and the class name.
- `/min-side/klasse/[classId]` returns 200 for an admin who does not teach the class, with a heading containing the class name.

## Portal

- Parent child page `/min-side/barn/[studentId]`:
  - A region named "Oppmøte" (`<section aria-labelledby>` pointing at its heading). One element with `data-date="YYYY-MM-DD"` per non-cancelled school day in the active year. Each row shows "Til stede", "Fravær" or "Ikke registrert".
  - A region named "Ukenotater" with every class note of the active year (homework text visible). Each note has `data-date`; the first one is the newest.
- Student login (`students.child_email`) on `/min-side`: heading "Min skole", own class name, notes of the year, and the same "Oppmøte" region with `data-date` rows. `main` must not contain "Gjenstår", "Alt er betalt" or "betaling".
- A parent opening another family's child at `/min-side/barn/[id]` gets HTTP 404.

## Unit module

File `src/lib/auth-redirect.ts`, importable from plain Node (no `server-only`, no `@/` aliases). Exports:

- `safeNextPath(value: string | null | undefined): string | null`
  - Returns local paths as is, including query strings and `/en/...`.
  - Returns null for null, undefined, empty, no leading slash, `//...`, `/\...`, absolute URLs, `javascript:`, `/%2F%2F...`, a leading space, and the login pages (`/min-side/logg-inn`, `/en/min-side/logg-inn`, `/min-side/auth/bekreft`, `/login`).
- `resolvePostLoginPath({ next, isAdmin, locale }): string`
  - A safe `next` wins, for admins and others.
  - Otherwise `/admin/dagsplan` for admins in both locales, `/min-side` for `no`, `/en/min-side` for `en`.
