import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { incomingUser, readIncomingFiles } from "@/lib/incoming-server";
import { prisma } from "@/lib/prisma";
import { bankBalance } from "@/lib/bank";
import { postManualBankJournal, reversePostedJournal } from "@/lib/accounting-posting";
import { completeFinancialOperation, guardFinancialOperation, replayAfterConflict, type FinancialOperationContext } from "@/lib/financial-idempotency";
import { isTrustedMutationOrigin } from "@/lib/request-security";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create").default("create"), type: z.enum(["OWNER_FUNDING", "MANUAL_DEPOSIT", "MANUAL_EXPENSE"]), amount: z.coerce.number().positive().max(10_000_000_000), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), projectId: z.string().optional(), categoryKey: z.string().optional(), counterAccountKey: z.string().optional(), description: z.string().trim().min(2).max(1000), reference: z.string().trim().max(300).optional() }),
  z.object({ action: z.literal("reverse"), id: z.string().trim().min(1), reason: z.string().trim().min(2).max(1000) }),
]);
const json = (body: unknown, status = 200) => NextResponse.json(body, { status });

export async function GET() {
  if (!(await incomingUser("bank.view"))) return json({ error: "غير مصرح" }, 403);
  const [account, transactions, projects, canManage] = await Promise.all([
    prisma.bankAccount.findFirst({ where: { active: true }, orderBy: { createdAt: "asc" } }),
    prisma.bankTransaction.findMany({ include: { project: { select: { id: true, name: true } }, actor: { select: { name: true } }, attachments: { select: { id: true, name: true } } }, orderBy: [{ transactionDate: "asc" }, { createdAt: "asc" }] }),
    prisma.project.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    incomingUser("bank.manage"),
  ]);
  return json({ account, transactions, projects, balanceCents: bankBalance(transactions), canManage: !!canManage });
}

export async function POST(request: Request) {
  const user = await incomingUser("bank.manage"); if (!user) return json({ error: "غير مصرح" }, 403);
  if (!isTrustedMutationOrigin(request)) return json({ error: "مصدر الطلب غير موثوق." }, 403);
  let operationContext: FinancialOperationContext | null = null;
  try {
    const form = await request.formData(); const input = schema.parse({ action: "create", ...JSON.parse(String(form.get("payload") || "{}")) }); const files = await readIncomingFiles(form);
    const guarded = await guardFinancialOperation(request, { actorId: user.id, operation: input.action === "reverse" ? "bank.transaction.reverse" : "bank.transaction", requestData: input, businessData: input });
    if ("response" in guarded) return guarded.response;
    operationContext = guarded.context;
    const result = await prisma.$transaction(async (tx) => {
      if (input.action === "reverse") {
        if (!files.length) throw new Error("إلغاء حركة البنك يحتاج مرفق إثبات.");
        const transaction = await tx.bankTransaction.findUnique({ where: { id: input.id } });
        if (!transaction || transaction.status !== "POSTED") throw new Error("الحركة ملغاة بالفعل أو غير موجودة.");
        if (transaction.sourceType || !["OWNER_FUNDING", "MANUAL_DEPOSIT", "MANUAL_EXPENSE"].includes(transaction.type)) throw new Error("هذه الحركة مرتبطة بدورة مالية أخرى وتُلغى من موديولها الأصلي.");
        const reversedAt = new Date();
        await reversePostedJournal(tx, "BANK_MOVEMENT", transaction.id, reversedAt, user.id, input.reason);
        await tx.bankTransaction.update({ where: { id: transaction.id }, data: { status: "REVERSED", reversedAt, reversalReason: input.reason, attachments: { create: files.map((file) => ({ ...file, name: `إثبات إلغاء - ${file.name}`, actorId: user.id })) } } });
        await tx.auditLog.create({ data: { actorId: user.id, action: "bank.transaction.reverse", target: transaction.id, details: JSON.stringify({ reason: input.reason }) } });
        await completeFinancialOperation(tx, operationContext!, { body: { ok: true, id: transaction.id, transactionStatus: "REVERSED" }, entityType: "bankTransaction", entityId: transaction.id, summary: { number: transaction.number, amountCents: transaction.amountCents, action: "reverse" } });
        return transaction;
      }
      const amountCents = Math.round(input.amount * 100); if (!Number.isSafeInteger(amountCents)) throw new Error("راجع القيمة المالية.");
      const account = await tx.bankAccount.upsert({ where: { name: "الحساب البنكي الرئيسي" }, update: { active: true }, create: { name: "الحساب البنكي الرئيسي" } });
      if (input.projectId && !(await tx.project.findFirst({ where: { id: input.projectId, active: true } }))) throw new Error("المشروع غير صحيح.");
      const prior = await tx.bankTransaction.findMany({ select: { type: true, amountCents: true, status: true } });
      if (input.type === "MANUAL_EXPENSE" && amountCents > bankBalance(prior)) throw new Error("رصيد البنك لا يكفي لهذه المصروفات.");
      if (input.type === "MANUAL_EXPENSE" && !input.categoryKey) throw new Error("اختر تصنيف المصروف البنكي.");
      if (input.type === "MANUAL_DEPOSIT" && !input.counterAccountKey) throw new Error("اختر الحساب المقابل للتسوية.");
      const id = randomUUID(); const transaction = await tx.bankTransaction.create({ data: { id, number: `BNK-${id.slice(0, 8).toUpperCase()}`, accountId: account.id, type: input.type, amountCents, transactionDate: new Date(`${input.date}T00:00:00.000Z`), projectId: input.projectId || null, categoryKey: input.categoryKey || null, counterAccountKey: input.counterAccountKey || null, description: input.description, reference: input.reference || null, actorId: user.id, attachments: { create: files.map((file) => ({ ...file, actorId: user.id })) } } });
      await postManualBankJournal(tx, transaction);
      await tx.auditLog.create({ data: { actorId: user.id, action: "bank.transaction.create", target: transaction.id, details: JSON.stringify({ type: input.type, amountCents, projectId: input.projectId || null }) } });
      await completeFinancialOperation(tx, operationContext!, { status: 201, body: { ok: true, id: transaction.id }, entityType: "bankTransaction", entityId: transaction.id, summary: { number: transaction.number, amountCents, date: input.date, type: input.type } });
      return transaction;
    });
    return json({ ok: true, id: result.id }, input.action === "reverse" ? 200 : 201);
  } catch (error) { const replay = await replayAfterConflict(error, operationContext); if (replay) return replay; return json({ error: error instanceof Error ? error.message : "تعذر حفظ الحركة." }, 400); }
}
