import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { incomingUser, readIncomingFiles } from "@/lib/incoming-server";

const itemSchema = z.object({
  name: z.string().trim().min(1).max(300),
  unit: z.string().trim().min(1).max(50),
  quantity: z.number().finite().positive().max(1e9),
  price: z.number().finite().positive().max(1e10),
});

const schema = z.object({
  action: z.literal("invoice"),
  projectId: z.string().trim().min(1),
  supplierId: z.string().trim().optional().nullable(),
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
    const date = new Date(value);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }),
  number: z.string().trim().optional(),
  notes: z.string().trim().max(2000).optional(),
  items: z.array(itemSchema).min(1).max(200),
});

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
    const project = await prisma.project.findFirst({
      where: { id: data.projectId, active: true },
      select: { id: true },
    });
    if (!project) throw new Error("اختر مشروعًا صحيحًا.");
    if (data.supplierId) {
      const supplier = await prisma.company.findFirst({
        where: { id: data.supplierId, active: true, type: "SUPPLIER" },
        select: { id: true },
      });
      if (!supplier) throw new Error("اختر موردًا صحيحًا.");
    }
    const number = data.number?.trim() || nextNumber();
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
    const invoice = await prisma.$transaction(async (tx) => {
      const created = await tx.purchaseInvoice.create({
        data: {
          number,
          projectId: data.projectId,
          supplierId: data.supplierId || null,
          invoiceDate: new Date(data.invoiceDate),
          notes: data.notes || null,
          totalCents,
          actorId: user.id,
          items: { createMany: { data: items } },
        },
      });
      await tx.purchaseAttachment.createMany({
        data: files.map((file) => ({
          ...file,
          entityType: "invoice",
          entityId: created.id,
          actorId: user.id,
        })),
      });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: "purchases.invoice",
          target: created.id,
          details: JSON.stringify({
            input: {
              number,
              projectId: data.projectId,
              supplierId: data.supplierId || null,
              totalCents,
              items: items.length,
            },
          }),
        },
      });
      return created;
    });
    return NextResponse.json({ id: invoice.id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "تعذر حفظ الفاتورة." },
      { status: 400 },
    );
  }
}
