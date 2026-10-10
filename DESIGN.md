# Design System

## Design Intent

Islamskole Bærum feels welcoming, trustworthy, and rooted in its local school community. Public pages should remain warm and inviting. Administrative surfaces are the quieter operational expression of the same identity, optimized for repeated daily use, accurate decisions, and confidence around children and payments.

## Visual World

- Use warm cream as the page ground, white for working surfaces, deep green-gray for text, and school green as the primary action and active-state color.
- Keep sunshine yellow, sky blue, and berry as limited supporting accents. They clarify categories and states, not decorate every panel.
- Preserve the existing logo, friendly brand illustrations, rounded silhouettes, and light organic details on public pages.
- Use restrained rules, soft tonal fields, and minimal elevation in the admin system. Dense work areas should feel calm, not playful.
- Avoid cold enterprise gray, saturated gradients, glass effects, dark mode, hard shadows, and dashboard grids made only from interchangeable cards.

## Typography

- Fredoka is the heading and identity face. Use it for page titles, key totals, and short section labels.
- Nunito is the reading and interface face. Use it for body copy, controls, tables, forms, and operational details.
- Headings should be compact and purposeful. Body text should be plain, direct, and easy to scan in Norwegian bokmål.
- Financial figures and aligned counts may use tabular numerals in Nunito.

## Shape, Line, and Elevation

- Public surfaces may use large rounded cards and pill actions from the current system.
- Admin surfaces use medium rounded corners, fine low-contrast borders, and flatter sections. Reserve large soft cards for a dominant work area or completion moment.
- Primary actions remain rounded but should not compete with status indicators or table controls.
- Destructive and financial reversals require explicit language, consequences, and a clear confirmation step.

## Layout and Density

- Admin navigation is grouped and stable, with the active school year and global family search available from the shell.
- Lead with unresolved work and decisions. Totals support the workbench instead of replacing it.
- Family context should persist when moving between a guardian, child, enrollment, placement, and payment.
- Desktop surfaces can be information-dense when hierarchy is strong. Mobile surfaces become task cards and drawers, never compressed desktop tables.
- Touch targets are at least 44 pixels on mobile. Keyboard focus is always visible.

## State and Motion

- Healthy, informational, pending, warning, and blocked states use consistent semantic color, icon, label, and plain-language next steps.
- Status must never rely on color alone.
- Motion is brief and functional: opening a drawer, confirming a saved change, moving focus, or revealing dependent fields.
- Respect reduced-motion preferences. Avoid decorative motion in the admin system.

## Content and Evidence

- Use real school terminology, dates, class names, family names, amounts, and school-year context in product examples.
- Never invent performance claims, testimonials, or payment outcomes.
- Public enrollment copy explains what will happen, what is charged immediately, and what the family should expect next.
- Admin copy distinguishes application, admission, placement, enrollment, invoice amount, payment capture, refund, and settlement.

## Implemented Admin Primitives

- `FamilyWorkbench` is the canonical family detail composition. It keeps relationship context, child-level operational facts, the next action, and recent activity in one responsive view model.
- `/admin/familier` is the canonical global family search and list. Student maintenance remains available through `/admin/elever` and is linked from each family record.
- The shell exposes six primary destinations, grouped secondary tools, the active school year, family search, account access, and a scrollable mobile drawer.
- `--admin-muted` is the minimum muted text tone on light admin surfaces. `--admin-action` is the accessible green used for primary admin actions.
- Child summaries use an auto-fitting fact grid with a minimum readable column width. Mobile keeps the next action before detailed records and relationship history.
- Family editing keeps the primary contact, relationship labels, address, new guardians, and data-review resolution in one task-focused surface.
- Public enrollment fails closed when no active fee exists and restores an unfinished family draft after refresh or accidental navigation.
- Healthy, pending, informational, blocked, and neutral states pair color with labels and status marks. Captured payments, refunds, admission decisions, and placement are never collapsed into one status.
- Statement imports start with file selection, detect the source and accounts, and show a read-only preview before confirmation. Missing details appear only when needed, and completion keeps the import counts visible.
