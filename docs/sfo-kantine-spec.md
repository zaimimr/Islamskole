# SFO / Kantine: spec

Status: draft, 2026-10-22. Nothing built yet.

## Goal

The SFO/Kantine team plans activities and trips, collects sign-ups and consent, sees the health info they need to keep children safe, and takes payment for trips and kiosk sales. They get their own role, separate from admin and teacher.

## What exists today (build on it, don't duplicate)

- `school_activities` + `activity_students` + `activity_responses` + `activity_response_history`: per-class activity with consent text, respond-by date, draft/published/cancelled, going/consent per child, consent history, participation marking. Admin UI `admin/aktiviteter`, parent UI `min-side/aktiviteter`.
- Staff access is `is_admin()` or `sunday_class_staff(class, year)` via `activity_can_staff()`.
- Health on `students`: `allergies`, `medical_notes`, `photo_consent`, `health_updated_at`. Parents edit via `portal_update_child_health`. Pickup persons in `family_pickup_persons`.
- Payments: `payments` (øre) + `payment_targets` (per child) + Vipps ePayment. Sales units: 1111805 web, 60206 donasjon (API), 24279 sadaqah and 610090 elevbetaling (settlement upload only).
- Roles: `profiles.role` is `admin | member`. Teachers/volunteers are flags on `guardians` (`is_teacher`, `is_volunteer`). Login is magic link only.

## 1. New role: SFO

| | Admin | SFO | Teacher | Parent |
|---|---|---|---|---|
| Create, edit, publish, cancel SFO activities | Y | Y | N | N |
| Edit Sunday-school class activities | Y | N | own class | N |
| See sign-ups and consent for SFO activities | Y | Y | N | own child |
| See allergies, medical notes, photo consent, pickup persons | Y | only for children signed up to an SFO activity, read-only | own class | own child |
| See guardian name + phone for signed-up children | Y | Y | own class | N |
| Mark participation / check-in on the day | Y | Y | own class | N |
| Create trip prices, see who has paid | Y | Y | N | own child |
| Register cash/manual trip payment | Y | Y | N | N |
| Kiosk: sell, see own sales | Y | Y | N | N |
| Kiosk: products, prices, reports | Y | Y | N | N |
| Refunds | Y | N (request only) | N | N |
| Tuition, sadaqa, families, students, school setup | Y | N | N | N |
| Edit health info | N (parent owns it) | N | N | own child |

Model:

- `guardians.is_sfo boolean` (same pattern as `is_teacher`/`is_volunteer`), so SFO staff log in through the existing portal magic link and land on `/min-side/sfo`. No new admin accounts.
- SQL helper `is_sfo_staff()` (SECURITY DEFINER, like `portal_guardian_ids()`), used in RLS and RPCs.
- Admin toggles the flag on the guardian/teacher page. Audit-logged.
- SFO staff never enter `/admin`.

## 2. SFO activities

Extend `school_activities` instead of a new table:

- `owner text not null default 'class' check (owner in ('class','sfo'))`.
- `class_id` nullable when `owner = 'sfo'`. Audience in new table `activity_audience(activity_id, class_id)`: one or more classes, or all classes.
- New columns: `location`, `starts_at`/`ends_at` (time, not only date), `capacity int null`, `min_age`/`max_age` (calendar-year age via `src/lib/age.ts`), `price_ore int null`, `payment_due date null`, `show_on_website boolean`, `needs_consent boolean` (today consent is always required), `registration_mode` (`invite` = invited children answer, like now; `open` = parents sign children up).
- Optional per-activity questions to parents: free text "Annet vi bør vite" only. No form builder in v1.

Flow:

1. SFO creates draft, picks audience, price, capacity, consent text.
2. Publish: invites parents of matching children (existing `activity_added_notifications` email path). If `show_on_website`, it appears on the public site.
3. Parent answers in `min-side/aktiviteter`: going / not going, consent, sees allergies on file with a "Stemmer dette?" confirm or edit link, pays if priced.
4. Full: new answers go to a simple "Venteliste" status on the response. Only for SFO activities with capacity. (Note: class wait lists were rejected; this is per-activity capacity, confirm with owner.)
5. On the day: SFO opens the roster, checks children in/out, sees allergies inline.
6. Cancel: existing cancellation notice, and paid trips become refund requests for admin.

## 3. Public website

- New "Aktiviteter" section on the public site, listing published SFO activities with `show_on_website = true`: title, date/time, place, age, price, spots left.
- "Meld på" sends the visitor to `/min-side/logg-inn` and back to the activity. No anonymous sign-up, since consent and health info need a known guardian.
- Uses the existing `events` look on the public site; `events` stays for non-registration items.

## 4. Health and needs view

- RPC `sfo_activity_roster(activity_id)` returns per child: name, age, class, allergies, medical notes, photo consent, pickup persons, guardian name + phone, going/consent/paid status.
- Only for children with a response on that activity, only while the activity is not older than 30 days. No browse-all-students view for SFO.
- Allergy summary at the top of the roster ("3 nøtteallergi, 1 gluten").
- Printable roster (existing print pattern) for trips without signal.
- Every roster read is audit-logged (health data, GDPR art. 9).
- Stale info: if `health_updated_at` is older than the current school year, the parent is asked to confirm when they sign up.

## 5. Trip payments

- Each priced SFO activity creates a `student_fees` row per signed-up child (category `activity`, linked to `activity_id`), so the existing ledger, balances, allocations and "Økonomi" page show it.
- Parent pays with Vipps from the activity card or "Økonomi". Group pay for siblings uses `payment_targets` like today.
- SFO can register cash payment on the roster (amount, date, method), same shape as admin manual payments.
- Sibling discount: not applied to activities.
- Not paid by `payment_due`: shown in red on the roster, child still allowed unless SFO removes them. No automatic removal.
- Which Vipps sales unit: open question (see below). Payments must carry `kind = 'activity'` so they never mix with tuition in reports.

## 6. Kiosk

Smallest useful version:

- `kiosk_products(id, name, price_ore, active, sort_order)`.
- `kiosk_sales(id, sold_at, sold_by, total_ore, method in ('vipps','cash','card'), school_day_id null)` + `kiosk_sale_lines(sale_id, product_id, name, unit_ore, qty)`.
- `/min-side/sfo/kiosk`: phone-first till. Tap products, see total, pick method. Vipps = show the shop's Vipps number/QR for the amount, SFO taps "Betalt". Cash = tap "Betalt".
- Day close: totals per method, cash count entered, difference shown.
- Report: per day / per month, per product, CSV export (existing `/api/export` pattern, SFO allowed for kiosk only).
- Not tied to children or families. No tabs, no credit, no stock tracking in v1.

## 7. SFO home `/min-side/sfo`

- Tabs: Aktiviteter, Kiosk, Rapport.
- Aktiviteter: upcoming first, each card shows date, signed up / capacity, consent missing, unpaid.
- Activity detail: Påmeldte (roster with health), Betaling, Rediger.
- Follows admin UI conventions: cards over tables, essentials + Detaljer, wide on desktop, labels and values only.

## 8. Notifications (email only, existing queue)

- Published: invite to parents in audience.
- Reminder before `respond_by` to parents without an answer.
- Reminder before `payment_due` if unpaid.
- Changed time/place or cancelled: notice to everyone going.

## 9. Out of scope v1

- Daily SFO attendance / opening hours (school is Sunday only).
- Recurring activities (weekly club). Create each date for now.
- Card terminal integration, stock counting, child prepaid kiosk balance.
- SMS. Spond. Custom form builder.

## 10. Open questions for the owner

1. Who is SFO/Kantine: a few named volunteers who already are guardians, or outside people? (Decides `guardians.is_sfo` vs. a new staff table.)
2. Should SFO see medical notes, or only allergies? Medical notes can be sensitive.
3. Trip money and kiosk money: same bank account and Vipps sales unit as tuition, or separate? Does SFO need its own accounting?
4. Kiosk payment: Vipps number + "Betalt" button is enough, or do they want Vipps to confirm payment automatically (needs a Vipps QR/ePayment per sale, slower at the till)?
5. Can SFO activities be open to children who are not enrolled (siblings, friends)? v1 assumes enrolled only.
6. Capacity and "Venteliste" per activity: wanted?
7. Refunds for cancelled trips: always full, or SFO decides?
8. Does a teacher ever need to run an SFO activity too, or is it fully separate?

## 11. Build order

1. Role: `is_sfo`, `is_sfo_staff()`, admin toggle, `/min-side/sfo` shell.
2. SFO activities: schema extension, audience, create/publish, parent sign-up reuse.
3. Roster with health + check-in + print + audit.
4. Trip payments via `student_fees` + Vipps + cash.
5. Public website listing.
6. Kiosk till + day close + report.
7. Reminders.

Each step ships on its own. Tests: DB checks for every RLS rule in the matrix (SFO cannot read students outside a roster, cannot read tuition), e2e for publish, sign-up, pay, kiosk sale.
