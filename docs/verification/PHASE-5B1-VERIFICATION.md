# Phase5B.1 — prospective prices

- Each price version has a linked source item and reason. Previous rows retain fixed prices and cumulative quantities.
- New quantities only on latest price version; old entitlement may progress at old price.
- New versions require a different price, positive new quantity, documented reason and fresh proof. Price changes reviewed through existing statement cycle; no direct financial effect on draft.
- Calculation tests:200×400 +100×450 =125,000; later+50 at450 =147,500. Old65% entitlement can progress to100% at400. Missing reason, identical price and quantity on retired version rejected.
- API tests: draft with existing proof still needs fresh price-change proof; prior approved120,000 remains unchanged when new50×450 produces142,500; approval permissions/cycle unchanged; retired-price API quantity rejected. Exact temporary data removed, audit and actual user data retained.
- Lint/build and incoming regression tests pass. Remaining5B withdrawal/reassignment and corrections deferred until this slice is reviewed.
- Browser verified on independent QA session: Jari3 previous300×400 remains120,000; linked new100×450 adds45,000; cumulative165,000, retention8,250, net156,750. Cancelled without saving; actual demo approval/payment history untouched. New version button and required reason visible. Public HTTPS API tests also passed.
