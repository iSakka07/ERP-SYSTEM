import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { incomingUser } from "@/lib/incoming-server";
import { postStockIssueJournal, postStockReturnJournal } from "@/lib/accounting-posting";

type Tx = Prisma.TransactionClient;
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const line = z.object({ itemId: z.string().min(1), quantity: z.number().positive().max(1e9) });
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("item"), name: z.string().trim().min(2).max(200), unit: z.string().trim().min(1).max(50), category: z.string().trim().max(100).optional(), minimumQuantity: z.number().min(0).max(1e9).default(0) }),
  z.object({ action: z.literal("issue"), warehouseId: z.string().min(1), projectId: z.string().min(1), movementDate: date, recipient: z.string().trim().min(2).max(200), notes: z.string().trim().max(1000).optional(), lines: z.array(line).min(1).max(100) }),
  z.object({ action: z.literal("return"), warehouseId: z.string().min(1), projectId: z.string().min(1), movementDate: date, recipient: z.string().trim().min(2).max(200), notes: z.string().trim().max(1000).optional(), lines: z.array(line).min(1).max(100) }),
  z.object({ action: z.literal("transfer"), fromWarehouseId: z.string().min(1), toWarehouseId: z.string().min(1), movementDate: date, recipient: z.string().trim().min(2).max(200), notes: z.string().trim().max(1000).optional(), lines: z.array(line).min(1).max(100) }),
  z.object({ action: z.literal("receipt"), invoiceId: z.string().min(1), warehouseId: z.string().min(1), movementDate: date, directProjectId: z.string().optional(), recipient: z.string().trim().min(2).max(200), notes: z.string().trim().max(1000).optional(), lines: z.array(z.object({ purchaseItemId: z.string().min(1), quantity: z.number().positive().max(1e9) })).min(1).max(200) }),
  z.object({ action: z.literal("count"), warehouseId: z.string().min(1), countDate: date, notes: z.string().trim().max(1000).optional(), lines: z.array(z.object({ itemId: z.string().min(1), actualQuantity: z.number().min(0).max(1e9), reason: z.string().trim().max(500).optional() })).min(1).max(1000) }),
]);

const movementNumber = (prefix: string) => `${prefix}-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 6).toUpperCase()}`;

async function balances(tx: Tx) {
  const moves = await tx.stockMovement.findMany({ where: { status: "POSTED" }, include: { lines: true } });
  const map = new Map<string, { quantity: number; valueCents: number }>();
  const apply = (warehouseId: string | null, itemId: string, quantity: number, valueCents: number) => {
    if (!warehouseId) return;
    const key = `${warehouseId}:${itemId}`; const row = map.get(key) || { quantity: 0, valueCents: 0 };
    row.quantity += quantity; row.valueCents += valueCents; map.set(key, row);
  };
  for (const move of moves) for (const item of move.lines) { apply(move.fromWarehouseId, item.itemId, -item.quantity, -item.totalCents); apply(move.toWarehouseId, item.itemId, item.quantity, item.totalCents); }
  return map;
}

async function assertProject(user: { isProjectScoped: boolean; projectIds: string[] }, projectId: string) {
  const project = await prisma.project.findFirst({ where: { id: projectId, active: true }, select: { id: true } });
  if (!project || (user.isProjectScoped && !user.projectIds.includes(projectId))) throw new Error("المشروع غير متاح.");
}

export async function POST(request: Request) {
  const user = await incomingUser("warehouse.manage");
  if (!user) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  try {
    const data = schema.parse(await request.json());
    if (data.action === "item") {
      const item = await prisma.inventoryItem.create({ data: { code: `ITM-${randomUUID().slice(0, 8).toUpperCase()}`, name: data.name, unit: data.unit, category: data.category || null, minimumQuantity: data.minimumQuantity } });
      return NextResponse.json({ id: item.id });
    }
    if ("projectId" in data) await assertProject(user, data.projectId);
    if (data.action === "receipt" && data.directProjectId) await assertProject(user, data.directProjectId);
    const result = await prisma.$transaction(async (tx) => {
      if (data.action === "receipt") {
        const invoice = await tx.purchaseInvoice.findUnique({ where: { id: data.invoiceId }, include: { items: true, stockMovements: { where: { status: "POSTED", type: "RECEIPT" }, include: { lines: true } } } });
        if (!invoice || invoice.status !== "POSTED") throw new Error("الفاتورة غير متاحة للاستلام.");
        if (user.isProjectScoped && !user.projectIds.includes(invoice.projectId)) throw new Error("الفاتورة خارج مشروعاتك.");
        const received = new Map<string, number>();
        for (const move of invoice.stockMovements) for (const row of move.lines) if (row.sourcePurchaseItemId) received.set(row.sourcePurchaseItemId, (received.get(row.sourcePurchaseItemId) || 0) + row.quantity);
        const prepared = [];
        for (const input of data.lines) {
          const purchaseItem = invoice.items.find((item) => item.id === input.purchaseItemId);
          if (!purchaseItem || input.quantity > purchaseItem.quantity - (received.get(purchaseItem.id) || 0) + 1e-8) throw new Error("كمية الاستلام أكبر من المتبقي في الفاتورة.");
          const inventoryItem = purchaseItem.inventoryItemId ? await tx.inventoryItem.findUnique({ where: { id: purchaseItem.inventoryItemId } }) : await tx.inventoryItem.upsert({ where: { name_unit: { name: purchaseItem.name, unit: purchaseItem.unit } }, update: { active: true }, create: { code: `ITM-${randomUUID().slice(0, 8).toUpperCase()}`, name: purchaseItem.name, unit: purchaseItem.unit } });
          if (!inventoryItem) throw new Error("تعذر تجهيز صنف المخزن.");
          if (!purchaseItem.inventoryItemId) await tx.purchaseItem.update({ where: { id: purchaseItem.id }, data: { inventoryItemId: inventoryItem.id } });
          prepared.push({ itemId: inventoryItem.id, quantity: input.quantity, unitCostCents: purchaseItem.unitPriceCents, totalCents: Math.round(input.quantity * purchaseItem.unitPriceCents), sourcePurchaseItemId: purchaseItem.id });
        }
        const receipt = await tx.stockMovement.create({ data: { number: movementNumber("REC"), type: "RECEIPT", movementDate: new Date(data.movementDate), toWarehouseId: data.warehouseId, purchaseInvoiceId: invoice.id, recipient: data.recipient, notes: data.notes || null, actorId: user.id, lines: { create: prepared } }, include: { lines: true } });
        if (data.directProjectId) {
          const issue = await tx.stockMovement.create({ data: { number: movementNumber("ISS"), type: "ISSUE_PROJECT", movementDate: new Date(data.movementDate), fromWarehouseId: data.warehouseId, projectId: data.directProjectId, purchaseInvoiceId: invoice.id, recipient: data.recipient, notes: `صرف مباشر بعد الاستلام${data.notes ? `: ${data.notes}` : ""}`, actorId: user.id, lines: { create: prepared.map((row) => ({ itemId: row.itemId, quantity: row.quantity, unitCostCents: row.unitCostCents, totalCents: row.totalCents })) } }, include: { lines: true } });
          await postStockIssueJournal(tx, { id: issue.id, movementDate: issue.movementDate, projectId: issue.projectId, actorId: user.id, totalCents: issue.lines.reduce((sum, row) => sum + row.totalCents, 0) });
        }
        return receipt;
      }
      const current = await balances(tx);
      if (data.action === "issue" || data.action === "transfer") {
        const warehouseId = data.action === "issue" ? data.warehouseId : data.fromWarehouseId;
        if (data.action === "transfer" && data.fromWarehouseId === data.toWarehouseId) throw new Error("اختر مخزنين مختلفين.");
        const prepared = data.lines.map((input) => { const row = current.get(`${warehouseId}:${input.itemId}`) || { quantity: 0, valueCents: 0 }; if (input.quantity > row.quantity + 1e-8) throw new Error("الكمية المطلوبة أكبر من الرصيد المتاح."); const unitCostCents = row.quantity > 0 ? row.valueCents / row.quantity : 0; return { itemId: input.itemId, quantity: input.quantity, unitCostCents, totalCents: Math.round(input.quantity * unitCostCents) }; });
        const issue = await tx.stockMovement.create({ data: { number: movementNumber(data.action === "issue" ? "ISS" : "TRF"), type: data.action === "issue" ? "ISSUE_PROJECT" : "TRANSFER", movementDate: new Date(data.movementDate), fromWarehouseId: warehouseId, toWarehouseId: data.action === "transfer" ? data.toWarehouseId : null, projectId: data.action === "issue" ? data.projectId : null, recipient: data.recipient, notes: data.notes || null, actorId: user.id, lines: { create: prepared } }, include: { lines: true } });
        if (data.action === "issue") await postStockIssueJournal(tx, { id: issue.id, movementDate: issue.movementDate, projectId: issue.projectId, actorId: user.id, totalCents: issue.lines.reduce((sum, row) => sum + row.totalCents, 0) });
        return issue;
      }
      if (data.action === "return") {
        const projectMoves = await tx.stockMovement.findMany({ where: { projectId: data.projectId, status: "POSTED", type: { in: ["ISSUE_PROJECT", "RETURN_PROJECT"] } }, include: { lines: true } });
        const prepared = data.lines.map((input) => {
          let quantity = 0; let valueCents = 0;
          for (const move of projectMoves) for (const row of move.lines) if (row.itemId === input.itemId) { const sign = move.type === "ISSUE_PROJECT" ? 1 : -1; quantity += sign * row.quantity; valueCents += sign * row.totalCents; }
          if (input.quantity > quantity + 1e-8) throw new Error("كمية المرتجع أكبر من الكمية المصروفة المتبقية على المشروع.");
          const unitCostCents = quantity > 0 ? valueCents / quantity : 0;
          return { itemId: input.itemId, quantity: input.quantity, unitCostCents, totalCents: Math.round(input.quantity * unitCostCents) };
        });
        const returned = await tx.stockMovement.create({ data: { number: movementNumber("RET"), type: "RETURN_PROJECT", movementDate: new Date(data.movementDate), toWarehouseId: data.warehouseId, projectId: data.projectId, recipient: data.recipient, notes: data.notes || null, actorId: user.id, lines: { create: prepared } }, include: { lines: true } });
        await postStockReturnJournal(tx, { id: returned.id, movementDate: returned.movementDate, projectId: returned.projectId, actorId: user.id, totalCents: returned.lines.reduce((sum, row) => sum + row.totalCents, 0) });
        return returned;
      }
      const warehouseBalances = current;
      const countLines = data.lines.map((input) => { const row = warehouseBalances.get(`${data.warehouseId}:${input.itemId}`) || { quantity: 0, valueCents: 0 }; const unitCostCents = row.quantity > 0 ? row.valueCents / row.quantity : 0; return { itemId: input.itemId, bookQuantity: row.quantity, actualQuantity: input.actualQuantity, difference: input.actualQuantity - row.quantity, unitCostCents, reason: input.reason || null }; });
      const count = await tx.inventoryCount.create({ data: { number: movementNumber("CNT"), warehouseId: data.warehouseId, countDate: new Date(data.countDate), notes: data.notes || null, actorId: user.id, lines: { create: countLines } } });
      for (const direction of ["IN", "OUT"] as const) { const rows = countLines.filter((row) => direction === "IN" ? row.difference > 0 : row.difference < 0); if (rows.length) await tx.stockMovement.create({ data: { number: movementNumber(`ADJ-${direction}`), type: `ADJUSTMENT_${direction}`, movementDate: new Date(data.countDate), ...(direction === "IN" ? { toWarehouseId: data.warehouseId } : { fromWarehouseId: data.warehouseId }), notes: `تسوية الجرد ${count.number}`, actorId: user.id, lines: { create: rows.map((row) => ({ itemId: row.itemId, quantity: Math.abs(row.difference), unitCostCents: row.unitCostCents, totalCents: Math.round(Math.abs(row.difference) * row.unitCostCents) })) } } }); }
      return count;
    });
    await prisma.auditLog.create({ data: { actorId: user.id, action: `warehouse.${data.action}`, target: result.id, details: JSON.stringify(data) } });
    return NextResponse.json({ id: result.id });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر حفظ حركة المخزن." }, { status: 400 });
  }
}
