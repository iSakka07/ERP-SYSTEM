import "server-only";
import { prisma } from "@/lib/prisma";

export type StockBalance = { itemId: string; warehouseId: string; quantity: number; valueCents: number; averageCostCents: number };

export function calculateStockBalances(movements: Awaited<ReturnType<typeof warehouseMovements>>) {
  const balances = new Map<string, StockBalance>();
  const apply = (warehouseId: string | null, itemId: string, quantity: number, valueCents: number) => {
    if (!warehouseId) return;
    const key = `${warehouseId}:${itemId}`;
    const row = balances.get(key) || { itemId, warehouseId, quantity: 0, valueCents: 0, averageCostCents: 0 };
    row.quantity += quantity;
    row.valueCents += valueCents;
    row.averageCostCents = row.quantity > 0 ? row.valueCents / row.quantity : 0;
    balances.set(key, row);
  };
  for (const movement of movements) for (const line of movement.lines) {
    if (movement.fromWarehouseId) apply(movement.fromWarehouseId, line.itemId, -line.quantity, -line.totalCents);
    if (movement.toWarehouseId) apply(movement.toWarehouseId, line.itemId, line.quantity, line.totalCents);
  }
  return [...balances.values()];
}

export function warehouseMovements() {
  return prisma.stockMovement.findMany({
    where: { status: "POSTED" },
    include: { lines: { include: { item: true } }, fromWarehouse: true, toWarehouse: true, purchaseInvoice: { select: { id: true, number: true, name: true } } },
    orderBy: [{ movementDate: "desc" }, { createdAt: "desc" }],
  });
}

export async function warehouseSnapshot(projectIds?: string[]) {
  const [warehouses, items, movements, invoices, projects, counts] = await Promise.all([
    prisma.warehouse.findMany({ where: { active: true }, orderBy: [{ type: "asc" }, { name: "asc" }] }),
    prisma.inventoryItem.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    warehouseMovements(),
    prisma.purchaseInvoice.findMany({
      where: { status: "POSTED", stockMode: { in: ["WAREHOUSE", "DIRECT_PROJECT"] }, ...(projectIds ? { projectId: { in: projectIds } } : {}) },
      include: { project: true, supplier: true, items: { include: { inventoryItem: true }, orderBy: { position: "asc" } }, stockMovements: { where: { status: "POSTED", type: "RECEIPT" }, include: { lines: true } } },
      orderBy: { invoiceDate: "desc" },
    }),
    prisma.project.findMany({ where: { active: true, ...(projectIds ? { id: { in: projectIds } } : {}) }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
    prisma.inventoryCount.findMany({ include: { warehouse: true, lines: { include: { item: true } } }, orderBy: { countDate: "desc" }, take: 30 }),
  ]);
  const balances = calculateStockBalances(movements);
  const receivedByPurchaseItem = new Map<string, number>();
  for (const invoice of invoices) for (const movement of invoice.stockMovements) for (const line of movement.lines) if (line.sourcePurchaseItemId) receivedByPurchaseItem.set(line.sourcePurchaseItemId, (receivedByPurchaseItem.get(line.sourcePurchaseItemId) || 0) + line.quantity);
  return {
    warehouses,
    items,
    movements: movements.map((movement) => ({ ...movement, movementDate: movement.movementDate.toISOString(), createdAt: movement.createdAt.toISOString() })),
    invoices: invoices.map((invoice) => ({ ...invoice, invoiceDate: invoice.invoiceDate.toISOString(), createdAt: invoice.createdAt.toISOString(), updatedAt: invoice.updatedAt.toISOString(), reversedAt: invoice.reversedAt?.toISOString() || null })),
    projects,
    counts: counts.map((count) => ({ ...count, countDate: count.countDate.toISOString(), createdAt: count.createdAt.toISOString() })),
    balances,
    receivedByPurchaseItem: Object.fromEntries(receivedByPurchaseItem),
  };
}
