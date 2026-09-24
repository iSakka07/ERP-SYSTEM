import "server-only";
import { prisma } from "@/lib/prisma";

function omit<T extends object, K extends keyof T>(value: T, keys: readonly K[]): Omit<T, K> {
  const result = { ...value };
  for (const key of keys) delete result[key];
  return result;
}

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
    include: { lines: { include: { item: true } }, fromWarehouse: true, toWarehouse: true },
    orderBy: [{ movementDate: "desc" }, { createdAt: "desc" }],
  });
}

export async function warehouseSnapshot(projectIds?: string[], includeFinancial = true) {
  const [warehouses, items, movements, invoices, projects, counts] = await Promise.all([
    prisma.warehouse.findMany({ where: { active: true, ...(projectIds ? { OR: [{ type: { not: "PROJECT" } }, { projectId: { in: projectIds } }] } : {}) }, orderBy: [{ type: "asc" }, { name: "asc" }] }),
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
  const accessibleWarehouseIds = new Set(warehouses.map((warehouse) => warehouse.id));
  const visibleMovements = projectIds ? movements.filter((movement) =>
    (!movement.projectId || projectIds.includes(movement.projectId))
    && (!movement.fromWarehouseId || accessibleWarehouseIds.has(movement.fromWarehouseId))
    && (!movement.toWarehouseId || accessibleWarehouseIds.has(movement.toWarehouseId)),
  ) : movements;
  const visibleCounts = counts.filter((count) => accessibleWarehouseIds.has(count.warehouseId));
  const actorIds = [...new Set([...visibleMovements.map((movement) => movement.actorId), ...visibleCounts.map((count) => count.actorId)])];
  const actors = actorIds.length ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true, email: true } }) : [];
  const actorMap = new Map(actors.map((actor) => [actor.id, `${actor.name} — ${actor.email}`]));
  const balances = calculateStockBalances(movements).filter((balance) => accessibleWarehouseIds.has(balance.warehouseId));
  const receivedByPurchaseItem = new Map<string, number>();
  for (const invoice of invoices) for (const movement of invoice.stockMovements) for (const line of movement.lines) if (line.sourcePurchaseItemId) receivedByPurchaseItem.set(line.sourcePurchaseItemId, (receivedByPurchaseItem.get(line.sourcePurchaseItemId) || 0) + line.quantity);
  const safeMovements = visibleMovements.map((movement) => ({ ...movement, actor: actorMap.get(movement.actorId) || "حساب غير متاح", movementDate: movement.movementDate.toISOString(), createdAt: movement.createdAt.toISOString(), lines: includeFinancial ? movement.lines : movement.lines.map((line) => omit(line, ["unitCostCents", "totalCents"])) }));
  const safeInvoices = invoices.map((invoice) => {
    const normalized = { ...omit(invoice, ["totalCents"]), items: includeFinancial ? invoice.items : invoice.items.map((item) => omit(item, ["unitPriceCents", "totalCents"])), stockMovements: includeFinancial ? invoice.stockMovements : invoice.stockMovements.map((movement) => ({ ...movement, lines: movement.lines.map((line) => omit(line, ["unitCostCents", "totalCents"])) })) };
    return { ...(includeFinancial ? invoice : normalized), invoiceDate: invoice.invoiceDate.toISOString(), createdAt: invoice.createdAt.toISOString(), updatedAt: invoice.updatedAt.toISOString(), reversedAt: invoice.reversedAt?.toISOString() || null };
  });
  const safeCounts = visibleCounts.map((count) => ({ ...count, actor: actorMap.get(count.actorId) || "حساب غير متاح", countDate: count.countDate.toISOString(), createdAt: count.createdAt.toISOString(), lines: includeFinancial ? count.lines : count.lines.map((line) => omit(line, ["unitCostCents"])) }));
  const safeBalances = balances.map((balance) => includeFinancial ? balance : { ...balance, valueCents: null, averageCostCents: null });
  return {
    warehouses,
    items,
    movements: safeMovements,
    invoices: safeInvoices,
    projects,
    counts: safeCounts,
    balances: safeBalances,
    receivedByPurchaseItem: Object.fromEntries(receivedByPurchaseItem),
  };
}
