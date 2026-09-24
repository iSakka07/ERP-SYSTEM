import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { accessProfile } from "@/lib/access-control";
import { prisma } from "@/lib/prisma";
import { AttachmentsDirectory, type AttachmentRow } from "@/components/attachments-directory";

const moduleLabels: Record<string, string> = { incoming: "العقود والوارد", expenses: "مستخلصات المقاولين", purchases: "المشتريات", petty: "الخزنة والنثريات", bank: "البنك", salaries: "المرتبات" };
const day = (date: Date) => date.toLocaleDateString("en-GB");

export default async function AttachmentsPage() {
  const session = await auth(); if (!session?.user?.id) redirect("/login");
  const profile = await accessProfile(session.user.id); if (!profile) redirect("/login");
  const can = (key: string) => profile.permissions.includes(key) && !(profile.isProjectScoped && ["pettycash.view", "bank.view", "salaries.view"].includes(key));
  if (!["incoming.view","expenses.view","purchases.view","pettycash.view","bank.view","salaries.view"].some(can)) redirect("/");
  const projectWhere = profile.isProjectScoped ? { projectId: { in: profile.projectIds } } : {};
  const [contracts, subcontract, invoices, petty, bank, salaries] = await Promise.all([
    can("incoming.view") ? prisma.incomingContract.findMany({ where: projectWhere, select: { id: true, name: true, statements: { select: { id: true, sequence: true, materials: { select: { id: true } } } }, memos: { select: { id: true } } } }) : Promise.resolve([]),
    can("expenses.view") ? prisma.subcontractAccount.findMany({ where: projectWhere, select: { id: true, name: true, withdrawals: { select: { id: true, itemName: true, effectiveDate: true } }, statements: { select: { id: true, sequence: true, payments: { select: { id: true } } } } } }) : Promise.resolve([]),
    can("purchases.view") ? prisma.purchaseInvoice.findMany({ where: projectWhere, select: { id: true, name: true, number: true } }) : Promise.resolve([]),
    can("pettycash.view") ? prisma.pettyCashTransaction.findMany({ select: { id: true, description: true } }) : Promise.resolve([]),
    can("bank.view") ? prisma.bankTransaction.findMany({ select: { id: true, number: true, description: true } }) : Promise.resolve([]),
    can("salaries.view") ? Promise.all([
      prisma.payrollRun.findMany({ select: { id: true, month: true } }),
      prisma.employeeAdvance.findMany({ select: { id: true, employee: { select: { name: true } } } }),
      prisma.employeeBonus.findMany({ select: { id: true, employee: { select: { name: true } }, name: true } }),
      prisma.employeeDeduction.findMany({ select: { id: true, employee: { select: { name: true } }, name: true } }),
    ]) : Promise.resolve([[], [], [], []]),
  ]);
  const [incomingFiles, expenseFiles, purchaseFiles, pettyFiles, bankFiles, salaryFiles] = await Promise.all([
    can("incoming.view") ? prisma.incomingAttachment.findMany({ select: { id: true, name: true, size: true, createdAt: true, entityType: true, entityId: true } }) : Promise.resolve([]),
    can("expenses.view") ? prisma.expenseAttachment.findMany({ select: { id: true, name: true, size: true, createdAt: true, entityType: true, entityId: true } }) : Promise.resolve([]),
    can("purchases.view") ? prisma.purchaseAttachment.findMany({ select: { id: true, name: true, size: true, createdAt: true, entityType: true, entityId: true } }) : Promise.resolve([]),
    can("pettycash.view") ? prisma.pettyCashAttachment.findMany({ select: { id: true, name: true, size: true, createdAt: true, transactionId: true } }) : Promise.resolve([]),
    can("bank.view") ? prisma.bankAttachment.findMany({ select: { id: true, name: true, size: true, createdAt: true, transactionId: true } }) : Promise.resolve([]),
    can("salaries.view") ? prisma.salaryAttachment.findMany({ select: { id: true, name: true, size: true, createdAt: true, payrollRunId: true, advanceId: true, bonusId: true, deductionId: true } }) : Promise.resolve([]),
  ]);
  const contractNames = new Map<string,string>(); const incomingIds = new Set<string>();
  for (const contract of contracts) { contractNames.set(contract.id, "عقد: " + contract.name); incomingIds.add(contract.id); for (const statement of contract.statements) { contractNames.set(statement.id, "مستخلص " + statement.sequence + " · " + contract.name); incomingIds.add(statement.id); for (const material of statement.materials) { contractNames.set(material.id, "شهادة خامات · مستخلص " + statement.sequence); incomingIds.add(material.id); } } for (const memo of contract.memos) { contractNames.set(memo.id, "مذكرة عقد · " + contract.name); incomingIds.add(memo.id); } }
  const accountNames = new Map<string,string>(); const expenseIds = new Set<string>();
  for (const account of subcontract) { accountNames.set(account.id, account.name); expenseIds.add(account.id); for (const withdrawal of account.withdrawals) { accountNames.set(withdrawal.id, "سحب أعمال · " + withdrawal.itemName + " · " + account.name); expenseIds.add(withdrawal.id); } for (const statement of account.statements) { accountNames.set(statement.id, "مستخلص " + statement.sequence + " · " + account.name); expenseIds.add(statement.id); for (const payment of statement.payments) { accountNames.set(payment.id, "إثبات صرف · " + account.name); expenseIds.add(payment.id); } } }
  const purchaseNames = new Map(invoices.map((invoice)=>[invoice.id, invoice.name || invoice.number]));
  const pettyNames = new Map(petty.map((record)=>[record.id,record.description]));
  const bankNames = new Map(bank.map((record)=>[record.id,record.description || record.number]));
  const salaryNames = new Map<string,string>();
  const [runs, advances, bonuses, deductions] = salaries;
  for (const row of runs) salaryNames.set(row.id,"مسير مرتبات " + row.month);
  for (const row of advances) salaryNames.set(row.id,"سلفة الموظف " + row.employee.name);
  for (const row of bonuses) salaryNames.set(row.id,"مكافأة " + row.employee.name + " · " + row.name);
  for (const row of deductions) salaryNames.set(row.id,"خصم " + row.employee.name + " · " + row.name);
  const rows: AttachmentRow[] = [
    ...incomingFiles.filter(file=>incomingIds.has(file.entityId)).map(file=>({ id:file.id,name:file.name,size:file.size,date:day(file.createdAt),module:moduleLabels.incoming,record:contractNames.get(file.entityId)||"ملف وارد",href:"/api/incoming/attachments/"+file.id })),
    ...expenseFiles.filter(file=>expenseIds.has(file.entityId)).map(file=>({ id:file.id,name:file.name,size:file.size,date:day(file.createdAt),module:moduleLabels.expenses,record:accountNames.get(file.entityId)||"مستخلص مقاول",href:"/api/expenses/attachments/"+file.id })),
    ...purchaseFiles.filter(file=>purchaseNames.has(file.entityId)).map(file=>({ id:file.id,name:file.name,size:file.size,date:day(file.createdAt),module:moduleLabels.purchases,record:purchaseNames.get(file.entityId)||"فاتورة مشتريات",href:"/api/purchases/attachments/"+file.id })),
    ...pettyFiles.map(file=>({ id:file.id,name:file.name,size:file.size,date:day(file.createdAt),module:moduleLabels.petty,record:pettyNames.get(file.transactionId)||"حركة خزنة",href:"/api/petty-cash/attachments/"+file.id })),
    ...bankFiles.map(file=>({ id:file.id,name:file.name,size:file.size,date:day(file.createdAt),module:moduleLabels.bank,record:bankNames.get(file.transactionId)||"حركة بنكية",href:"/api/bank/attachments/"+file.id })),
    ...salaryFiles.filter(file=>salaryNames.has(file.payrollRunId||file.advanceId||file.bonusId||file.deductionId||"")).map(file=>{const recordId=file.payrollRunId||file.advanceId||file.bonusId||file.deductionId||"";return {id:file.id,name:file.name,size:file.size,date:day(file.createdAt),module:moduleLabels.salaries,record:salaryNames.get(recordId)||"ملف مرتبات",href:"/api/salaries/attachments/"+file.id};}),
  ].sort((a,b)=>b.date.localeCompare(a.date));
  return <AttachmentsDirectory rows={rows} />;
}
