# Mobile-first admin redesign

Status: Approved for implementation on 2026-11-02. The owner requested proceeding directly without mockups.

## Purpose

Staff usually know a student's first name, rather than a parent or family name. Make that the starting point throughout administration. Optimize Sunday operations for an admin using a phone: find a child, contact a parent, record attendance, see teacher coverage, and resolve exceptions without changing pages unnecessarily.

Keep the existing cream, green, typography and school identity. Improve information order, navigation, density and interactions within that identity. Desktop uses the same task structure with more room for aligned columns.

## Confirmed requirements

- Mobile first, desktop second, covering all admin pages and related teacher attendance/absence flows.
- Student information order: student, age, class, parent information, payment information.
- Remove redundant routine badges such as registered and placed when class membership already establishes them. Keep actionable exceptions and detailed history accessible.
- Dagplan comes first in navigation. Admins record most attendance.
- Replace attendance class dropdowns and the Vis submission with visible class toggles that apply immediately.
- First-lesson attendance carries forward to later lessons for the same student on the same school day. Later lessons can be corrected independently.
- Bulk present marks only unrecorded students, preserving existing marks and active reported absence.
- Teacher absence immediately flags affected classes. Admins arrange substitutes.
- Assigned teachers default to present on the school day unless absence is recorded. There is no teacher arrival/check-in workflow or student-style teacher attendance register.
- Student absence distinguishes reported from unreported absence. An explanatory note is a separate fact, not the basis for classifying absence as reported.
- Parents may report student absence privately to teachers by email or SMS. The teacher records Meldt fravær and a note in the system; private messages do not update attendance automatically.
- Class detail opens on class information, including teachers. Age and capacity belong in class setup, rather than website content.
- Placing a student into a full class offers an explicit capacity increase in the placement flow.
- Review task flows from admin and teacher perspectives before implementation. Source-based walkthroughs are preliminary evidence; actual staff feedback remains valuable.

## Recommended structure

### Navigation and lookup

- Mobile bottom navigation: Dagplan, Elever, Klasser, Mer. Keep student search directly available in the header. Desktop navigation uses the same order, with the remaining destinations visible in groups.
- Mer contains Betaling, Lærere, Beskjeder, Opptak, Aktiviteter, Familier, Arbeidsflate and Oppsett. Oppsett groups school years, public contact/links, accounts and access, and history. Keep Min konto available. Respect existing staff permissions.
- Keep Arbeidsflate as the cross-school exception overview. Recommend Dagplan as the default admin landing page, showing today when it is a school day, otherwise the next school day. Opening a bookmarked date preserves that date.
- Search matches student first names and partial names. Results lead with full student name, age and class to distinguish children with the same first name. Also retain guardian, phone, email, family, class and payment-reference lookup.
- Open a student directly from results. Family and finance results show matching child names instead of requiring staff to recognize the household name.
- Preserve list position, query and filters when returning from a student or payment action.

### Student overview

1. Student name, age and current class or classes.
2. Parents/guardians with relationship labels and direct phone/email actions.
3. Compact admin-only payment summary with the relevant Vipps action.
4. Secondary sections for attendance, learning, reports, activities, editing and history.

Teachers see identity, relevant parent contacts and teaching information within their assigned access. Payment information remains restricted to admins. Family records continue to hold shared guardian, sibling and billing relationships; changing the entry point does not split family accounts.

Show admission, missing placement, ended enrollment and payment issues when they require action. Retain the underlying independent records and historical facts. Do not show several healthy-state badges for every child.

### Dagplan and student attendance

- One working view combines teacher coverage and student attendance for the selected date and lesson. Put uncovered teaching assignments first.
- Use separate controls for class and lesson: visible class buttons including Alle, and a separate 1. time / 2. time / 3. time control using the school's configured lessons and times. No Vis button. Class buttons wrap on narrow screens; avoid a dropdown or a hidden collection of classes.
- A class header shows its name, assigned teacher/substitute, staffing state, attendance counts and unrecorded count. All counts and marking actions refer to the selected lesson. Keep explicitly labelled day/year reports available separately.
- Selecting a class opens its compact roster. Alle shows class summaries with in-place expansion, a Vis alle elevlister option, and bulk marking accessible from each header. Keep the selected roster open after marking.
- Each compact row shows student name, attendance state and an accessible three-dot menu. An unmarked student has a direct Møtt action. Tapping the status opens attendance choices. The menu contains student information, parent contact and secondary actions. Important health/pickup alerts remain discoverable at the point of use.
- Status counts include Møtt, Forsinket, Meldt fravær, Ikke meldt fravær, and Ikke registrert. Unrecorded is never interpreted as absent. A separate note indicator opens the explanation when one exists. Avoid Gyldig/Ugyldig labels because reporting does not establish validity.
- A teacher who receives an absence message by private email or SMS selects Meldt fravær and adds a short note in the same flow. Distinguish a report recorded by staff from one submitted through the parent portal, and retain the recording actor and time using existing audit/report records. Admins retain correction access.
- Bulk action names the affected count, for example Merk 8 uregistrerte som møtt. A fresh server-side check must preserve marks and absence reports created by someone else after the page loaded.
- Saving gives clear feedback and retains the current date, class, lesson and scroll position. Failed saves restore the previous value and allow retry.

Attendance inheritance:

- Recording lesson 1 fills later eligible lessons that day. Changes to lesson 1 update attendance still inherited from lesson 1.
- Explicitly changing lesson 2 preserves that correction when lesson 1 changes, and carries the lesson-2 correction into later attendance still eligible for inheritance.
- Explicit changes in lesson 3 remain intact. Never copy attendance between different students or different dates, or into cancelled lessons.
- Keep inherited status identifiable when opening its details, without repeating explanatory text on every row.
- Bulk marking does not clear a reported absence. An explicit individual correction can record that a child arrived while retaining the original report in history.

### Teachers and future planning

- Teacher portal exposes Meld fravær without requiring a class-by-class search. Allow several actual school dates to be selected together, an optional explanation, a review before saving, and withdrawal of the teacher's own reports.
- Offer all applicable future school dates in the selected school year, instead of only the next eight. Do not add recurring rules in this first redesign.
- A saved absence appears immediately in admin planning and on affected lessons. Assigning a substitute resolves coverage, while retaining the original teacher's absence.
- Mobile planning uses a chronological list of upcoming Sundays showing absent teachers, affected classes and unresolved cover. Expanding a date provides class-level actions. Desktop may use a teacher-by-date grid with the same data and labels.
- Teacher identity links to contact and assigned classes. Class and teacher entry points use the same absence and substitute actions. Check availability and simultaneous teaching assignments when choosing cover.
- On the school day, assigned teachers default to Tilstede unless absence is recorded. No arrival confirmation is required. Show recorded absence and the assigned substitute directly in the class header; retaining the original teacher's absence does not leave the covered class flagged as uncovered.
- For future dates, show the teacher as scheduled/expected unless absence is reported. Do not describe a future assignment as an arrival that has already happened.

### Classes and placement

- Class list prioritizes class name, teachers, age range and occupied places/capacity. Move public website ordering away from the main operational list.
- First tab: Klasseinfo, showing teachers, timetable, age range and capacity with direct editing. Keep Elever and teaching resources reachable without restoring a long semester plan above the roster.
- Nettside contains public descriptions, images and publication controls. Capacity and age are edited in class setup even if those values also appear publicly.
- A full class remains selectable during admission, placement and transfer. Reveal current occupancy/capacity, an editable new capacity, and the explicit action Øk kapasitet og plasser. Default to the minimum capacity needed for this placement, never increase silently.
- Save the capacity change and placement together. Concurrent placements must not overfill the class or leave a capacity change behind after failed placement. Preserve the entered form if another admin changes the class.
- Retain existing class-wide capacity semantics in this redesign. Occupancy is measured for the selected school year. The capacity edit must identify the class it changes; year-specific capacity would be separate scope.

## Whole-admin coverage

Every route and its create/edit/detail variants receives a mobile pass. Grouping below changes navigation and presentation, without removing functions.

| Area and current route | Planned focus |
| --- | --- |
| Arbeidsflate, /admin | Actionable exceptions with direct routes to the relevant child or task |
| Dagplan, /admin/dagsplan | Combined staffing and attendance, immediate class/lesson toggles, reports retained |
| Elever, /admin/elever, /ny, /[id] | First-name lookup, identity/contact order, compact editing and secondary history |
| Familier, /admin/familier, /[id], /[id]/rediger | Child names visible in matching results; preserve siblings, shared guardians, merging and billing |
| Opptak, /admin/register | Student-led review, inline capacity increase, preserve admission and waiting workflows |
| Klasser, /admin/klasser, /ny, /[id] | Operational directory, Klasseinfo first, separate public content |
| Lærere, /admin/laerere | Contact, classes, future absence and cover; retain application/archive flows |
| Betaling overview, /admin/betaling | Student-led identification with family billing totals; Vipps action primary |
| Betaling /oppfolging and /avdrag | Identify the child immediately; payment follow-up and installment actions in context |
| Betaling /logg, /rabatter, /sadaqa | Readable history and adjustments; retain donation and manual payment functions |
| Betaling /avstemming and /dobbeltforinger | Group infrequent accounting tools; preserve review, allocations, refunds and exports |
| Beskjeder, /admin/beskjeder, /[id], /epost | Recipient selection, compose/review, delivery history and failed-send actions on mobile |
| Aktiviteter, /admin/aktiviteter, /ny, /[id] | Readable participation and consent, roster/contact and editing |
| SFO, /admin/sfo, /ny, /[id], /allergier | Preserve shared activity structure, role access and relevant health/pickup information |
| Skoleår, /admin/skolear, /ny, /[id], /[id]/rollover | Clear year context, calendar/time setup and deliberate rollover steps |
| Nettside, /admin/innstillinger | Rename according to actual public contact/link content; concise mobile forms |
| Tilgang og konto, /admin/brukere, /admin/konto | Role clarity, account tasks and existing developer controls |
| Historikk, /admin/revisjon | Useful mobile filters and readable event detail |
| Related teacher portal | Compact attendance, student/contact lookup, future absence and substitute visibility |

## Evidence and existing behavior

Three independent source walkthroughs covered student lookup, Sunday operations, and class/remaining admin routes. These are heuristic reviews, not observed staff tests or rendered browser QA.

- Navigation currently places Dagsplan after admissions, families, students and classes: src/components/admin/sidebar-nav.tsx.
- Global search already matches students but orders family hits first; the family list can match a child without showing that matching child prominently: admin/actions.ts, command-palette-dialog.tsx and familier/family-list.tsx.
- Student detail renders payment management before student/guardian information: admin/(admin-only)/elever/[id]/page.tsx.
- Attendance currently uses Klasse and Time dropdowns followed by Vis: dagsplan/day-attendance.tsx. The shared roster already has bulk present: portal/teacher/attendance-roster.tsx.
- Existing same-day inheritance is covered by migration 20261010150000_attendance_propagation.sql, supabase/tests/attendance_propagation.sql and tests/e2e/attendance.spec.ts. Preserve and reverify it rather than building another cascade.
- Teacher absence and substitute assignment already exist. Teacher-home.tsx currently limits the absence chooser to eight dates.
- Class age/capacity currently live in ClassForm under Nettside. Full classes are disabled in register/admit-dialog.tsx; students-actions.ts sends admins to Klasser to change capacity.
- PRODUCT.md, DESIGN.md and the persisted admin surface brief still describe a family-first entry point. After approval, update that guidance to student-first navigation while preserving family relationships and independent financial records.

## Delivery order after design approval

1. Implement directly in the existing visual system; the owner waived mockup review.
2. Navigation, student-first search and student/contact information order, including family and payment search results.
3. Compact Dagplan, class/lesson toggles and bulk marking, preserving attendance inheritance and explicit overrides.
4. Teacher future absence and admin coverage planning, with default presence and no separate arrival recording.
5. Class directory, Klasseinfo and atomic capacity increase during admission/placement/transfer.
6. Apply the same conventions to the remaining routes in the coverage table; complete mobile and desktop task checks before release.

Keep the underlying family/payment model, permissions and recorded history intact. No marketing-site redesign, new billing model, recurring absence engine or unrelated feature expansion.

## How success will be checked

- At 360px and 390px widths, find the correct student using only a first name, distinguish duplicate names by age/class, and reach the correct parent in one tap from the student overview.
- Open Dagplan directly, identify uncovered classes and teacher coverage, switch class/lesson without a Vis action, and record attendance without leaving the page.
- Mark remaining students present while preserving reported absence, late arrivals, manual marks, and concurrent changes. Check a failed save and retry without losing context.
- Record a student absence received privately by SMS/email as Meldt fravær with a note. Verify that reported absence without note text stays reported, that unreported absence stays separate from unrecorded attendance, and that staff-recorded and portal-reported sources remain identifiable.
- Record lesson 1, verify inheritance into lessons 2 and 3, override lesson 2, then change lesson 1 and verify later explicit corrections survive. Cover cancelled lessons/days and future dates.
- Report two future teacher absences, see both in admin planning, assign cover, and withdraw a report without accidentally discarding a substitute assignment.
- Verify that an assigned teacher defaults to present on the day without a check-in action, recorded absence takes precedence, and substitute coverage resolves the class's coverage warning while preserving the absent teacher's report.
- Place/transfer a child into a full class through one reviewed capacity-and-placement action. Check concurrent placements and rollback on failure.
- Check long names, several guardians/classes, unknown ages, missing phone, no active school year, empty/cancelled days, no classes, and loading/error states.
- Check keyboard access, screen-reader labels, visible focus, 44px minimum mobile touch targets, text zoom, and meaningful status labels alongside color.
- Re-run the relevant existing browser/database suites and required lint/type/build checks. Keep generated Next route types from racing a running browser-test dev server.
- Separate admin and teacher walkthroughs verify role access and that teachers cannot retrieve payment information. Real staff feedback is recorded separately from simulated task reviews.
- Desktop checks at 1280px and 1440px retain efficient scanning and actions. Complete the mobile route inventory before calling the redesign finished.

## Design review

The teacher-presence and student-absence decisions are settled. The owner approved implementation directly and waived mockup review.

The navigation, next-school-day landing behavior, multi-date absence selection and minimum capacity suggestion above are included in the approved implementation scope.
