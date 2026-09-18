import "server-only";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;
type PostingLine = { accountKey: string; debitCents?: number; creditCents?: number; projectId?: string | null; counterpartyType?: string; counterpartyId?: string; description?: string };

const monthOf = (date: Date) => date.toISOString().slice(0, 7);

export async function accountingIsLive(tx: Tx, date: Date) {
  const setting = await tx.systemMetadata.findUnique({ where: { key: "accounting.goLiveDate" } });
  return !!setting?.value && date >= new Date(`${setting.value}T00:00:00.000Z`);
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

export async function postPurchaseJournal(tx: Tx, invoice: { id: string; totalCents: number; invoiceDate: Date; name: string; projectId: string; paymentSource: string; actorId: string }) {
  return postJournal(tx, { sourceType: "PURCHASE", sourceId: invoice.id, entryDate: invoice.invoiceDate, description: `فاتورة مشتريات: ${invoice.name}`, actorId: invoice.actorId, projectId: invoice.projectId, lines: [{ accountKey: "PURCHASE_COST", debitCents: invoice.totalCents }, { accountKey: invoice.paymentSource === "PETTY_CASH" ? "PETTY_CASH" : "OWNER_FUNDING", creditCents: invoice.totalCents }] });
}
