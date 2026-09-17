import assert from "node:assert/strict";
import { financials } from "../src/lib/incoming.ts";
const c = {
  originalCents: 1_000_000_000,
  memos: [],
  statements: [
    {
      sequence: 1,
      stage: "PAID",
      grossCents: 100_000_000,
      materials: [{ totalCents: 10_000_000 }],
    },
    {
      sequence: 2,
      stage: "CENTRAL",
      grossCents: 160_000_000,
      materials: [{ totalCents: 5_000_000 }],
    },
  ],
};
let f = financials(c);
assert.equal(f.gross, 100_000_000);
assert.equal(f.net, 90_000_000);
assert.equal(f.materials, 15_000_000);
assert.equal(f.effectiveMaterials, 10_000_000);
assert.equal(f.entitlement, 155_000_000);
assert.equal(f.remaining, 840_000_000);
assert.equal(f.pending, 60_000_000);
assert.equal(f.pendingNet, 55_000_000);
assert.equal(f.pct, 10);
c.statements[1].stage = "PAID";
f = financials(c);
assert.equal(f.gross, 160_000_000);
assert.equal(f.net, 145_000_000);
assert.equal(f.entitlement, 0);
assert.equal(f.pendingNet, 0);
assert.equal(f.remaining, 840_000_000);
assert.equal(f.pct, 16);
assert.notEqual(f.gross, 260_000_000);
c.statements[1].stage = "CENTRAL";
assert.equal(financials(c).net, 90_000_000);
c.statements.push({
  sequence: 3,
  stage: "FINANCE",
  grossCents: 180_000_000,
  materials: [{ totalCents: 2_000_000 }],
});
assert.equal(financials(c).entitlement, 178_000_000);
assert.equal(financials(c).pendingNet, 73_000_000);
c.statements.pop();
c.memos.push({ kind: "INCREASE", amountCents: 100_000_000 });
assert.equal(financials(c).value, 1_100_000_000);
c.statements[0].stage = "CENTRAL";
assert.equal(financials(c).net, 0);
assert.equal(financials(c).gross, 0);
assert.equal(
  financials({ originalCents: 1e9, memos: [], statements: [] }).remaining,
  1e9,
);
console.log(
  "PASS: latest paid cumulative, pending excluded, materials not duplicated, rollback, memos and empty contract.",
);
