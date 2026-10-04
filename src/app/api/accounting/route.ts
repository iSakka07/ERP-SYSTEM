import { NextResponse } from "next/server";
import { z } from "zod";
import { incomingUser } from "@/lib/incoming-server";
import { prisma } from "@/lib/prisma";
import { postSubcontractApproval, postSubcontractPayment } from "@/lib/accounting-posting";
import { assertMutation } from "@/lib/request-security";
import { arabicErrorMessage } from "@/lib/api-error";
import { completeFinancialOperation, guardFinancialOperation, replayAfterConflict, type FinancialOperationContext } from "@/lib/financial-idempotency";

const payload = z.discriminatedUnion("action", [
  z.object({ action: z.literal("goLive"), goLiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
  z.object({ action: z.literal("closePeriod"), month: z.string().regex(/^\d{4}-\d{2}$/) }),
  z.object({ action: z.literal("reopenPeriod"), month: z.string().regex(/^\d{4}-\d{2}$/), reason: z.string().trim().min(3).max(500) }),
]);

export async function POST(request: Request) {
  const user = await incomingUser("accounting.manage");
  if (!user) return NextResponse.json({ error: "غير مسموح بتحديد تاريخ بدء المحاسبة." }, { status: 403 });
  const mutationError = assertMutation(request);
  if (mutationError) return mutationError;
  const parsed = payload.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "راجع بيانات المحاسبة المطلوبة." }, { status: 400 });
  let operationContext: FinancialOperationContext | null = null;
  try {
    const guarded = await guardFinancialOperation(request, { actorId: user.id, operation: `accounting.${parsed.data.action}`, requestData: parsed.data, businessData: parsed.data });
    if ("response" in guarded) return guarded.response;
    const context = guarded.context;
    operationContext = context;
    await prisma.$transaction(async (tx) => {
      if (parsed.data.action === "closePeriod") {
        const period = await tx.accountingPeriod.upsert({ where: { month: parsed.data.month }, update: { status: "CLOSED", closedAt: new Date(), closedById: user.id, reopenReason: null }, create: { month: parsed.data.month, status: "CLOSED", closedAt: new Date(), closedById: user.id } });
        await tx.auditLog.create({ data: { actorId: user.id, action: "accounting.period.close", target: period.id, details: JSON.stringify({ month: parsed.data.month }) } });
        await completeFinancialOperation(tx, context, { body: { ok: true }, entityType: "accountingPeriod", entityId: period.id, summary: { action: parsed.data.action, month: parsed.data.month } });
        return;
      }
      if (parsed.data.action === "reopenPeriod") {
        const period = await tx.accountingPeriod.findUnique({ where: { month: parsed.data.month } });
        if (!period || period.status !== "CLOSED") throw new Error("هذه الفترة ليست مقفلة.");
        await tx.accountingPeriod.update({ where: { id: period.id }, data: { status: "OPEN", reopenReason: parsed.data.reason } });
        await tx.auditLog.create({ data: { actorId: user.id, action: "accounting.period.reopen", target: period.id, details: JSON.stringify({ month: parsed.data.month, reason: parsed.data.reason }) } });
        await completeFinancialOperation(tx, context, { body: { ok: true }, entityType: "accountingPeriod", entityId: period.id, summary: { action: parsed.data.action, month: parsed.data.month } });
        return;
      }
      if (Number.isNaN(Date.parse(`${parsed.data.goLiveDate}T00:00:00.000Z`))) throw new Error("تاريخ بدء المحاسبة غير صحيح.");
      const current = await tx.systemMetadata.findUnique({ where: { key: "accounting.goLiveDate" } });
      const entries = await tx.journalEntry.count();
      if (entries && current?.value !== parsed.data.goLiveDate) throw new Error("لا يمكن تغيير تاريخ التشغيل بعد إنشاء قيود. استخدم تسوية أو عكسًا موثقًا.");
      await tx.systemMetadata.upsert({ where: { key: "accounting.goLiveDate" }, update: { value: parsed.data.goLiveDate }, create: { key: "accounting.goLiveDate", value: parsed.data.goLiveDate } });
      const start = new Date(`${parsed.data.goLiveDate}T00:00:00.000Z`);
      const statements = await tx.subcontractStatement.findMany({
        where: { stage: { in: ["EXECUTIVE", "ACCOUNTING"] }, executiveApprovedAt: { gte: start } },
        include: { deductions: true, account: { include: { statements: { include: { deductions: true } } } } },
        orderBy: { executiveApprovedAt: "asc" },
      });
      for (const statement of statements) {
        const previous = statement.account.statements.filter((item) => item.sequence < statement.sequence && ["EXECUTIVE", "ACCOUNTING"].includes(item.stage)).sort((a, b) => b.sequence - a.sequence)[0];
        await postSubcontractApproval(tx, { ...statement, previousDeductions: previous?.deductions || [] }, user.id);
      }
      const payments = await tx.subcontractPayment.findMany({ where: { paymentDate: { gte: start } }, include: { statement: { include: { account: true } } }, orderBy: { paymentDate: "asc" } });
      for (const payment of payments) await postSubcontractPayment(tx, payment);
      await tx.auditLog.create({ data: { actorId: user.id, action: "accounting.go_live.set", target: "accounting.goLiveDate", details: JSON.stringify({ previous: current?.value || null, value: parsed.data.goLiveDate, migratedSubcontractStatements: statements.length, migratedSubcontractPayments: payments.length }) } });
      await completeFinancialOperation(tx, context, { body: { ok: true }, entityType: "systemMetadata", entityId: "accounting.goLiveDate", summary: { action: parsed.data.action, goLiveDate: parsed.data.goLiveDate, migratedSubcontractStatements: statements.length, migratedSubcontractPayments: payments.length } });
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const replay = await replayAfterConflict(error, operationContext);
    if (replay) return replay;
    return NextResponse.json({ error: arabicErrorMessage(error, "تعذر حفظ إعدادات المحاسبة. حاول مرة أخرى.") }, { status: 400 });
  }
}
