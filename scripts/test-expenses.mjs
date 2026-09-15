import assert from "node:assert/strict";
import { calculateExpense, expenseSummary } from "../src/lib/expenses.ts";
const item = {
  itemKey: "paint",
  name: "نقاشة",
  unit: "م2",
  currentQuantity: 200,
  price: 400,
  entitlementPercent: 65,
};
const retention = [{ name: "تأمين أعمال", kind: "PERCENT", value: 5 }];
const first = calculateExpense([item], retention);
assert.equal(first.grossCents, 5200000);
assert.equal(first.netCents, 4940000);
const second = calculateExpense(
  [{ ...item, currentQuantity: 100, entitlementPercent: 100 }],
  retention,
  first.items,
);
assert.equal(second.items[0].previousQuantity, 200);
assert.equal(second.grossCents, 12000000);
assert.equal(second.netCents, 11400000);
assert.equal(second.previousGrossCents, 5200000);
const withNewItem = calculateExpense(
  [
    { ...item, currentQuantity: 100, entitlementPercent: 100 },
    {
      ...item,
      itemKey: "new",
      name: "بند إضافي",
      currentQuantity: 10,
      price: 100,
      entitlementPercent: 100,
    },
  ],
  retention,
  first.items,
);
assert.equal(withNewItem.items[1].previousQuantity, 0);
assert.equal(withNewItem.grossCents, 12100000);
const summaries = [
  {
    sequence: 1,
    stage: "ACCOUNTING",
    ...first,
    payments: [{ amountCents: 3000000 }],
  },
  { sequence: 2, stage: "DRAFT", ...second, payments: [] },
];
assert.equal(expenseSummary(summaries).grossCents, 5200000);
summaries[1].stage = "EXECUTIVE";
assert.equal(expenseSummary(summaries).grossCents, 12000000);
assert.equal(expenseSummary(summaries).remainingCents, 8400000);
assert.equal(
  calculateExpense(
    [item],
    [{ name: "ضريبة اختيارية", kind: "FIXED", value: 1000 }],
  ).netCents,
  5100000,
);
assert.equal(calculateExpense([item], []).netCents, 5200000);
assert.throws(() =>
  calculateExpense([{ ...item, itemKey: "different" }], retention, first.items),
);
assert.throws(() =>
  calculateExpense([{ ...item, price: 401 }], retention, first.items),
);
assert.throws(() =>
  calculateExpense([{ ...item, currentQuantity: -1 }], retention),
);
assert.throws(() =>
  calculateExpense([{ ...item, entitlementPercent: 101 }], retention),
);
assert.throws(() =>
  calculateExpense([item], [{ name: "خطأ", kind: "FIXED", value: 53000 }]),
);
assert.throws(() => calculateExpense([item, item], []));
const large = calculateExpense(
  [{ ...item, currentQuantity: 200000, entitlementPercent: 100 }],
  [],
);
assert.equal(large.grossCents, 8000000000);
summaries[1].payments = [{ amountCents: 9000000 }];
assert.equal(expenseSummary(summaries).advanceCents, 600000);
assert.equal(expenseSummary(summaries).remainingCents, 0);
console.log(
  "Expenses calculations, cumulative snapshots, deductions, advances and invalid inputs passed.",
);
