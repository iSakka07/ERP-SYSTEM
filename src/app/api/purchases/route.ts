import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { incomingUser, readIncomingFiles } from "@/lib/incoming-server";
import { postPurchaseJournal, reversePostedJournal } from "@/lib/accounting-posting";
import { assertBalances, balanceForAccount } from "@/lib/petty-cash";
import { completeFinancialOperation, guardFinancialOperation, replayAfterConflict, type FinancialOperationContext } from "@/lib/financial-idempotency";

const itemSchema = z.object({
  name: z.string().trim().min(1).max(300),
  unit: z.string().trim().min(1).max(50),
  quantity: z.number().finite().positive().max(1e9),
  price: z.number().finite().positive().max(1e10),
});

const invoiceSchema = z.object({
  action: z.literal("invoice"),
  projectId: z.string().trim().min(1),
  supplierId: z.string().trim().optional().nullable(),
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
    const date = new Date(value);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }),
  name: z.string().trim().min(1).max(160),
  notes: z.string().trim().max(2000).optional(),
  paymentSource: z.enum(["EXECUTIVE_DIRECTOR", "PETTY_CASH"]),
  items: z.array(itemSchema).min(1).max(200),
});

const schema = z.discriminatedUnion("action", [
  invoiceSchema,
  z.object({
    action: z.literal("reverse"),
    id: z.string().trim().min(1),
    reason: z.string().trim().min(2).max(1000),
  }),
]);

function cents(value: number) {
  const result = Math.round(value * 100);
  return validCents(result);
}

function validCents(result: number) {
  if (!Number.isSafeInteger(result) || result < 1 || result > 1_000_000_000_000)
    throw new Error("راجع القيمة المالية؛ الحد الأدنى قرش واحد.");
  return result;
}

function nextNumber() {
  const day = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `PUR-${day}-${randomUUID().slice(0, 6).toUpperCase()}`;
}

export async function POST(request: Request) {
  const user = await incomingUser("purchases.manage");
  if (!user) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  let operationContext: FinancialOperationContext | null = null;
  try {
    const origin = request.headers.get("origin");
    const configuredHost = process.env.AUTH_URL ? new URL(process.env.AUTH_URL).host : null;
    if (origin && new URL(origin).host !== request.headers.get("host") && new URL(origin).host !== configuredHost)
      return NextResponse.json({ error: "طلب غير مسموح." }, { status: 403 });
    if (Number(request.headers.get("content-length") || 0) > 11 * 1024 * 1024)
      return NextResponse.json({ error: "حجم الطلب أكبر من الحد المسموح." }, { status: 413 });
    const form = await request.formData();
    const data = schema.parse(JSON.parse(String(form.get("payload") ?? "{}")));
    const files = await readIncomingFiles(form);
    if (!files.length) throw new Error("فاتورة المشتريات تحتاج مرفق إثبات.");
    if (data.action === "reverse") {
      if (!files.length) throw new Error("إلغاء فاتورة المشتريات يحتاج مرفق إثبات.");
      const guarded = await guardFinancialOperation(request, {
        actorId: user.id,
        operation: "purchases.invoice.reverse",
        requestData: data,
        businessData: { id: data.id, reason: data.reason },
      });
      if ("response" in guarded) return guarded.response;
      operationContext = guarded.context;
      const reversed = await prisma.$transaction(async (tx) => {
        const invoice = await tx.purchaseInvoice.findUnique({ where: { id: data.id } });
        if (!invoice || invoice.status !== "POSTED") throw new Error("الفاتورة ملغاة بالفعل أو غير موجودة.");
        if (user.isProjectScoped && !user.projectIds.includes(invoice.projectId)) throw new Error("غير مصرح لهذا المشروع.");
        const reversedAt = new Date();
        await reversePostedJournal(tx, "PURCHASE", invoice.id, reversedAt, user.id, data.reason);
        if (invoice.paymentSource === "PETTY_CASH") {
          const movement = await tx.pettyCashTransaction.findFirst({
            where: { type: "PURCHASE_PAYMENT", documentNumber: invoice.number, status: "POSTED" },
          });
          if (!movement) throw new Error("تعذر إيجاد حركة الصندوق المرتبطة بالفاتورة؛ لا يمكن إلغاؤها بأمان.");
          await tx.pettyCashTransaction.update({
            where: { id: movement.id },
            data: {
              status: "REVERSED",
              reversedAt,
              reversalReason: `إلغاء فاتورة مشتريات: ${data.reason}`,
              attachments: { create: files.map((file) => ({ ...file, name: `إثبات إلغاء فاتورة - ${file.name}`, actorId: user.id })) },
            },
          });
        }
        const updated = await tx.purchaseInvoice.update({ where: { id: invoice.id }, data: { status: "REVERSED", reversedAt, reversalReason: data.reason } });
        await tx.purchaseAttachment.createMany({ data: files.map((file) => ({ ...file, entityType: "invoice", entityId: invoice.id, name: `إثبات إلغاء - ${file.name}`, actorId: user.id })) });
        await tx.auditLog.create({ data: { actorId: user.id, action: "purchases.invoice.reverse", target: invoice.id, details: JSON.stringify({ reason: data.reason, paymentSource: invoice.paymentSource }) } });
        await completeFinancialOperation(tx, operationContext!, { body: { id: invoice.id, status: "REVERSED" }, entityType: "purchaseInvoice", entityId: invoice.id, summary: { number: invoice.number, name: invoice.name, totalCents: invoice.totalCents, action: "reverse" } });
        return updated;
      });
      return NextResponse.json({ id: reversed.id, invoiceStatus: reversed.status });
    }
    const project = await prisma.project.findFirst({
      where: { id: data.projectId, active: true },
      select: { id: true },
    });
    if (!project) throw new Error("اختر مشروعًا صحيحًا.");
    if (user.isProjectScoped && !user.projectIds.includes(project.id)) throw new Error("غير مصرح لهذا المشروع.");
    if (data.supplierId) {
      const supplier = await prisma.company.findFirst({
        where: { id: data.supplierId, active: true, type: "SUPPLIER" },
        select: { id: true },
      });
      if (!supplier) throw new Error("اختر موردًا صحيحًا.");
    }
    const number = nextNumber();
    const exists = await prisma.purchaseInvoice.findUnique({ where: { number } });
    if (exists) throw new Error("رقم فاتورة المشتريات مستخدم بالفعل.");
    const items = data.items.map((item, position) => {
      const unitPriceCents = cents(item.price);
      return {
        position,
        name: item.name,
        unit: item.unit,
        quantity: item.quantity,
        unitPriceCents,
        totalCents: validCents(Math.round(item.quantity * unitPriceCents)),
      };
    });
    const totalCents = items.reduce((sum, item) => {
      const total = sum + item.totalCents;
      if (!Number.isSafeInteger(total) || total > 1_000_000_000_000)
        throw new Error("إجمالي الفاتورة أكبر من الحد المسموح.");
      return total;
    }, 0);
    const guarded = await guardFinancialOperation(request, { actorId: user.id, operation: "purchases.invoice", requestData: data, businessData: { projectId: data.projectId, supplierId: data.supplierId || null, invoiceDate: data.invoiceDate, name: data.name, totalCents, paymentSource: data.paymentSource } });
    if ("response" in guarded) return guarded.response;
    operationContext = guarded.context;
    const invoice = await prisma.$transaction(async (tx) => {
      const created = await tx.purchaseInvoice.create({
        data: {
          number,
          name: data.name,
          projectId: data.projectId,
          supplierId: data.supplierId || null,
          invoiceDate: new Date(data.invoiceDate),
          notes: data.notes || null,
          totalCents,
          paymentSource: data.paymentSource,
          actorId: user.id,
          items: { createMany: { data: items } },
        },
      });
      if (data.paymentSource === "PETTY_CASH") {
        const main = await tx.pettyCashAccount.findFirst({ where: { type: "MAIN", active: true } });
        if (!main) throw new Error("لم يتم إعداد Petty Cash.");
        const movements = await tx.pettyCashTransaction.findMany();
        if (balanceForAccount(movements, main.id) < totalCents) throw new Error("رصيد Petty Cash لا يكفي لسداد الفاتورة.");
        const id = randomUUID();
        const movement = { id, number: `PC-PUR-${id}`, type: "PURCHASE_PAYMENT", amountCents: totalCents, transactionDate: new Date(data.invoiceDate), sourceAccountId: main.id, destinationAccountId: null, projectId: data.projectId, categoryId: null, description: `سداد فاتورة مشتريات: ${data.name}`, documentNumber: number, fundingSource: null, recordedById: user.id, status: "POSTED" };
        assertBalances([...movements, movement]);
        await tx.pettyCashTransaction.create({ data: movement });
      }
      await tx.purchaseAttachment.createMany({
        data: files.map((file) => ({
          ...file,
          entityType: "invoice",
          entityId: created.id,
          actorId: user.id,
        })),
      });
      await postPurchaseJournal(tx, created);
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: "purchases.invoice",
          target: created.id,
          details: JSON.stringify({
            input: {
              number,
              name: data.name,
              projectId: data.projectId,
              supplierId: data.supplierId || null,
              totalCents,
              paymentSource: data.paymentSource,
              items: items.length,
            },
          }),
        },
      });
      await completeFinancialOperation(tx, operationContext!, { body: { id: created.id }, entityType: "purchaseInvoice", entityId: created.id, summary: { number, name: data.name, totalCents, date: data.invoiceDate } });
      return created;
    });
    return NextResponse.json({ id: invoice.id });
  } catch (error) {
    const replay = await replayAfterConflict(error, operationContext); if (replay) return replay;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "تعذر حفظ الفاتورة." },
      { status: 400 },
    );
  }
}
