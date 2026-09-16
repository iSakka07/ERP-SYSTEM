import assert from "node:assert/strict";
import { allocateMonthlySalary, monthDays } from "../src/lib/salary-payroll.ts";

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
console.log("Salary payroll business logic tests passed.");
