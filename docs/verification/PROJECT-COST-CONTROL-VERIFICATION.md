# Project Cost Control — Verification

## KPI sources

- Contract Value: the sum of `originalCents` for active Incoming Contracts. Contract variations remain visible in the Incoming module and are not silently introduced into this V1 KPI.
- Certified Revenue: latest cumulative incoming statement for each active contract at any stage.
- Collected Amount: the existing Incoming `PAID` cumulative logic only.
- Subcontract Cost: `expenseSummary(...).netCents`; payments are excluded from cost.
- Purchases Cost: Purchase Invoice totals; supplier payments are not implemented and therefore excluded from Cash Out.
- Salaries Cost: project shares from `allocationJson` on approved and paid Payroll Runs. Cash Out contains paid payroll shares only.
- Petty Cash: posted `DIRECT_EXPENSE` and `CUSTODY_EXPENSE` movements linked to the project only.

## Formulas

- Outstanding = Certified Revenue − Collected Amount.
- Total Cost = subcontractors + purchases + approved payroll shares + Petty Cash actual expenses.
- Profit to Date = Certified Revenue − Total Cost.
- Cash Out = subcontractor payments + paid payroll shares + Petty Cash actual expenses.
- Net Cash Position = Cash In − Cash Out.

## Exclusions and limitations

- No subcontractor ceiling is used.
- Funding, Petty Cash transfers, reversed movements, and supplier invoices without payments are not Cash Out.
- Other Expenses are intentionally hidden until a distinct source of truth exists, preventing double counting.
- Project-level access scope is not implemented; global RBAC applies.
