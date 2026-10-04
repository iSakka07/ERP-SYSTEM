import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { assertBalances, balanceForAccount } from "@/lib/petty-cash";
import { postPettyCashJournal, reversePostedJournal } from "@/lib/accounting-posting";

type Tx = Prisma.TransactionClient;
export type PaymentSource = "EXECUTIVE_DIRECTOR" | "PETTY_CASH" | "EMPLOYEE_CUSTODY";

export async function fundMainCash(tx: Tx, input: { amountCents: number; date: Date; actorId: string; projectId?: string | null; documentNumber: string; description: string; operationId?: string }) {
  const main = await tx.pettyCashAccount.findFirst({ where: { type: "MAIN", active: true }, include: { employee: true } });
  if (!main) throw new Error("لم يتم إعداد الخزنة الرئيسية.");
  const id = randomUUID(); const operationId = input.operationId || randomUUID();
  const funding = { id, number: `PC-FUND-${id}`, type: "FUNDING", status: "POSTED", amountCents: input.amountCents, transactionDate: input.date, sourceAccountId: null, destinationAccountId: main.id, projectId: input.projectId || null, categoryId: null, description: `تمويل من المدير التنفيذي: ${input.description}`, documentNumber: input.documentNumber, fundingSource: "EXECUTIVE_DIRECTOR", recordedById: input.actorId, operationId, linkedEntityType: "SETTLEMENT" };
  await tx.pettyCashTransaction.create({ data: funding });
  await postPettyCashJournal(tx, funding);
  return { main, operationId };
}

/** Creates the cash-ledger trail for a settlement.  The caller owns the
 * business journal (payable/cost -> PETTY_CASH), avoiding duplicate cost. */
export async function settleThroughMainCash(tx: Tx, input: {
  source: PaymentSource; amountCents: number; date: Date; actorId: string;
  projectId?: string | null; documentNumber: string; description: string;
  operationId?: string; accountId?: string | null;
}) {
  const main = await tx.pettyCashAccount.findFirst({ where: { type: "MAIN", active: true }, include: { employee: true } });
  if (!main) throw new Error("لم يتم إعداد الخزنة الرئيسية.");
  const existing = await tx.pettyCashTransaction.findMany();
  const operationId = input.operationId || randomUUID();
  const movements: Array<Record<string, unknown>> = [];
  const sourceAccount = input.source === "EMPLOYEE_CUSTODY"
    ? await tx.pettyCashAccount.findFirst({ where: { id: input.accountId || "", type: "EMPLOYEE", active: true }, include: { employee: true } })
    : main;
  if (input.source === "EMPLOYEE_CUSTODY" && !sourceAccount)
    throw new Error("اختر عهدة موظف نشطة وصحيحة.");
  if (!sourceAccount) throw new Error("تعذر تحديد حساب الصرف.");
  if (input.source === "EXECUTIVE_DIRECTOR") {
    const id = randomUUID();
    const funding = { id, number: `PC-FUND-${id}`, type: "FUNDING", status: "POSTED", amountCents: input.amountCents, transactionDate: input.date, sourceAccountId: null, destinationAccountId: main.id, projectId: input.projectId || null, categoryId: null, description: `تمويل من المدير التنفيذي لصرف: ${input.description}`, documentNumber: input.documentNumber, fundingSource: "EXECUTIVE_DIRECTOR", recordedById: input.actorId, operationId, linkedEntityType: "SETTLEMENT" };
    movements.push(funding);
    await tx.pettyCashTransaction.create({ data: funding });
    await postPettyCashJournal(tx, funding);
  }
  if (input.source !== "EXECUTIVE_DIRECTOR" && balanceForAccount(existing, sourceAccount.id) < input.amountCents)
    throw new Error(input.source === "EMPLOYEE_CUSTODY" ? "رصيد عهدة الموظف لا يكفي لإتمام الصرف." : "رصيد الخزنة الرئيسية لا يكفي لإتمام الصرف.");
  const id = randomUUID();
  const payout = { id, number: `PC-OUT-${id}`, type: "SETTLEMENT_PAYMENT", status: "POSTED", amountCents: input.amountCents, transactionDate: input.date, sourceAccountId: sourceAccount.id, destinationAccountId: null, projectId: input.projectId || null, categoryId: null, description: `${input.source === "EMPLOYEE_CUSTODY" ? `صرف من عهدة ${sourceAccount.employee?.name || sourceAccount.name}` : "صرف من الخزنة"}: ${input.description}`, documentNumber: input.documentNumber, fundingSource: null, recordedById: input.actorId, operationId, linkedEntityType: input.source === "EMPLOYEE_CUSTODY" ? "PURCHASE_EMPLOYEE_CUSTODY" : "SETTLEMENT" };
  assertBalances([...existing, ...movements, payout] as never[]);
  await tx.pettyCashTransaction.create({ data: payout });
  return { main, operationId, payoutId: id };
}

export async function reverseCashSettlement(tx: Tx, operationId: string, actorId: string, reason: string) {
  const rows = await tx.pettyCashTransaction.findMany({ where: { operationId, status: "POSTED" } });
  const reversedAt = new Date();
  for (const row of rows) {
    if (row.type === "FUNDING") await reversePostedJournal(tx, "PETTY_CASH", row.id, reversedAt, actorId, reason);
    await tx.pettyCashTransaction.update({ where: { id: row.id }, data: { status: "REVERSED", reversedAt, reversalReason: reason } });
  }
}
