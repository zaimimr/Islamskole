# Sunday school rollout

Build for a Sunday-only school with limited staff. Preserve the existing Norwegian bokmål and English interface, access boundaries and financial history.

## Delivery order

1. Signup confirmation, parent and student welcome emails, first-use Min side guidance, installment-plan confirmation and payment reminders. Reuse existing receipts and announcement delivery.
2. Shared teaching plans with goals, completion and reuse across school years, private lesson materials and substitute handover using existing classes, lessons and semester plans.
3. Homework completion with needs-help responses, editable end-of-term report drafts from learning progress and attendance, publication, printing and parent notification.
4. Attendance follow-up after three consecutive missed school Sundays, teacher-reviewed contact and follow-up history, activity consent per child and participation rosters.

## Acceptance

- Every feature is available to its intended role through the existing navigation and child/class pages.
- Guardians see their own children, students see their own learning, and teachers see only authorised classes. Financial and consent emails go to guardians.
- Email delivery survives retries, respects communication preferences and does not block signup or admission when the provider fails. Proposed application email addresses do not grant student access.
- First-use guidance explains passwordless login and the role's Min side tasks, and can be dismissed persistently.
- Materials support files and links with private access. Substitute handover includes the plan, materials and previous lesson notes.
- Homework responses remain tied to the child and assignment. Staff can see completion and requests for help.
- Reports are reviewed before publication, retain a published snapshot, can be printed, and become visible to the child and guardians only after publication.
- Absence streaks count actual non-cancelled school Sundays during enrollment, without treating missing attendance as absence. Contact home is an explicit staff decision.
- Activity responses record the responding guardian, consent decision and participation per child. Staff can see missing responses and print a roster.
- Verify migrations locally with permission and integrity checks, unit tests, lint, typecheck, production build, and relevant desktop/mobile browser flows before shipping.

## Progress

- Email and onboarding implemented locally. 126 unit checks, 50 focused email database checks and five email browser setup/flow/teardown checks passed. The previous full database run passed 619 checks. Production build passed. Shipping and the remaining stages are still outstanding.

- Shared teaching goals, covered topics, school-year reuse, private lesson materials and substitute handover implemented locally. 32 focused database checks, 664 full database checks, 127 unit checks and 10 browser setup/flow/teardown checks passed. Typecheck, lint and production build passed. Shipping and the remaining stages are still outstanding.

- Homework completion, needs-help responses, version checks and assignment selection implemented locally. 70 focused homework and child-merge database checks and three browser checks passed. Typecheck passed. Report, attendance and activity work is ongoing.

- Reviewed term reports implemented locally with separate private drafts, retained publications, printing, guardian notification and child-merge preservation. 720 full database checks, 127 unit checks and three report browser checks passed. Typecheck, lint and production build passed. Attendance follow-up and activity consent are ongoing, shipping is still outstanding.

- Attendance follow-up implemented locally with whole-Sunday absence streaks, explicit staff decisions, reviewed guardian emails and retained private contact history. 76 focused attendance and child-merge database checks and three browser checks passed. Typecheck and lint passed. Activity consent and shipping remain outstanding.
