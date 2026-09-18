import { NextResponse } from "next/server";
import { z } from "zod";
import { incomingUser } from "@/lib/incoming-server";
import { prisma } from "@/lib/prisma";
import { postSubcontractApproval, postSubcontractPayment } from "@/lib/accounting-posting";

const payload = z.object({ goLiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

export async function POST(request: Request) {
  const user = await incomingUser("accounting.manage");
  if (!user) return NextResponse.json({ error: "غير مسموح بتحديد تاريخ بدء المحاسبة." }, { status: 403 });
  const parsed = payload.safeParse(await request.json());
  if (!parsed.success || Number.isNaN(Date.parse(`${parsed.data?.goLiveDate}T00:00:00.000Z`))) return NextResponse.json({ error: "تاريخ بدء المحاسبة غير صحيح." }, { status: 400 });
  try {
    await prisma.$transaction(async (tx) => {
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
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر حفظ تاريخ التشغيل." }, { status: 400 });
  }
}
