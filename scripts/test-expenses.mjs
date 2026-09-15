import assert from "node:assert/strict";
import {
  calculateExpense,
  expenseSummary,
  newExpenseStatementBlockReason,
} from "../src/lib/expenses.ts";
assert.equal(newExpenseStatementBlockReason(), "");
for (const stage of ["DRAFT", "TECHNICAL", "SITE"])
  assert.ok(newExpenseStatementBlockReason({ stage, kind: "CURRENT" }));
for (const stage of ["EXECUTIVE", "ACCOUNTING"])
  assert.equal(newExpenseStatementBlockReason({ stage, kind: "CURRENT" }), "");
assert.ok(
  newExpenseStatementBlockReason({ stage: "ACCOUNTING", kind: "FINAL" }),
);
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

const oldPrice = calculateExpense([{ ...item, entitlementPercent: 100 }], []);
const version = {
  ...item,
  itemKey: "paint-450",
  currentQuantity: 100,
  price: 450,
  entitlementPercent: 100,
  sourceItemKey: item.itemKey,
  priceChangeReason: "زيادة سعر الكميات الجديدة",
};
const atNewPrice = calculateExpense(
  [{ ...item, currentQuantity: 0, entitlementPercent: 100 }, version],
  [],
  oldPrice.items,
);
assert.equal(atNewPrice.grossCents, 12500000); // 200*400 + 100*450, never300*450
assert.equal(oldPrice.items[0].totalCents, 8000000);
assert.throws(() =>
  calculateExpense(
    [
      { ...item, currentQuantity: 0, entitlementPercent: 100 },
      { ...version, priceChangeReason: "" },
    ],
    [],
    oldPrice.items,
  ),
);
assert.throws(() =>
  calculateExpense(
    [{ ...item, currentQuantity: 1, entitlementPercent: 100 }, version],
    [],
    oldPrice.items,
  ),
);
assert.throws(() =>
  calculateExpense(
    [
      { ...item, currentQuantity: 0, entitlementPercent: 100 },
      { ...version, price: 400 },
    ],
    [],
    oldPrice.items,
  ),
);
const later = calculateExpense(
  [
    { ...item, currentQuantity: 0, entitlementPercent: 100 },
    { ...version, currentQuantity: 50 },
  ],
  [],
  atNewPrice.items,
);
assert.equal(later.grossCents, 14750000);
assert.throws(() =>
  calculateExpense(
    [
      { ...item, currentQuantity: 1, entitlementPercent: 100 },
      { ...version, currentQuantity: 50 },
    ],
    [],
    atNewPrice.items,
  ),
);
const progress = calculateExpense(
  [{ ...item, currentQuantity: 0, entitlementPercent: 100 }, version],
  [],
  first.items,
);
assert.equal(progress.grossCents, 12500000); // entitlement advances on old quantities at400
console.log(
  "Prospective prices, historic values, later quantities and entitlement progression passed.",
);
