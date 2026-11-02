# Mobile-first admin implementation

Design: ../specs/2026-11-02-mobile-first-admin-design.md

Approved to implement directly, without mockups. Preserve existing family billing, history, permissions and same-day attendance inheritance. Use existing Next.js 16.2.9, React 19 and Supabase patterns. No new dependencies or code comments. Norwegian bokmål UI.

- [x] Navigation and lookup: reorder sidebar, add mobile Dagplan/Elever/Klasser/Mer navigation, student-first global search with age/class, preserve other search types. Files: admin shell, admin-mobile-nav, sidebar-nav, command-palette and admin/actions.ts. Verify mobile navigation and first-name search in existing search browser tests.
- [x] Student overview: show identity, age/class and guardians before payment controls; secondary detailed history/editing. Files: admin/elever pages. Verify duplicate first names, contact links, responsive order and existing family/payment flows.
- [x] Sunday workflow: immediate class/lesson controls, compact class and student rows, combined teacher coverage, accessible secondary actions. Preserve direct status changes, note/report source and inheritance. Add DB protection for bulk-present concurrency. Files: dagsplan, shared teacher attendance roster, portal actions, new migration. Verify existing attendance tests and new concurrency/report cases.
- [x] Teacher planning: multi-date absence across future school dates, default present on the day, upcoming cover view and admin substitutes. Files: teacher-home, teacher-absence, teacher actions and Dagplan planning. Verify reporting, withdrawal, cover and permissions.
- [x] Classes and capacity: default Klasseinfo, teachers/timetable/age/capacity, operational class directory; full class selectable with atomic explicit expansion during admission/placement/transfer. Files: klasser, class-form/sort-list, enrollment manager, admission dialog, students-actions and migration. Verify full-class placement, stale capacity, rollback and concurrency with database/browser tests.
- [x] Remaining admin: child names lead family/finance lists, simplify finance tools, route-by-route mobile pass on communications, activities/SFO, teacher registry, school year, access/account/history/public settings. Preserve all features and role boundaries.
- [x] Integration: apply local migrations and regenerate types; update English/Norwegian attendance labels and durable product/design guidance. Run lint, typecheck, unit/database/browser suites and production build sequentially where generated route types require it. Check rendered mobile and desktop flows, fix review findings, release verified changes through main using hobby project policy.

## Dependencies

Navigation, student overview, Sunday workflow, class capacity and remaining-admin presentation have independent file ownership. Integrate migration-generated types and translations after feature edits. Only one local browser test server/test-data suite may run at a time. Do not run next typegen while the browser-test dev server is active.

## Progress

- Repository is on main with only the design draft untracked at start. Local Supabase is running. Existing Next guides and design/coding/security instructions have been read.
- Implementation and browser verification are complete across the planned source areas. Final static checks and release are in progress.
- Unit tests: 153 passed. Database tests: 44 files and 979 assertions passed. Final lint, type checking and production build passed after all browser tests stopped.
- The 37-route mobile walkthrough passes at 360px, including visible-control bounds. Task checks also cover 390px, 1280px and 1440px, first-name lookup, contact order, finance keyboard navigation and multi-date teacher absence.
- Attendance, capacity expansion at all three entry points, simultaneous final-seat requests, class navigation, teacher overrides, reported absence notes and substitute flows pass targeted browser checks. The full browser suite exercised 100 checks: 98 passed initially, with two stale assertions corrected. The final attendance/child-merge recheck passed 7/7. All covered browser checks now pass, and the test server is stopped.
- Design scan covered 47 changed UI files. Its single warning is the intentional selected-tab underline in finance navigation, not a card border.
- Release preflight found three historical migration filenames differed from production timestamps. Fetched migration statements match exactly apart from trailing empty statements. Local files and local test history now use production's versions; production history was not modified. Remote dry-run now includes only the two new migrations.
- The two new production migrations were applied successfully on 2026-11-03. Source and data checks are complete. Application release follows a commit and push to main, with production deployment status checked before handover.
