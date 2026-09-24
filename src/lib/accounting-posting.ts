import "server-only";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;
type PostingLine = { accountKey: string; debitCents?: number; creditCents?: number; projectId?: string | null; counterpartyType?: string; counterpartyId?: string; description?: string };

const monthOf = (date: Date) => date.toISOString().slice(0, 7);

export async function accountingIsLive(tx: Tx, date: Date) {
  const setting = await tx.systemMetadata.findUnique({ where: { key: "accounting.goLiveDate" } });
  // أثناء بناء النظام يعمل الترحيل الطبيعي فورًا. عند اعتماد تاريخ تشغيل رسمي
  // لاحقًا، يظل قيد التاريخ حاجزًا لحماية البيانات التاريخية قبل ذلك التاريخ.
  return !setting?.value || date >= new Date(`${setting.value}T00:00:00.000Z`);
}

export async function postJournal(tx: Tx, input: { sourceType: string; sourceId: string; entryDate: Date; description: string; actorId: string; projectId?: string | null; lines: PostingLine[] }) {
  if (!(await accountingIsLive(tx, input.entryDate))) return null;
  const existing = await tx.journalEntry.findFirst({ where: { sourceType: input.sourceType, sourceId: input.sourceId } });
  if (existing) return existing;
  const period = await tx.accountingPeriod.upsert({ where: { month: monthOf(input.entryDate) }, update: {}, create: { month: monthOf(input.entryDate) } });
  if (period.status !== "OPEN") throw new Error("الفترة المحاسبية لهذا المستند مقفلة.");
  const debit = input.lines.reduce((sum, line) => sum + (line.debitCents || 0), 0);
  const credit = input.lines.reduce((sum, line) => sum + (line.creditCents || 0), 0);
  if (!Number.isSafeInteger(debit) || debit < 1 || debit !== credit) throw new Error("القيد المحاسبي غير متوازن.");
  if (input.lines.some((line) => (!!line.debitCents) === (!!line.creditCents))) throw new Error("كل سطر محاسبي يجب أن يكون مدينًا أو دائنًا فقط.");
  const accounts = await tx.accountingAccount.findMany({ where: { systemKey: { in: input.lines.map((line) => line.accountKey) }, active: true } });
  const byKey = new Map(accounts.map((account) => [account.systemKey, account]));
  if (byKey.size !== new Set(input.lines.map((line) => line.accountKey)).size) throw new Error("دليل الحسابات المحاسبي غير مكتمل.");
  const id = randomUUID();
  return tx.journalEntry.create({ data: { id, number: `JV-${input.entryDate.toISOString().slice(0, 10).replaceAll("-", "")}-${id.slice(0, 6).toUpperCase()}`, entryDate: input.entryDate, description: input.description, sourceType: input.sourceType, sourceId: input.sourceId, projectId: input.projectId || null, actorId: input.actorId, lines: { create: input.lines.map((line) => ({ accountId: byKey.get(line.accountKey)!.id, debitCents: line.debitCents || 0, creditCents: line.creditCents || 0, projectId: line.projectId || input.projectId || null, counterpartyType: line.counterpartyType || null, counterpartyId: line.counterpartyId || null, description: line.description || null })) } } });
}

const categoryAccounts: Record<string, string> = { workers_daily: "DAILY_LABOR_EXPENSE", project_admin: "PROJECT_ADMIN_EXPENSE", transport: "TRANSPORT_EXPENSE", diesel: "DIESEL_EXPENSE", maintenance: "MAINTENANCE_EXPENSE", hospitality: "HOSPITALITY_EXPENSE", small_purchases: "PURCHASE_COST", tools: "TOOLS_EXPENSE", petty: "GENERAL_EXPENSE", general: "GENERAL_EXPENSE", other: "GENERAL_EXPENSE" };

export async function postPettyCashJournal(tx: Tx, movement: { id: string; type: string; amountCents: number; transactionDate: Date; projectId: string | null; categoryId: string | null; description: string; recordedById: string }) {
  if (["OPENING_BALANCE", "ADJUSTMENT_IN", "ADJUSTMENT_OUT"].includes(movement.type)) return null;
  const category = movement.categoryId ? await tx.pettyCashCategory.findUnique({ where: { id: movement.categoryId } }) : null;
  const expenseKey = categoryAccounts[category?.key || ""] || "GENERAL_EXPENSE";
  const common = { sourceType: "PETTY_CASH", sourceId: movement.id, entryDate: movement.transactionDate, description: movement.description, actorId: movement.recordedById, projectId: movement.projectId };
  if (movement.type === "FUNDING") return postJournal(tx, { ...common, lines: [{ accountKey: "PETTY_CASH", debitCents: movement.amountCents }, { accountKey: "OWNER_FUNDING", creditCents: movement.amountCents }] });
  if (movement.type === "DIRECT_EXPENSE") return postJournal(tx, { ...common, lines: [{ accountKey: expenseKey, debitCents: movement.amountCents }, { accountKey: "PETTY_CASH", creditCents: movement.amountCents }] });
  if (movement.type === "CUSTODY_ISSUE") return postJournal(tx, { ...common, lines: [{ accountKey: "EMPLOYEE_ADVANCES", debitCents: movement.amountCents }, { accountKey: "PETTY_CASH", creditCents: movement.amountCents }] });
  if (movement.type === "CUSTODY_EXPENSE") return postJournal(tx, { ...common, lines: [{ accountKey: expenseKey, debitCents: movement.amountCents }, { accountKey: "EMPLOYEE_ADVANCES", creditCents: movement.amountCents }] });
  if (movement.type === "CUSTODY_RETURN") return postJournal(tx, { ...common, lines: [{ accountKey: "PETTY_CASH", debitCents: movement.amountCents }, { accountKey: "EMPLOYEE_ADVANCES", creditCents: movement.amountCents }] });
  return null;
}

export async function postPurchaseJournal(tx: Tx, invoice: { id: string; totalCents: number; paidCents: number; invoiceDate: Date; name: string; projectId: string; supplierId: string | null; paymentSource: string; stockMode?: string; actorId: string }) {
  const inventory = invoice.stockMode === "WAREHOUSE" || invoice.stockMode === "DIRECT_PROJECT";
  const unpaidCents = invoice.totalCents - invoice.paidCents;
  const lines: PostingLine[] = [{ accountKey: inventory ? "INVENTORY_ASSET" : "PURCHASE_COST", debitCents: invoice.totalCents }];
  if (invoice.paidCents > 0) lines.push({ accountKey: invoice.paymentSource === "PETTY_CASH" ? "PETTY_CASH" : "OWNER_FUNDING", creditCents: invoice.paidCents });
  if (unpaidCents > 0) lines.push({ accountKey: "SUPPLIER_PAYABLE", creditCents: unpaidCents, counterpartyType: "SUPPLIER", counterpartyId: invoice.supplierId || undefined });
  return postJournal(tx, { sourceType: "PURCHASE", sourceId: invoice.id, entryDate: invoice.invoiceDate, description: `فاتورة مشتريات: ${invoice.name}`, actorId: invoice.actorId, projectId: inventory ? null : invoice.projectId, lines });
}

export async function postPurchasePaymentJournal(tx: Tx, payment: { id: string; amountCents: number; paymentDate: Date; paymentSource: string; invoiceName: string; invoiceId: string; projectId: string; supplierId: string | null; actorId: string }) {
  return postJournal(tx, { sourceType: "PURCHASE_PAYMENT", sourceId: payment.id, entryDate: payment.paymentDate, description: `سداد دفعة من فاتورة مشتريات: ${payment.invoiceName}`, actorId: payment.actorId, projectId: null, lines: [{ accountKey: "SUPPLIER_PAYABLE", debitCents: payment.amountCents, counterpartyType: "SUPPLIER", counterpartyId: payment.supplierId || undefined }, { accountKey: payment.paymentSource === "PETTY_CASH" ? "PETTY_CASH" : "OWNER_FUNDING", creditCents: payment.amountCents }] });
}

export async function postStockIssueJournal(tx: Tx, movement: { id: string; movementDate: Date; projectId: string | null; actorId: string; totalCents: number }) {
  if (!movement.projectId || !movement.totalCents) return null;
  return postJournal(tx, { sourceType: "WAREHOUSE_ISSUE", sourceId: movement.id, entryDate: movement.movementDate, description: "صرف خامات من المخزن للمشروع", actorId: movement.actorId, projectId: movement.projectId, lines: [{ accountKey: "PROJECT_MATERIAL_COST", debitCents: movement.totalCents }, { accountKey: "INVENTORY_ASSET", creditCents: movement.totalCents }] });
}

export async function postStockReturnJournal(tx: Tx, movement: { id: string; movementDate: Date; projectId: string | null; actorId: string; totalCents: number }) {
  if (!movement.projectId || !movement.totalCents) return null;
  return postJournal(tx, { sourceType: "WAREHOUSE_RETURN", sourceId: movement.id, entryDate: movement.movementDate, description: "مرتجع خامات من المشروع إلى المخزن", actorId: movement.actorId, projectId: movement.projectId, lines: [{ accountKey: "INVENTORY_ASSET", debitCents: movement.totalCents }, { accountKey: "PROJECT_MATERIAL_COST", creditCents: movement.totalCents }] });
}

type PayrollPostingLine = { employeeId: string; basicCents: number; bonusCents: number; deductionCents: number; advanceCents: number; netCents: number; allocationJson: string };

export async function postPayrollApproval(tx: Tx, run: { id: string; month: string; approvedById: string; lines: PayrollPostingLine[] }) {
  const [year, month] = run.month.split("-").map(Number);
  const entryDate = new Date(Date.UTC(year, month, 0));
  const lines: PostingLine[] = [];
  for (const line of run.lines) {
    const cost = line.basicCents + line.bonusCents - line.deductionCents;
    let allocations: { projectId: string | null; cents: number }[] = [];
    try { allocations = JSON.parse(line.allocationJson); } catch { allocations = []; }
    const base = allocations.reduce((sum, item) => sum + item.cents, 0) || 1;
    let remaining = cost;
    for (const [index, allocation] of allocations.entries()) { const debitCents = index === allocations.length - 1 ? remaining : Math.round(cost * allocation.cents / base); remaining -= debitCents; if (debitCents) lines.push({ accountKey: "PAYROLL_COST", debitCents, projectId: allocation.projectId, counterpartyType: "EMPLOYEE", counterpartyId: line.employeeId }); }
    if (!allocations.length && cost) lines.push({ accountKey: "PAYROLL_COST", debitCents: cost, counterpartyType: "EMPLOYEE", counterpartyId: line.employeeId });
    if (line.netCents) lines.push({ accountKey: "PAYROLL_PAYABLE", creditCents: line.netCents, counterpartyType: "EMPLOYEE", counterpartyId: line.employeeId });
    if (line.advanceCents) lines.push({ accountKey: "EMPLOYEE_ADVANCES", creditCents: line.advanceCents, counterpartyType: "EMPLOYEE", counterpartyId: line.employeeId });
  }
  return postJournal(tx, { sourceType: "PAYROLL_APPROVAL", sourceId: run.id, entryDate, description: `اعتماد كشف رواتب ${run.month}`, actorId: run.approvedById, lines });
}

export async function postPayrollPayment(tx: Tx, run: { id: string; month: string; totalCents: number; paidAt: Date | null; paidById: string | null }) {
  if (!run.paidAt || !run.paidById) throw new Error("بيانات صرف الرواتب غير مكتملة.");
  return postJournal(tx, { sourceType: "PAYROLL_PAYMENT", sourceId: run.id, entryDate: run.paidAt, description: `صرف كشف رواتب ${run.month}`, actorId: run.paidById, lines: [{ accountKey: "PAYROLL_PAYABLE", debitCents: run.totalCents }, { accountKey: "OWNER_FUNDING", creditCents: run.totalCents }] });
}

export async function postExecutiveAdvance(tx: Tx, advance: { id: string; amountCents: number; issuedAt: Date; employeeId: string; note: string | null }, actorId: string) {
  return postJournal(tx, { sourceType: "EMPLOYEE_ADVANCE", sourceId: advance.id, entryDate: advance.issuedAt, description: `سلفة موظف${advance.note ? `: ${advance.note}` : ""}`, actorId, lines: [{ accountKey: "EMPLOYEE_ADVANCES", debitCents: advance.amountCents, counterpartyType: "EMPLOYEE", counterpartyId: advance.employeeId }, { accountKey: "OWNER_FUNDING", creditCents: advance.amountCents }] });
}

type SubcontractDeduction = { name: string; amountCents: number };
type SubcontractApproval = {
  id: string; revision: number; grossCents: number; netCents: number; previousGrossCents: number; executiveApprovedAt: Date | null;
  account: { projectId: string; companyId: string }; deductions: SubcontractDeduction[];
  previousDeductions?: SubcontractDeduction[];
};

function deductionAccount(name: string) {
  return /تأمين|تامين/i.test(name) ? "RETENTION_PAYABLE" : "SUBCONTRACTOR_DEDUCTIONS";
}

async function reverseLatestSourceEntry(tx: Tx, sourceType: string, sourcePrefix: string, entryDate: Date, actorId: string, reason: string) {
  const existing = await tx.journalEntry.findFirst({ where: { sourceType, sourceId: { startsWith: sourcePrefix }, status: "POSTED" }, include: { lines: true, reversalEntry: true }, orderBy: { createdAt: "desc" } });
  if (!existing || existing.reversalEntry) return null;
  const accounts = await tx.accountingAccount.findMany({ where: { id: { in: existing.lines.map((line) => line.accountId) } } });
  const byId = new Map(accounts.map((account) => [account.id, account]));
  return postJournal(tx, { sourceType: `${sourceType}_REVERSAL`, sourceId: existing.id, entryDate, description: `عكس تلقائي: ${reason}`, actorId, projectId: existing.projectId, lines: existing.lines.map((line) => ({ accountKey: byId.get(line.accountId)!.systemKey!, debitCents: line.creditCents, creditCents: line.debitCents, projectId: line.projectId, counterpartyType: line.counterpartyType || undefined, counterpartyId: line.counterpartyId || undefined, description: line.description || undefined })) }).then(async (reversal) => {
    if (reversal) await tx.journalEntry.update({ where: { id: reversal.id }, data: { reversalOfId: existing.id, reversalReason: reason } });
    return reversal;
  });
}

export async function reversePostedJournal(tx: Tx, sourceType: string, sourcePrefix: string, entryDate: Date, actorId: string, reason: string) {
  return reverseLatestSourceEntry(tx, sourceType, sourcePrefix, entryDate, actorId, reason);
}

function signedLine(accountKey: string, amountCents: number, naturalSide: "debit" | "credit", extra: Omit<PostingLine, "accountKey" | "debitCents" | "creditCents"> = {}): PostingLine | null {
  if (!amountCents) return null;
  const positive = amountCents > 0;
  const debit = positive ? naturalSide === "debit" : naturalSide === "credit";
  return { accountKey, ...(debit ? { debitCents: Math.abs(amountCents) } : { creditCents: Math.abs(amountCents) }), ...extra };
}

export async function postSubcontractApproval(tx: Tx, statement: SubcontractApproval, actorId: string) {
  const entryDate = statement.executiveApprovedAt || new Date();
  if (!(await accountingIsLive(tx, entryDate))) return null;
  const grossDelta = statement.grossCents - statement.previousGrossCents;
  const previousByAccount = new Map<string, number>();
  for (const deduction of statement.previousDeductions || []) previousByAccount.set(deductionAccount(deduction.name), (previousByAccount.get(deductionAccount(deduction.name)) || 0) + deduction.amountCents);
  const currentByAccount = new Map<string, number>();
  for (const deduction of statement.deductions) currentByAccount.set(deductionAccount(deduction.name), (currentByAccount.get(deductionAccount(deduction.name)) || 0) + deduction.amountCents);
  const deductionDeltas = [...currentByAccount.entries()].map(([key, amount]) => [key, amount - (previousByAccount.get(key) || 0)] as const).filter(([, amount]) => amount !== 0);
  const netDelta = statement.netCents - (statement.previousGrossCents - [...previousByAccount.values()].reduce((sum, amount) => sum + amount, 0));
  await reverseLatestSourceEntry(tx, "SUBCONTRACT_ACCRUAL", `${statement.id}:`, entryDate, actorId, "إعادة اعتماد مستخلص مقاول بعد تعديل موثق");
  const counterparty = { counterpartyType: "SUBCONTRACTOR", counterpartyId: statement.account.companyId };
  const lines = [signedLine("SUBCONTRACT_COST", grossDelta, "debit", counterparty), signedLine("SUBCONTRACTOR_PAYABLE", netDelta, "credit", counterparty), ...deductionDeltas.map(([accountKey, amount]) => signedLine(accountKey, amount, "credit", counterparty))].filter((line): line is PostingLine => Boolean(line));
  if (!lines.length) return null;
  return postJournal(tx, { sourceType: "SUBCONTRACT_ACCRUAL", sourceId: `${statement.id}:${statement.revision}`, entryDate, description: "استحقاق أعمال مقاول باطن", actorId, projectId: statement.account.projectId, lines });
}

export async function postSubcontractPayment(tx: Tx, payment: { id: string; amountCents: number; paymentDate: Date; actorId: string; statement: { account: { projectId: string; companyId: string } } }) {
  return postJournal(tx, { sourceType: "SUBCONTRACT_PAYMENT", sourceId: payment.id, entryDate: payment.paymentDate, description: "دفعة لمقاول باطن", actorId: payment.actorId, projectId: payment.statement.account.projectId, lines: [{ accountKey: "SUBCONTRACTOR_PAYABLE", debitCents: payment.amountCents, counterpartyType: "SUBCONTRACTOR", counterpartyId: payment.statement.account.companyId }, { accountKey: "OWNER_FUNDING", creditCents: payment.amountCents }] });
}

export async function postIncomingAccrual(tx: Tx, statement: { id: string; grossCents: number; submittedAt: Date; contract: { projectId: string } }, previousGrossCents: number, ownerCompanyId: string, actorId: string) {
  const amountCents = statement.grossCents - previousGrossCents;
  if (amountCents <= 0) throw new Error("الزيادة التراكمية في الجاري الوارد يجب أن تكون موجبة قبل الترحيل.");
  return postJournal(tx, { sourceType: "INCOMING_ACCRUAL", sourceId: statement.id, entryDate: statement.submittedAt, description: "استحقاق أعمال من جهة مالكة", actorId, projectId: statement.contract.projectId, lines: [{ accountKey: "OWNER_RECEIVABLE", debitCents: amountCents, counterpartyType: "OWNER", counterpartyId: ownerCompanyId }, { accountKey: "CONTRACT_REVENUE", creditCents: amountCents, counterpartyType: "OWNER", counterpartyId: ownerCompanyId }] });
}

export async function postOwnerMaterialCertificate(tx: Tx, certificate: { id: string; totalCents: number; createdAt: Date; statement: { contract: { projectId: string } } }, ownerCompanyId: string, actorId: string) {
  const common = { entryDate: certificate.createdAt, actorId, projectId: certificate.statement.contract.projectId, description: "خامات مستلمة من الجهة المالكة" };
  await postJournal(tx, { ...common, sourceType: "OWNER_MATERIAL_RECEIPT", sourceId: certificate.id, lines: [{ accountKey: "OWNER_MATERIALS", debitCents: certificate.totalCents, counterpartyType: "OWNER", counterpartyId: ownerCompanyId }, { accountKey: "OWNER_RECEIVABLE", creditCents: certificate.totalCents, counterpartyType: "OWNER", counterpartyId: ownerCompanyId }] });
  return postJournal(tx, { ...common, sourceType: "OWNER_MATERIAL_COST", sourceId: certificate.id, lines: [{ accountKey: "PROJECT_MATERIAL_COST", debitCents: certificate.totalCents }, { accountKey: "OWNER_MATERIALS", creditCents: certificate.totalCents, counterpartyType: "OWNER", counterpartyId: ownerCompanyId }] });
}

export async function postIncomingCollection(tx: Tx, statement: { id: string; grossCents: number; paidAt: Date | null; contract: { projectId: string }; materials: { totalCents: number }[] }, previousPaidGrossCents: number, ownerCompanyId: string, actorId: string, sourceId = statement.id) {
  if (!statement.paidAt) throw new Error("تاريخ التحصيل غير مكتمل.");
  const cashCents = incomingCollectionCashCents(statement.grossCents, previousPaidGrossCents, statement.materials);
  if (cashCents < 0) throw new Error("صافي التحصيل بعد خصم الخامات لا يمكن أن يكون سالبًا.");
  if (!cashCents) return null;
  return postJournal(tx, { sourceType: "INCOMING_COLLECTION", sourceId, entryDate: statement.paidAt, description: "تحصيل مستخلص من جهة مالكة", actorId, projectId: statement.contract.projectId, lines: [{ accountKey: "BANK", debitCents: cashCents }, { accountKey: "OWNER_RECEIVABLE", creditCents: cashCents, counterpartyType: "OWNER", counterpartyId: ownerCompanyId }] });
}

export function incomingCollectionCashCents(grossCents: number, previousPaidGrossCents: number, materials: { totalCents: number }[]) {
  return grossCents - previousPaidGrossCents - materials.reduce((sum, material) => sum + material.totalCents, 0);
}

const bankExpenseAccounts: Record<string, string> = { diesel: "DIESEL_EXPENSE", workers_daily: "DAILY_LABOR_EXPENSE", transport: "TRANSPORT_EXPENSE", maintenance: "MAINTENANCE_EXPENSE", hospitality: "HOSPITALITY_EXPENSE", tools: "TOOLS_EXPENSE", project_admin: "PROJECT_ADMIN_EXPENSE", general: "GENERAL_EXPENSE", other: "GENERAL_EXPENSE" };

export async function postManualBankJournal(tx: Tx, transaction: { id: string; type: string; amountCents: number; transactionDate: Date; description: string; actorId: string; projectId: string | null; categoryKey: string | null; counterAccountKey: string | null }) {
  if (transaction.type === "INCOMING_COLLECTION" || transaction.type === "OPENING_BALANCE") return null;
  if (transaction.type === "OWNER_FUNDING") return postJournal(tx, { sourceType: "BANK_MOVEMENT", sourceId: transaction.id, entryDate: transaction.transactionDate, description: transaction.description, actorId: transaction.actorId, projectId: transaction.projectId, lines: [{ accountKey: "BANK", debitCents: transaction.amountCents }, { accountKey: "OWNER_FUNDING", creditCents: transaction.amountCents }] });
  if (transaction.type === "MANUAL_DEPOSIT") return postJournal(tx, { sourceType: "BANK_MOVEMENT", sourceId: transaction.id, entryDate: transaction.transactionDate, description: transaction.description, actorId: transaction.actorId, projectId: transaction.projectId, lines: [{ accountKey: "BANK", debitCents: transaction.amountCents }, { accountKey: transaction.counterAccountKey || "OPENING_BALANCE", creditCents: transaction.amountCents }] });
  return postJournal(tx, { sourceType: "BANK_MOVEMENT", sourceId: transaction.id, entryDate: transaction.transactionDate, description: transaction.description, actorId: transaction.actorId, projectId: transaction.projectId, lines: [{ accountKey: bankExpenseAccounts[transaction.categoryKey || ""] || "GENERAL_EXPENSE", debitCents: transaction.amountCents }, { accountKey: "BANK", creditCents: transaction.amountCents }] });
}
