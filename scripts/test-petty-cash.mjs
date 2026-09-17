import assert from "node:assert/strict";
import { assertBalances, cents, balanceForAccount, isProjectCost, validatePettyInput } from "../src/lib/petty-cash.ts";
assert.equal(cents('1,234.56'),123456);
assert.equal(cents('0',true),0);
assert.throws(()=>cents('0.001'));
assert.throws(()=>cents('-1'));
assert.throws(()=>assertBalances([{status:'POSTED',amountCents:1,sourceAccountId:'cash',destinationAccountId:null}]));
assert.equal(balanceForAccount([{status:"POSTED",amountCents:1000,sourceAccountId:null,destinationAccountId:"cash"},{status:"POSTED",amountCents:250,sourceAccountId:"cash",destinationAccountId:null}],"cash"),750);
assert.equal(isProjectCost("CUSTODY_ISSUE"),false); assert.equal(isProjectCost("CUSTODY_EXPENSE"),true);
assert.throws(()=>validatePettyInput({type:"DIRECT_EXPENSE",amount:10,description:"x",allocation:"PROJECT",hasAttachment:true}),/مشروع/);
assert.throws(()=>validatePettyInput({type:"FUNDING",amount:10,description:"x",hasAttachment:false}),/المرفق/);
// Scenario: executive funding → project expense → employee custody → partial settlement → return.
const main = "main", custody = "custody-employee", project = "project-a";
const scenario = [
  { status: "POSTED", amountCents: 1000000, sourceAccountId: null, destinationAccountId: main, type: "FUNDING" },
  { status: "POSTED", amountCents: 125000, sourceAccountId: main, destinationAccountId: null, projectId: project, type: "DIRECT_EXPENSE" },
  { status: "POSTED", amountCents: 300000, sourceAccountId: main, destinationAccountId: custody, type: "CUSTODY_ISSUE" },
  { status: "POSTED", amountCents: 180000, sourceAccountId: custody, destinationAccountId: null, projectId: project, type: "CUSTODY_EXPENSE" },
  { status: "POSTED", amountCents: 120000, sourceAccountId: custody, destinationAccountId: main, type: "CUSTODY_RETURN" },
];
assert.doesNotThrow(() => assertBalances(scenario));
assert.equal(balanceForAccount(scenario, main), 695000);
assert.equal(balanceForAccount(scenario, custody), 0);
assert.equal(scenario.filter((movement) => isProjectCost(movement.type) && movement.projectId === project).reduce((sum, movement) => sum + movement.amountCents, 0), 305000);
assert.equal(scenario.filter((movement) => movement.type === "CUSTODY_ISSUE").reduce((sum, movement) => sum + movement.amountCents, 0), 300000, "custody issue remains a transfer, not project cost");
assert.throws(() => assertBalances([...scenario, { status: "POSTED", amountCents: 1, sourceAccountId: custody, destinationAccountId: null, type: "CUSTODY_EXPENSE" }]));
console.log("Petty Cash business logic tests passed.");
