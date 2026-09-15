import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { currencyRaw, currencyDisplay } from "../src/lib/currency.ts";

assert.equal(currencyDisplay("123345678"), "123,345,678.00");
assert.equal(currencyDisplay("32312321321"), "32,312,321,321.00");
assert.equal(currencyDisplay("0.5"), "0.50");
assert.equal(currencyDisplay("1234.", false), "1,234.");
assert.equal(currencyDisplay("1000.01"), "1,000.01");
assert.equal(currencyRaw("١٢٣٬٣٤٥٫٦٧"), "123345.67");
assert.equal(currencyRaw("123,345,678.00"), "123345678.00");
assert.equal(currencyDisplay(""), "");

const db = new PrismaClient();
const tag = `QA-DESIGN-${randomUUID()}`;
const password = randomUUID();
const base = process.env.ERP_TEST_URL || "http://localhost:3090";
const users = [];
const jars = {};
let project, company, contract;
async function login(email) {
  const jar = new Map();
  const take = r => r.headers.getSetCookie().forEach(c => {const [k,...v]=c.split(";")[0].split("=");jar.set(k,v.join("="));});
  const csrf=await fetch(`${base}/api/auth/csrf`);take(csrf);
  const {csrfToken}=await csrf.json();
  const cookie=()=>[...jar].map(([k,v])=>`${k}=${v}`).join("; ");
  const response=await fetch(`${base}/api/auth/callback/credentials`,{method:"POST",redirect:"manual",headers:{"Content-Type":"application/x-www-form-urlencoded",Cookie:cookie()},body:new URLSearchParams({csrfToken,email,password,callbackUrl:base})});take(response);
  assert.ok((await (await fetch(`${base}/api/auth/session`,{headers:{Cookie:cookie()}})).json()).user);
  return cookie();
}
async function post(payload, ordinary=1, estimate=0, role="admin") {
  const form=new FormData();form.set("payload",JSON.stringify(payload));
  for(const [field,count] of [["files",ordinary],["estimateFiles",estimate]])for(let i=0;i<count;i++)form.append(field,new Blob(["%PDF-1.4\n% synthetic QA proof\n%%EOF"],{type:"application/pdf"}),`${tag}-${field}-${i}.pdf`);
  const response=await fetch(`${base}/api/incoming`,{method:"POST",headers:{Cookie:jars[role],Origin:base},body:form});
  return {status:response.status,...await response.json()};
}
try {
  const hash=await bcrypt.hash(password,10);
  for(const key of ["admin","sales"]){const role=await db.role.findUniqueOrThrow({where:{key}});const user=await db.user.create({data:{email:`${tag}-${key}@qa.invalid`.toLowerCase(),name:tag,passwordHash:hash,active:true,roleId:role.id}});users.push(user.id);jars[key]=await login(user.email);}
  company=await db.company.create({data:{name:tag,type:"OWNER"}});
  project=await db.project.create({data:{name:tag,code:tag,companyId:company.id}});
  const payload={action:"contract",number:tag,name:tag,projectId:project.id,value:"1200000.25",estimateValue:"1000000.10",estimateReference:"QA historical reference"};
  assert.equal((await post(payload,1,0)).status,400,"estimate value requires archive");
  assert.equal((await post(payload,3,3)).status,400,"combined file limit");
  assert.equal((await post(payload,1,1,"sales")).status,403,"RBAC remains enforced");
  const created=await post(payload,1,1);assert.equal(created.status,200);contract=created.id;
  let saved=await db.incomingContract.findUniqueOrThrow({where:{id:contract}});
  assert.equal(saved.originalCents,120000025);assert.equal(saved.estimateCents,100000010);
  const archive=await db.incomingAttachment.findFirstOrThrow({where:{entityId:contract,entityType:"estimate"}});
  assert.equal((await fetch(`${base}/api/incoming/attachments/${archive.id}`,{headers:{Cookie:jars.sales}})).status,403);
  assert.equal((await fetch(`${base}/api/incoming/attachments/${archive.id}`,{headers:{Cookie:jars.admin}})).status,200);
  const {estimateReference: _legacy,...edit}=payload;void _legacy;
  assert.equal((await post({...edit,id:contract},0,0)).status,200,"unchanged estimate reuses archived proof");
  assert.equal((await post({...edit,id:contract,estimateValue:"900000"},0,0)).status,400,"changed estimate requires fresh proof");
  assert.equal((await post({...edit,id:contract,estimateValue:"900000"},0,1)).status,200);
  saved=await db.incomingContract.findUniqueOrThrow({where:{id:contract}});
  assert.equal(saved.estimateReference,"QA historical reference","legacy reference preserved");
  assert.equal(saved.estimateCents,90000000);
  assert.equal(await db.incomingAttachment.count({where:{entityId:contract,entityType:"estimate"}}),2,"archives retained");
  assert.equal((await post({...edit,id:contract,estimateValue:""},0,0)).status,200,"optional value can be cleared without deleting archives");
  assert.equal((await db.incomingContract.findUniqueOrThrow({where:{id:contract}})).estimateCents,null);
  assert.equal((await post({action:"memo",contractId:contract,kind:"INCREASE",value:10,reason:tag},1,1)).status,400,"archive is contract-only");
  console.log("PASS: currency formatting, raw cents, estimate archive, legacy preservation, combined limits and RBAC.");
} finally {
  if(contract){await db.incomingAttachment.deleteMany({where:{entityId:contract}});await db.incomingContract.delete({where:{id:contract}});}
  if(project)await db.project.delete({where:{id:project.id}});
  if(company)await db.company.delete({where:{id:company.id}});
  await db.auditLog.deleteMany({where:{actorId:{in:users}}});
  await db.user.deleteMany({where:{id:{in:users}}});
  await db.$disconnect();
}
