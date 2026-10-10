---
version: 1
slug: "src-app-locale-admin-familier-child-merge"
primary_target: "src/app/[locale]/admin/familier/child-merge-dialog.tsx"
related_targets:
  - "src/components/admin/family-workbench.tsx"
---

# Merge children

Operate. Extend the existing family workbench with a deliberate merge of two records of the same child.

THESIS: Keep one enrolled student, combine related history, review placement and money before confirmation.

OWN-WORLD: Inherit DESIGN.md, cream, white, accessible green, Fredoka/Nunito, existing dialog and selector primitives.

STORY: Choose the student to keep, choose a duplicate student or application, review the combined class and tuition balance, then confirm. Conflicts block confirmation with a precise next action.

FIRST VIEWPORT: Two labeled selectors show the selected records' placement and payment state. Preview presents class context and a compact claim, paid and remaining grid. The green confirmation is the sole primary action. Mobile preserves this order and scrolls longer previews.

FORM: A scoped extension within the established admin system. No replacement visual world or new raster assets.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Finish review: Ship. Desktop and mobile craft, accessibility and documentation passed independent review. A shared-payment finding was corrected with a recipient-completeness guard and regression tests proving that later synchronization preserves both children's shares.

Production preview follow-up: An unprocessed application may propose a different email; the enrolled student's login is retained and the proposed value remains visible in the preview and archive. Different logins on two actual students still block merging. This adjustment passed independent review and four additional database regressions.
