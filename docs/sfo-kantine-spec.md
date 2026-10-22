# SFO / Kantine: spec

Status: draft v2, 2026-10-22. Nothing built yet.

## Goal

The SFO/Kantine team plans activities and trips, shows them on the website, collects sign-ups and consent, sees allergies and medical notes for children who are signed up, and takes payment for trips. They work in `/admin`, filtered to what their role allows. SFO staff can be parents or people from outside.

## What exists today (build on it, don't duplicate)

- `school_activities` + `activity_students` + `activity_responses` + `activity_response_history`: per-class activity with consent text, respond-by date, draft/published/cancelled, going/consent per child, consent history, participation marking. Admin UI `admin/aktiviteter`, parent UI `min-side/aktiviteter`.
- Health on `students`: `allergies`, `medical_notes`, `photo_consent`, `health_updated_at`. Parents edit via `portal_update_child_health`. Pickup persons in `family_pickup_persons`.
- `sadaqa_gifts`: amount, method, family, `source_payment_id` (Vipps), school year, void.
- Roles: `profiles.role` is `admin | member`, checked by `is_admin()` in about 120 RLS policies and by `requireAdmin()`/`getIsAdmin()` in about 28 files. Teachers/volunteers are flags on `guardians`. Login is magic link only.

## 1. Roles and permissions

Replace `profiles.role`, `guardians.is_teacher` and `guardians.is_volunteer` with lookup tables, so new roles are rows, not columns.

```
roles            (key text pk, name text)                       seed: admin, sfo, teacher, volunteer
permissions      (key text pk, name text)                       seed: see below
role_permissions (role_key -> roles, permission_key -> permissions, pk both)
person_roles     (guardian_id -> guardians, role_key -> roles, granted_by, granted_at, suspended_at, note, pk guardian_id + role_key)
```

Roles attach to the person (`guardians` row), not the login account. Teachers exist before they ever log in, and `guardians` already holds teachers who are not parents. Outsiders and admins get a `guardians` row too. The logged-in person is resolved by email, the same way as `portal_guardian_ids()`.

Permissions in v1:

| Key | Gives |
|---|---|
| `activities.sfo.manage` | Create, edit, publish, cancel SFO activities |
| `activities.sfo.roster` | Roster of signed-up children with allergies, medical notes, photo consent, pickup persons, guardian name + phone. Check-in and participation |
| `activities.sfo.payments` | See who has paid for SFO activities, register cash payment |

- `admin` role has every permission implicitly. `sfo` role gets the three above. `teacher` and `volunteer` get none in v1 (see 1b).
- SQL, all SECURITY DEFINER with `search_path=public`:
  - `guardian_has_role(guardian_id, role)`: role row exists and `suspended_at is null`.
  - `has_role(role)`: true for any of the caller's `portal_guardian_ids()`.
  - `has_permission(p)`: `has_role('admin')` or an active role with `p`.
  - `is_admin()` is rewritten as `has_role('admin')`, so the 120 existing policies keep working unchanged.
- Admin migration: each `profiles.role = 'admin'` is matched to a `guardians` row by email, or one is created, then gets a `person_roles` row. `handle_new_user` stops writing role. `profiles.role` is dropped once nothing reads it.
- Only admins can read or change `roles`, `role_permissions`, `person_roles`. Every grant, suspension and removal is audit-logged.
- Email change on a person (existing `guardian_email_changes` flow) moves their roles with them.

## 1b. Moving teachers and volunteers to roles

A role says what someone is. An assignment says where. `class_teachers`, `class_substitutes` and `lessons.teacher_guardian_id` / `co_teacher_guardian_id` stay as they are and still decide which class a teacher can work in.

| Today | After |
|---|---|
| `guardians.is_teacher` | `person_roles` row with `teacher` |
| `guardians.is_volunteer` | `person_roles` row with `volunteer` |
| `guardians.teacher_suspended_at` | `person_roles.suspended_at` on the `teacher` row |
| `guardians.teacher_note` | `person_roles.note` on the `teacher` row |
| `guardians.source_application_id` | stays on `guardians` |

Two-step migration, so the live site never breaks:

1. Migration A:
   - Create the tables and fill `person_roles` from `is_teacher`, `is_volunteer`, `teacher_suspended_at`, `teacher_note`.
   - Recreate every SQL function that checks `g.is_teacher and g.teacher_suspended_at is null` to use `guardian_has_role(g.id, 'teacher')`, among them `sunday_class_staff`, lesson access, week plans, absences, announcements and portal RPCs. Only the latest definition of each function needs changing.
   - Add a sync trigger so the old flags keep matching `person_roles` while the current code on main still reads them.
2. App: switch reads and writes in about 14 files (`laerere`, `teacher-actions.ts`, `brukere`, `familier`, `families-actions.ts`, `families/repository.ts`, `elever/[id]`, `klasser/[id]`, `dagsplan`, `copyable-assignments.ts`, `portal-admin-actions.ts`, `actions.ts`, `portal/data.ts`, export route), patch `types.ts` by hand. Approving a teacher application creates the role row. Suspend and reactivate set `suspended_at`. Deploy.
3. Migration B: once nothing reads them, drop the trigger and `is_teacher`, `is_volunteer`, `teacher_suspended_at`, `teacher_note`.

Later: teacher permissions such as `class.notes.write` and `attendance.mark`, so each check becomes "has the permission and is assigned to this class". New staff types (for example an assistant who marks attendance but does not write notes) are then seed rows, not code.

App side:

- `getPermissions()` loads the user's permission set once per request. `requirePermission(p)` next to `requireAdmin()`.
- Admin layout lets in anyone with at least one permission. The sidebar, mobile nav and command palette only show sections the user has access to. Every page and server action checks its own permission; nav filtering is not the guard.
- A user with only SFO permissions sees one section: Aktiviteter, showing SFO activities only.
- `/api/export` stays admin-only.

Users:

- `admin/brukere` gets a role picker per user (one or more roles) and "Legg til bruker" with email + role.
- Outsider: admin adds email + `sfo` role, they get a login link.
- Parent: same email as their guardian record means same login. They see `/min-side` as a parent and `/admin` filtered to SFO.

## 2. SFO activities

Extend `school_activities`:

- `owner text not null default 'class' check (owner in ('class','sfo'))`.
- `class_id` nullable when `owner = 'sfo'`. Audience in `activity_audience(activity_id, class_id)`: one or more classes, or all.
- New columns: `location`, `starts_at`/`ends_at`, `capacity int null`, `min_age`/`max_age` (calendar-year age via `src/lib/age.ts`), `price_ore int null`, `payment_due date null`, `show_on_website boolean`, `needs_consent boolean`.
- RLS: `activity_can_staff()` becomes `is_admin()` or class staff for `owner = 'class'`, or `has_permission('activities.sfo.manage')` for `owner = 'sfo'`. SFO cannot see or edit class activities.

Flow:

1. SFO creates a draft, picks audience, time, place, price, capacity, consent text.
2. Publish: parents of matching children are invited (existing `activity_added_notifications` email). If `show_on_website`, it appears on the public site.
3. Parent answers in `min-side/aktiviteter`: going / not going, consent, sees the allergies and medical notes on file with "Stemmer dette?" and an edit link, pays if priced.
4. Capacity reached: sign-up closes and the activity shows "Fullt". No waiting list.
5. On the day: SFO opens the roster, checks children in, sees health info inline.
6. Cancel: existing cancellation notice to everyone going. Paid trips are listed for admin to refund.

## 3. Public website

- "Aktiviteter" section listing published SFO activities with `show_on_website = true`: title, date/time, place, age, price, spots left or "Fullt".
- "Meld på" goes to `/min-side/logg-inn` and back to the activity. No anonymous sign-up, consent needs a known guardian.

## 4. Roster and health

- RPC `sfo_activity_roster(activity_id)`, needs `activities.sfo.roster`. Per child: name, age, class, allergies, medical notes, photo consent, pickup persons, guardian name + phone, going, consent, paid.
- Only children with a response on that activity, and only until 30 days after the activity. No browse-all-students view.
- Allergy summary at the top.
- Printable roster for trips.
- Every roster read is audit-logged (health data, GDPR art. 9).
- Health info older than the current school year: parent must confirm it when signing up.

## 5. Trip payments as sadaqa

Trip payments are recorded in `sadaqa_gifts`, marked with the activity they came from.

- New columns on `sadaqa_gifts`: `activity_id uuid null references school_activities`, `student_id uuid null references students`. A gift with `activity_id` set is an activity payment.
- Vipps: parent pays from the activity card. On capture, one `sadaqa_gifts` row per child with `source_payment_id`, `activity_id`, `student_id`, `family_id`. Siblings in one payment become one row each.
- Cash: SFO registers it on the roster (amount, date, method `kontant`), written as a `sadaqa_gifts` row with `created_by`.
- Paid status per child = active gifts for that activity and child >= `price_ore`. Not paid by `payment_due` is shown red on the roster. The child is not removed automatically.
- No `student_fees` row, so trips never show as tuition debt or affect balances.
- Sadaqa page in admin: new "Kilde" column and filter (Direkte / activity title). Totals include activity gifts, with a split per source.
- SFO with `activities.sfo.payments` sees only gifts with an `activity_id` for SFO activities, through an RPC. They do not see other sadaqa.
- Void and refund stay admin-only.

## 6. Notifications (email only, existing queue)

- Published: invite to parents in the audience.
- Reminder before `respond_by` to parents who have not answered.
- Reminder before `payment_due` if unpaid.
- Time or place changed, or cancelled: notice to everyone going.

## 7. Later

- Kiosk (products, till, day close, reports).
- Waiting list for full activities.
- Teacher permissions (see 1b).
- More admin sections behind permissions (for example a read-only economy role).
- Recurring activities.

## 8. Open questions

1. Trip payments as sadaqa: if the school reports gifts to Skatteetaten for skattefradrag, payment for a trip is not a gift. Should activity gifts be left out of any such report?
2. Refunds for cancelled trips: always full, or decided per trip?
3. Can children who are not enrolled (siblings, friends) join SFO activities? v1 assumes enrolled children only.
4. Should SFO see Sunday-school class activities read-only, or nothing?

## 9. Build order

1. Roles: tables, seed, `has_permission`, `is_admin()` rewrite, admin migration, `requirePermission`, filtered admin nav, role picker on Brukere.
1b. Teachers and volunteers to roles: migration A, app switch, deploy, migration B.
2. SFO activities: schema, audience, RLS, create/publish, reuse parent sign-up.
3. Roster with health, check-in, print, audit.
4. Trip payments via `sadaqa_gifts` (Vipps + cash), Kilde on the sadaqa page.
5. Public website listing.
6. Reminders.

Each step ships on its own. Tests: DB checks for every permission (SFO cannot read students outside a roster, cannot read tuition or other sadaqa, cannot touch class activities, existing admin still passes every current check after the `is_admin()` rewrite, every existing teacher and substitute check passes after migration A both with the old flags and with roles, a suspended teacher loses access, teacher + parent and SFO + teacher on one person keep both), e2e for SFO login, publish, parent sign-up, Vipps pay, cash pay.
