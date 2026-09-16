import assert from "node:assert/strict";
import { balanceForAccount, isProjectCost, validatePettyInput } from "../src/lib/petty-cash.ts";
assert.equal(balanceForAccount([{status:"POSTED",amountCents:1000,sourceAccountId:null,destinationAccountId:"cash"},{status:"POSTED",amountCents:250,sourceAccountId:"cash",destinationAccountId:null}],"cash"),750);
assert.equal(isProjectCost("CUSTODY_ISSUE"),false); assert.equal(isProjectCost("CUSTODY_EXPENSE"),true);
assert.throws(()=>validatePettyInput({type:"DIRECT_EXPENSE",amount:10,description:"x",allocation:"PROJECT",hasAttachment:true}),/مشروع/);
assert.throws(()=>validatePettyInput({type:"FUNDING",amount:10,description:"x",hasAttachment:false}),/المرفق/);
console.log("Petty Cash business logic tests passed.");
