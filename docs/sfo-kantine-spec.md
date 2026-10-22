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

Replace the `profiles.role` flag with lookup tables, so new roles are rows, not columns.

```
roles            (key text pk, name text)                       seed: admin, sfo
permissions      (key text pk, name text)                       seed: see below
role_permissions (role_key -> roles, permission_key -> permissions, pk both)
user_roles       (user_id -> auth.users, role_key -> roles, granted_by, granted_at, pk both)
```

Permissions in v1:

| Key | Gives |
|---|---|
| `activities.sfo.manage` | Create, edit, publish, cancel SFO activities |
| `activities.sfo.roster` | Roster of signed-up children with allergies, medical notes, photo consent, pickup persons, guardian name + phone. Check-in and participation |
| `activities.sfo.payments` | See who has paid for SFO activities, register cash payment |

- `admin` role has every permission implicitly. `sfo` role gets the three above.
- SQL: `has_permission(p text)` (SECURITY DEFINER, `search_path=public`) returns true if the user has `admin` or a role with `p`. `is_admin()` is rewritten to read `user_roles`, so the 120 existing policies keep working unchanged.
- Migration: every `profiles.role = 'admin'` becomes a `user_roles` row. `handle_new_user` stops writing role. `profiles.role` is dropped in a later migration once nothing reads it.
- Only admins can read or change `roles`, `role_permissions`, `user_roles`. Every grant and removal is audit-logged.
- Teachers stay on `guardians.is_teacher` + `class_teachers` for now. Their access is per class, so a role alone does not cover it. Moving them to roles is a follow-up.

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
- Teachers moved to roles.
- More admin sections behind permissions (for example a read-only economy role).
- Recurring activities.

## 8. Open questions

1. Trip payments as sadaqa: if the school reports gifts to Skatteetaten for skattefradrag, payment for a trip is not a gift. Should activity gifts be left out of any such report?
2. Refunds for cancelled trips: always full, or decided per trip?
3. Can children who are not enrolled (siblings, friends) join SFO activities? v1 assumes enrolled children only.
4. Should SFO see Sunday-school class activities read-only, or nothing?

## 9. Build order

1. Roles: tables, seed, `has_permission`, `is_admin()` rewrite, admin migration, `requirePermission`, filtered admin nav, role picker on Brukere.
2. SFO activities: schema, audience, RLS, create/publish, reuse parent sign-up.
3. Roster with health, check-in, print, audit.
4. Trip payments via `sadaqa_gifts` (Vipps + cash), Kilde on the sadaqa page.
5. Public website listing.
6. Reminders.

Each step ships on its own. Tests: DB checks for every permission (SFO cannot read students outside a roster, cannot read tuition or other sadaqa, cannot touch class activities, existing admin still passes every current check after the `is_admin()` rewrite), e2e for SFO login, publish, parent sign-up, Vipps pay, cash pay.
