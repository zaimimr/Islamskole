---
version: 1
slug: "src-app-locale-admin"
primary_target: "src/app/[locale]/admin"
related_targets: ["src/app/[locale]/pamelding"]
---

# Student-first administration

## Scope and Mode

- Primary surface: principal and administrator operations under `src/app/[locale]/admin`.
- Related surface: public enrollment under `src/app/[locale]/pamelding`.
- Mode: operate. Related teacher-portal work covers attendance and planned absence.

## Audience and Job

Staff usually know a student's first name. Find the right student by age and class, reach parent contact, then inspect admin-only payment information. Dagplan supports Sunday attendance and teacher coverage on a phone. Preserve shared family relationships, billing and independently trustworthy historical records.

## Approved Direction

- Direction: student-first mobile administration within the existing school identity.
- Approved: 2026-11-02, with implementation directly and no mockup review.
- Design: `docs/superpowers/specs/2026-11-02-mobile-first-admin-design.md`.
- Main interaction: first-name lookup opens student identity, age, class and parent contact before payment controls.
- Sunday work: immediate class and lesson buttons, compact attendance and teacher coverage, preserving same-day inheritance and later overrides.
- Placement: offer an explicit inline capacity increase saved atomically with admission, placement or transfer.

## Composition Contract

The desktop admin shell has grouped navigation and a utility bar with active school year and student-first search. Mobile exposes Dagplan, Elever, Klasser and Mer in bottom navigation. Student detail follows identity, age/class, parent contact and payment. Family detail retains connected relationships, billing and history; lists lead with child names. Show actionable exceptions instead of redundant registration and placement badges.

The dashboard uses the same grammar but leads with unresolved work. The public enrollment flow creates or matches the durable family, flexible guardian roles, and children before immediate Vipps payment.

## Comp Translation

The following are conceptual and must not be literalized: sample names, sample addresses, sample amounts, avatar drawings, exact comp text, and the static number of children. Core text and controls remain semantic HTML. Relationship lines and status marks use the existing icon library or authored CSS, not raster crops from the comp.

## Visual Record

Sampled from interior pixels of the approved comp:

| Role | Value |
| --- | --- |
| Page ground | `#FCFAF5` |
| Working surface | `#FEFEFE` |
| Primary ink | `#090D13` |
| Strong action green | `#3C8F44` |
| Active navigation field | `#DCEDDD` |
| Warm folder layer | `#FEEDCA` |
| Attention field | `#FFF8E9` |

Component grammar uses medium rounded working surfaces, fine warm-gray borders, near-flat elevation, Fredoka headings, Nunito interface text, compact semantic status labels, and full-width task actions. The type ramp is a compact 30 to 36 pixel page title, 20 to 24 pixel section headings, 14 to 16 pixel interface text, and 12 to 13 pixel metadata.

## Ingredient Inventory

| Ingredient | Commitment | Medium |
| --- | --- | --- |
| Grouped admin navigation | Dagplan, Elever, Klasser and Mer; grouped secondary tools and account | Semantic HTML, CSS, Lucide icons |
| Active school year | Persistent selector in the utility bar | Semantic HTML and existing select primitives |
| Student-first search | Student results with age/class first; retain guardian, family, class, email, phone and payment reference lookup | Semantic combobox and server query |
| Relationship context | Flexible guardians and every sibling connected to the family | Semantic HTML, CSS relationship rule, Lucide icons |
| Family record | Dominant surface with overview, children, admission, payments, and history | Semantic HTML, route tabs, server-rendered data |
| Child summaries | Identity, age/class and payment; admission/enrollment exceptions only when actionable | Semantic HTML and reusable status components |
| Primary next action | The most important unresolved family task | Button or link with explicit consequence copy |
| Recent history | Append-only operational and financial events | Semantic ordered list with pagination |
| Cross-school attention | Compact access to unresolved work outside the selected family | Semantic links and live counts |
| Public enrollment | Three-step child, guardian, review-and-pay flow | Accessible forms and server actions |
| Brand reference | Existing public identity source, not a shipping admin asset | Existing repository assets |

## Constraints

- Preserve immediate intentional Vipps capture.
- Preserve all current administrative and public enrollment capabilities.
- Preserve first-class family, guardian, sibling, and child relationships and existing portal permissions.
- Do not hard-code mother and father roles.
- Do not delete captured financial history.
- Keep admission, placement, enrollment, fee, payment, refund, and settlement as distinct facts.
- Use Norwegian bokmål in the admin system and maintain Norwegian and English public localization.
- No unresolved product decisions remain for implementation.
