import { NextResponse } from "next/server";
import { z } from "zod";
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
  invoiceDate: z.string().trim().min(1),
  number: z.string().trim().optional(),
  notes: z.string().trim().max(2000).optional(),
  items: z.array(itemSchema).min(1).max(200),
});

function cents(value: number) {
  return Math.round(value * 100);
}

async function nextNumber() {
  const count = await prisma.purchaseInvoice.count();
  return `PUR-${String(count + 1).padStart(5, "0")}`;
}

export async function POST(request: Request) {
  const user = await incomingUser("purchases.manage");
  if (!user) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  try {
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
    const number = data.number?.trim() || (await nextNumber());
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
        totalCents: Math.round(item.quantity * unitPriceCents),
      };
    });
    const totalCents = items.reduce((sum, item) => sum + item.totalCents, 0);
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
