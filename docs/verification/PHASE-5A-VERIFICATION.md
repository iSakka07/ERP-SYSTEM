# Phase 5A verification — 15 September 2026

Access simplification verified: renamed creation action and form, direct enabled «إضافة مستخلص» in collapsed empty account row opens Jari1 sheet without expanding; pending demo row shows disabled create with visible reason and direct «فتح شيت جاري2». Existing user account inspected only, cancelled without saving. New account save wired to open first sheet after refresh. Helper tests cover empty, pending, executive/accounting and final states; lint, typecheck and production build passed. No permission or financial rule changed.

Passed:

- Calculation tests: Jari1 52,000 gross /49,400 net; Jari2 120,000 gross /114,000 net; actual30,000 leaves84,000. Percentage and fixed deductions, no deductions, advances, invalid quantities/percentages, missing/duplicate prior items, price-change rejection and large monetary values.
- API tests against local production and the approved public HTTPS preview: isolated technical/site/executive/accounting permissions, ordered approvals, financial effect only at executive stage, mandatory proof, immutable reviewed sheet, blocked rollback with payment/later Jari, revision protection, separate actual payments, explicit advance reason, private attachments and restricted UI.
- Browser: approved52,000 remains while Jari2draft120,000; previousquantity200/current100/cumulative300; price400/entitlement100%; net114,000/previousactual30,000/remaining84,000 in editor. Changing current to150 recalculated gross140,000 and retention7,000. Removing retention recalculated net140,000. Cancelled without saving.
- Responsive check:390×844 viewport; table scrolls internally, surrounding form contained, mobile menu hidden after transition. Temporary viewport reset.
- Incoming calculation regression test passed. Type check, production build and lint passed.

Only exact temporary test accounts, roles and financial fixtures are deleted after tests. Audit retained; demo records clearly labelled. Existing administrator password and disabled default demo accounts unchanged.

Try: /expenses → expand the labelled شركة التمساح demo → جاري2 → تعديل الشيت. Save a draft, then approve technical → site → executive → accounting, then record evidenced payments. Configure separate approval grants from administrator accounts screen. Stop here for review; Phase5B reassignment/corrections deferred.
