import assert from "node:assert/strict";
import { assertAffectedBalances, balanceForAccount, expenseTypes, pettyLabels } from "../src/lib/petty-cash.ts";

const mainId = "main";
const executiveId = "executive";
const posted = (type, amountCents, sourceAccountId, destinationAccountId) => ({ status: "POSTED", type, amountCents, sourceAccountId, destinationAccountId });

const opening = posted("OPENING_BALANCE", 100_000, null, mainId);
const transfer = posted("EXECUTIVE_ISSUE", 25_000, mainId, executiveId);
const expense = posted("EXECUTIVE_EXPENSE", 8_000, executiveId, null);
const returned = posted("EXECUTIVE_RETURN", 2_000, executiveId, mainId);
const movements = [opening, transfer, expense, returned];

assert.equal(balanceForAccount(movements, mainId), 77_000, "main cash reflects transfers only");
assert.equal(balanceForAccount(movements, executiveId), 15_000, "executive fund is a cash balance, not debt");
assert.equal(expenseTypes.has("EXECUTIVE_EXPENSE"), true, "executive expense is included in cost reporting");
assert.equal(pettyLabels.EXECUTIVE_ISSUE, "تحويل لصندوق المدير التنفيذي");
assert.doesNotThrow(() => assertAffectedBalances(movements, [transfer, expense, returned]));
assert.throws(() => assertAffectedBalances([opening, posted("EXECUTIVE_ISSUE", 110_000, mainId, executiveId)], transfer), /رصيد سالب/);
assert.throws(() => assertAffectedBalances([opening, transfer, posted("EXECUTIVE_EXPENSE", 30_000, executiveId, null)], expense), /رصيد سالب/);

console.log("Executive fund cash transfers, expenses, returns, labels and negative-balance guards passed.");
