---
version: 1
slug: "src-components-learning-progress"
primary_target: "src/components/learning-progress"
related_targets: ["src/app/[locale]/min-side/barn","src/app/[locale]/min-side/klasse","src/app/[locale]/admin/elever"]
---

# Learning progress

Mode: Operate. Extend the existing class and child surfaces in the school portal.

Teachers record a child's Quran, Arabic and Islamic knowledge goals and dated progress. Families read the latest feedback and next practice target, with earlier updates available on demand. School administrators use the same editor from the student record.

## Direction contract

THESIS: A child's current practice and teacher feedback lead. Dated updates make learning visible without grades, scores or decorative charts.

OWN-WORLD: Inherit the portal's cream ground, green action color, Fredoka headings, Nunito controls, rounded inputs and flat divided lists. Use existing primitives and explicit labelled statuses.

STORY: A teacher chooses a child from the class, adds a written goal, and records later progress. The family sees what to practise next and can open the dated history. Saving shares immediately with the family.

FIRST VIEWPORT: Child name and class above a learning heading and one primary add-goal action. Goals show the subject, title, status, optional Quran reference, feedback and next target. Mobile stacks these in reading order. The inline form replaces its opener and keeps errors next to saving.

FORM: Existing-surface extension. Inherit the incumbent world and use inline goal and update forms, with lazy paginated history. No concept seed applies.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
