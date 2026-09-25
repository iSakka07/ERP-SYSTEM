import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { incomingUser, readIncomingFiles } from "@/lib/incoming-server";
import {
  postPurchaseJournal,
  postPurchasePaymentJournal,
  postStockIssueJournal,
  reversePostedJournal,
} from "@/lib/accounting-posting";
import { assertBalances, balanceForAccount } from "@/lib/petty-cash";
import {
  completeFinancialOperation,
  guardFinancialOperation,
  replayAfterConflict,
  type FinancialOperationContext,
} from "@/lib/financial-idempotency";

const itemSchema = z.object({
  inventoryItemId: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).max(300),
  unit: z.string().trim().min(1).max(50),
  quantity: z.number().finite().positive().max(1e9),
  receivedQuantity: z.number().finite().min(0).max(1e9).optional(),
  price: z.number().finite().positive().max(1e10),
});

const invoiceSchema = z.object({
  action: z.literal("invoice"),
  projectId: z.string().trim().min(1),
  supplierId: z.string().trim().optional().nullable(),
  invoiceDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((value) => {
      const date = new Date(value);
      return (
        !Number.isNaN(date.getTime()) &&
        date.toISOString().slice(0, 10) === value
      );
    }),
  name: z.string().trim().min(1).max(160),
  notes: z.string().trim().max(2000).optional(),
  paymentSource: z.enum(["EXECUTIVE_DIRECTOR", "PETTY_CASH"]),
  paidAmount: z.number().finite().min(0).max(1e10),
  stockMode: z
    .enum(["WAREHOUSE", "DIRECT_PROJECT", "LEGACY_DIRECT"])
    .default("LEGACY_DIRECT"),
  warehouseId: z.string().trim().optional().nullable(),
  items: z.array(itemSchema).min(1).max(200),
});

const schema = z.discriminatedUnion("action", [
  invoiceSchema,
  z.object({
    action: z.literal("reverse"),
    id: z.string().trim().min(1),
    reason: z.string().trim().min(2).max(1000),
  }),
  z.object({
    action: z.literal("payment"),
    id: z.string().trim().min(1),
    amount: z.number().finite().positive().max(1e10),
    paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    paymentSource: z.enum(["EXECUTIVE_DIRECTOR", "PETTY_CASH"]),
    notes: z.string().trim().max(1000).optional(),
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
    const configuredHost = process.env.AUTH_URL
      ? new URL(process.env.AUTH_URL).host
      : null;
    if (
      origin &&
      new URL(origin).host !== request.headers.get("host") &&
      new URL(origin).host !== configuredHost
    )
      return NextResponse.json({ error: "طلب غير مسموح." }, { status: 403 });
    if (Number(request.headers.get("content-length") || 0) > 11 * 1024 * 1024)
      return NextResponse.json(
        { error: "حجم الطلب أكبر من الحد المسموح." },
        { status: 413 },
      );
    const form = await request.formData();
    const data = schema.parse(JSON.parse(String(form.get("payload") ?? "{}")));
    if (
      data.action === "invoice" &&
      data.items.some(
        (item) =>
          !Number.isInteger(item.quantity) ||
          (item.receivedQuantity !== undefined &&
            (!Number.isInteger(item.receivedQuantity) ||
              item.receivedQuantity > item.quantity)),
      )
    )
      throw new Error(
        "راجع الكميات؛ كمية الاستلام يجب أن تكون رقمًا صحيحًا ولا تتجاوز كمية الفاتورة.",
      );
    if (
      data.action === "invoice" &&
      data.stockMode !== "LEGACY_DIRECT" &&
      data.items.some((item) => item.receivedQuantity === undefined)
    )
      throw new Error(
        "حدد الكمية المستلمة الآن لكل بند، واكتب 0 إذا لم يصل البند بعد.",
      );
    if (
      data.action === "payment" &&
      new Date(data.paymentDate).toISOString().slice(0, 10) !== data.paymentDate
    )
      throw new Error("تاريخ السداد غير صحيح.");
    if (
      data.action === "invoice" &&
      Math.abs(Math.round(data.paidAmount * 100) - data.paidAmount * 100) > 1e-7
    )
      throw new Error("المبلغ المسدد يجب ألا يزيد عن منزلتين عشريتين.");
    const files = await readIncomingFiles(form);
    if (!files.length)
      throw new Error(
        data.action === "payment"
          ? "سداد المورد يحتاج مرفق إثبات."
          : data.action === "reverse"
            ? "إلغاء فاتورة المشتريات يحتاج مرفق إثبات."
            : "فاتورة المشتريات تحتاج مرفق إثبات.",
      );
    if (data.action === "reverse") {
      const guarded = await guardFinancialOperation(request, {
        actorId: user.id,
        operation: "purchases.invoice.reverse",
        requestData: data,
        businessData: { id: data.id, reason: data.reason },
      });
      if ("response" in guarded) return guarded.response;
      operationContext = guarded.context;
      const reversed = await prisma.$transaction(async (tx) => {
        const invoice = await tx.purchaseInvoice.findUnique({
          where: { id: data.id },
          include: {
            stockMovements: { select: { id: true } },
            payments: { where: { status: "POSTED" } },
          },
        });
        if (!invoice || invoice.status !== "POSTED")
          throw new Error("الفاتورة ملغاة بالفعل أو غير موجودة.");
        if (invoice.stockMovements.length)
          throw new Error(
            "لا يمكن إلغاء فاتورة لها حركات مخزن. اعكس حركات المخزن أولًا للحفاظ على الأرصدة.",
          );
        if (
          user.isProjectScoped &&
          !user.projectIds.includes(invoice.projectId)
        )
          throw new Error("غير مصرح لهذا المشروع.");
        const reversedAt = new Date();
        await reversePostedJournal(
          tx,
          "PURCHASE",
          invoice.id,
          reversedAt,
          user.id,
          data.reason,
        );
        for (const payment of invoice.payments)
          await reversePostedJournal(
            tx,
            "PURCHASE_PAYMENT",
            payment.id,
            reversedAt,
            user.id,
            data.reason,
          );
        await tx.purchasePayment.updateMany({
          where: { invoiceId: invoice.id, status: "POSTED" },
          data: { status: "REVERSED", reversedAt, reversalReason: data.reason },
        });
        const cashReferences = [
          invoice.number,
          ...invoice.payments
            .filter((payment) => payment.paymentSource === "PETTY_CASH")
            .map((payment) => payment.number),
        ];
        const pettyMovements = await tx.pettyCashTransaction.findMany({
          where: {
            type: "PURCHASE_PAYMENT",
            documentNumber: { in: cashReferences },
            status: "POSTED",
          },
        });
        if (
          invoice.paymentSource === "PETTY_CASH" &&
          invoice.paidCents > 0 &&
          !pettyMovements.some(
            (movement) => movement.documentNumber === invoice.number,
          )
        )
          throw new Error(
            "تعذر إيجاد حركة الصندوق المرتبطة بالفاتورة؛ لا يمكن إلغاؤها بأمان.",
          );
        for (const movement of pettyMovements)
          await tx.pettyCashTransaction.update({
            where: { id: movement.id },
            data: {
              status: "REVERSED",
              reversedAt,
              reversalReason: `إلغاء فاتورة مشتريات: ${data.reason}`,
              attachments: {
                create: files.map((file) => ({
                  ...file,
                  name: `إثبات إلغاء فاتورة - ${file.name}`,
                  actorId: user.id,
                })),
              },
            },
          });
        const updated = await tx.purchaseInvoice.update({
          where: { id: invoice.id },
          data: { status: "REVERSED", reversedAt, reversalReason: data.reason },
        });
        await tx.purchaseAttachment.createMany({
          data: files.map((file) => ({
            ...file,
            entityType: "invoice",
            entityId: invoice.id,
            name: `إثبات إلغاء - ${file.name}`,
            actorId: user.id,
          })),
        });
        await tx.auditLog.create({
          data: {
            actorId: user.id,
            action: "purchases.invoice.reverse",
            target: invoice.id,
            details: JSON.stringify({
              reason: data.reason,
              paymentSource: invoice.paymentSource,
            }),
          },
        });
        await completeFinancialOperation(tx, operationContext!, {
          body: { id: invoice.id, status: "REVERSED" },
          entityType: "purchaseInvoice",
          entityId: invoice.id,
          summary: {
            number: invoice.number,
            name: invoice.name,
            totalCents: invoice.totalCents,
            action: "reverse",
          },
        });
        return updated;
      });
      return NextResponse.json({
        id: reversed.id,
        invoiceStatus: reversed.status,
      });
    }
    if (data.action === "payment") {
      const amountCents = validCents(Math.round(data.amount * 100));
      if (Math.abs(amountCents - data.amount * 100) > 1e-7)
        throw new Error("مبلغ الدفعة يجب ألا يزيد عن منزلتين عشريتين.");
      const guarded = await guardFinancialOperation(request, {
        actorId: user.id,
        operation: "purchases.invoice.payment",
        requestData: data,
        businessData: {
          id: data.id,
          amountCents,
          paymentDate: data.paymentDate,
          paymentSource: data.paymentSource,
        },
      });
      if ("response" in guarded) return guarded.response;
      operationContext = guarded.context;
      const payment = await prisma.$transaction(async (tx) => {
        const invoice = await tx.purchaseInvoice.findUnique({
          where: { id: data.id },
          include: { supplier: true },
        });
        if (!invoice || invoice.status !== "POSTED")
          throw new Error("الفاتورة غير متاحة للسداد.");
        if (
          user.isProjectScoped &&
          !user.projectIds.includes(invoice.projectId)
        )
          throw new Error("غير مصرح لهذا المشروع.");
        if (!invoice.paymentTrackingStarted)
          throw new Error(
            "هذه فاتورة تاريخية غير مفعّل عليها تتبع الدفعات؛ راجع الإدارة المالية قبل تسجيل دفعة إضافية.",
          );
        const remaining = invoice.totalCents - invoice.paidCents;
        if (amountCents > remaining)
          throw new Error("قيمة الدفعة أكبر من المتبقي على الفاتورة.");
        const updated = await tx.purchaseInvoice.updateMany({
          where: {
            id: invoice.id,
            status: "POSTED",
            paymentTrackingStarted: true,
            paidCents: { lte: invoice.totalCents - amountCents },
          },
          data: { paidCents: { increment: amountCents } },
        });
        if (updated.count !== 1)
          throw new Error(
            "تم تسجيل دفعة أخرى بالتزامن؛ حدّث الفاتورة وراجع المتبقي.",
          );
        const number = `PAY-${randomUUID().slice(0, 8).toUpperCase()}`;
        const created = await tx.purchasePayment.create({
          data: {
            invoiceId: invoice.id,
            number,
            amountCents,
            paymentDate: new Date(data.paymentDate),
            paymentSource: data.paymentSource,
            notes: data.notes || null,
            actorId: user.id,
          },
        });
        if (data.paymentSource === "PETTY_CASH") {
          const main = await tx.pettyCashAccount.findFirst({
            where: { type: "MAIN", active: true },
          });
          if (!main) throw new Error("لم يتم إعداد صندوق النثريات.");
          const movements = await tx.pettyCashTransaction.findMany();
          if (balanceForAccount(movements, main.id) < amountCents)
            throw new Error("رصيد صندوق النثريات لا يكفي لسداد الدفعة.");
          const id = randomUUID();
          const movement = {
            id,
            number: `PC-PUR-${id}`,
            type: "PURCHASE_PAYMENT",
            amountCents,
            transactionDate: new Date(data.paymentDate),
            sourceAccountId: main.id,
            destinationAccountId: null,
            projectId: invoice.projectId,
            categoryId: null,
            description: `دفعة مورد عن فاتورة: ${invoice.name}`,
            documentNumber: number,
            fundingSource: null,
            recordedById: user.id,
            status: "POSTED",
          };
          assertBalances([...movements, movement]);
          await tx.pettyCashTransaction.create({ data: movement });
        }
        await postPurchasePaymentJournal(tx, {
          id: created.id,
          amountCents,
          paymentDate: created.paymentDate,
          paymentSource: data.paymentSource,
          invoiceName: invoice.name,
          invoiceId: invoice.id,
          projectId: invoice.projectId,
          supplierId: invoice.supplierId,
          actorId: user.id,
        });
        await tx.purchaseAttachment.createMany({
          data: files.map((file) => ({
            ...file,
            entityType: "invoice",
            entityId: invoice.id,
            name: `إثبات دفعة ${number} - ${file.name}`,
            actorId: user.id,
          })),
        });
        await tx.auditLog.create({
          data: {
            actorId: user.id,
            action: "purchases.invoice.payment",
            target: invoice.id,
            details: JSON.stringify({
              paymentId: created.id,
              number,
              amountCents,
              paymentSource: data.paymentSource,
              paymentDate: data.paymentDate,
            }),
          },
        });
        await completeFinancialOperation(tx, operationContext!, {
          body: {
            id: created.id,
            number,
            paidCents: invoice.paidCents + amountCents,
          },
          entityType: "purchasePayment",
          entityId: created.id,
          summary: {
            number,
            invoiceNumber: invoice.number,
            amountCents,
            totalCents: invoice.totalCents,
          },
        });
        return created;
      });
      return NextResponse.json(
        { id: payment.id, number: payment.number },
        { status: 201 },
      );
    }
    const project = await prisma.project.findFirst({
      where: { id: data.projectId, active: true },
      select: { id: true, code: true, name: true },
    });
    if (!project) throw new Error("اختر مشروعًا صحيحًا.");
    if (user.isProjectScoped && !user.projectIds.includes(project.id))
      throw new Error("غير مصرح لهذا المشروع.");
    if (data.supplierId) {
      const supplier = await prisma.company.findFirst({
        where: { id: data.supplierId, active: true, type: "SUPPLIER" },
        select: { id: true },
      });
      if (!supplier) throw new Error("اختر موردًا صحيحًا.");
    }
    if (data.stockMode !== "LEGACY_DIRECT") {
      const warehouse = await prisma.warehouse.findFirst({
        where: { id: data.warehouseId || "", active: true },
        select: { id: true },
      });
      if (!warehouse) throw new Error("اختر مخزنًا صحيحًا لاستلام الخامات.");
      if (data.items.some((item) => !item.inventoryItemId))
        throw new Error("اختر صنفًا مخزنيًا لكل بند قبل تسجيل الفاتورة.");
    }
    const requestedItemIds = [
      ...new Set(
        data.items.flatMap((item) =>
          item.inventoryItemId ? [item.inventoryItemId] : [],
        ),
      ),
    ];
    const selectedInventoryItems = requestedItemIds.length
      ? await prisma.inventoryItem.findMany({
          where: { id: { in: requestedItemIds }, active: true },
          select: { id: true, name: true, unit: true },
        })
      : [];
    const inventoryItemsById = new Map(
      selectedInventoryItems.map((item) => [item.id, item]),
    );
    if (selectedInventoryItems.length !== requestedItemIds.length)
      throw new Error(
        "أحد الأصناف المخزنية غير متاح؛ حدّث الاختيار وحاول مرة أخرى.",
      );
    const number = nextNumber();
    const exists = await prisma.purchaseInvoice.findUnique({
      where: { number },
    });
    if (exists) throw new Error("رقم فاتورة المشتريات مستخدم بالفعل.");
    const items = data.items.map((item, position) => {
      const unitPriceCents = cents(item.price);
      return {
        id: randomUUID(),
        position,
        name: item.inventoryItemId
          ? inventoryItemsById.get(item.inventoryItemId)!.name
          : item.name,
        unit: item.inventoryItemId
          ? inventoryItemsById.get(item.inventoryItemId)!.unit
          : item.unit,
        quantity: item.quantity,
        unitPriceCents,
        totalCents: validCents(Math.round(item.quantity * unitPriceCents)),
        ...(item.inventoryItemId
          ? { inventoryItemId: item.inventoryItemId }
          : {}),
      };
    });
    const totalCents = items.reduce((sum, item) => {
      const total = sum + item.totalCents;
      if (!Number.isSafeInteger(total) || total > 1_000_000_000_000)
        throw new Error("إجمالي الفاتورة أكبر من الحد المسموح.");
      return total;
    }, 0);
    const paidCents = Math.round(data.paidAmount * 100);
    if (!Number.isSafeInteger(paidCents) || paidCents > totalCents)
      throw new Error("المبلغ المسدد لا يمكن أن يتجاوز إجمالي الفاتورة.");
    const guarded = await guardFinancialOperation(request, {
      actorId: user.id,
      operation: "purchases.invoice",
      requestData: data,
      businessData: {
        projectId: data.projectId,
        supplierId: data.supplierId || null,
        invoiceDate: data.invoiceDate,
        name: data.name,
        totalCents,
        paidCents,
        paymentSource: data.paymentSource,
        stockMode: data.stockMode,
        receivedQuantities: data.items.map(
          (item) => item.receivedQuantity ?? 0,
        ),
      },
    });
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
          paidCents,
          paymentTrackingStarted: true,
          paymentSource: data.paymentSource,
          stockMode: data.stockMode,
          warehouseId:
            data.stockMode === "LEGACY_DIRECT" ? null : data.warehouseId,
          actorId: user.id,
          items: { createMany: { data: items } },
        },
      });
      if (data.paymentSource === "PETTY_CASH" && paidCents > 0) {
        const main = await tx.pettyCashAccount.findFirst({
          where: { type: "MAIN", active: true },
        });
        if (!main) throw new Error("لم يتم إعداد صندوق النثريات.");
        const movements = await tx.pettyCashTransaction.findMany();
        if (balanceForAccount(movements, main.id) < paidCents)
          throw new Error("رصيد صندوق النثريات لا يكفي لسداد المبلغ المحدد.");
        const id = randomUUID();
        const movement = {
          id,
          number: `PC-PUR-${id}`,
          type: "PURCHASE_PAYMENT",
          amountCents: paidCents,
          transactionDate: new Date(data.invoiceDate),
          sourceAccountId: main.id,
          destinationAccountId: null,
          projectId: data.projectId,
          categoryId: null,
          description: `سداد فاتورة مشتريات: ${data.name}`,
          documentNumber: number,
          fundingSource: null,
          recordedById: user.id,
          status: "POSTED",
        };
        assertBalances([...movements, movement]);
        await tx.pettyCashTransaction.create({ data: movement });
      }
      if (paidCents > 0)
        await tx.purchasePayment.create({
          data: {
            invoiceId: created.id,
            number: `PAY-${randomUUID().slice(0, 8).toUpperCase()}`,
            amountCents: paidCents,
            paymentDate: new Date(data.invoiceDate),
            paymentSource: data.paymentSource,
            notes: "دفعة عند تسجيل الفاتورة",
            actorId: user.id,
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
      if (data.stockMode !== "LEGACY_DIRECT") {
        const movementDate = new Date(data.invoiceDate);
        const receiptLines: {
          itemId: string;
          quantity: number;
          unitCostCents: number;
          totalCents: number;
          sourcePurchaseItemId: string;
        }[] = [];
        for (const [index, purchaseItem] of items.entries()) {
          const receivedQuantity = data.items[index].receivedQuantity ?? 0;
          if (receivedQuantity <= 0) continue;
          const inventoryItem = purchaseItem.inventoryItemId
            ? await tx.inventoryItem.findUnique({
                where: { id: purchaseItem.inventoryItemId },
              })
            : await tx.inventoryItem.upsert({
                where: {
                  name_unit: {
                    name: purchaseItem.name,
                    unit: purchaseItem.unit,
                  },
                },
                update: { active: true },
                create: {
                  code: `ITM-${randomUUID().slice(0, 8).toUpperCase()}`,
                  name: purchaseItem.name,
                  unit: purchaseItem.unit,
                },
              });
          if (!inventoryItem || !inventoryItem.active)
            throw new Error("أحد أصناف الفاتورة المخزنية لم يعد متاحًا.");
          if (!purchaseItem.inventoryItemId)
            await tx.purchaseItem.update({
              where: { id: purchaseItem.id },
              data: { inventoryItemId: inventoryItem.id },
            });
          receiptLines.push({
            itemId: inventoryItem.id,
            quantity: receivedQuantity,
            unitCostCents: purchaseItem.unitPriceCents,
            totalCents: Math.round(
              receivedQuantity * purchaseItem.unitPriceCents,
            ),
            sourcePurchaseItemId: purchaseItem.id,
          });
        }
        if (receiptLines.length) {
          const receiptId = randomUUID();
          await tx.stockMovement.create({
            data: {
              id: receiptId,
              number: `RCV-${movementDate.toISOString().slice(0, 10).replaceAll("-", "")}-${receiptId.slice(0, 6).toUpperCase()}`,
              type: "RECEIPT",
              movementDate,
              toWarehouseId: data.warehouseId!,
              purchaseInvoiceId: created.id,
              recipient: "مسؤول المخزن",
              notes: `استلام فعلي من الفاتورة ${number}`,
              actorId: user.id,
              lines: { createMany: { data: receiptLines } },
            },
          });
        }
        if (data.stockMode === "DIRECT_PROJECT" && receiptLines.length) {
          const projectWarehouse = await tx.warehouse.upsert({
            where: { projectId: data.projectId },
            update: { active: true },
            create: {
              code: `PRJ-${project.code}`,
              name: `مخزن مشروع — ${project.name}`,
              type: "PROJECT",
              projectId: data.projectId,
            },
          });
          const issueId = randomUUID();
          const issue = await tx.stockMovement.create({
            data: {
              id: issueId,
              number: `ISS-${movementDate.toISOString().slice(0, 10).replaceAll("-", "")}-${issueId.slice(0, 6).toUpperCase()}`,
              type: "ISSUE_PROJECT",
              movementDate,
              fromWarehouseId: data.warehouseId!,
              toWarehouseId: projectWarehouse.id,
              projectId: data.projectId,
              purchaseInvoiceId: created.id,
              recipient: "مسؤول المشروع",
              notes: `استلام وصرف مباشر من الفاتورة ${number}`,
              actorId: user.id,
              lines: {
                createMany: {
                  data: receiptLines.map((line) => ({
                    itemId: line.itemId,
                    quantity: line.quantity,
                    unitCostCents: line.unitCostCents,
                    totalCents: line.totalCents,
                  })),
                },
              },
            },
          });
          await postStockIssueJournal(tx, {
            ...issue,
            totalCents: receiptLines.reduce(
              (sum, line) => sum + line.totalCents,
              0,
            ),
          });
        }
      }
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
              items: items.map((item, index) => ({
                purchaseItemId: item.id,
                orderedQuantity: item.quantity,
                receivedQuantity: data.items[index].receivedQuantity ?? 0,
              })),
            },
          }),
        },
      });
      await completeFinancialOperation(tx, operationContext!, {
        body: { id: created.id },
        entityType: "purchaseInvoice",
        entityId: created.id,
        summary: {
          number,
          name: data.name,
          totalCents,
          paidCents,
          date: data.invoiceDate,
        },
      });
      return created;
    });
    return NextResponse.json({ id: invoice.id });
  } catch (error) {
    const replay = await replayAfterConflict(error, operationContext);
    if (replay) return replay;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "تعذر حفظ الفاتورة." },
      { status: 400 },
    );
  }
}
