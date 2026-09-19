import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const base = process.env.ERP_TEST_URL || "http://127.0.0.1:3090";
const tag = "pc-test-" + randomUUID(), password = randomUUID();
const ids = [], counts = [], categories = [], users = [];
let employee, project, company;
const day = new Date().toISOString().slice(0,10);
async function login(email) {
  const jar = new Map();
  const take = r => r.headers.getSetCookie().forEach(c => { const [k,...v]=c.split(";")[0].split("="); jar.set(k,v.join("=")); });
  const headers = () => ({ Cookie:[...jar].map(([k,v])=>k+"="+v).join("; ") });
  const r=await fetch(base+"/api/auth/csrf"); take(r); const {csrfToken}=await r.json();
  const s=await fetch(base+"/api/auth/callback/credentials",{method:"POST",redirect:"manual",headers:{...headers(),"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({csrfToken,email,password})});take(s);
  return headers();
}
async function post(headers, fields, proof=true, origin=base) {
  const key=randomUUID(); const send=async confirmation=>{const f=new FormData();for(const[k,v]of Object.entries({date:day,...fields}))f.set(k,String(v));if(proof)f.append("files",new Blob(["%PDF-1.4\nAUTOMATED TEST"],{type:"application/pdf"}),"AUTOMATED-TEST.pdf");const r=await fetch(base+"/api/petty-cash",{method:"POST",headers:{...headers,Origin:origin,"Idempotency-Key":key,...(confirmation?{"Duplicate-Confirmation":confirmation}:{})},body:f});const result=await r.json();if(r.status===409&&result.code==="SIMILAR_FINANCIAL_OPERATION")return send(result.confirmationToken);return{status:r.status,...result};};return send();
}
try {
  for (const roleKey of ["admin","sales"]) {
    const role=await db.role.findUniqueOrThrow({where:{key:roleKey}});
    const u=await db.user.create({data:{name:tag,email:tag+roleKey+"@test.invalid",passwordHash:await hash(password,10),roleId:role.id}});users.push(u.id);
  }
  const h=await login(tag+"admin@test.invalid"), forbidden=await login(tag+"sales@test.invalid");
  company=await db.company.create({data:{name:tag,type:"OWNER"}});
  project=await db.project.create({data:{name:tag,code:tag,companyId:company.id}});
  employee=await db.employee.create({data:{name:tag,employeeCode:tag,jobTitle:"TEST"}});
  async function ok(fields, proof=true){const r=await post(h,fields,proof);assert.equal(r.status,200,JSON.stringify(r));if(fields.action==="cash-count")counts.push(r.id);else if(fields.action==="category"){if(!categories.includes(r.id))categories.push(r.id);}else if(fields.action!=="reverse")ids.push(r.id);return r.id;}
  async function reject(fields, proof=true, code=400){const r=await post(h,fields,proof);assert.equal(r.status,code,JSON.stringify(r));}
  const snapshot=async()=>{const r=await fetch(base+"/api/petty-cash",{headers:h});assert.equal(r.status,200);return r.json();};
  const before=await snapshot(), main=before.accounts.find(a=>a.type==="MAIN");
  assert.ok(!JSON.stringify(before).includes("passwordHash"),"API must not expose credentials");
  const categoryId=await ok({action:"category",name:tag,active:true,requiresDocument:true,requiresAttachment:true},false);
  await reject({type:"FUNDING",amount:100,description:tag},false);
  assert.equal((await post(forbidden,{type:"FUNDING",amount:100,description:tag})).status,403);
  assert.equal((await post(h,{type:"FUNDING",amount:100,description:tag},true,"https://untrusted.invalid")).status,403);
  const funding=await ok({type:"FUNDING",amount:10000,description:tag});
  const issue=await ok({type:"CUSTODY_ISSUE",amount:4000,description:tag,employeeId:employee.id});
  const custody=(await db.pettyCashTransaction.findUniqueOrThrow({where:{id:issue}})).destinationAccountId;
  const expense={type:"CUSTODY_EXPENSE",amount:1500,description:tag,sourceAccountId:custody,allocation:"PROJECT",projectId:project.id,categoryId,documentNumber:tag};
  await reject({...expense,documentNumber:""});
  const expenseId=await ok(expense);
  await reject({type:"CUSTODY_RETURN",amount:2501,description:tag,sourceAccountId:custody});
  await reject({action:"reverse",id:issue,reason:tag});
  await ok({type:"DIRECT_EXPENSE",amount:500,description:tag,allocation:"PROJECT",projectId:project.id,categoryId,documentNumber:tag});
  let d=await snapshot();assert.equal(d.accounts.find(a=>a.id===custody).balanceCents,250000);
  await ok({type:"CUSTODY_RETURN",amount:2500,description:tag,sourceAccountId:custody});
  d=await snapshot();assert.equal(d.accounts.find(a=>a.id===main.id).balanceCents,main.balanceCents+800000);assert.equal(d.accounts.find(a=>a.id===custody).balanceCents,0);
  const total=()=>db.pettyCashTransaction.aggregate({where:{projectId:project.id,status:"POSTED",type:{in:["DIRECT_EXPENSE","CUSTODY_EXPENSE"]}},_sum:{amountCents:true}});
  assert.equal((await total())._sum.amountCents,200000,"project costs in cents");
  const html=await(await fetch(base+"/?project="+project.id,{headers:h})).text();assert.ok(html.includes("/petty-cash?project="+project.id),"project links to cash ledger");
  await reject({...expense,amount:0.001});
  await reject({...expense,date:"2026-02-30"});
  const balance=d.accounts.find(a=>a.id===main.id).balanceCents;
  const countId=await ok({action:"cash-count",accountId:main.id,actual:(balance+10000)/100},false);
  assert.equal((await snapshot()).accounts.find(a=>a.id===main.id).balanceCents,balance,"count has no financial effect");
  const adjustment=await ok({action:"adjust",countId,description:tag});
  await reject({action:"adjust",countId,description:tag});
  await ok({action:"reverse",id:adjustment,reason:tag});
  await ok({action:"cash-count",accountId:custody,actual:0},false);
  await ok({action:"reverse",id:expenseId,reason:tag});
  assert.equal((await total())._sum.amountCents,50000,"reversal removes cost");
  const reversed=await db.pettyCashTransaction.findUniqueOrThrow({where:{id:expenseId},include:{attachments:true}});
  assert.equal(reversed.status,"REVERSED");assert.equal(reversed.attachments.length,2,"reversal proof persisted");
  const originalJournal=await db.journalEntry.findFirstOrThrow({where:{sourceType:"PETTY_CASH",sourceId:expenseId}});
  const reversalJournal=await db.journalEntry.findFirstOrThrow({where:{reversalOfId:originalJournal.id}});
  assert.equal(reversalJournal.status,"POSTED","cash reversal must create a balancing journal entry");
  await reject({action:"reverse",id:expenseId,reason:tag});
  await ok({action:"category",id:categoryId,name:tag,active:true,requiresDocument:false,requiresAttachment:false},false);
  await ok({...expense,amount:100,documentNumber:""},false);
  const projectCostBeforeGeneral=(await total())._sum.amountCents;
  const general=await ok({type:"DIRECT_EXPENSE",amount:50,description:tag,allocation:"GENERAL",categoryId},false);
  assert.equal((await db.pettyCashTransaction.findUniqueOrThrow({where:{id:general}})).projectId,null);
  assert.equal((await total())._sum.amountCents,projectCostBeforeGeneral,"general expense never enters project cost");
  await reject({type:"DIRECT_EXPENSE",amount:50,description:tag,allocation:"GENERAL",projectId:project.id,categoryId},false);
  await ok({action:"category",id:categoryId,name:tag,active:false,requiresDocument:false,requiresAttachment:false},false);
  await reject({...expense,amount:1});
  // More than 200 records must not truncate balance or history.
  const bulk=Array.from({length:205},()=>({id:randomUUID(),number:randomUUID(),type:"FUNDING",amountCents:1,transactionDate:new Date(),destinationAccountId:main.id,description:tag,recordedById:users[0]}));
  ids.push(...bulk.map(t=>t.id));await db.pettyCashTransaction.createMany({data:bulk});
  d=await snapshot();assert.ok(d.transactions.filter(t=>t.description===tag).length>200);
  const all=await db.pettyCashTransaction.findMany({where:{status:"POSTED"}});
  const expected=all.reduce((s,t)=>s+(t.destinationAccountId===main.id?t.amountCents:0)-(t.sourceAccountId===main.id?t.amountCents:0),0);
  assert.equal(d.accounts.find(a=>a.id===main.id).balanceCents,expected);
  // Concurrent requests cannot spend the same remaining custody balance twice.
  await ok({action:"category",id:categoryId,name:tag,active:true,requiresDocument:false,requiresAttachment:false},false);
  const remaining=d.accounts.find(a=>a.id===custody).balanceCents;
  const parallel=await Promise.all([post(h,{...expense,amount:remaining/100},false),post(h,{...expense,amount:remaining/100},false)]);
  parallel.filter(r=>r.status===200).forEach(r=>ids.push(r.id));
  assert.equal(parallel.filter(r=>r.status===200).length,1,"only one concurrent spend succeeds");
  await reject({type:"DIRECT_EXPENSE",amount:1e10,description:tag,allocation:"GENERAL",categoryId});
  assert.ok(funding);
  console.log("PASS: funding, partial custody, returns, balances, project cost, reversal proof, zero count, adjustment, categories, permissions, 200+ rows, concurrent spending.");
} finally {
  // Delete only records owned by the temporary test users/entities.
  if(users.length){
    await db.pettyCashAttachment.deleteMany({where:{actorId:{in:users}}});
    await db.pettyCashTransaction.deleteMany({where:{recordedById:{in:users}}});
    await db.pettyCashCount.deleteMany({where:{actorId:{in:users}}});
    await db.auditLog.deleteMany({where:{actorId:{in:users}}});
  }
  if(employee) {await db.pettyCashAccount.deleteMany({where:{employeeId:employee.id}});await db.employee.delete({where:{id:employee.id}});}
  if(categories.length)await db.pettyCashCategory.deleteMany({where:{id:{in:categories}}});
  if(project)await db.project.delete({where:{id:project.id}});
  if(company)await db.company.delete({where:{id:company.id}});
  if(users.length)await db.user.deleteMany({where:{id:{in:users}}});
  await db.$disconnect();
}
