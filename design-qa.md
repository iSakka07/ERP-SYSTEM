# Design QA — shared ERP document creation

final result: passed

## Scope and source

Approved reference pattern, not a clone of military content/navigation:

- `C:/Users/Administrator/Desktop/123456.png` — 1903×905 px, new-document form, white two-column cards, data right and history left, approximately 2:1, 24px gap.
- `C:/Users/Administrator/Desktop/لقطة شاشة 2026-09-15 171928.png` — 435×80 px, estimate currency field. User explicitly overrides the screenshot's omitted decimals with two decimal places.
- Existing Cairo font, navy ERP navigation and product identity are retained. No officers, military checklist, new logo, or unrelated workflow was introduced.

## Implementation and capture evidence

In-app browser, local-only `http://localhost:3090`, new-document mode. No public tunnel.

- Desktop CSS viewport: 1903×905, reported DPR 1. Initial screenshot `qa-artifacts/incoming-desktop.png`: 1903×905 px, project selector expanded.
- Final desktop `qa-artifacts/incoming-desktop-final.png`: 1888×898 px returned by the browser capture surface at the same CSS viewport; comparisons are normalized for that capture-size difference, not claimed pixel-exact. Contract and estimate filled with synthetic amounts, blurred currency fields, no saved client edit.
- Focused currency evidence: `qa-artifacts/currency-control-crop.png`, 495×100 px diagnostic crop of the final desktop capture. Source field and this crop were returned together in a single comparison input. The discarded `currency-field.png` is not evidence: the browser clip operation captured the wrong origin.
- Subcontractor creation sheet: `qa-artifacts/expense-sheet-desktop.png`, 1888×898 px; same CSS viewport, new current statement, no overview metrics/list inside the editor.
- Mobile: CSS viewport 390×844, DPR 1, `qa-artifacts/incoming-mobile.png` returned 375×812 px. Body/scroll width 375 px; data card 343 px at x=16, history card 343 px at x=16 beneath the data. No horizontal page overflow; Excel tables retain their own horizontal scrolling.
- Source full-screen reference and prototype desktop were emitted together; source currency field and prototype control crop were emitted together. ERP form labels and fields differ intentionally from the military document reference.
- Open select state compared against `C:/Users/Administrator/Desktop/xsxsx.png` in the in-app browser at 1280×720, DPR 1. The implementation uses the shared ERPSelect popup: white panel, 8px radius, light blue selected/highlight state, subtle elevation, circular selected indicator, and a short slide/fade animation. The browser QA environment reports `prefers-reduced-motion: reduce`, so computed animation is correctly disabled there while the normal-motion CSS remains present.
- Captures are local ignored artifacts, not public assets. Temporary viewport overrides are reset after testing.

## Findings and iterations

1. Existing white inputs, native OS select popups, inline estimate reference and one-column document forms did not follow the approved pattern. Fixed with shared CurrencyInput, ERPSelect and DocumentLayout plus global control tokens.
2. Controlled numeric price fields could lose a partially typed decimal if display relied directly on numeric parent state. Fixed by retaining a focused editing string and canonicalizing display on blur. UI entry `0.50` remains `0.50` after blur.
3. Preserved legacy textual estimate references rather than treating them as monetary values. Added nullable estimateCents and separate `estimate` attachment classification. Updating the value requires fresh proof; previous archives remain intact.
4. Combined attachment count/size limits apply across contract and estimate files. Financial effects, approval order and RBAC stay unchanged.
5. Standardized document additions, master-data creation and account creation; actual payment creation is focused rather than embedded amongst the statement's summary cards. New-document tracker is genuinely empty. Existing incoming audit and statement approvals populate history without invented events.
6. The shared select popup originally matched the control color but still used a plain checked indicator and had limited motion polish. Fixed ERPSelect and global styles so all dropdowns share the Technical Hub-like open state, circular indicator, hover/selected transitions, scrollbar styling and reduced-motion fallback.

No unresolved P0/P1/P2 in the requested pattern. Intentional adaptations: retained ERP sidebar/branding, different business fields, responsive stacking below 800px, and grouped editing values only finalize two decimals on blur. Native file chooser text follows browser locale (P3 cosmetic); labels and instructions remain Arabic.

## Verification

- `pnpm lint` — passed without warnings.
- `pnpm build` — passed, including TypeScript.
- Browser QA of the open select state — passed; dropdown opens from the shared control, selected option is visibly highlighted, and reduced-motion settings are respected.
- `pnpm test:incoming` and `pnpm test:expenses` — passed calculations and historical/cumulative rules.
- `pnpm test:design-inputs` — passed formatting, exact stored cents, estimate proof requirements, archive retention, legacy preservation, combined limits and forbidden-role access.
- `pnpm test:expenses-api` and `pnpm test:expense-corrections-api` — passed unchanged approval/payment, withdrawal/reassignment, price version and correction/debt rules.
- Real browser submit of an exact synthetic contract: displayed `123,345,678.25` saved as `12334567825` cents; estimate `120,000,000.50` saved as `12000000050` cents with its own proof. This verifies actual FormData submission, not only formatter output.
- Only exact synthetic test users/contracts/project/company/attachments and their test audit were cleaned up. Client users, credentials, documents, payments and existing audit were not changed; no global seed/reset.

## Durable implementation rule

Read Product Bible 26.9.1. All future additions reuse DocumentLayout, CurrencyInput and ERPSelect. Currency formatting is presentation only; quantities/percentages are never monetary inputs. Estimate comparison is informational and cannot create revenue/cost/treasury/journal entries.
