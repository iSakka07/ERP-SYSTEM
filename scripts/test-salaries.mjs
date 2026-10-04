import assert from "node:assert/strict";
import { activeDaysInMonth, allocateMonthlySalary, assertAdvanceWithinSalary, assertDeductionWithinSalary, assertPayrollMonthAvailable, buildPayrollDistribution, followingMonth, intersectSalaryPeriods, monthDays, nextPayrollMonth } from "../src/lib/salary-payroll.ts";

const date = (value) => new Date(`${value}T00:00:00.000Z`);
assert.equal(monthDays("2026-02"), 28);
assert.equal(monthDays("2028-02"), 29);
assert.equal(monthDays("2026-04"), 30);
assert.equal(monthDays("2026-07"), 31);
const split = allocateMonthlySalary("2026-04", 3_000_000, [{ projectId: "a", startDate: date("2026-04-01"), endDate: date("2026-04-10") }, { projectId: "b", startDate: date("2026-04-11"), endDate: date("2026-04-30") }]);
assert.deepEqual(split.map((item) => [item.projectId, item.days, item.cents]), [["a", 10, 1_000_000], ["b", 20, 2_000_000]]);
const gap = allocateMonthlySalary("2026-04", 3_000_000, [{ projectId: "a", startDate: date("2026-04-01"), endDate: date("2026-04-15") }]);
assert.deepEqual(gap.map((item) => [item.projectId, item.days, item.cents]), [["a", 15, 1_500_000], [null, 15, 1_500_000]]);
assert.throws(() => allocateMonthlySalary("2026-04", 3_000_000, [{ projectId: "a", startDate: date("2026-04-01"), endDate: null }, { projectId: "b", startDate: date("2026-04-01"), endDate: null }]), /متداخل/);
const activePeriods = [{ startDate: date("2026-04-01"), endDate: date("2026-04-15") }, { startDate: date("2026-04-21"), endDate: null }];
assert.equal(activeDaysInMonth("2026-04", activePeriods), 25);
assert.deepEqual(
  intersectSalaryPeriods([{ projectId: "a", startDate: date("2026-04-01"), endDate: null }], activePeriods)
    .map((item) => [item.projectId, item.startDate.toISOString().slice(0, 10), item.endDate?.toISOString().slice(0, 10)]),
  [["a", "2026-04-01", "2026-04-15"], ["a", "2026-04-21", "9999-12-31"]],
);
assert.deepEqual(
  buildPayrollDistribution("2026-04", 3_000_000, [{ projectId: "a", startDate: date("2026-04-01"), endDate: date("2026-04-15") }, { projectId: "b", startDate: date("2026-04-16"), endDate: null }], [{ startDate: date("2026-04-01"), endDate: null }]),
  [{ projectId: "a", days: 15, cents: 1_500_000 }, { projectId: "b", days: 15, cents: 1_500_000 }],
);
assert.deepEqual(
  buildPayrollDistribution("2026-04", 3_000_000, [{ projectId: "a", startDate: date("2026-04-01"), endDate: null }], [{ startDate: date("2026-04-01"), endDate: null }], [{ startDate: date("2026-04-16"), monthlySalaryCents: 4_000_000 }]),
  [{ projectId: "a", days: 15, cents: 1_500_000 }, { projectId: "a", days: 15, cents: 2_000_000 }],
);
assert.equal(followingMonth("2026-12"), "2027-01");
assert.equal(nextPayrollMonth([], "2026-11"), "2026-11");
assert.equal(nextPayrollMonth(["2026-10", "2026-11"], "2026-11"), "2026-12");
assert.doesNotThrow(() => assertPayrollMonthAvailable("2026-11", ["2026-10"], "2026-10"));
assert.throws(() => assertPayrollMonthAvailable("2026-10", ["2026-10"], "2026-10"), /معتمد بالفعل/);
assert.throws(() => assertPayrollMonthAvailable("2026-12", ["2026-10"], "2026-10"), /2026-11/);
assert.doesNotThrow(() => assertAdvanceWithinSalary(500_000, 100_000, 400_000));
assert.throws(() => assertAdvanceWithinSalary(500_000, 100_000, 400_001), /إجمالي السلف/);
assert.doesNotThrow(() => assertDeductionWithinSalary("2026-11", 500_000, 100_000, 400_000));
assert.throws(() => assertDeductionWithinSalary("2026-11", 500_000, 100_000, 400_001), /إجمالي خصومات/);
console.log("Salary payroll business logic tests passed.");
