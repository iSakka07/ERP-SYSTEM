import assert from "node:assert/strict";
import { buildCostControlTotals } from "../src/lib/project-cost-control-math.ts";

// عقدان: يؤخذ آخر جاري تراكمي لكل عقد، لا مجموع الجواري القديمة.
const result = buildCostControlTotals({
  contractValueCents: 15_000_000,
  certifiedRevenueCents: 8_000_000,
  collectedCents: 6_000_000,
  subcontractorsCents: 3_100_000,
  subcontractorCashCents: 900_000,
  purchasesCents: 1_200_000,
  salariesCents: 700_000, // كشف معتمد، لذلك هو تكلفة حتى لو لم يصرف بالكامل بعد.
  paidSalariesCents: 500_000,
  pettyCashCents: 200_000, // مصروف فعلي فقط؛ التمويل وتسليم العهدة مستبعدان.
});

assert.equal(result.revenue.outstandingCents, 2_000_000);
assert.equal(result.cost.totalCostCents, 5_200_000);
assert.equal(result.performance.profitToDateCents, 2_800_000);
assert.equal(result.cash.cashOutCents, 1_600_000, "لا يدخل سوى المدفوع فعليًا في التدفق النقدي");
assert.equal(result.cash.netCashPositionCents, 4_400_000);
assert.equal(result.revenue.executionPercent, 8_000_000 / 15_000_000 * 100);
assert.equal(result.revenue.collectionPercent, 75);
assert.equal(buildCostControlTotals({ contractValueCents: 0, certifiedRevenueCents: 0, collectedCents: 0, subcontractorsCents: 0, subcontractorCashCents: 0, purchasesCents: 0, salariesCents: 0, paidSalariesCents: 0, pettyCashCents: 0 }).revenue.collectionPercent, null);
console.log("Project Cost Control business logic tests passed.");
console.log("Project Cost Control business logic tests passed.");
