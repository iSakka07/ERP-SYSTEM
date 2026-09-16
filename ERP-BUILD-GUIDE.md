# ERP Build Guide

## Latest V1 sequencing decision

The user approved continuing missing V1 modules, followed by a dedicated V1 remediation campaign before V2. Read `V1_REMEDIATION_PLAN.md` and `docs/audit-v1/AUDIT_V1.md`. Findings remain OPEN/deferred, not fixed. Keep development local-only; no public deployment or operational financial reliance until release blockers pass verification. Next is Phase 8 Salaries requirements clarification, not automatic implementation. Do not duplicate Petty Cash custody/cash functionality in Phase 9. The following older progress notes are historical where they conflict with this decision.

Current approved refinement: shared document creation layout, Technical Hub-style controls, currency inputs, and optional incoming estimate value with a separate archive. See Product Bible 26.9.1 and design-qa.md. Phase 5B price versions, withdrawal/reassignment and documented quantity corrections/debt are implemented; do not start another module before review.

Reuse DocumentLayout, CurrencyInput and ERPSelect in all additions. Data is right, history is left on desktop and below on mobile. Submit raw money without commas, keep cents calculations and approval/payment rules unchanged. Use currency for prices and fixed deductions, not quantities or percentages. Preserve existing credentials and disabled demo accounts; never rerun the global seed on this database. Runtime remains local-only; public tunnel is cancelled.

The product requirements, financial rules, UX system, phase prompts, and
Definitions of Done are maintained in `../PRODUCT_BIBLE_V1.md`.

Completed: **Phase 4 — Incoming Module**.

Follow Product Bible sections 8.3–8.3.2: gross cumulative certificates, nine-stage
workflow, financial effect only when disbursed, material certificates without a
separate payment cycle. General ledger, partial collections and estimate workflow
remain deferred.
