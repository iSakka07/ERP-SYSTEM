import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';

assert.equal(process.env.ERP_ISOLATED_TEST, 'true');
assert.ok(/[\\/]tmp[\\/]isolated-test-/.test(process.env.DATABASE_URL || '') || process.env.ERP_ISOLATED_POSTGRES === 'true');
const db = new PrismaClient();
const base = process.env.ERP_TEST_URL;
assert.match(base, /^http:\/\/127\.0\.0\.1:/);
const tag = randomUUID().slice(0, 8);
const results = [];
const record = (id, evidence) => { results.push({ id, ...evidence }); console.log(JSON.stringify(results.at(-1))); };
async function login(email, password) {
  const jar = new Map();
  const save = r => r.headers.getSetCookie().forEach(c => { const [k,...v]=c.split(';')[0].split('='); jar.set(k,v.join('=')); });
  const cookie = () => [...jar].map(([k,v]) => `${k}=${v}`).join('; ');
  const csrf = await fetch(`${base}/api/auth/csrf`); save(csrf);
  const { csrfToken } = await csrf.json();
  const response = await fetch(`${base}/api/auth/callback/credentials`, { method:'POST', redirect:'manual', headers:{Cookie:cookie(),'Content-Type':'application/x-www-form-urlencoded'}, body:new URLSearchParams({csrfToken,email,password,callbackUrl:base}) }); save(response);
  const session = await (await fetch(`${base}/api/auth/session`, {headers:{Cookie:cookie()}})).json();
  assert.ok(session.user, `Login failed: ${email}`);
  return cookie();
}
async function request(cookie, path, data, {key=randomUUID(), origin=base, form=false, contentType='application/json'}={}) {
  const headers = {Cookie:cookie,Origin:origin,'Idempotency-Key':key};
  let body;
  if (form) { body=new FormData(); body.set('payload',JSON.stringify(data)); body.append('files',new File(['%PDF-1.4\nAudit fixture'], 'audit.pdf',{type:'application/pdf'})); }
  else { headers['Content-Type']=contentType;body=JSON.stringify(data); }
  const r=await fetch(base+path,{method:'POST',headers,body});
  const text=await r.text();let value;try{value=JSON.parse(text)}catch{value=text.slice(0,300)};
  return {status:r.status,body:value};
}
try {
  const admin=await login('admin@erp.local',process.env.ERP_TEST_ADMIN_PASSWORD);
  const adminRow=await db.user.findUniqueOrThrow({where:{email:'admin@erp.local'}});
  const owner=await db.company.create({data:{name:`Audit owner ${tag}`,type:'OWNER'}});
  const own=await db.project.create({data:{code:`AO-${tag}`,name:`Audit own ${tag}`,companyId:owner.id}});
  const alien=await db.project.create({data:{code:`AX-${tag}`,name:`ALIEN_PROJECT_${tag}`,companyId:owner.id}});
  const employee=await db.employee.create({data:{employeeCode:`AE-${tag}`,name:`Audit engineer ${tag}`,jobTitle:'engineer'}});
  const secretEmployee=await db.employee.create({data:{employeeCode:`AS-${tag}`,name:`SECRET_EMPLOYEE_${tag}`,jobTitle:'engineer',monthlySalaryCents:87654321}});
  await db.projectEngineerAssignment.create({data:{projectId:own.id,employeeId:employee.id}});
  const role=await db.role.findUniqueOrThrow({where:{key:'technical_office_engineer'}});
  const password=`Audit-${randomUUID()}`;
  const engineer=await db.user.create({data:{name:`Audit engineer ${tag}`,email:`audit-${tag}@example.invalid`,passwordHash:await hash(password,10),roleId:role.id,employeeId:employee.id}});
  for(const key of ['incoming.view','warehouse.manage','warehouse.view']){
    const permission=await db.permission.findUniqueOrThrow({where:{key}});
    await db.userPermissionOverride.create({data:{userId:engineer.id,permissionId:permission.id,enabled:true}});
  }
  const eng=await login(engineer.email,password);
  const management=await fetch(base+'/management',{headers:{Cookie:eng}});
  const managementText=await management.text();
  record('SEC-01',{status:management.status,leaksSalary:managementText.includes('87654321'),leaksOtherEmployee:managementText.includes(secretEmployee.name),leaksOtherProject:managementText.includes(alien.name)});
  const alienContract=await db.incomingContract.create({data:{number:`AC-${tag}`,name:`Alien contract ${tag}`,projectId:alien.id,originalCents:100000}});
  const filename=`CONFIDENTIAL_OTHER_PROJECT_${tag}.pdf`;
  const attachment=await db.incomingAttachment.create({data:{entityType:'contract',entityId:alienContract.id,name:filename,mime:'application/octet-stream',size:5,data:Buffer.from('%PDF-'),actorId:adminRow.id}});
  await db.auditLog.create({data:{actorId:adminRow.id,action:'incoming.stage',target:alienContract.id,details:JSON.stringify({input:{reason:`PRIVATE_REASON_${tag}`}})}});
  const incomingText=await (await fetch(base+'/incoming',{headers:{Cookie:eng}})).text();
  const download=await fetch(base+'/api/incoming/attachments/'+attachment.id,{headers:{Cookie:eng}});
  record('SEC-02',{leaksAttachmentName:incomingText.includes(filename),leaksAuditReason:incomingText.includes(`PRIVATE_REASON_${tag}`),attachmentDownloadStatus:download.status});

  const main=await db.warehouse.findFirstOrThrow({where:{active:true,type:{not:'PROJECT'}}});
  const item=await db.inventoryItem.create({data:{code:`AI-${tag}`,name:`Audit item ${tag}`,unit:'unit'}});
  const invoice=await db.purchaseInvoice.create({data:{number:`AP-${tag}`,name:`Audit invoice ${tag}`,projectId:own.id,invoiceDate:new Date('2026-09-28'),totalCents:1000,stockMode:'WAREHOUSE',warehouseId:main.id,actorId:adminRow.id,items:{create:{position:1,name:item.name,unit:'unit',quantity:10,unitPriceCents:100,totalCents:1000,inventoryItemId:item.id}}},include:{items:true}});
  const receipt=await request(admin,'/api/warehouse',{action:'receipt',invoiceId:invoice.id,warehouseId:main.id,movementDate:'2026-09-28',recipient:'Audit operator',lines:[{purchaseItemId:invoice.items[0].id,quantity:7},{purchaseItemId:invoice.items[0].id,quantity:7}]});
  const receiptLines=await db.stockMovementLine.findMany({where:{sourcePurchaseItemId:invoice.items[0].id}});
  record('FIN-01-receipt',{...receipt,ordered:10,received:receiptLines.reduce((s,x)=>s+x.quantity,0)});
  const readerRole=await db.role.create({data:{key:`audit_reader_${tag}`,name:'Audit warehouse reader'}});
  const viewPermission=await db.permission.findUniqueOrThrow({where:{key:'warehouse.view'}});
  await db.rolePermission.create({data:{roleId:readerRole.id,permissionId:viewPermission.id}});
  const reader=await db.user.create({data:{name:'Audit warehouse reader',email:`reader-${tag}@example.invalid`,passwordHash:await hash(password,10),roleId:readerRole.id}});
  const readerCookie=await login(reader.email,password);
  const register=await (await fetch(base+'/api/warehouse/receipts?invoice='+invoice.number,{headers:{Cookie:readerCookie}})).json();
  record('SEC-05',{onlyPermission:'warehouse.view',invoiceFinancialData:register.rows?.[0]?.invoice});
  const issue=await request(admin,'/api/warehouse',{action:'issue',warehouseId:main.id,projectId:own.id,movementDate:'2026-09-28',recipient:'Audit operator',lines:[{itemId:item.id,quantity:10},{itemId:item.id,quantity:10}]});
  record('FIN-01-issue',{...issue,availableBefore:14,requestedTotal:20});

  const item2=await db.inventoryItem.create({data:{code:`AR-${tag}`,name:`Audit retry ${tag}`,unit:'unit'}});
  await db.stockMovement.create({data:{number:`AR-OPEN-${tag}`,type:'RECEIPT',toWarehouseId:main.id,movementDate:new Date(),actorId:adminRow.id,lines:{create:{itemId:item2.id,quantity:100,unitCostCents:100,totalCents:10000}}}});
  const retryData={action:'issue',warehouseId:main.id,projectId:own.id,movementDate:'2026-09-28',recipient:'Audit retry',lines:[{itemId:item2.id,quantity:5}]};
  const key=randomUUID();const first=await request(admin,'/api/warehouse',retryData,{key});const second=await request(admin,'/api/warehouse',retryData,{key});
  record('FIN-02',{first,second,distinctRecords:first.body.id!==second.body.id});

  const alienWarehouse=await db.warehouse.create({data:{code:`AW-${tag}`,name:`Alien warehouse ${tag}`,type:'PROJECT',projectId:alien.id}});
  await db.stockMovement.create({data:{number:`AW-OPEN-${tag}`,type:'RECEIPT',toWarehouseId:alienWarehouse.id,movementDate:new Date('2025-01-01'),actorId:adminRow.id,lines:{create:{itemId:item2.id,quantity:10,unitCostCents:100,totalCents:1000}}}});
  await db.accountingPeriod.upsert({where:{month:'2025-01'},update:{status:'CLOSED'},create:{month:'2025-01',status:'CLOSED'}});
  const journalBefore=await db.journalEntry.count();
   const count=await request(eng,'/api/warehouse',{action:'count',warehouseId:alienWarehouse.id,countDate:'2025-01-15',lines:[{itemId:item2.id,actualQuantity:0,reason:'Audit count'}]});
   record('SEC-03-FIN-03',{...count,otherProject:alien.id,authorizedProjects:[own.id],closedPeriod:true,journalDelta:(await db.journalEntry.count())-journalBefore});
   const ownWarehouse=await db.warehouse.findFirstOrThrow({where:{type:'PROJECT',projectId:own.id,active:true}});
   await db.stockMovement.create({data:{number:`OW-OPEN-${tag}`,type:'RECEIPT',toWarehouseId:ownWarehouse.id,movementDate:new Date('2026-01-01'),actorId:adminRow.id,lines:{create:{itemId:item2.id,quantity:10,unitCostCents:100,totalCents:1000}}}});
   await db.accountingPeriod.upsert({where:{month:'2026-01'},update:{status:'CLOSED'},create:{month:'2026-01',status:'CLOSED'}});
   const closedBefore=await db.inventoryCount.count();
   const closedCount=await request(eng,'/api/warehouse',{action:'count',warehouseId:ownWarehouse.id,countDate:'2026-01-15',lines:[{itemId:item2.id,actualQuantity:5,reason:'Closed period test'}]});
   const closedAfter=await db.inventoryCount.count();
   record('FIN-03-closed-period',{status:closedCount.status,body:closedCount.body,countDelta:closedAfter-closedBefore,journalDelta:(await db.journalEntry.count())-journalBefore});
   await db.accountingPeriod.update({where:{month:'2026-01'},data:{status:'OPEN'}});
   const openCount=await request(eng,'/api/warehouse',{action:'count',warehouseId:ownWarehouse.id,countDate:'2026-02-15',lines:[{itemId:item2.id,actualQuantity:5,reason:'Shortage posting test'}]});
   const adjustment=await db.journalEntry.findFirst({where:{sourceType:'INVENTORY_ADJUSTMENT'},orderBy:{createdAt:'desc'},include:{lines:{include:{account:true}}}});
   record('FIN-03-shortage-posting',{status:openCount.status,body:openCount.body,sourceType:adjustment?.sourceType,totalDebit:adjustment?.lines.reduce((s,l)=>s+l.debitCents,0),totalCredit:adjustment?.lines.reduce((s,l)=>s+l.creditCents,0),accounts:adjustment?.lines.map(l=>({key:l.account.systemKey,debit:l.debitCents,credit:l.creditCents}))});
  const origin=await request(admin,'/api/inventory-items',{name:`Audit cross origin ${tag}`,unit:'unit'},{origin:'https://untrusted.example.invalid',contentType:'text/plain'});
  record('SEC-04',{...origin,note:'Authenticated handler test; no browser exploit asserted'});

  const cash=await db.pettyCashAccount.findFirstOrThrow({where:{type:'MAIN',active:true}});
  await db.pettyCashTransaction.create({data:{number:`AFUND-${tag}`,type:'FUNDING',amountCents:100000,destinationAccountId:cash.id,transactionDate:new Date(),description:'Audit fixture funding',recordedById:adminRow.id}});
  const supplier=await db.company.findFirstOrThrow({where:{type:'SUPPLIER',active:true}});
  const purchase=await request(admin,'/api/purchases',{action:'invoice',projectId:own.id,supplierId:supplier.id,invoiceDate:'2026-09-28',name:`Audit cash invoice ${tag}`,paymentSource:'PETTY_CASH',paidAmount:10,stockMode:'LEGACY_DIRECT',items:[{name:`Audit service ${tag}`,unit:'unit',quantity:1,price:10}]},{form:true});
  if(purchase.status<300){
    const purchaseId=purchase.body.id;
    const saved=await db.purchaseInvoice.findUniqueOrThrow({where:{id:purchaseId}});
    const movement=await db.pettyCashTransaction.findFirstOrThrow({where:{documentNumber:saved.number,type:'PURCHASE_PAYMENT'}});
    const form=new FormData();form.set('action','reverse');form.set('id',movement.id);form.set('reason','Audit reversal of linked purchase');form.append('files',new File(['%PDF-1.4\nAudit'], 'audit.pdf'));
    const response=await fetch(base+'/api/petty-cash',{method:'POST',headers:{Cookie:admin,Origin:base,'Idempotency-Key':randomUUID()},body:form});
    const body=await response.json();
    const after=await db.purchaseInvoice.findUniqueOrThrow({where:{id:purchaseId},include:{payments:true}});
    const pettyAfter=await db.pettyCashTransaction.findUniqueOrThrow({where:{id:movement.id}});
    record('FIN-04',{status:response.status,body,pettyStatus:pettyAfter.status,invoicePaidCents:after.paidCents,paymentStatuses:after.payments.map(p=>p.status),purchaseJournalStillPresent:await db.journalEntry.count({where:{sourceType:'PURCHASE',sourceId:purchaseId}})});
  }else record('FIN-04',{setupFailed:purchase});
  const accountantCookie=await login('accountant@erp.local',process.env.ERP_TEST_ADMIN_PASSWORD);
  const payroll=await db.payrollRun.create({data:{month:'2030-02',status:'APPROVED',totalCents:1000,approvedById:adminRow.id}});
  const payrollForm=new FormData();payrollForm.set('action','payroll-pay');payrollForm.set('payload',JSON.stringify({id:payroll.id}));
  const payrollResponse=await fetch(base+'/api/salaries',{method:'POST',headers:{Cookie:accountantCookie,Origin:base,'Idempotency-Key':randomUUID()},body:payrollForm});
  record('SEC-06',{actorRole:'accountant',status:payrollResponse.status,body:await payrollResponse.json(),payrollStatus:(await db.payrollRun.findUniqueOrThrow({where:{id:payroll.id}})).status});
  const costProject=await db.project.create({data:{code:`COST-${tag}`,name:`Audit cost ${tag}`,companyId:owner.id}});
  const costContract=await request(admin,'/api/incoming',{action:'contract',number:`COST-C-${tag}`,name:'Audit cost contract',projectId:costProject.id,value:1000},{form:true});
  if(costContract.status<300){
    const statement=await request(admin,'/api/incoming',{action:'statement',contractId:costContract.body.id,kind:'CURRENT',value:100,materialNumber:`MAT-${tag}`,materials:[{name:'Owner material',unit:'unit',quantity:1,price:20}]},{form:true});
    const inlineCertificate=await db.materialCertificate.findUnique({where:{number:`MAT-${tag}`}});
    const inlinePostingCount=inlineCertificate ? await db.journalEntry.count({where:{sourceId:inlineCertificate.id,sourceType:{in:['OWNER_MATERIAL_RECEIPT','OWNER_MATERIAL_COST']}}}) : null;
    const separateCertificate=await request(admin,'/api/incoming',{action:'material',statementId:statement.body.id,number:`MAT-SEPARATE-${tag}`,items:[{name:'Separate owner material',unit:'unit',quantity:1,price:20}]},{form:true});
    const funding=await request(admin,'/api/bank',{action:'create',type:'OWNER_FUNDING',amount:100,date:'2026-09-28',description:`Audit bank funding ${tag}`},{form:true});
    const expense=await request(admin,'/api/bank',{action:'create',type:'MANUAL_EXPENSE',amount:10,date:'2026-09-28',projectId:costProject.id,categoryKey:'diesel',description:`Audit project bank expense ${tag}`},{form:true});
    const report=await (await fetch(base+'/api/project-cost-control?projectId='+costProject.id,{headers:{Cookie:admin}})).json();
    const costs=await db.journalLine.findMany({where:{projectId:costProject.id,account:{type:'EXPENSE'}}});
    record('FIN-05',{statementStatus:statement.status,statementBody:statement.body,separateCertificateStatus:separateCertificate.status,fundingStatus:funding.status,expenseStatus:expense.status,reportCostCents:report.cost?.totalCostCents,ownerMaterialsCents:report.revenue?.materialsCents,ledgerExpenseCents:costs.reduce((s,l)=>s+l.debitCents-l.creditCents,0)});
    const excessMaterial=await request(admin,'/api/incoming',{action:'statement',contractId:costContract.body.id,kind:'CURRENT',value:200,materialNumber:`MAT-EXCESS-${tag}`,materials:[{name:'Excess inline material',unit:'unit',quantity:1,price:300}]},{form:true});
    record('FIN-06',{inlineCertificateCents:inlineCertificate?.totalCents,inlinePostingCount,excessMaterialStatus:excessMaterial.status,excessMaterialBody:excessMaterial.body,statementGrossCents:20000,newMaterialCents:30000});
  }else record('FIN-05',{setupFailed:costContract});
  const health=await fetch(base+'/api/health');record('OPS-health',{status:health.status,body:await health.json()});
  const byId = Object.fromEntries(results.map((item) => [item.id, item]));
  assert.equal(byId['SEC-01'].leaksSalary, false);
  assert.equal(byId['SEC-01'].leaksOtherEmployee, false);
  assert.equal(byId['SEC-02'].attachmentDownloadStatus, 403);
  assert.equal(byId['FIN-01-receipt'].status, 400);
  assert.equal(byId['FIN-01-issue'].status, 400);
  assert.equal(byId['FIN-02'].second.body.replayed, true);
  assert.equal(byId['SEC-03-FIN-03'].status, 403);
  assert.equal(byId['FIN-03-closed-period'].status, 400);
  assert.equal(byId['SEC-06'].status, 403);
  assert.equal(byId['FIN-06'].inlinePostingCount, 2);
  assert.equal(byId['FIN-06'].excessMaterialStatus, 400);
  console.log('PASS: security and financial acceptance cases passed.');
} finally {
  await db.$disconnect();
}
