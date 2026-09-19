import assert from "node:assert/strict";
import {
  calculateExpense,
  expenseSummary,
  newExpenseStatementBlockReason,
  expenseCumulativeQuantity,
  correctionDebtAfterApproval,
  expensePayableCents,
} from "../src/lib/expenses.ts";
assert.equal(newExpenseStatementBlockReason(), "");
for (const stage of ["DRAFT", "TECHNICAL", "SITE"])
  assert.ok(newExpenseStatementBlockReason({ stage, kind: "CURRENT" }));
for (const stage of ["EXECUTIVE", "ACCOUNTING"])
  assert.equal(newExpenseStatementBlockReason({ stage, kind: "CURRENT" }), "");
assert.ok(
  newExpenseStatementBlockReason({ stage: "ACCOUNTING", kind: "FINAL" }),
);
assert.equal(expensePayableCents([
  { id: "j1", sequence: 1, stage: "ACCOUNTING", grossCents: 10000000, netCents: 10000000, payments: [{ amountCents: 2000000 }] },
  { id: "j2", sequence: 2, stage: "EXECUTIVE", grossCents: 5000000, netCents: 5000000, payments: [] },
], "j1"), 3000000, "an old statement payment is capped by the latest reduced entitlement");
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
const newOnly = calculateExpense(
  [{
    ...item,
    itemKey: "different",
    name: "بند مستقل في جاري لاحق",
    currentQuantity: 10,
    price: 100,
    entitlementPercent: 100,
  }],
  retention,
  first.items,
);
assert.equal(newOnly.items.length, 2);
assert.equal(newOnly.previousGrossCents, first.grossCents);
assert.equal(newOnly.grossCents, 5300000);
assert.equal(newOnly.items.find((i) => i.itemKey === item.itemKey).currentQuantity, 0);
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

const correctionRows = [
  {
    ...item,
    currentQuantity: 0,
    entitlementPercent: 100,
    correctionQuantity: 50,
    correctionReason: "حصر زائد بالسعر الأصلي",
  },
  {
    ...version,
    currentQuantity: 0,
    correctionQuantity: 20,
    correctionReason: "تصحيح الكمية بإصدار سعر450",
  },
];
const corrected = calculateExpense(correctionRows, retention, atNewPrice.items);
assert.equal(corrected.grossCents, 9600000); //150*400 +80*450
assert.equal(corrected.netCents, 9120000);
assert.equal(corrected.items[0].previousQuantity, 200);
assert.equal(expenseCumulativeQuantity(corrected.items[0]), 150);
assert.equal(
  atNewPrice.grossCents,
  12500000,
  "historical snapshot never altered",
);
const afterCorrection = calculateExpense(
  [
    { ...item, currentQuantity: 0, entitlementPercent: 100 },
    { ...version, currentQuantity: 10 },
  ],
  [],
  corrected.items,
);
assert.equal(afterCorrection.items[0].previousQuantity, 150);
assert.equal(afterCorrection.items[1].previousQuantity, 80);
assert.equal(
  afterCorrection.grossCents,
  10050000,
  "correction is not subtracted twice",
);
for (const patch of [
  { correctionQuantity: -1 },
  { correctionQuantity: 201 },
  { correctionReason: " " },
  { correctionQuantity: 0.0000001 },
])
  assert.throws(() =>
    calculateExpense(
      [{ ...correctionRows[0], ...patch }, correctionRows[1]],
      [],
      atNewPrice.items,
    ),
  );
assert.throws(() =>
  calculateExpense(
    [{ ...item, correctionQuantity: 1, correctionReason: "لا يوجد سابق" }],
    [],
  ),
);
assert.throws(() =>
  calculateExpense(
    [{ ...correctionRows[0], entitlementPercent: 99 }, correctionRows[1]],
    [],
    atNewPrice.items,
  ),
);
const cancelledMeasurement = calculateExpense(
  [
    { ...correctionRows[0], correctionQuantity: 200 },
    { ...correctionRows[1], correctionQuantity: 100 },
  ],
  retention,
  atNewPrice.items,
);
assert.equal(cancelledMeasurement.grossCents, 0);
assert.equal(cancelledMeasurement.netCents, 0);
const previousBalance = {
  netCents: 11400000,
  paidCents: 9000000,
  debtCents: 0,
};
const debt = correctionDebtAfterApproval(previousBalance, 7600000, true);
assert.equal(debt, 1400000);
const debtStatement = {
  sequence: 2,
  stage: "DRAFT",
  grossCents: 8000000,
  netCents: 7600000,
  correctionDebtCents: debt,
  payments: [],
};
const debtStatements = [
  {
    sequence: 1,
    stage: "ACCOUNTING",
    grossCents: 12000000,
    netCents: 11400000,
    payments: [{ amountCents: 9000000 }],
  },
  debtStatement,
];
assert.equal(expenseSummary(debtStatements).debtCents, 0);
debtStatement.stage = "SITE";
assert.equal(expenseSummary(debtStatements).debtCents, 0);
debtStatement.stage = "EXECUTIVE";
assert.equal(expenseSummary(debtStatements).debtCents, debt);
assert.equal(expenseSummary(debtStatements).advanceCents, 0);
assert.equal(
  correctionDebtAfterApproval(expenseSummary(debtStatements), 8000000, false),
  1000000,
);
assert.equal(
  correctionDebtAfterApproval(expenseSummary(debtStatements), 9500000, false),
  0,
);
const withAdvance = { netCents: 11400000, paidCents: 12000000, debtCents: 0 };
assert.equal(
  correctionDebtAfterApproval(withAdvance, 7600000, true),
  3800000,
  "original6000 advance remains separately classified",
);
assert.equal(correctionDebtAfterApproval(previousBalance, 0, true), 9000000);
console.log(
  "Documented corrections, original price versions, zero measurement, forward carry, executive-only debt and settlement passed.",
);
