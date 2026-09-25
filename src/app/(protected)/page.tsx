import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { accessProfile } from "@/lib/access-control";
import { money } from "@/lib/incoming";
import { isProjectCost, balanceForAccount, expenseTypes } from "@/lib/petty-cash";
import { RoleDashboard } from "@/components/role-dashboard";
import { AttentionList } from "@/components/attention-list";
import { getAttentionAlerts } from "@/lib/attention-alerts";

type Search = Record<string, string | string[] | undefined>;
const day = 86_400_000;
const auditModuleLinks: Record<string, { href: string; label: string }> = {
  incoming: { href: "/incoming", label: "العقود والوارد" },
  expenses: { href: "/expenses", label: "مستخلصات المقاولين" },
  purchases: { href: "/purchases", label: "المشتريات" },
  warehouse: { href: "/warehouse", label: "المخزن" },
  inventory: { href: "/warehouse?tab=items", label: "الأصناف والمخزن" },
  pettycash: { href: "/petty-cash", label: "الخزنة" },
  salary: { href: "/salaries", label: "المرتبات" },
  bank: { href: "/bank", label: "البنك" },
  masterdata: { href: "/management", label: "الإدارة والمشروعات" },
  account: { href: "/management", label: "إدارة الحسابات" },
  role: { href: "/management", label: "الصلاحيات" },
  profile: { href: "/profile", label: "الملف الشخصي" },
  accounting: { href: "/accounting", label: "المحاسبة" },
  financial: { href: "/accounting", label: "العمليات المالية" },
};
const auditLink = (action: string) => auditModuleLinks[action.split(".")[0]] || { href: "/attention", label: "سجل الإجراءات" };
function auditSummary(details: string | null) {
  if (!details) return "لا توجد تفاصيل إضافية مسجلة لهذا الإجراء.";
  try {
    const parsed = JSON.parse(details) as Record<string, unknown>;
    const input = parsed.input && typeof parsed.input === "object" && !Array.isArray(parsed.input) ? parsed.input as Record<string, unknown> : {};
    const values = { ...parsed, ...input };
    const labels: Record<string, string> = { name: "الاسم", number: "الرقم", stage: "المرحلة", status: "الحالة", type: "النوع", reason: "السبب", reference: "المرجع", paymentSource: "مصدر السداد", attachmentCount: "مرفقات", changedName: "تم تعديل الاسم", changedAvatar: "تم تعديل الصورة", safeDelete: "حذف آمن", active: "الحالة", incomingVisible: "إتاحة الوارد", financialVisible: "إتاحة الماليات" };
    const pieces = Object.entries(labels).flatMap(([key, label]) => {
      const value = values[key];
      if (value === undefined || value === null || value === "" || key === "type" && value === "") return [];
      if (typeof value === "boolean") return value ? [`${label}: نعم`] : [];
      if (typeof value === "string" || typeof value === "number") return [`${label}: ${String(value).slice(0, 90)}`];
      return [];
    });
    if (typeof values.amountCents === "number") pieces.push(`القيمة: ${money(values.amountCents)}`);
    if (typeof values.totalCents === "number") pieces.push(`الإجمالي: ${money(values.totalCents)}`);
    return pieces.slice(0, 3).join(" · ") || "تم تسجيل التغيير على السجل المرتبط بهذا الإجراء.";
  } catch {
    return "تم تسجيل التغيير على السجل المرتبط بهذا الإجراء.";
  }
}
const dateOnly = (value: Date) => value.toISOString().slice(0, 10);
const inRange = (value: Date | null | undefined, from: Date, to: Date) => !!value && value >= from && value <= to;
const clampDate = (value: string | undefined, fallback: Date) => value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00.000Z`) : fallback;
const key = (value: Date) => `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}`;

function periodFrom(search: Search) {
  const now = new Date();
  const defaultFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const defaultTo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
  const from = clampDate(typeof search.from === "string" ? search.from : undefined, defaultFrom);
  const rawTo = clampDate(typeof search.to === "string" ? search.to : undefined, defaultTo);
  const to = new Date(rawTo); to.setUTCHours(23, 59, 59, 999);
  return from <= to ? { from, to } : { from: defaultFrom, to: defaultTo };
}

function paidIncomingInRange(contract: { statements: { stage: string; paidAt: Date | null; grossCents: number; materials: { totalCents: number }[]; sequence: number }[] }, from: Date, to: Date) {
  let previousNet = 0;
  return [...contract.statements].sort((a, b) => a.sequence - b.sequence).reduce((sum, statement) => {
    const materials = contract.statements.filter((item) => item.sequence <= statement.sequence).reduce((total, item) => total + item.materials.reduce((n, certificate) => n + certificate.totalCents, 0), 0);
    const currentNet = statement.grossCents - materials;
    const increment = statement.stage === "PAID" ? Math.max(0, currentNet - previousNet) : 0;
    if (statement.stage === "PAID") previousNet = Math.max(previousNet, currentNet);
    return inRange(statement.paidAt, from, to) ? sum + increment : sum;
  }, 0);
}

function relevantCost(account: { statements: { stage: string; statementDate: Date; grossCents: number; previousGrossCents: number }[] }, from: Date, to: Date) {
  return account.statements.filter((statement) => ["EXECUTIVE", "ACCOUNTING"].includes(statement.stage) && inRange(statement.statementDate, from, to)).reduce((sum, statement) => sum + Math.max(0, statement.grossCents - statement.previousGrossCents), 0);
}

export default async function Home({ searchParams }: { searchParams: Promise<Search> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const profile = await accessProfile(session.user.id);
  if (!profile) redirect("/login");
  const search = await searchParams;
  const evaluationDate = new Date();
  const period = periodFrom(search);
  const canFinancial = profile.permissions.includes("project_cost_control.view");
  const canStock = profile.permissions.includes("warehouse.view");
  const canPurchases = profile.permissions.includes("purchases.view");
  const canPetty = profile.permissions.includes("pettycash.view") && !profile.isProjectScoped;
  const scoped = profile.isProjectScoped ? { id: { in: profile.projectIds } } : {};
  const allProjects = await prisma.project.findMany({ where: { active: true, ...scoped }, include: { company: true }, orderBy: { name: "asc" } });
  const requestedProject = typeof search.project === "string" ? search.project : "";
  const projectId = allProjects.some((project) => project.id === requestedProject) ? requestedProject : "";
  const selectedProjects = projectId ? allProjects.filter((project) => project.id === projectId) : allProjects;
  const projectWhere = projectId ? { projectId } : profile.isProjectScoped ? { projectId: { in: profile.projectIds } } : {};
  const warehouses = canStock ? await prisma.warehouse.findMany({ where: { active: true, OR: [{ type: { not: "PROJECT" } }, ...(profile.isProjectScoped ? [{ projectId: { in: profile.projectIds } }] : [{}])] } }) : [];
  const warehouseIds = warehouses.map((warehouse) => warehouse.id);
  const [contracts, accounts, invoices, petty, pettyAccounts, allPettyMovements, payrollRuns, inventoryItems, stockMovements] = await Promise.all([
    (canFinancial || profile.permissions.includes("incoming.view")) ? prisma.incomingContract.findMany({ where: projectWhere, include: { memos: true, statements: { orderBy: { sequence: "asc" }, include: { materials: true } } } }) : Promise.resolve([]),
    (canFinancial || profile.permissions.includes("expenses.view")) ? prisma.subcontractAccount.findMany({ where: projectWhere, include: { company: true, statements: { include: { payments: true } } } }) : Promise.resolve([]),
    canFinancial || canPurchases || canStock ? prisma.purchaseInvoice.findMany({ where: { status: "POSTED", ...projectWhere }, include: { supplier: { select: { name: true } }, items: true, stockMovements: { where: { status: "POSTED", type: "RECEIPT" }, include: { lines: true } } } }) : Promise.resolve([]),
    canPetty ? prisma.pettyCashTransaction.findMany({ where: { status: "POSTED", ...(projectId ? { projectId } : {}) }, include: { category: true, project: { select: { name: true } }, recordedBy: { select: { name: true } }, attachments: { select: { id: true } } }, orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }] }) : Promise.resolve([]),
    canPetty ? prisma.pettyCashAccount.findMany({ where: { active: true }, include: { employee: { select: { name: true } } }, orderBy: { createdAt: "asc" } }) : Promise.resolve([]),
    canPetty ? prisma.pettyCashTransaction.findMany({ where: { status: "POSTED" }, select: { status: true, type: true, number: true, transactionDate: true, createdAt: true, amountCents: true, sourceAccountId: true, destinationAccountId: true } }) : Promise.resolve([]),
    profile.permissions.includes("salaries.view") ? prisma.payrollRun.findMany({ orderBy: { month: "desc" }, take: 2 }) : Promise.resolve([]),
    canStock ? prisma.inventoryItem.findMany({ where: { active: true }, select: { id: true, name: true, unit: true, minimumQuantity: true } }) : Promise.resolve([]),
    canStock && warehouseIds.length ? prisma.stockMovement.findMany({ where: { status: "POSTED", OR: [{ fromWarehouseId: { in: warehouseIds } }, { toWarehouseId: { in: warehouseIds } }] }, include: { lines: true }, orderBy: [{ movementDate: "desc" }, { createdAt: "desc" }, { id: "desc" }] }) : Promise.resolve([]),
 ]);

  const reportContracts = canFinancial ? contracts : [];
  const reportAccounts = canFinancial ? accounts : [];
  const reportInvoices = canFinancial ? invoices : [];
  const reportPetty = canFinancial ? petty : [];
  const reportPettyAccounts = canFinancial ? pettyAccounts : [];
  const reportAllPettyMovements = canFinancial ? allPettyMovements : [];
  const reportPayrollRuns = canFinancial ? payrollRuns : [];
  const mainAccount = reportPettyAccounts.find((account) => account.type === "MAIN");
  const previous = { from: new Date(period.from.getTime() - (period.to.getTime() - period.from.getTime() + day)), to: new Date(period.from.getTime() - 1) };
  const calculate = (range: { from: Date; to: Date }) => {
    const contractValue = reportContracts.filter((contract) => inRange(contract.createdAt, range.from, range.to)).reduce((sum, contract) => sum + contract.originalCents + contract.memos.reduce((value, memo) => value + (memo.kind === "INCREASE" ? memo.amountCents : -memo.amountCents), 0), 0);
    const incoming = reportContracts.reduce((sum, contract) => sum + paidIncomingInRange(contract, range.from, range.to), 0);
    const subcontract = reportAccounts.reduce((sum, account) => sum + relevantCost(account, range.from, range.to), 0);
    const purchases = reportInvoices.filter((invoice) => inRange(invoice.invoiceDate, range.from, range.to)).reduce((sum, invoice) => sum + invoice.totalCents, 0);
    const pettyCost = reportPetty.filter((transaction) => isProjectCost(transaction.type) && inRange(transaction.transactionDate, range.from, range.to)).reduce((sum, transaction) => sum + transaction.amountCents, 0);
    const subcontractPaid = reportAccounts.flatMap((account) => account.statements).flatMap((statement) => statement.payments).filter((payment) => payment.status !== "REVERSED" && inRange(payment.paymentDate, range.from, range.to)).reduce((sum, payment) => sum + payment.amountCents, 0);
    const payrollPaid = reportPayrollRuns.filter((run) => run.status === "PAID" && inRange(run.paidAt, range.from, range.to)).reduce((sum, run) => sum + run.totalCents, 0);
    const directPurchasesPaid = reportInvoices.filter((invoice) => invoice.paymentSource === "EXECUTIVE_DIRECTOR" && inRange(invoice.invoiceDate, range.from, range.to)).reduce((sum, invoice) => sum + invoice.totalCents, 0);
    const pettyOut = reportPetty.filter((transaction) => transaction.sourceAccountId === mainAccount?.id && inRange(transaction.transactionDate, range.from, range.to)).reduce((sum, transaction) => sum + transaction.amountCents, 0);
    return { contractValue, incoming, subcontract, purchases, petty: pettyCost, cost: subcontract + purchases + pettyCost, paid: subcontractPaid + payrollPaid + directPurchasesPaid + pettyOut };
  };
  const totals = calculate(period);
  const priorTotals = calculate(previous);
 const rows = selectedProjects.map((project) => {
    const contractValue = reportContracts.filter((contract) => contract.projectId === project.id).reduce((sum, contract) => sum + contract.originalCents + contract.memos.reduce((value, memo) => value + (memo.kind === "INCREASE" ? memo.amountCents : -memo.amountCents), 0), 0);
    const incoming = reportContracts.filter((contract) => contract.projectId === project.id).reduce((sum, contract) => sum + paidIncomingInRange(contract, period.from, period.to), 0);
    const subcontract = reportAccounts.filter((account) => account.projectId === project.id).reduce((sum, account) => sum + relevantCost(account, period.from, period.to), 0);
    const purchases = reportInvoices.filter((invoice) => invoice.projectId === project.id && inRange(invoice.invoiceDate, period.from, period.to)).reduce((sum, invoice) => sum + invoice.totalCents, 0);
    const pettyCost = reportPetty.filter((transaction) => transaction.projectId === project.id && isProjectCost(transaction.type) && inRange(transaction.transactionDate, period.from, period.to)).reduce((sum, transaction) => sum + transaction.amountCents, 0);
    const cost = subcontract + purchases + pettyCost;
    return { id: project.id, name: project.name, owner: project.company.name, contractValue, incoming, cost, paid: pettyCost };
  });
  const months = Array.from({ length: 6 }, (_, index) => { const cursor = new Date(Date.UTC(period.to.getUTCFullYear(), period.to.getUTCMonth() - (5 - index), 1)); return { key: key(cursor), label: new Intl.DateTimeFormat("ar-EG", { month: "short", year: "numeric" }).format(cursor), incoming: 0, cost: 0 }; });
  const monthMap = new Map(months.map((month) => [month.key, month]));
  for (const contract of reportContracts) for (const bucket of months) { const [year, month] = bucket.key.split("-").map(Number); bucket.incoming += paidIncomingInRange({ statements: contract.statements }, new Date(Date.UTC(year, month - 1, 1)), new Date(Date.UTC(year, month, 0, 23, 59, 59, 999))); }
  for (const account of reportAccounts) for (const statement of account.statements) { const bucket = monthMap.get(key(statement.statementDate)); if (bucket && ["EXECUTIVE", "ACCOUNTING"].includes(statement.stage)) bucket.cost += Math.max(0, statement.grossCents - statement.previousGrossCents); }
  for (const invoice of reportInvoices) { const bucket = monthMap.get(key(invoice.invoiceDate)); if (bucket) bucket.cost += invoice.totalCents; }
  for (const transaction of reportPetty) { const bucket = monthMap.get(key(transaction.transactionDate)); if (bucket && isProjectCost(transaction.type)) bucket.cost += transaction.amountCents; }
  const flowByProject = selectedProjects.map((project) => {
    const projectMonths = months.map((month) => ({ ...month, incoming: 0, cost: 0 }));
    const projectMonthMap = new Map(projectMonths.map((month) => [month.key, month]));
    for (const contract of reportContracts.filter((item) => item.projectId === project.id)) for (const bucket of projectMonths) { const [year, month] = bucket.key.split("-").map(Number); bucket.incoming += paidIncomingInRange({ statements: contract.statements }, new Date(Date.UTC(year, month - 1, 1)), new Date(Date.UTC(year, month, 0, 23, 59, 59, 999))); }
    for (const account of reportAccounts.filter((item) => item.projectId === project.id)) for (const statement of account.statements) { const bucket = projectMonthMap.get(key(statement.statementDate)); if (bucket && ["EXECUTIVE", "ACCOUNTING"].includes(statement.stage)) bucket.cost += Math.max(0, statement.grossCents - statement.previousGrossCents); }
    for (const invoice of reportInvoices.filter((item) => item.projectId === project.id)) { const bucket = projectMonthMap.get(key(invoice.invoiceDate)); if (bucket) bucket.cost += invoice.totalCents; }
    for (const transaction of reportPetty.filter((item) => item.projectId === project.id && isProjectCost(item.type))) { const bucket = projectMonthMap.get(key(transaction.transactionDate)); if (bucket) bucket.cost += transaction.amountCents; }
    return { projectId: project.id, months: projectMonths };
  });
  const mainBalance = mainAccount ? balanceForAccount(reportAllPettyMovements, mainAccount.id) : 0;
  const pettyPeriod = reportPetty.filter((transaction) => inRange(transaction.transactionDate, period.from, period.to));
  const previousPetty = reportPetty.filter((transaction) => inRange(transaction.transactionDate, previous.from, previous.to));
  const pettyIn = pettyPeriod.filter((transaction) => transaction.destinationAccountId === mainAccount?.id).reduce((sum, transaction) => sum + transaction.amountCents, 0);
  const pettyOut = pettyPeriod.filter((transaction) => transaction.sourceAccountId === mainAccount?.id).reduce((sum, transaction) => sum + transaction.amountCents, 0);
  const pettyPreviousOut = previousPetty.filter((transaction) => transaction.sourceAccountId === mainAccount?.id).reduce((sum, transaction) => sum + transaction.amountCents, 0);
  const custodyOutside = reportPettyAccounts.filter((account) => account.type === "CUSTODY").map((account) => {
    const movements = reportAllPettyMovements.filter((movement) => movement.destinationAccountId === account.id || movement.sourceAccountId === account.id).sort((a, b) => a.transactionDate.getTime() - b.transactionDate.getTime() || a.createdAt.getTime() - b.createdAt.getTime());
    let balance = 0; let outstandingSince: Date | null = null;
    for (const movement of movements) { const wasEmpty = balance <= 0; if (movement.destinationAccountId === account.id) balance += movement.amountCents; if (movement.sourceAccountId === account.id) balance -= movement.amountCents; if (wasEmpty && balance > 0) outstandingSince = movement.transactionDate; if (balance <= 0) outstandingSince = null; }
    return { id: account.id, name: account.name, holder: account.employee?.name || "موظف", balance, since: outstandingSince?.toISOString() || null, days: outstandingSince ? Math.max(0, Math.floor((evaluationDate.getTime() - outstandingSince.getTime()) / day)) : 0 };
  }).filter((custody) => custody.balance > 0 && custody.since).sort((a, b) => new Date(a.since!).getTime() - new Date(b.since!).getTime()).slice(0, 3);
 const cashComposition = pettyPeriod.filter((transaction) => expenseTypes.has(transaction.type)).reduce<Record<string, number>>((all, transaction) => { const label = transaction.category?.name || "غير مصنف"; all[label] = (all[label] || 0) + transaction.amountCents; return all; }, {});
  const scopedWarehouseIds = new Set(warehouses.map((warehouse) => warehouse.id));
  const scopedStockMovements = stockMovements.filter((movement) => scopedWarehouseIds.has(movement.fromWarehouseId || "") || scopedWarehouseIds.has(movement.toWarehouseId || ""));
  const balanceMap = new Map<string, { itemId: string; warehouseId: string; quantity: number; valueCents: number }>();
  const applyStock = (warehouseId: string | null, itemId: string, quantity: number, valueCents: number) => { if (!warehouseId) return; const balanceKey = `${warehouseId}:${itemId}`; const row = balanceMap.get(balanceKey) || { itemId, warehouseId, quantity: 0, valueCents: 0 }; row.quantity += quantity; row.valueCents += valueCents; balanceMap.set(balanceKey, row); };
  for (const movement of scopedStockMovements) for (const line of movement.lines) { applyStock(movement.fromWarehouseId, line.itemId, -line.quantity, -line.totalCents); applyStock(movement.toWarehouseId, line.itemId, line.quantity, line.totalCents); }
  const stockBalances = [...balanceMap.values()];
  const stockValue = stockBalances.filter((row) => scopedWarehouseIds.has(row.warehouseId)).reduce((sum, row) => sum + row.valueCents, 0);
  const quantityByItem = stockBalances.filter((row) => scopedWarehouseIds.has(row.warehouseId)).reduce<Record<string, number>>((all, row) => { all[row.itemId] = (all[row.itemId] || 0) + row.quantity; return all; }, {});
  const itemMap = new Map(inventoryItems.map((item) => [item.id, item]));
  const recentItemIds = [...new Set(scopedStockMovements.flatMap((movement) => movement.lines.map((line) => line.itemId)))];
  const recentStock = canStock ? recentItemIds.filter((id) => itemMap.has(id) && (quantityByItem[id] || 0) > 0.000001).slice(0, 5).map((id) => ({
    id, name: itemMap.get(id)!.name, unit: itemMap.get(id)!.unit, quantity: quantityByItem[id],
  })) : [];
  const lowStockCount = inventoryItems.filter((item) => item.minimumQuantity > 0 && (quantityByItem[item.id] || 0) <= item.minimumQuantity).length;
  const stockInvoices = invoices.filter((invoice) => ["WAREHOUSE", "DIRECT_PROJECT"].includes(invoice.stockMode));
  const receivedByPurchaseItem = new Map<string, number>();
  for (const invoice of stockInvoices) for (const movement of invoice.stockMovements) for (const line of movement.lines) if (line.sourcePurchaseItemId) receivedByPurchaseItem.set(line.sourcePurchaseItemId, (receivedByPurchaseItem.get(line.sourcePurchaseItemId) || 0) + line.quantity);
  const pendingInvoices = stockInvoices.filter((invoice) => invoice.items.some((item) => item.quantity - (receivedByPurchaseItem.get(item.id) || 0) > 0.000001));
  const alerts = await getAttentionAlerts(profile, projectId || undefined);
  const attention = typeof search.attention === "string" && search.attention === "all";
  if (attention) {
    const requestedAuditPage = typeof search.auditPage === "string" ? Number(search.auditPage) : 1;
    const auditPage = Number.isSafeInteger(requestedAuditPage) && requestedAuditPage > 0 ? requestedAuditPage : 1;
    const auditPageSize = 10;
    const [activities, activityTotal] = profile.user.role?.key === "admin" ? await Promise.all([prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, skip: (auditPage - 1) * auditPageSize, take: auditPageSize, select: { id: true, actorId: true, action: true, target: true, details: true, createdAt: true } }), prisma.auditLog.count()]) : [[], 0];
    const actorIds = [...new Set(activities.map((activity) => activity.actorId))];
    const actors = actorIds.length ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } }) : [];
    const actorNames = new Map(actors.map((actor) => [actor.id, actor.name]));
    const auditPages = Math.max(1, Math.ceil(activityTotal / auditPageSize));
    const auditParams = new URLSearchParams(); if (projectId) auditParams.set("project", projectId);
    const auditHref = (page: number) => { const params = new URLSearchParams(auditParams); params.set("auditPage", String(page)); return `/attention?${params.toString()}`; };
    return <AttentionList alerts={alerts} activities={activities.map((activity) => {
      const destination = auditLink(activity.action);
      return { id: activity.id, actor: actorNames.get(activity.actorId) || "حساب غير متاح", action: activity.action, target: activity.target, summary: auditSummary(activity.details), href: destination.href, hrefLabel: `فتح ${destination.label}`, createdAt: activity.createdAt.toISOString() };
    })} activityPagination={activityTotal ? { page: Math.min(auditPage, auditPages), total: activityTotal, previousHref: auditPage > 1 ? auditHref(auditPage - 1) : null, nextHref: auditPage < auditPages ? auditHref(auditPage + 1) : null } : undefined} />;
  }
  const purchasesInPeriod = invoices.filter((invoice) => inRange(invoice.invoiceDate, period.from, period.to));
  const partiallyPaidPurchases = purchasesInPeriod.filter((invoice) => invoice.paidCents > 0 && invoice.paidCents < invoice.totalCents);
  const partialPurchasesOutstanding = partiallyPaidPurchases.reduce((sum, invoice) => sum + Math.max(0, invoice.totalCents - invoice.paidCents), 0);
  const recentPurchases = canPurchases ? [...purchasesInPeriod].sort((a, b) => b.invoiceDate.getTime() - a.invoiceDate.getTime() || b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id)).slice(0, 5).map((invoice) => ({
    id: invoice.id, name: invoice.name || "فاتورة مشتريات", supplier: invoice.supplier?.name || "بدون مورد",
    date: dateOnly(invoice.invoiceDate), total: invoice.totalCents,
  })) : [];
  return <RoleDashboard roleKey={profile.user.role!.key} userName={profile.user.name} canFinancial={canFinancial} filter={{ projectId, from: dateOnly(period.from), to: dateOnly(period.to), projects: allProjects.map((project) => ({ id: project.id, name: project.name })) }} projects={rows.map((row) => ({ ...row, contractValue: money(row.contractValue), incoming: money(row.incoming), cost: money(row.cost), paid: money(row.paid), margin: money(row.incoming - row.cost), risk: canFinancial ? (row.incoming - row.cost < 0 ? "يتطلب متابعة" : "ضمن المتاح") : "متابعة حسب الصلاحية" }))} totals={{ contractValue: money(totals.contractValue), incoming: money(totals.incoming), cost: money(totals.cost), paid: money(totals.paid), liquidity: money(totals.incoming - totals.paid) }} insights={{ months, flowByProject, costComposition: [{ name: "أعمال المقاولين", value: totals.subcontract, color: "#2563eb" }, { name: "المشتريات", value: totals.purchases, color: "#f59e0b" }, { name: "النثريات", value: totals.petty, color: "#10b981" }], projectCount: selectedProjects.length, periodLabel: `${dateOnly(period.from)} إلى ${dateOnly(period.to)}`, comparison: { incoming: [totals.incoming, priorTotals.incoming], cost: [totals.cost, priorTotals.cost], liquidity: [totals.incoming - totals.paid, priorTotals.incoming - priorTotals.paid] }, alerts, operations: { stock: canStock ? stockValue : 0, low: canStock ? lowStockCount : 0, pending: canStock ? pendingInvoices.length : 0, purchases: canPurchases ? purchasesInPeriod.reduce((sum, invoice) => sum + invoice.totalCents, 0) : 0, count: canPurchases ? purchasesInPeriod.length : 0, partialPaymentCount: canPurchases ? partiallyPaidPurchases.length : 0, partialPaymentOutstanding: canPurchases ? partialPurchasesOutstanding : 0, canStock, canPurchases, recentStock, recentPurchases }, petty: { balance: mainBalance, in: pettyIn, out: pettyOut, previousOut: pettyPreviousOut, custodyOutside, composition: Object.entries(cashComposition).map(([name, value], index) => ({ name, value, color: ["#2563eb", "#10b981", "#f59e0b", "#8b5cf6", "#64748b"][index % 5] })), recent: pettyPeriod.slice(0, 5).map((transaction) => ({ id: transaction.id, date: dateOnly(transaction.transactionDate), type: transaction.type, description: transaction.description, amount: transaction.amountCents, incoming: transaction.destinationAccountId === mainAccount?.id, project: transaction.project?.name || "عام الشركة" })) } }} />;
}
