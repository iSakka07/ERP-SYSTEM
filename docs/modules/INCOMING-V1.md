# Phase 4 — Incoming V1

Approved 15 September 2026. The authoritative Product Bible remains
`../PRODUCT_BIBLE_V1.md`, sections 8.3–8.3.2.

## Scope

- `/incoming`: compact nine-column contract table, filters, expandable statements,
  export of the filtered rows, contract creation/editing and increase/decrease memos.
- Optional estimate reference, no mandatory estimate or supervising engineer.
- Unlimited sequential current certificates and a final certificate.
- Stages: شركة → كتيبة → لواء → إدارة → استشاري → تموين → فرع مالي → مركزية → تم الصرف.
- Amount always entered as cumulative **before materials**. The notice appears in
  both statement and material certificate forms.
- Materials: statement selector, linked summary, item/unit/quantity/price/total
  sheet, add/remove item, notes and required attachments. No independent payment status.
- Each material certificate contains incremental, non-duplicated materials;
  cumulative materials at sequence N sum certificates through N.
- Gross incoming uses the latest PAID cumulative statement only.
- Net incoming = gross incoming minus cumulative materials through the latest PAID
  statement. Materials on subsequent pending statements are visible, not posted.
- Remaining = adjusted contract value minus PAID gross, not minus net again.
- Gross, cash and material percentages appear in expanded details.
- Paid statements and their historical materials are locked. Paid rollback needs
  admin and a reason; later paid statements must be rolled back first. The rollback
  creates a reversing journal entry and a linked outgoing bank movement. A later
  re-payment creates a new collection event without deleting the old history.
- Payment date, cheque/transfer reference and proof required for PAID.
- Required attachments for new contracts, statements, materials and memos. Private
  authenticated downloads. Up to five files and 10 MB total per request.
- All mutations and rollbacks write audit records transactionally. No operational
  hard-delete API.

## Accounting integration

Creating a statement records its incremental accrued revenue. Material certificates
record the received material and project material cost. Reaching PAID records only
the incremental cash received since the previous paid statement and adds it to the
main bank account. Posted statements and material certificates are not edited in
place; correction uses documented reversal and replacement history.

Partial owner receipts, owner deductions other than materials, and the full estimate
approval/conversion workflow remain deferred.

## Run and verify

`pnpm db:generate`, `pnpm db:migrate`, `pnpm db:demo-incoming`.

`pnpm dev --port 3090 --hostname 0.0.0.0`.

`pnpm test:incoming` tests the financial calculations.
`pnpm test:incoming-api` tests real APIs against the running local demo instance,
using existing seeded admin/accountant/sales accounts. It creates only clearly
labelled synthetic fixtures and removes those exact fixtures afterwards; audit
records remain. Do not run the API test against production.

Reference demo: contract 10m, Jari 1 paid gross 1m, materials 100k, cash 900k;
Jari 2 at Central gross 1.6m, additional materials 50k. When Jari 2 is paid,
gross becomes 1.6m, cash 1.45m, remaining 8.4m, not a sum of both statements.
