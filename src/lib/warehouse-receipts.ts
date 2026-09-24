import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const PAGE_SIZES = [10, 25, 50, 100] as const;
function omit<T extends object, K extends keyof T>(value: T, keys: readonly K[]): Omit<T, K> {
  const result = { ...value };
  for (const key of keys) delete result[key];
  return result;
}
const RECEIPT_INCLUDE = {
  toWarehouse: { select: { id: true, code: true, name: true, type: true, projectId: true } },
  fromWarehouse: { select: { id: true, code: true, name: true, type: true, projectId: true } },
  lines: { include: { item: { select: { id: true, code: true, name: true, unit: true } } } },
  purchaseInvoice: {
    include: {
      project: { select: { id: true, code: true, name: true } },
      supplier: { select: { id: true, name: true, phone: true } },
      items: { orderBy: { position: "asc" as const } },
      stockMovements: {
        where: { type: "RECEIPT" },
        orderBy: [{ movementDate: "asc" as const }, { createdAt: "asc" as const }, { number: "asc" as const }],
        include: { lines: { select: { sourcePurchaseItemId: true, quantity: true } } },
      },
    },
  },
} satisfies Prisma.StockMovementInclude;

export type ReceiptFilters = {
  search: string;
  invoice: string;
  status: string[];
  kind: string;
  warehouse: string;
  project: string;
  supplier: string;
  receiptFrom: Date | null;
  receiptTo: Date | null;
  createdFrom: Date | null;
  createdTo: Date | null;
  creator: string;
  issue: string;
  page: number;
  pageSize: number;
  sort: string;
};

const text = (params: URLSearchParams, key: string, limit = 160) => (params.get(key) || "").trim().slice(0, limit);
const dateStart = (value: string | null) => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value ? null : parsed;
};
const dateEnd = (value: string | null) => {
  const parsed = dateStart(value);
  if (parsed) parsed.setUTCDate(parsed.getUTCDate() + 1);
  return parsed;
};

export function parseReceiptFilters(params: URLSearchParams): ReceiptFilters {
  const requestedSize = Number(params.get("size"));
  const requestedPage = Number(params.get("page"));
  const statuses = params.getAll("status").flatMap((value) => value.split(",")).map((value) => value.trim()).filter(Boolean).slice(0, 10);
  return {
    search: text(params, "q"), invoice: text(params, "invoice"), status: [...new Set(statuses)],
    kind: text(params, "kind", 30), warehouse: text(params, "warehouse", 100), project: text(params, "project", 100),
    supplier: text(params, "supplier", 100), receiptFrom: dateStart(params.get("receiptFrom")), receiptTo: dateEnd(params.get("receiptTo")),
    createdFrom: dateStart(params.get("createdFrom")), createdTo: dateEnd(params.get("createdTo")), creator: text(params, "creator", 100),
    issue: text(params, "issue", 20), page: Number.isInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, 1_000_000) : 1,
    pageSize: PAGE_SIZES.includes(requestedSize as (typeof PAGE_SIZES)[number]) ? requestedSize : 25,
    sort: ["oldest", "number-asc", "number-desc"].includes(params.get("sort") || "") ? params.get("sort")! : "newest",
  };
}

function receiptWhere(filters: ReceiptFilters, projectIds?: string[]): Prisma.StockMovementWhereInput {
  const and: Prisma.StockMovementWhereInput[] = [{ type: "RECEIPT" }];
  if (projectIds) and.push({ OR: [{ projectId: { in: projectIds } }, { purchaseInvoice: { is: { projectId: { in: projectIds } } } }] });
  if (filters.status.length) and.push({ status: { in: filters.status } });
  if (filters.kind === "DIRECT_PROJECT") and.push({ purchaseInvoice: { is: { stockMode: "DIRECT_PROJECT" } } });
  if (filters.kind === "WAREHOUSE") and.push({ purchaseInvoice: { is: { stockMode: "WAREHOUSE" } } });
  if (filters.kind === "OTHER") and.push({ OR: [{ purchaseInvoiceId: null }, { purchaseInvoice: { is: { stockMode: { notIn: ["DIRECT_PROJECT", "WAREHOUSE"] } } } }] });
  if (filters.warehouse) and.push({ toWarehouseId: filters.warehouse });
  if (filters.project) and.push({ OR: [{ projectId: filters.project }, { purchaseInvoice: { is: { projectId: filters.project } } }] });
  if (filters.supplier) and.push({ purchaseInvoice: { is: { supplierId: filters.supplier } } });
  if (filters.creator) and.push({ actorId: filters.creator });
  if (filters.receiptFrom || filters.receiptTo) and.push({ movementDate: { ...(filters.receiptFrom ? { gte: filters.receiptFrom } : {}), ...(filters.receiptTo ? { lt: filters.receiptTo } : {}) } });
  if (filters.createdFrom || filters.createdTo) and.push({ createdAt: { ...(filters.createdFrom ? { gte: filters.createdFrom } : {}), ...(filters.createdTo ? { lt: filters.createdTo } : {}) } });
  if (filters.invoice) and.push({ purchaseInvoice: { is: { number: { contains: filters.invoice } } } });
  if (filters.issue === "linked") and.push({ purchaseInvoice: { is: { stockMovements: { some: { type: "ISSUE_PROJECT" } } } } });
  if (filters.issue === "none") and.push({ OR: [{ purchaseInvoiceId: null }, { purchaseInvoice: { is: { stockMovements: { none: { type: "ISSUE_PROJECT" } } } } }] });
  if (["POSTED", "REVERSED", "CANCELLED"].includes(filters.issue)) and.push({ purchaseInvoice: { is: { stockMovements: { some: { type: "ISSUE_PROJECT", status: filters.issue } } } } });
  if (filters.search) {
    const query = filters.search;
    and.push({ OR: [
      { number: { contains: query } },
      { purchaseInvoice: { is: { number: { contains: query } } } },
      { purchaseInvoice: { is: { name: { contains: query } } } },
      { purchaseInvoice: { is: { supplier: { is: { name: { contains: query } } } } } },
      { lines: { some: { item: { is: { code: { contains: query } } } } } },
      { lines: { some: { item: { is: { name: { contains: query } } } } } },
      { purchaseInvoice: { is: { stockMovements: { some: { type: "ISSUE_PROJECT", number: { contains: query } } } } } },
    ] });
  }
  return { AND: and };
}

function orderBy(sort: string): Prisma.StockMovementOrderByWithRelationInput[] {
  if (sort === "oldest") return [{ movementDate: "asc" }, { number: "asc" }];
  if (sort === "number-asc") return [{ number: "asc" }, { movementDate: "desc" }];
  if (sort === "number-desc") return [{ number: "desc" }, { movementDate: "desc" }];
  return [{ movementDate: "desc" }, { number: "desc" }];
}

export function receiptFilterSummary(filters: ReceiptFilters) {
  return [
    filters.search && `بحث: ${filters.search}`, filters.invoice && `الفاتورة: ${filters.invoice}`,
    filters.status.length && `الحالة: ${filters.status.join("، ")}`, filters.kind && `النوع: ${filters.kind}`,
    filters.warehouse && `المخزن: ${filters.warehouse}`, filters.project && `المشروع: ${filters.project}`,
    filters.supplier && `المورد: ${filters.supplier}`, filters.receiptFrom && `تاريخ الاستلام من ${filters.receiptFrom.toISOString().slice(0, 10)}`,
    filters.receiptTo && `تاريخ الاستلام إلى ${new Date(filters.receiptTo.getTime() - 86_400_000).toISOString().slice(0, 10)}`,
    filters.createdFrom && `تاريخ الإنشاء من ${filters.createdFrom.toISOString().slice(0, 10)}`,
    filters.createdTo && `تاريخ الإنشاء إلى ${new Date(filters.createdTo.getTime() - 86_400_000).toISOString().slice(0, 10)}`,
    filters.creator && `المنفذ: ${filters.creator}`, filters.issue === "linked" && "مرتبط بحركة توريد",
    filters.issue === "none" && "بدون حركة توريد مرتبطة",
    ["POSTED", "REVERSED", "CANCELLED"].includes(filters.issue) && `حالة حركة التوريد المرتبطة: ${filters.issue}`,
  ].filter(Boolean).join(" · ") || "كل الاستلامات";
}

type ReceiptRecord = Prisma.StockMovementGetPayload<{ include: typeof RECEIPT_INCLUDE }>;
function fulfilledTotals(invoice: ReceiptRecord["purchaseInvoice"]) {
  if (!invoice) return { totalOrdered: null, totalReceived: null, state: "غير مرتبط بفاتورة" };
  const totalOrdered = invoice.items.reduce((sum, item) => sum + item.quantity, 0);
  const receivedByItem = new Map<string, number>();
  for (const move of invoice.stockMovements) if (move.status === "POSTED") for (const line of move.lines) {
    if (line.sourcePurchaseItemId) receivedByItem.set(line.sourcePurchaseItemId, (receivedByItem.get(line.sourcePurchaseItemId) || 0) + line.quantity);
  }
  const totalReceived = [...receivedByItem.values()].reduce((sum, quantity) => sum + quantity, 0);
  const hasExactLinks = invoice.items.length > 0 && invoice.items.every((item) => receivedByItem.has(item.id));
  const isComplete = hasExactLinks && invoice.items.every((item) => (receivedByItem.get(item.id) || 0) + 1e-8 >= item.quantity);
  const hasUnlinkedReceipt = invoice.stockMovements.some((movement) => movement.status === "POSTED" && movement.lines.some((line) => !line.sourcePurchaseItemId));
  return { totalOrdered, totalReceived, state: invoice.status === "REVERSED" ? "فاتورة ملغاة" : hasUnlinkedReceipt ? "تعذر تحديد الاكتمال بدقة" : isComplete ? "استلام كامل" : totalReceived > 0 ? "استلام جزئي" : "لم يُستلم" };
}

export async function receiptRegister(filters: ReceiptFilters, options: { projectIds?: string[]; all?: boolean } = {}) {
  const where = receiptWhere(filters, options.projectIds);
  const take = options.all ? 10_000 : filters.pageSize;
  const skip = options.all ? 0 : (filters.page - 1) * filters.pageSize;
  const [total, records, warehouses, projects, suppliers, creatorMovements] = await Promise.all([
    prisma.stockMovement.count({ where }),
    prisma.stockMovement.findMany({ where, include: RECEIPT_INCLUDE, orderBy: orderBy(filters.sort), take, ...(options.all ? {} : { skip }) }),
    prisma.warehouse.findMany({ where: { active: true, ...(options.projectIds ? { OR: [{ type: { not: "PROJECT" } }, { projectId: { in: options.projectIds } }] } : {}) }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.project.findMany({ where: { active: true, ...(options.projectIds ? { id: { in: options.projectIds } } : {}) }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.company.findMany({ where: { active: true, type: "SUPPLIER", purchaseInvoices: { some: { ...(options.projectIds ? { projectId: { in: options.projectIds } } : {}), stockMovements: { some: { type: "RECEIPT" } } } } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.stockMovement.findMany({ where, select: { actorId: true }, distinct: ["actorId"] }),
  ]);
  const actorIds = [...new Set(creatorMovements.map((record) => record.actorId))];
  const actors = actorIds.length ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } }) : [];
  const actorMap = new Map(actors.map((actor) => [actor.id, actor.name]));
  return {
    total, page: filters.page, pageSize: filters.pageSize, totalPages: Math.max(1, Math.ceil(total / filters.pageSize)),
    warehouses, projects, suppliers,
    statuses: [...new Set(records.map((record) => record.status))].sort(),
    creators: [...new Map(actors.map((actor) => [actor.id, actor])).values()].sort((a, b) => a.name.localeCompare(b.name, "ar")),
    rows: records.map((record) => {
      const totals = fulfilledTotals(record.purchaseInvoice);
      const hasPostedIssue = record.purchaseInvoice?.stockMovements.some((movement) => movement.type === "ISSUE_PROJECT" && movement.status === "POSTED") ?? false;
      return {
        id: record.id, number: record.number, movementDate: record.movementDate.toISOString(), createdAt: record.createdAt.toISOString(),
        status: record.status, type: record.purchaseInvoice?.stockMode || "OTHER", itemCount: record.lines.length,
        items: record.lines.map((line) => ({ code: line.item.code, name: line.item.name, unit: line.item.unit, quantity: line.quantity })),
        invoice: record.purchaseInvoice ? { id: record.purchaseInvoice.id, number: record.purchaseInvoice.number, name: record.purchaseInvoice.name, status: record.purchaseInvoice.status, paidCents: record.purchaseInvoice.paymentTrackingStarted ? record.purchaseInvoice.paidCents : record.purchaseInvoice.totalCents, totalCents: record.purchaseInvoice.totalCents } : null,
        supplier: record.purchaseInvoice?.supplier ? { id: record.purchaseInvoice.supplier.id, name: record.purchaseInvoice.supplier.name } : null,
        warehouse: record.toWarehouse ? { id: record.toWarehouse.id, name: record.toWarehouse.name } : null,
        project: record.purchaseInvoice?.project ? { id: record.purchaseInvoice.project.id, code: record.purchaseInvoice.project.code, name: record.purchaseInvoice.project.name } : null,
        creator: actorMap.get(record.actorId) || "حساب غير متاح", hasPostedIssue, ...totals,
      };
    }),
  };
}

export async function receiptDetails(id: string, projectIds?: string[], includeFinancial = true) {
  const record = await prisma.stockMovement.findFirst({ where: { id, type: "RECEIPT", ...(projectIds ? { OR: [{ projectId: { in: projectIds } }, { purchaseInvoice: { is: { projectId: { in: projectIds } } } }] } : {}) }, include: { ...RECEIPT_INCLUDE } });
  if (!record) return null;
  const invoice = record.purchaseInvoice;
  const sortedReceipts = invoice?.stockMovements.filter((movement) => movement.type === "RECEIPT").sort((a, b) => a.movementDate.getTime() - b.movementDate.getTime() || a.createdAt.getTime() - b.createdAt.getTime() || a.number.localeCompare(b.number)) ?? [];
  const currentIndex = sortedReceipts.findIndex((movement) => movement.id === record.id);
  const previouslyReceived = new Map<string, number>();
  for (const move of sortedReceipts.slice(0, Math.max(0, currentIndex))) if (move.status === "POSTED") for (const line of move.lines) {
    if (line.sourcePurchaseItemId) previouslyReceived.set(line.sourcePurchaseItemId, (previouslyReceived.get(line.sourcePurchaseItemId) || 0) + line.quantity);
  }
  const purchaseItems = new Map((invoice?.items || []).map((item) => [item.id, item]));
  const itemTotals = new Map<string, number>();
  for (const move of sortedReceipts.slice(0, currentIndex + 1)) if (move.status === "POSTED") for (const line of move.lines) {
    if (line.sourcePurchaseItemId) itemTotals.set(line.sourcePurchaseItemId, (itemTotals.get(line.sourcePurchaseItemId) || 0) + line.quantity);
  }
  const lineItems = record.lines.map((line) => {
    const purchaseItem = line.sourcePurchaseItemId ? purchaseItems.get(line.sourcePurchaseItemId) : undefined;
    const previous = line.sourcePurchaseItemId ? previouslyReceived.get(line.sourcePurchaseItemId) || 0 : null;
    const receivedAfter = line.sourcePurchaseItemId ? itemTotals.get(line.sourcePurchaseItemId) || 0 : null;
    return {
      id: line.id, itemId: line.itemId, code: line.item.code, name: line.item.name, unit: line.item.unit,
      orderedQuantity: purchaseItem?.quantity ?? null, previouslyReceivedQuantity: previous,
      currentQuantity: line.quantity, totalReceivedQuantity: receivedAfter,
      remainingQuantity: purchaseItem && receivedAfter !== null ? Math.max(0, purchaseItem.quantity - receivedAfter) : null,
      unitPriceCents: purchaseItem?.unitPriceCents ?? line.unitCostCents, totalCents: line.totalCents,
      hasPurchaseLineLink: Boolean(purchaseItem),
    };
  });
  const relatedIssues = invoice ? await prisma.stockMovement.findMany({ where: { purchaseInvoiceId: invoice.id, type: "ISSUE_PROJECT", id: { not: record.id } }, include: { fromWarehouse: { select: { id: true, name: true } }, toWarehouse: { select: { id: true, name: true } }, lines: { include: { item: { select: { id: true, code: true, name: true, unit: true } } } } }, orderBy: [{ movementDate: "desc" }, { createdAt: "desc" }] }) : [];
  const projectIdsForNames = [...new Set([record.projectId, ...relatedIssues.map((movement) => movement.projectId)].filter((value): value is string => Boolean(value)))];
  const [projects, auditRows] = await Promise.all([
    projectIdsForNames.length ? prisma.project.findMany({ where: { id: { in: projectIdsForNames } }, select: { id: true, code: true, name: true } }) : [],
    prisma.auditLog.findMany({ where: { target: { in: [record.id, ...(invoice ? [invoice.id] : []), ...relatedIssues.map((movement) => movement.id)] }, OR: [{ action: { startsWith: "warehouse." } }, { action: "purchases.invoice" }] }, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, actorId: true, action: true, target: true, createdAt: true } }),
  ]);
  const detailActorIds = [...new Set([record.actorId, ...relatedIssues.map((movement) => movement.actorId), ...auditRows.map((row) => row.actorId)])];
  const actors = detailActorIds.length ? await prisma.user.findMany({ where: { id: { in: detailActorIds } }, select: { id: true, name: true } }) : [];
  const projectMap = new Map(projects.map((project) => [project.id, project]));
  const actorMap = new Map(actors.map((actor) => [actor.id, actor.name]));
  const auditReferences = new Map([[record.id, record.number], ...(invoice ? [[invoice.id, invoice.number] as [string, string]] : []), ...relatedIssues.map((movement) => [movement.id, movement.number] as [string, string])]);
  const overall = fulfilledTotals(invoice);
  return {
    id: record.id, number: record.number, type: invoice?.stockMode || "OTHER", status: record.status,
    movementDate: record.movementDate.toISOString(), createdAt: record.createdAt.toISOString(), notes: record.notes,
    recipient: record.recipient, creator: actorMap.get(record.actorId) || "حساب غير متاح",
    warehouse: record.toWarehouse, sourceWarehouse: record.fromWarehouse,
    project: invoice?.project || (record.projectId ? projectMap.get(record.projectId) : null) || null,
    invoice: invoice ? { id: invoice.id, number: invoice.number, name: invoice.name, invoiceDate: invoice.invoiceDate.toISOString(), status: invoice.status, stockMode: invoice.stockMode, project: invoice.project, supplier: invoice.supplier ? { id: invoice.supplier.id, name: invoice.supplier.name, phone: invoice.supplier.phone } : null, itemCount: invoice.items.length } : null,
    itemCount: record.lines.length, invoiceReceiptState: overall.state,
    lines: includeFinancial ? lineItems : lineItems.map((line) => omit(line, ["unitPriceCents", "totalCents"])),
    trace: relatedIssues.map((movement) => ({ id: movement.id, number: movement.number, type: movement.type, status: movement.status, movementDate: movement.movementDate.toISOString(), createdAt: movement.createdAt.toISOString(), fromWarehouse: movement.fromWarehouse, toWarehouse: movement.toWarehouse, project: movement.projectId ? projectMap.get(movement.projectId) || null : null, actor: actorMap.get(movement.actorId) || "حساب غير متاح", lines: movement.lines.map((line) => ({ code: line.item.code, name: line.item.name, unit: line.item.unit, quantity: line.quantity })) })),
    traceNote: relatedIssues.length ? "حركات التوريد أدناه مرتبطة بفاتورة المشتريات نفسها؛ المخطط الحالي لا يربط كل حركة توريد بسطر استلام بعينه." : null,
    audit: auditRows.map((row) => ({ id: row.id, action: row.action, target: auditReferences.get(row.target) || "مستند مرتبط", createdAt: row.createdAt.toISOString(), actor: actorMap.get(row.actorId) || "حساب غير متاح" })),
  };
}

export const receiptPageSizes = PAGE_SIZES;
