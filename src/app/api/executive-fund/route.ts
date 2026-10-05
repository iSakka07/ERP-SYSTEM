import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { incomingUser, readIncomingFiles } from "@/lib/incoming-server";
import { assertAffectedBalances, balanceForAccount, cents } from "@/lib/petty-cash";
import { postPettyCashJournal, reversePostedJournal } from "@/lib/accounting-posting";
import { completeFinancialOperation, guardFinancialOperation, replayAfterConflict, type FinancialOperationContext } from "@/lib/financial-idempotency";
import { assertMutation } from "@/lib/request-security";
import { arabicErrorMessage } from "@/lib/api-error";
import { getExecutiveFundData } from "@/lib/executive-fund-data";

const allowedManagers = new Set(["admin", "accountant", "executive_director"]);
const json = (body: unknown, status = 200) => NextResponse.json(body, { status });

export async function GET() {
  const user = await incomingUser("pettycash.view");
  if (!user) return json({ error: "غير مصرح" }, 403);
  return json(await getExecutiveFundData(user.can("pettycash.manage") && allowedManagers.has(user.roleKey)));
}

export async function POST(request: Request) {
  const user = await incomingUser("pettycash.manage");
  if (!user || !allowedManagers.has(user.roleKey)) return json({ error: "غير مصرح" }, 403);
  const mutationError = assertMutation(request);
  if (mutationError) return mutationError;
  if (Number(request.headers.get("content-length") || 0) > 11 * 1024 * 1024) return json({ error: "حجم الطلب كبير" }, 413);

  let operationContext: FinancialOperationContext | null = null;
  try {
    const form = await request.formData();
    const value = (key: string) => String(form.get(key) ?? "").trim();
    const action = value("action");
    const files = await readIncomingFiles(form);
    const requestData = Object.fromEntries([...form.entries()].filter(([, item]) => typeof item === "string"));
    const guarded = await guardFinancialOperation(request, { actorId: user.id, operation: `executive-fund.${action}`, requestData, businessData: requestData });
    if ("response" in guarded) return guarded.response;
    const financialContext = guarded.context;
    operationContext = financialContext;

    const result = await prisma.$transaction(async (tx) => {
      await tx.systemMetadata.upsert({ where: { key: "pettycash-write-lock" }, create: { key: "pettycash-write-lock", value: randomUUID() }, update: { value: randomUUID() } });
      const accounts = await tx.pettyCashAccount.findMany();
      const main = accounts.find((item) => item.type === "MAIN" && item.active);
      const executive = accounts.find((item) => item.type === "EXECUTIVE" && item.active);
      if (!main || !executive) throw new Error("لم يتم إعداد الخزنة الرئيسية وصندوق المدير التنفيذي.");
      const movements = await tx.pettyCashTransaction.findMany();

      if (action === "reverse") {
        const id = value("id");
        const reason = value("reason");
        if (reason.length < 2) throw new Error("سبب الإلغاء مطلوب ويجب أن يكون واضحًا.");
        const original = movements.find((item) => item.id === id && item.status === "POSTED" && ["EXECUTIVE_ISSUE", "EXECUTIVE_EXPENSE", "EXECUTIVE_RETURN"].includes(item.type));
        if (!original) throw new Error("الحركة ملغاة بالفعل أو غير موجودة.");
        assertAffectedBalances(movements.filter((item) => item.id !== id), original);
        await reversePostedJournal(tx, "PETTY_CASH", original.id, new Date(), user.id, reason);
        await tx.pettyCashTransaction.update({ where: { id }, data: { status: "REVERSED", reversedAt: new Date(), reversalReason: reason, attachments: { create: files.map((file) => ({ ...file, name: `إثبات الإلغاء - ${file.name}`, actorId: user.id })) } } });
        await tx.auditLog.create({ data: { actorId: user.id, action: "pettycash.executive_reverse", target: id, details: JSON.stringify({ reason, original }) } });
        await completeFinancialOperation(tx, financialContext, { body: { ok: true, id }, entityType: "pettyCashTransaction", entityId: id, summary: { action, amountCents: original.amountCents } });
        return { id };
      }

      if (!['issue', 'expense', 'return'].includes(action)) throw new Error("إجراء غير معروف.");
      const amountCents = cents(value("amount"));
      const rawDate = value("date");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate) || new Date(rawDate).toISOString().slice(0, 10) !== rawDate) throw new Error("التاريخ غير صحيح.");
      const transactionDate = new Date(rawDate);
      const description = value("description");
      if (!description || description.length > 2000) throw new Error("البيان مطلوب وبحد أقصى 2000 حرف.");
      if (!files.length) throw new Error("إثبات الحركة مطلوب.");

      let type = "EXECUTIVE_ISSUE";
      let sourceAccountId: string | null = main.id;
      let destinationAccountId: string | null = executive.id;
      let projectId: string | null = null;
      let categoryId: string | null = null;
      const documentNumber: string | null = value("documentNumber") || null;
      if (action === "expense") {
        type = "EXECUTIVE_EXPENSE";
        sourceAccountId = executive.id;
        destinationAccountId = null;
        const category = await tx.pettyCashCategory.findFirst({ where: { id: value("categoryId"), active: true } });
        if (!category) throw new Error("اختر تصنيفًا نشطًا.");
        if (category.requiresDocument && !documentNumber) throw new Error("رقم المستند مطلوب لهذا التصنيف.");
        categoryId = category.id;
        const allocation = value("allocation");
        if (!['PROJECT', 'GENERAL'].includes(allocation)) throw new Error("حدد جهة التحميل.");
        if (allocation === "PROJECT") {
          const project = await tx.project.findFirst({ where: { id: value("projectId"), active: true } });
          if (!project) throw new Error("اختر مشروعًا صحيحًا.");
          projectId = project.id;
        }
      } else if (action === "return") {
        type = "EXECUTIVE_RETURN";
        sourceAccountId = executive.id;
        destinationAccountId = main.id;
      }

      if (balanceForAccount(movements, sourceAccountId) < amountCents) throw new Error(sourceAccountId === main.id ? "رصيد الخزنة الرئيسية لا يكفي." : "رصيد صندوق المدير التنفيذي لا يكفي.");
      const id = randomUUID();
      const movement = { id, number: `EXF-${id}`, type, status: "POSTED", amountCents, transactionDate, sourceAccountId, destinationAccountId, projectId, categoryId, description, documentNumber, fundingSource: null, recordedById: user.id, linkedEntityType: "EXECUTIVE_FUND" };
      assertAffectedBalances([...movements, movement], movement);
      await tx.pettyCashTransaction.create({ data: { ...movement, attachments: { create: files.map((file) => ({ ...file, actorId: user.id })) } } });
      await postPettyCashJournal(tx, movement);
      await tx.auditLog.create({ data: { actorId: user.id, action: `pettycash.${type.toLowerCase()}`, target: id, details: JSON.stringify(movement) } });
      await completeFinancialOperation(tx, financialContext, { body: { ok: true, id }, entityType: "pettyCashTransaction", entityId: id, summary: { type, amountCents, date: rawDate } });
      return { id };
    }, { maxWait: 10000, timeout: 20000 });
    return json({ ok: true, ...result });
  } catch (error) {
    const replay = await replayAfterConflict(error, operationContext);
    if (replay) return replay;
    return json({ error: arabicErrorMessage(error, "تعذر حفظ حركة صندوق المدير التنفيذي.") }, 400);
  }
}
