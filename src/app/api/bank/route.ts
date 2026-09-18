import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { incomingUser, readIncomingFiles } from "@/lib/incoming-server";
import { prisma } from "@/lib/prisma";
import { bankBalance } from "@/lib/bank";
import { postManualBankJournal } from "@/lib/accounting-posting";

const schema = z.object({ type: z.enum(["OWNER_FUNDING", "MANUAL_DEPOSIT", "MANUAL_EXPENSE"]), amount: z.coerce.number().positive().max(10_000_000_000), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), projectId: z.string().optional(), categoryKey: z.string().optional(), counterAccountKey: z.string().optional(), description: z.string().trim().min(2).max(1000), reference: z.string().trim().max(300).optional() });
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
  try {
    const form = await request.formData(); const input = schema.parse(JSON.parse(String(form.get("payload") || "{}"))); const files = await readIncomingFiles(form);
    const result = await prisma.$transaction(async (tx) => {
      const amountCents = Math.round(input.amount * 100); if (!Number.isSafeInteger(amountCents)) throw new Error("راجع القيمة المالية.");
      const account = await tx.bankAccount.upsert({ where: { name: "الحساب البنكي الرئيسي" }, update: { active: true }, create: { name: "الحساب البنكي الرئيسي" } });
      if (input.projectId && !(await tx.project.findFirst({ where: { id: input.projectId, active: true } }))) throw new Error("المشروع غير صحيح.");
      const prior = await tx.bankTransaction.findMany({ select: { type: true, amountCents: true } });
      if (input.type === "MANUAL_EXPENSE" && amountCents > bankBalance(prior)) throw new Error("رصيد البنك لا يكفي لهذه المصروفات.");
      if (input.type === "MANUAL_EXPENSE" && !input.categoryKey) throw new Error("اختر تصنيف المصروف البنكي.");
      if (input.type === "MANUAL_DEPOSIT" && !input.counterAccountKey) throw new Error("اختر الحساب المقابل للتسوية.");
      const id = randomUUID(); const transaction = await tx.bankTransaction.create({ data: { id, number: `BNK-${id.slice(0, 8).toUpperCase()}`, accountId: account.id, type: input.type, amountCents, transactionDate: new Date(`${input.date}T00:00:00.000Z`), projectId: input.projectId || null, categoryKey: input.categoryKey || null, counterAccountKey: input.counterAccountKey || null, description: input.description, reference: input.reference || null, actorId: user.id, attachments: { create: files.map((file) => ({ ...file, actorId: user.id })) } } });
      await postManualBankJournal(tx, transaction);
      await tx.auditLog.create({ data: { actorId: user.id, action: "bank.transaction.create", target: transaction.id, details: JSON.stringify({ type: input.type, amountCents, projectId: input.projectId || null }) } });
      return transaction;
    });
    return json({ ok: true, id: result.id }, 201);
  } catch (error) { return json({ error: error instanceof Error ? error.message : "تعذر حفظ الحركة." }, 400); }
}
