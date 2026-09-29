import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { incomingUser } from "@/lib/incoming-server";
import { assertAccountingPeriodOpen, postInventoryAdjustment, postStockIssueJournal, postStockReturnJournal } from "@/lib/accounting-posting";
import { completeFinancialOperation, guardFinancialOperation, replayAfterConflict, type FinancialOperationContext } from "@/lib/financial-idempotency";
import { assertMutation } from "@/lib/request-security";
import { centsNumber } from "@/lib/money";

type Tx = Prisma.TransactionClient;
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("item"), name: z.string().trim().min(2).max(200), unit: z.string().trim().min(1).max(50), category: z.string().trim().max(100).optional(), minimumQuantity: z.number().int().min(0).max(1e9).default(0) }),
  z.object({ action: z.literal("issue"), warehouseId: z.string().min(1), projectId: z.string().min(1), movementDate: date, recipient: z.string().trim().min(2).max(200), notes: z.string().trim().max(1000).optional(), lines: z.array(z.object({ itemId: z.string().min(1), quantity: z.number().int().positive().max(1e9) })).min(1).max(100) }),
  z.object({ action: z.literal("return"), warehouseId: z.string().min(1), projectId: z.string().min(1), movementDate: date, recipient: z.string().trim().min(2).max(200), notes: z.string().trim().max(1000).optional(), lines: z.array(z.object({ itemId: z.string().min(1), quantity: z.number().int().positive().max(1e9) })).min(1).max(100) }),
  z.object({ action: z.literal("consume"), projectId: z.string().min(1), movementDate: date, recipient: z.string().trim().min(2).max(200), notes: z.string().trim().max(1000).optional(), lines: z.array(z.object({ itemId: z.string().min(1), quantity: z.number().int().positive().max(1e9) })).min(1).max(100) }),
  z.object({ action: z.literal("transfer"), fromWarehouseId: z.string().min(1), toWarehouseId: z.string().min(1), movementDate: date, recipient: z.string().trim().min(2).max(200), notes: z.string().trim().max(1000).optional(), lines: z.array(z.object({ itemId: z.string().min(1), quantity: z.number().int().positive().max(1e9) })).min(1).max(100) }),
  z.object({ action: z.literal("receipt"), invoiceId: z.string().min(1), warehouseId: z.string().min(1), movementDate: date, directProjectId: z.string().optional(), recipient: z.string().trim().min(2).max(200), notes: z.string().trim().max(1000).optional(), lines: z.array(z.object({ purchaseItemId: z.string().min(1), inventoryItemId: z.string().min(1).optional(), quantity: z.number().int().positive().max(1e9) })).min(1).max(200) }),
  z.object({ action: z.literal("count"), warehouseId: z.string().min(1), countDate: date, notes: z.string().trim().max(1000).optional(), lines: z.array(z.object({ itemId: z.string().min(1), actualQuantity: z.number().int().min(0).max(1e9), reason: z.string().trim().max(500).optional() })).min(1).max(1000) }),
]);

const movementNumber = (prefix: string) => `${prefix}-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 6).toUpperCase()}`;
const WAREHOUSE_IDEMPOTENT_ACTIONS = new Set(["receipt", "issue", "return", "transfer", "consume", "count"]);

function rejectDuplicateLineIds(ids: string[], message: string) {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) throw new Error(message);
    seen.add(id);
  }
}

async function finishWarehouseOperation<T extends { id: string }>(
  tx: Tx,
  context: FinancialOperationContext | null,
  input: { action: string; entity: T; actorId: string; payload: unknown; entityType: string; summary: Record<string, unknown> },
) {
  await tx.auditLog.create({ data: { actorId: input.actorId, action: `warehouse.${input.action}`, target: input.entity.id, details: JSON.stringify(input.payload) } });
  if (context) {
    await completeFinancialOperation(tx, context, {
      body: { id: input.entity.id },
      entityType: input.entityType,
      entityId: input.entity.id,
      summary: input.summary,
    });
  }
  return input.entity;
}

async function monthlyCountNumber(tx: Tx, countDate: Date) {
  const monthStart = new Date(Date.UTC(countDate.getUTCFullYear(), countDate.getUTCMonth(), 1));
  const nextMonthStart = new Date(Date.UTC(countDate.getUTCFullYear(), countDate.getUTCMonth() + 1, 1));
  const sequence = await tx.inventoryCount.count({ where: { countDate: { gte: monthStart, lt: nextMonthStart } } }) + 1;
  const monthKey = `${countDate.getUTCFullYear()}${String(countDate.getUTCMonth() + 1).padStart(2, "0")}`;
  return `CNT-${monthKey}-${String(sequence).padStart(2, "0")}`;
}

async function balances(tx: Tx) {
  const moves = await tx.stockMovement.findMany({ where: { status: "POSTED" }, include: { lines: true } });
  const map = new Map<string, { quantity: number; valueCents: number }>();
  const apply = (warehouseId: string | null, itemId: string, quantity: number, valueCents: number) => {
    if (!warehouseId) return;
    const key = `${warehouseId}:${itemId}`; const row = map.get(key) || { quantity: 0, valueCents: 0 };
    row.quantity += quantity; row.valueCents += valueCents; map.set(key, row);
  };
  for (const move of moves) for (const item of move.lines) { const valueCents = centsNumber(item.totalCents); apply(move.fromWarehouseId, item.itemId, -item.quantity, -valueCents); apply(move.toWarehouseId, item.itemId, item.quantity, valueCents); }
  return map;
}

async function assertProject(tx: Tx, user: { isProjectScoped: boolean; projectIds: string[] }, projectId: string) {
  const project = await tx.project.findFirst({ where: { id: projectId, active: true }, select: { id: true } });
  if (!project || (user.isProjectScoped && !user.projectIds.includes(projectId))) {
    throw new Error("المشروع غير متاح أو خارج نطاق صلاحياتك.");
  }
}

async function assertWarehouseProject(tx: Tx, user: { isProjectScoped: boolean; projectIds: string[] }, warehouseId: string) {
  if (!user.isProjectScoped) return;
  const warehouse = await tx.warehouse.findFirst({ where: { id: warehouseId, active: true }, select: { id: true, projectId: true } });
  if (!warehouse) throw new Error("المخزن غير متاح.");
  if (warehouse.projectId && !user.projectIds.includes(warehouse.projectId)) {
    throw new Error("المخزن خارج نطاق مشاريعك المسموحة.");
  }
}

async function projectWarehouse(tx: Tx, projectId: string) {
  const project = await tx.project.findUnique({ where: { id: projectId }, select: { id: true, code: true, name: true } });
  if (!project) throw new Error("المشروع غير متاح.");
  return tx.warehouse.upsert({ where: { projectId }, update: { active: true }, create: { code: `PRJ-${project.code}`, name: `مخزن مشروع — ${project.name}`, type: "PROJECT", projectId } });
}

export async function POST(request: Request) {
  const mutationErr = assertMutation(request);
  if (mutationErr) return mutationErr;
  const user = await incomingUser("warehouse.manage");
  if (!user) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  let operationContext: FinancialOperationContext | null = null;
  try {
    const data = schema.parse(await request.json());
    if (data.action === "item") {
      const item = await prisma.inventoryItem.create({ data: { code: `ITM-${randomUUID().slice(0, 8).toUpperCase()}`, name: data.name, unit: data.unit, category: data.category || null, minimumQuantity: data.minimumQuantity } });
      return NextResponse.json({ id: item.id });
    }
    if (WAREHOUSE_IDEMPOTENT_ACTIONS.has(data.action)) {
      const guarded = await guardFinancialOperation(request, {
        actorId: user.id,
        operation: `warehouse.${data.action}`,
        requestData: data,
        businessData: data,
      });
      if ("response" in guarded) return guarded.response;
      operationContext = guarded.context;
    }
    const result = await prisma.$transaction(async (tx) => {
      // Serialize warehouse balance reads/writes on every provider. The
      // upsert acquires a row lock in PostgreSQL and the write lock in SQLite,
      // so two concurrent issues cannot validate the same stale balance.
      if (WAREHOUSE_IDEMPOTENT_ACTIONS.has(data.action)) {
        await tx.systemMetadata.upsert({
          where: { key: "warehouse-financial-write-lock" },
          create: { key: "warehouse-financial-write-lock", value: randomUUID() },
          update: { value: randomUUID() },
        });
      }
      if (data.action === "receipt") {
        await assertWarehouseProject(tx, user, data.warehouseId);
        if (data.directProjectId) await assertProject(tx, user, data.directProjectId);
        const invoice = await tx.purchaseInvoice.findUnique({ where: { id: data.invoiceId }, include: { items: true, stockMovements: { where: { status: "POSTED", type: "RECEIPT" }, include: { lines: true } } } });
        if (!invoice || invoice.status !== "POSTED") throw new Error("الفاتورة غير متاحة للاستلام.");
        if (user.isProjectScoped && !user.projectIds.includes(invoice.projectId)) throw new Error("الفاتورة خارج مشروعاتك.");
        rejectDuplicateLineIds(data.lines.map((line) => line.purchaseItemId), "لا يُسمح بتكرار نفس بند الفاتورة في طلب الاستلام الواحد.");
        const received = new Map<string, number>();
        for (const move of invoice.stockMovements) for (const row of move.lines) if (row.sourcePurchaseItemId) received.set(row.sourcePurchaseItemId, (received.get(row.sourcePurchaseItemId) || 0) + row.quantity);
        const requested = new Map<string, number>();
        for (const input of data.lines) requested.set(input.purchaseItemId, (requested.get(input.purchaseItemId) || 0) + input.quantity);
        for (const [purchaseItemId, quantity] of requested) {
          const purchaseItem = invoice.items.find((item) => item.id === purchaseItemId);
          if (!purchaseItem || quantity > purchaseItem.quantity - (received.get(purchaseItemId) || 0) + 1e-8) throw new Error("كمية الاستلام أكبر من المتبقي في الفاتورة.");
        }
        const prepared = [];
        for (const input of data.lines) {
          const purchaseItem = invoice.items.find((item) => item.id === input.purchaseItemId);
          if (!purchaseItem) throw new Error("بند الفاتورة غير موجود.");
          if (purchaseItem.inventoryItemId && input.inventoryItemId && purchaseItem.inventoryItemId !== input.inventoryItemId) throw new Error("هذا البند مرتبط مسبقًا بصنف مخزني مختلف؛ لا يمكن تغيير الربط بعد تسجيله.");
          const inventoryItemId = input.inventoryItemId || purchaseItem.inventoryItemId;
          const inventoryItem = inventoryItemId
            ? await tx.inventoryItem.findUnique({ where: { id: inventoryItemId } })
            : await tx.inventoryItem.upsert({ where: { name_unit: { name: purchaseItem.name, unit: purchaseItem.unit } }, update: { active: true }, create: { code: `ITM-${randomUUID().slice(0, 8).toUpperCase()}`, name: purchaseItem.name, unit: purchaseItem.unit } });
          if (!inventoryItem || !inventoryItem.active) throw new Error("تعذر تجهيز صنف المخزن.");
          if (inventoryItem.unit.trim() !== purchaseItem.unit.trim()) throw new Error(`وحدة الصنف المخزني «${inventoryItem.name}» لا تطابق وحدة بند الفاتورة «${purchaseItem.unit}».`);
          if (!purchaseItem.inventoryItemId) await tx.purchaseItem.update({ where: { id: purchaseItem.id }, data: { inventoryItemId: inventoryItem.id } });
          const unitCostCents = centsNumber(purchaseItem.unitPriceCents);
          prepared.push({ itemId: inventoryItem.id, quantity: input.quantity, unitCostCents, totalCents: Math.round(input.quantity * unitCostCents), sourcePurchaseItemId: purchaseItem.id });
        }
        const receipt = await tx.stockMovement.create({ data: { number: movementNumber("REC"), type: "RECEIPT", movementDate: new Date(data.movementDate), toWarehouseId: data.warehouseId, purchaseInvoiceId: invoice.id, recipient: data.recipient, notes: data.notes || null, actorId: user.id, lines: { create: prepared } }, include: { lines: true } });
        if (data.directProjectId) {
          const destination = await projectWarehouse(tx, data.directProjectId);
          const issue = await tx.stockMovement.create({ data: { number: movementNumber("ISS"), type: "ISSUE_PROJECT", movementDate: new Date(data.movementDate), fromWarehouseId: data.warehouseId, toWarehouseId: destination.id, projectId: data.directProjectId, purchaseInvoiceId: invoice.id, recipient: data.recipient, notes: `صرف مباشر بعد الاستلام${data.notes ? `: ${data.notes}` : ""}`, actorId: user.id, lines: { create: prepared.map((row) => ({ itemId: row.itemId, quantity: row.quantity, unitCostCents: row.unitCostCents, totalCents: row.totalCents })) } }, include: { lines: true } });
          await postStockIssueJournal(tx, { id: issue.id, movementDate: issue.movementDate, projectId: issue.projectId, actorId: user.id, totalCents: issue.lines.reduce((sum, row) => sum + centsNumber(row.totalCents), 0) });
        }
        return finishWarehouseOperation(tx, operationContext, { action: data.action, entity: receipt, actorId: user.id, payload: data, entityType: "stockMovement", summary: { number: receipt.number, invoiceNumber: invoice.number, itemCount: receipt.lines.length } });
      }
      const current = await balances(tx);
      if (data.action === "issue" || data.action === "transfer") {
        const warehouseId = data.action === "issue" ? data.warehouseId : data.fromWarehouseId;
        await assertWarehouseProject(tx, user, warehouseId);
        if (data.action === "issue") {
          await assertProject(tx, user, data.projectId);
        } else {
          await assertWarehouseProject(tx, user, data.toWarehouseId);
        }
        const sourceWarehouse = await tx.warehouse.findFirst({ where: { id: warehouseId, active: true } });
        if (!sourceWarehouse) throw new Error("المخزن المصدر غير متاح.");
        if (data.action === "issue" && sourceWarehouse.type === "PROJECT") throw new Error("التوريد للمشروع يبدأ من المخزن الرئيسي أو مخزن الشركة.");
        if (data.action === "transfer" && data.fromWarehouseId === data.toWarehouseId) throw new Error("اختر مخزنين مختلفين.");
        if (data.action === "transfer") { const destinationWarehouse = await tx.warehouse.findFirst({ where: { id: data.toWarehouseId, active: true } }); if (!destinationWarehouse || sourceWarehouse.type === "PROJECT" || destinationWarehouse.type === "PROJECT") throw new Error("التحويل المباشر متاح بين مخازن الشركة فقط؛ استخدم توريد لمخزن مشروع للمشروعات."); }
        rejectDuplicateLineIds(data.lines.map((line) => line.itemId), "لا يُسمح بتكرار نفس الصنف في طلب الحركة الواحد.");
        const requested = new Map<string, number>();
        for (const input of data.lines) requested.set(input.itemId, (requested.get(input.itemId) || 0) + input.quantity);
        for (const [itemId, quantity] of requested) {
          const row = current.get(`${warehouseId}:${itemId}`) || { quantity: 0, valueCents: 0 };
          if (quantity > row.quantity + 1e-8) throw new Error("الكمية المطلوبة أكبر من الرصيد المتاح.");
        }
        const prepared = data.lines.map((input) => { const row = current.get(`${warehouseId}:${input.itemId}`) || { quantity: 0, valueCents: 0 }; const unitCostCents = row.quantity > 0 ? row.valueCents / row.quantity : 0; return { itemId: input.itemId, quantity: input.quantity, unitCostCents, totalCents: Math.round(input.quantity * unitCostCents) }; });
        const destination = data.action === "issue" ? await projectWarehouse(tx, data.projectId) : null;
        const issue = await tx.stockMovement.create({ data: { number: movementNumber(data.action === "issue" ? "ISS" : "TRF"), type: data.action === "issue" ? "ISSUE_PROJECT" : "TRANSFER", movementDate: new Date(data.movementDate), fromWarehouseId: warehouseId, toWarehouseId: data.action === "transfer" ? data.toWarehouseId : destination?.id || null, projectId: data.action === "issue" ? data.projectId : null, recipient: data.recipient, notes: data.notes || null, actorId: user.id, lines: { create: prepared } }, include: { lines: true } });
        if (data.action === "issue") await postStockIssueJournal(tx, { id: issue.id, movementDate: issue.movementDate, projectId: issue.projectId, actorId: user.id, totalCents: issue.lines.reduce((sum, row) => sum + centsNumber(row.totalCents), 0) });
        return finishWarehouseOperation(tx, operationContext, { action: data.action, entity: issue, actorId: user.id, payload: data, entityType: "stockMovement", summary: { number: issue.number, type: issue.type, lineCount: issue.lines.length } });
      }
      if (data.action === "consume") {
        await assertProject(tx, user, data.projectId);
        const source = await projectWarehouse(tx, data.projectId);
        rejectDuplicateLineIds(data.lines.map((line) => line.itemId), "لا يُسمح بتكرار نفس الصنف في طلب الاستهلاك الواحد.");
        const requested = new Map<string, number>();
        for (const input of data.lines) requested.set(input.itemId, (requested.get(input.itemId) || 0) + input.quantity);
        for (const [itemId, quantity] of requested) {
          const row = current.get(`${source.id}:${itemId}`) || { quantity: 0, valueCents: 0 };
          if (quantity > row.quantity) throw new Error("الكمية المستهلكة أكبر من رصيد مخزن المشروع.");
        }
        const prepared = data.lines.map((input) => { const row = current.get(`${source.id}:${input.itemId}`) || { quantity: 0, valueCents: 0 }; const unitCostCents = row.quantity > 0 ? row.valueCents / row.quantity : 0; return { itemId: input.itemId, quantity: input.quantity, unitCostCents, totalCents: Math.round(input.quantity * unitCostCents) }; });
        const consumed = await tx.stockMovement.create({ data: { number: movementNumber("CON"), type: "CONSUMPTION", movementDate: new Date(data.movementDate), fromWarehouseId: source.id, projectId: data.projectId, recipient: data.recipient, notes: data.notes || null, actorId: user.id, lines: { create: prepared } } });
        return finishWarehouseOperation(tx, operationContext, { action: data.action, entity: consumed, actorId: user.id, payload: data, entityType: "stockMovement", summary: { number: consumed.number, type: consumed.type, lineCount: prepared.length } });
      }
      if (data.action === "return") {
        await assertProject(tx, user, data.projectId);
        await assertWarehouseProject(tx, user, data.warehouseId);
        const source = await projectWarehouse(tx, data.projectId);
        const destination = await tx.warehouse.findFirst({ where: { id: data.warehouseId, active: true, type: { not: "PROJECT" } } });
        if (!destination) throw new Error("اختر مخزن الشركة الذي سيستلم المرتجع.");
        rejectDuplicateLineIds(data.lines.map((line) => line.itemId), "لا يُسمح بتكرار نفس الصنف في طلب المرتجع الواحد.");
        const requested = new Map<string, number>();
        for (const input of data.lines) requested.set(input.itemId, (requested.get(input.itemId) || 0) + input.quantity);
        for (const [itemId, quantity] of requested) {
          const row = current.get(`${source.id}:${itemId}`) || { quantity: 0, valueCents: 0 };
          if (quantity > row.quantity) throw new Error("كمية المرتجع أكبر من رصيد مخزن المشروع.");
        }
        const prepared = data.lines.map((input) => {
          const row = current.get(`${source.id}:${input.itemId}`) || { quantity: 0, valueCents: 0 };
          const unitCostCents = row.quantity > 0 ? row.valueCents / row.quantity : 0;
          return { itemId: input.itemId, quantity: input.quantity, unitCostCents, totalCents: Math.round(input.quantity * unitCostCents) };
        });
        const returned = await tx.stockMovement.create({ data: { number: movementNumber("RET"), type: "RETURN_PROJECT", movementDate: new Date(data.movementDate), fromWarehouseId: source.id, toWarehouseId: data.warehouseId, projectId: data.projectId, recipient: data.recipient, notes: data.notes || null, actorId: user.id, lines: { create: prepared } }, include: { lines: true } });
        await postStockReturnJournal(tx, { id: returned.id, movementDate: returned.movementDate, projectId: returned.projectId, actorId: user.id, totalCents: returned.lines.reduce((sum, row) => sum + centsNumber(row.totalCents), 0) });
        return finishWarehouseOperation(tx, operationContext, { action: data.action, entity: returned, actorId: user.id, payload: data, entityType: "stockMovement", summary: { number: returned.number, type: returned.type, lineCount: returned.lines.length } });
      }
      await assertWarehouseProject(tx, user, data.warehouseId);
      const warehouseBalances = current;
      rejectDuplicateLineIds(data.lines.map((line) => line.itemId), "لا يُسمح بتكرار نفس الصنف في سطور الجرد الواحد.");
      const countLines = data.lines.map((input) => { const row = warehouseBalances.get(`${data.warehouseId}:${input.itemId}`) || { quantity: 0, valueCents: 0 }; const unitCostCents = row.quantity > 0 ? row.valueCents / row.quantity : 0; return { itemId: input.itemId, bookQuantity: row.quantity, actualQuantity: input.actualQuantity, difference: input.actualQuantity - row.quantity, unitCostCents, reason: input.reason || null }; });
      const countDate = new Date(`${data.countDate}T00:00:00.000Z`);
      await assertAccountingPeriodOpen(tx, countDate);
      const count = await tx.inventoryCount.create({ data: { number: await monthlyCountNumber(tx, countDate), warehouseId: data.warehouseId, countDate, notes: data.notes || null, actorId: user.id, lines: { create: countLines } } });
      for (const direction of ["IN", "OUT"] as const) {
        const rows = countLines.filter((row) => direction === "IN" ? row.difference > 0 : row.difference < 0);
        if (!rows.length) continue;
        const movement = await tx.stockMovement.create({
          data: {
            number: movementNumber(`ADJ-${direction}`),
            type: `ADJUSTMENT_${direction}`,
            movementDate: countDate,
            ...(direction === "IN" ? { toWarehouseId: data.warehouseId } : { fromWarehouseId: data.warehouseId }),
            notes: `تسوية الجرد ${count.number}`,
            actorId: user.id,
            lines: { create: rows.map((row) => ({ itemId: row.itemId, quantity: Math.abs(row.difference), unitCostCents: row.unitCostCents, totalCents: Math.round(Math.abs(row.difference) * row.unitCostCents) })) },
          },
          include: { lines: true },
        });
        await postInventoryAdjustment(tx, { id: movement.id, type: movement.type, movementDate: movement.movementDate, actorId: user.id, totalCents: movement.lines.reduce((sum, row) => sum + centsNumber(row.totalCents), 0) });
      }
      return finishWarehouseOperation(tx, operationContext, { action: data.action, entity: count, actorId: user.id, payload: data, entityType: "inventoryCount", summary: { number: count.number, warehouseId: data.warehouseId, lineCount: countLines.length } });
    });
    return NextResponse.json({ id: result.id });
  } catch (error) {
    if (error instanceof Error && error.message === "المخزن خارج نطاق مشاريعك المسموحة.") {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    const replay = await replayAfterConflict(error, operationContext);
    if (replay) return replay;
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر حفظ حركة المخزن." }, { status: 400 });
  }
}
