---
version: 1
slug: "src-components-impersonation"
primary_target: "src/components/impersonation"
related_targets: ["src/app/[locale]/admin/brukere", "src/app/[locale]/admin/revisjon", "src/app/[locale]/min-side/layout.tsx"]
---

# Developer impersonation

Mode: Operate. Extend existing account management and authenticated shells.

THESIS: Let the verified developer reproduce a user's experience with their actual permissions, while the acting identity and return control stay visible.

OWN-WORLD: Inherit cream surfaces, Fredoka headings, Nunito controls, existing dropdowns and buttons. An amber account-state strip belongs inside the sticky header. Its label names the selected email; its single action restores the developer account.

STORY: Developer chooses an account from Brukere og tilganger, uses its portal or admin permissions, then returns to their original session. Ordinary administrators cannot start impersonation. Expiry denies access and retains the return control. Audit history names the developer and selected user together.

FIRST VIEWPORT: Existing user list, with Bruk som denne brukeren in each other user's action menu. During impersonation a persistent strip above the normal header shows the email and a 44px return control. Mobile wraps the label and control without hiding either.

FORM: Precisely scoped existing-surface extension. No new visual identity or concept selection. Existing feedback toasts report action failures; pending controls prevent duplicate starts and returns.

FINISH: independent finish review and documentation comparison against the incumbent system are required. Preserve DESIGN.md and existing tokens.
