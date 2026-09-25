import "server-only";
import { prisma } from "@/lib/prisma";
import { balanceForAccount } from "@/lib/petty-cash";
import { money } from "@/lib/incoming";

export type AttentionAlert = { type: string; severity: string; title: string; detail: string; href: string; priority: number };

export async function getAttentionAlerts(profile: { permissions: string[]; isProjectScoped: boolean; projectIds: string[] }, selectedProjectId?: string): Promise<AttentionAlert[]> {
  const can = (permission: string) => profile.permissions.includes(permission);
  const projectWhere = selectedProjectId ? { projectId: selectedProjectId } : profile.isProjectScoped ? { projectId: { in: profile.projectIds } } : {};
  const canStock = can("warehouse.view");
  const canPetty = can("pettycash.view") && !profile.isProjectScoped;
  const warehouses = canStock ? await prisma.warehouse.findMany({ where: { active: true, OR: [{ type: { not: "PROJECT" } }, ...(profile.isProjectScoped ? [{ projectId: { in: profile.projectIds } }] : [{}])] }, select: { id: true } }) : [];
  const warehouseIds = warehouses.map((warehouse) => warehouse.id);
  const [contracts, accounts, invoices, pettyAccounts, pettyMovements, inventoryItems, stockMovements, payrollRun, payrollSetting, advances] = await Promise.all([
    can("incoming.view") ? prisma.incomingContract.findMany({ where: projectWhere, select: { name: true, statements: { select: { stage: true, sequence: true, submittedAt: true } } } }) : Promise.resolve([]),
    can("expenses.view") ? prisma.subcontractAccount.findMany({ where: projectWhere, select: { name: true, company: { select: { name: true } }, statements: { select: { stage: true, sequence: true, statementDate: true, netCents: true, payments: { select: { status: true, amountCents: true } } } } } }) : Promise.resolve([]),
    canStock ? prisma.purchaseInvoice.findMany({ where: { status: "POSTED", ...projectWhere }, select: { name: true, number: true, stockMode: true, items: { select: { id: true, quantity: true } }, stockMovements: { where: { status: "POSTED", type: "RECEIPT" }, select: { lines: { select: { sourcePurchaseItemId: true, quantity: true } } } } } }) : Promise.resolve([]),
    canPetty ? prisma.pettyCashAccount.findMany({ where: { active: true, type: "CUSTODY" }, select: { id: true, name: true, employee: { select: { name: true } } } }) : Promise.resolve([]),
    canPetty ? prisma.pettyCashTransaction.findMany({ where: { status: "POSTED" }, select: { destinationAccountId: true, sourceAccountId: true, amountCents: true, transactionDate: true, createdAt: true, type: true, number: true, status: true } }) : Promise.resolve([]),
    canStock ? prisma.inventoryItem.findMany({ where: { active: true, minimumQuantity: { gt: 0 } }, select: { id: true, name: true, minimumQuantity: true } }) : Promise.resolve([]),
    canStock && warehouseIds.length ? prisma.stockMovement.findMany({ where: { status: "POSTED", OR: [{ fromWarehouseId: { in: warehouseIds } }, { toWarehouseId: { in: warehouseIds } }] }, select: { fromWarehouseId: true, toWarehouseId: true, lines: { select: { itemId: true, quantity: true } } } }) : Promise.resolve([]),
    can("salaries.view") ? prisma.payrollRun.findFirst({ orderBy: { month: "desc" }, select: { status: true } }) : Promise.resolve(null),
    can("salaries.view") ? prisma.systemMetadata.findUnique({ where: { key: "salary-payment-day" }, select: { value: true } }) : Promise.resolve(null),
    can("salaries.view") ? prisma.employeeAdvance.findMany({ where: { status: "OPEN", remainingCents: { gt: 0 } }, select: { amountCents: true, remainingCents: true, issuedAt: true, repaymentMode: true, employee: { select: { name: true } } }, orderBy: { issuedAt: "asc" } }) : Promise.resolve([]),
  ]);
  const now = new Date(); const day = 86_400_000;
  const alerts: AttentionAlert[] = [];
  for (const custody of pettyAccounts) {
    const movements = pettyMovements.filter((movement) => movement.destinationAccountId === custody.id || movement.sourceAccountId === custody.id).sort((a, b) => a.transactionDate.getTime() - b.transactionDate.getTime() || a.createdAt.getTime() - b.createdAt.getTime());
    let running = 0; let outstandingSince: Date | null = null;
    for (const movement of movements) { const wasEmpty = running <= 0; if (movement.destinationAccountId === custody.id) running += movement.amountCents; if (movement.sourceAccountId === custody.id) running -= movement.amountCents; if (wasEmpty && running > 0) outstandingSince = movement.transactionDate; if (running <= 0) outstandingSince = null; }
    const balance = balanceForAccount(pettyMovements, custody.id);
    if (outstandingSince && balance > 0 && outstandingSince.getTime() < now.getTime() - day) alerts.push({ type: "petty", severity: "متأخر", priority: 1, title: "عهدة لم تعد للخزنة — " + custody.name, detail: (custody.employee?.name || "موظف") + " · المتبقي " + money(balance) + " ج.م", href: "/petty-cash" });
  }
  for (const contract of contracts) for (const statement of contract.statements) if (statement.stage !== "PAID" && statement.submittedAt.getTime() <= now.getTime() - 3 * day) alerts.push({ type: "incoming", severity: "تحصيل متأخر", priority: 1, title: "مستخلص جهة مالكة لم يُحصّل — جاري " + statement.sequence, detail: contract.name + " · مر عليه " + Math.floor((now.getTime() - statement.submittedAt.getTime()) / day) + " أيام دون صرف", href: "/incoming" });
  const approvalPermission: Record<string, string> = { DRAFT: "expenses.approve_technical", TECHNICAL: "expenses.approve_site", SITE: "expenses.approve_executive", EXECUTIVE: "expenses.pay" };
  for (const account of accounts) for (const statement of account.statements) {
    if (can(approvalPermission[statement.stage])) alerts.push({ type: "approval", severity: "اعتماد مطلوب", priority: 0, title: `مستخلص مقاول يحتاج اعتماد — جاري ${statement.sequence}`, detail: `${account.name} · ${account.company.name}`, href: "/expenses" });
    if (statement.stage === "ACCOUNTING" && statement.statementDate.getTime() < now.getTime() - 14 * day && statement.payments.filter((payment) => payment.status !== "REVERSED").reduce((sum, payment) => sum + payment.amountCents, 0) < statement.netCents) alerts.push({ type: "subcontract", severity: "متأخر", priority: 1, title: "مستخلص مقاول ينتظر الصرف — جاري " + statement.sequence, detail: account.name + " · " + account.company.name, href: "/expenses" });
  }
  const receivedByPurchaseItem = new Map<string, number>();
  for (const invoice of invoices) for (const movement of invoice.stockMovements) for (const line of movement.lines) if (line.sourcePurchaseItemId) receivedByPurchaseItem.set(line.sourcePurchaseItemId, (receivedByPurchaseItem.get(line.sourcePurchaseItemId) || 0) + line.quantity);
  for (const invoice of invoices) if (["WAREHOUSE", "DIRECT_PROJECT"].includes(invoice.stockMode)) { const pending = invoice.items.filter((item) => item.quantity - (receivedByPurchaseItem.get(item.id) || 0) > 0.000001); if (pending.length) alerts.push({ type: "purchases", severity: "قيد الاستلام", priority: 2, title: `فاتورة مشتريات لم يكتمل استلامها — ${invoice.name || invoice.number}`, detail: `${pending.length} بند بحاجة لاستلام`, href: "/warehouse?tab=receipts" }); }
  const quantities = new Map<string, number>(); const scopedIds = new Set(warehouseIds);
  for (const movement of stockMovements) for (const line of movement.lines) { if (movement.fromWarehouseId && scopedIds.has(movement.fromWarehouseId)) quantities.set(line.itemId, (quantities.get(line.itemId) || 0) - line.quantity); if (movement.toWarehouseId && scopedIds.has(movement.toWarehouseId)) quantities.set(line.itemId, (quantities.get(line.itemId) || 0) + line.quantity); }
  for (const item of inventoryItems) if ((quantities.get(item.id) || 0) <= item.minimumQuantity) alerts.push({ type: "warehouse", severity: "مخزون منخفض", priority: 2, title: "صنف وصل حد إعادة الطلب", detail: `${item.name} · الرصيد ${quantities.get(item.id) || 0}`, href: "/warehouse" });
  for (const advance of advances) {
    const days = Math.max(0, Math.floor((now.getTime() - advance.issuedAt.getTime()) / day));
    alerts.push({ type: "advance", severity: "سلفة قائمة", priority: 2, title: "سلفة موظف لم تُسوَّ — " + advance.employee.name, detail: "المتبقي " + money(advance.remainingCents) + " ج.م · " + (advance.repaymentMode === "NEXT_PAYROLL" ? "تُخصم من المرتب القادم" : "تُسترد على أقساط") + (days ? ` · منذ ${days} يوم` : ""), href: "/salaries" });
  }
  const payrollDay = Number(payrollSetting?.value || 0);
  if (payrollDay > 0 && payrollRun?.status === "APPROVED") { const due = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), Math.min(28, payrollDay))); const remaining = Math.ceil((due.getTime() - now.getTime()) / day); if (remaining <= 7) alerts.push({ type: "payroll", severity: remaining < 0 ? "متأخر" : "قريب", priority: remaining < 0 ? 1 : 2, title: "صرف المرتبات", detail: remaining < 0 ? "موعد الصرف المحدد تجاوز تاريخ اليوم." : "موعد الصرف المحدد بعد " + remaining + " يوم.", href: "/salaries" }); }
  return alerts.sort((a, b) => a.priority - b.priority);
}
