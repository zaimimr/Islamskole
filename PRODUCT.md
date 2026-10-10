# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary users for this release are the principal and trusted school administrators who manage admissions, students, families, classes, school years, payments, teachers, website content, and operational records.

Families use the public enrollment flow without an account. After enrollment, guardians sign in with an emailed login link (no password) to "Mine barn": each child's class, teachers, weekly homework and class note, attendance, calendar, absence reporting, and a one-line payment status.

Teachers sign in the same way to "Min klasse": their class roster on a phone, one-tap Sunday attendance, a weekly note with homework, absences reported by parents, and each child's learning progress. One person can be both a parent and a teacher.

Administrators publish announcements to the whole school or individual classes. Teachers publish to their own classes. Guardians read announcements in "Beskjeder" and one guardian acknowledges important notices for the family. Publishing defaults to email when delivery is configured, with a portal-only option.

Teachers record written goals in Quran, Arabic and Islamic knowledge, with optional surah/ayah references. Each dated update records practising, achieved or needs revision, teacher feedback and the next practice target. Saving shares the update immediately with the child and guardians. Current class teachers can continue existing goals after a class transfer. Families retain the learning history across school years.

## Product Purpose

Islamskole Bærum replaces Google Sheets and paper-based enrollment and payment administration with one dependable operational system. Success means the principal can see what needs attention, complete enrollment and payment work without double entry, and trust that family, placement, and financial history is complete and correct.

## Positioning

The product combines the focused workflows of a Norwegian community Sunday school with public enrollment, family relationships, class placement, school-year continuity, and Vipps payment operations in one compact system. It is intentionally smaller and more practical than a generic student information system.

## Operating Context

Islamskole Bærum is a Sunday school for Muslim children in Bærum, Norway. It serves children from 6 to 18 through a 12-year curriculum, normally with 8 to 12 students per class and teaching on approximately 35 Sundays from August to June.

The principal is moving enrollment and payment work from Google Sheets and paper. The system must support careful import, validation, duplicate review, reconciliation, and a clear cutover without ongoing double entry.

Parents enroll one or more children publicly and pay intentionally through Vipps. Payment capture happens immediately when the parent completes payment. Admission stage, placement, enrollment, and payment must remain separate operational facts even when they are shown together.

## Capabilities and Constraints

- Preserve every existing public and administrative function.
- Keep Norwegian bokmål and English public localization.
- Keep multi-child public enrollment, terms acceptance, computed totals, and immediate Vipps payment.
- Keep student records, applications, class placement, capacity, school years, rollover, fee adjustments, exemptions, partial and manual payments, sibling allocations, refunds, duplicate review, exports, teachers, users, audit history, activities, classes, and website settings.
- Restructure implementation where needed to improve correctness, safety, clarity, accessibility, responsiveness, and performance.
- Keep family, guardian, sibling, and child relationships first-class. Guardians and teachers see only the children and classes they are connected to; teachers never see payment data.
- Financial history must be traceable and must not be silently or destructively lost.
- Schema and payment changes require migration safety, automated coverage, and reconciliation checks.
- The application remains a school operations system and does not replace bookkeeping software.
- Student logins provide read access to the student's class, plans, notes, attendance and learning progress. Announcements are addressed to guardians.
- The next stages add class materials; activity consent and participation; and attendance follow-up after three consecutive missed school Sundays, with the teacher deciding whether to contact home.
- Grading, full learning management, payroll, transport, inventory, general chat, and native mobile applications remain outside this release.

## Brand Commitments

Preserve the Islamskole Bærum name, logo, public cream-and-green identity, friendly illustrations, welcoming tone, and community-centered character. The admin system should be a quieter operational expression of the same identity, with clarity and trust taking priority over decoration.

## Evidence on Hand

- Public identity and assets under `public/brand/`.
- Existing product behavior across `src/app/[locale]/` and `src/components/`.
- Database history under `supabase/migrations/` and generated types in `src/lib/supabase/types.ts`.
- Norwegian and English product copy in `messages/no.json` and `messages/en.json`.
- Existing payment, enrollment, and audit implementation in `src/lib/` and the administrative server actions.
- No approved testimonials, performance claims, or quantified time-saving claims are available and none should be invented.

## Product Principles

1. Show the principal what needs attention before showing totals.
2. Treat the family as the working relationship while preserving child-level decisions and accounting.
3. Keep admission, placement, enrollment, and payment states explicit and independently trustworthy.
4. Preserve history, explain consequences, and make risky actions deliberate.
5. Support migration from familiar tools without recreating a spreadsheet-shaped product.

## Accessibility & Inclusion

The responsive web interface must support keyboard navigation, visible focus, meaningful labels, at least 44-pixel touch targets on mobile, clear error recovery, and readable operational states. Access to child, guardian, moderation, and payment information must follow data minimization and role needs. Norwegian writing must use bokmål.

## Developer account

The verified owner has a developer role with administrative access and can use other verified accounts from Brukere og tilganger. Impersonation follows the selected account’s actual permissions, lasts one hour, and preserves the owner’s original session. Portal and admin headers identify the selected account and provide a return control. Audit history records the developer as the actual actor and retains the selected identity. Saved changes and outgoing messages are real. Ordinary administrators cannot use or grant developer access.
