import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { accessProfile } from "@/lib/access-control";
import { money } from "@/lib/incoming";
import { isProjectCost, balanceForAccount, expenseTypes } from "@/lib/petty-cash";
import { RoleDashboard } from "@/components/role-dashboard";

type Search = Record<string, string | string[] | undefined>;
const day = 86_400_000;
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
  const period = periodFrom(search);
  const canFinancial = profile.permissions.includes("project_cost_control.view");
  const scoped = profile.isProjectScoped ? { id: { in: profile.projectIds } } : {};
  const allProjects = await prisma.project.findMany({ where: { active: true, ...scoped }, include: { company: true }, orderBy: { name: "asc" } });
  const requestedProject = typeof search.project === "string" ? search.project : "";
  const projectId = allProjects.some((project) => project.id === requestedProject) ? requestedProject : "";
  const selectedProjects = projectId ? allProjects.filter((project) => project.id === projectId) : allProjects;
  const projectWhere = projectId ? { projectId } : profile.isProjectScoped ? { projectId: { in: profile.projectIds } } : {};
  const [contracts, accounts, invoices, petty, pettyAccounts, allPettyMovements, payrollRuns, payrollSetting, documents] = await Promise.all([
    canFinancial ? prisma.incomingContract.findMany({ where: projectWhere, include: { memos: true, statements: { orderBy: { sequence: "asc" }, include: { materials: true } } } }) : Promise.resolve([]),
    canFinancial ? prisma.subcontractAccount.findMany({ where: projectWhere, include: { company: true, statements: { include: { payments: true } } } }) : Promise.resolve([]),
    canFinancial ? prisma.purchaseInvoice.findMany({ where: { status: "POSTED", ...projectWhere } }) : Promise.resolve([]),
    canFinancial ? prisma.pettyCashTransaction.findMany({ where: { status: "POSTED", ...(projectId ? { projectId } : profile.isProjectScoped ? { projectId: { in: profile.projectIds } } : {}) }, include: { category: true, project: { select: { name: true } }, recordedBy: { select: { name: true } }, attachments: { select: { id: true } } }, orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }] }) : Promise.resolve([]),
    canFinancial ? prisma.pettyCashAccount.findMany({ where: { active: true }, include: { employee: { select: { name: true } } } }) : Promise.resolve([]),
    canFinancial ? prisma.pettyCashTransaction.findMany({ select: { status: true, type: true, number: true, transactionDate: true, amountCents: true, sourceAccountId: true, destinationAccountId: true } }) : Promise.resolve([]),
    profile.permissions.includes("salaries.view") ? prisma.payrollRun.findMany({ orderBy: { month: "desc" }, take: 2 }) : Promise.resolve([]),
    profile.permissions.includes("salaries.view") ? prisma.systemMetadata.findUnique({ where: { key: "salary-payment-day" } }) : Promise.resolve(null),
    canFinancial ? Promise.all([prisma.incomingAttachment.count(), prisma.expenseAttachment.count(), prisma.purchaseAttachment.count(), prisma.pettyCashAttachment.count(), prisma.bankAttachment.count(), prisma.salaryAttachment.count()]) : Promise.resolve([] as number[]),
  ]);

  const mainAccount = pettyAccounts.find((account) => account.type === "MAIN");
  const previous = { from: new Date(period.from.getTime() - (period.to.getTime() - period.from.getTime() + day)), to: new Date(period.from.getTime() - 1) };
  const calculate = (range: { from: Date; to: Date }) => {
    const contractValue = contracts.filter((contract) => inRange(contract.createdAt, range.from, range.to)).reduce((sum, contract) => sum + contract.originalCents + contract.memos.reduce((value, memo) => value + (memo.kind === "INCREASE" ? memo.amountCents : -memo.amountCents), 0), 0);
    const incoming = contracts.reduce((sum, contract) => sum + paidIncomingInRange(contract, range.from, range.to), 0);
    const subcontract = accounts.reduce((sum, account) => sum + relevantCost(account, range.from, range.to), 0);
    const purchases = invoices.filter((invoice) => inRange(invoice.invoiceDate, range.from, range.to)).reduce((sum, invoice) => sum + invoice.totalCents, 0);
    const pettyCost = petty.filter((transaction) => isProjectCost(transaction.type) && inRange(transaction.transactionDate, range.from, range.to)).reduce((sum, transaction) => sum + transaction.amountCents, 0);
    const subcontractPaid = accounts.flatMap((account) => account.statements).flatMap((statement) => statement.payments).filter((payment) => payment.status !== "REVERSED" && inRange(payment.paymentDate, range.from, range.to)).reduce((sum, payment) => sum + payment.amountCents, 0);
    const payrollPaid = payrollRuns.filter((run) => run.status === "PAID" && inRange(run.paidAt, range.from, range.to)).reduce((sum, run) => sum + run.totalCents, 0);
    const directPurchasesPaid = invoices.filter((invoice) => invoice.paymentSource === "EXECUTIVE_DIRECTOR" && inRange(invoice.invoiceDate, range.from, range.to)).reduce((sum, invoice) => sum + invoice.totalCents, 0);
    const pettyOut = petty.filter((transaction) => transaction.sourceAccountId === mainAccount?.id && inRange(transaction.transactionDate, range.from, range.to)).reduce((sum, transaction) => sum + transaction.amountCents, 0);
    return { contractValue, incoming, subcontract, purchases, petty: pettyCost, cost: subcontract + purchases + pettyCost, paid: subcontractPaid + payrollPaid + directPurchasesPaid + pettyOut };
  };
  const totals = calculate(period);
  const priorTotals = calculate(previous);
  const rows = selectedProjects.map((project) => {
    const contractValue = contracts.filter((contract) => contract.projectId === project.id).reduce((sum, contract) => sum + contract.originalCents + contract.memos.reduce((value, memo) => value + (memo.kind === "INCREASE" ? memo.amountCents : -memo.amountCents), 0), 0);
    const incoming = contracts.filter((contract) => contract.projectId === project.id).reduce((sum, contract) => sum + paidIncomingInRange(contract, period.from, period.to), 0);
    const subcontract = accounts.filter((account) => account.projectId === project.id).reduce((sum, account) => sum + relevantCost(account, period.from, period.to), 0);
    const purchases = invoices.filter((invoice) => invoice.projectId === project.id && inRange(invoice.invoiceDate, period.from, period.to)).reduce((sum, invoice) => sum + invoice.totalCents, 0);
    const pettyCost = petty.filter((transaction) => transaction.projectId === project.id && isProjectCost(transaction.type) && inRange(transaction.transactionDate, period.from, period.to)).reduce((sum, transaction) => sum + transaction.amountCents, 0);
    const cost = subcontract + purchases + pettyCost;
    return { id: project.id, name: project.name, owner: project.company.name, contractValue, incoming, cost, paid: pettyCost };
  });
  const months = Array.from({ length: 6 }, (_, index) => { const cursor = new Date(Date.UTC(period.to.getUTCFullYear(), period.to.getUTCMonth() - (5 - index), 1)); return { key: key(cursor), label: new Intl.DateTimeFormat("ar-EG", { month: "short", year: "numeric" }).format(cursor), incoming: 0, cost: 0 }; });
  const monthMap = new Map(months.map((month) => [month.key, month]));
  for (const contract of contracts) for (const bucket of months) { const [year, month] = bucket.key.split("-").map(Number); bucket.incoming += paidIncomingInRange({ statements: contract.statements }, new Date(Date.UTC(year, month - 1, 1)), new Date(Date.UTC(year, month, 0, 23, 59, 59, 999))); }
  for (const account of accounts) for (const statement of account.statements) { const bucket = monthMap.get(key(statement.statementDate)); if (bucket && ["EXECUTIVE", "ACCOUNTING"].includes(statement.stage)) bucket.cost += Math.max(0, statement.grossCents - statement.previousGrossCents); }
  for (const invoice of invoices) { const bucket = monthMap.get(key(invoice.invoiceDate)); if (bucket) bucket.cost += invoice.totalCents; }
  for (const transaction of petty) { const bucket = monthMap.get(key(transaction.transactionDate)); if (bucket && isProjectCost(transaction.type)) bucket.cost += transaction.amountCents; }
  const mainBalance = mainAccount ? balanceForAccount(allPettyMovements, mainAccount.id) : 0;
  const pettyPeriod = petty.filter((transaction) => inRange(transaction.transactionDate, period.from, period.to));
  const previousPetty = petty.filter((transaction) => inRange(transaction.transactionDate, previous.from, previous.to));
  const pettyIn = pettyPeriod.filter((transaction) => transaction.destinationAccountId === mainAccount?.id).reduce((sum, transaction) => sum + transaction.amountCents, 0);
  const pettyOut = pettyPeriod.filter((transaction) => transaction.sourceAccountId === mainAccount?.id).reduce((sum, transaction) => sum + transaction.amountCents, 0);
  const pettyPreviousOut = previousPetty.filter((transaction) => transaction.sourceAccountId === mainAccount?.id).reduce((sum, transaction) => sum + transaction.amountCents, 0);
  const cashComposition = pettyPeriod.filter((transaction) => expenseTypes.has(transaction.type)).reduce<Record<string, number>>((all, transaction) => { const label = transaction.category?.name || "غير مصنف"; all[label] = (all[label] || 0) + transaction.amountCents; return all; }, {});
  const overdueCustodyAlerts = pettyAccounts.flatMap((custody) => { if (custody.type !== "CUSTODY") return []; const issue = allPettyMovements.filter((movement) => movement.status === "POSTED" && movement.type === "CUSTODY_ISSUE" && movement.destinationAccountId === custody.id).sort((a, b) => a.transactionDate.getTime() - b.transactionDate.getTime())[0]; const balance = balanceForAccount(allPettyMovements, custody.id); return issue && balance > 0 && issue.transactionDate.getTime() < new Date().getTime() - day ? [{ type: "petty", severity: "متأخر", title: `عهدة لم تعد للخزنة — ${issue.number}`, detail: `${custody.employee?.name || "موظف"} · المتبقي ${money(balance)} ج.م`, href: "/petty-cash" }] : []; });
  const alerts = [
    ...overdueCustodyAlerts,
    ...contracts.flatMap((contract) => contract.statements.filter((statement) => statement.stage !== "PAID" && statement.submittedAt.getTime() < period.to.getTime() - 14 * day).map((statement) => ({ type: "incoming", severity: "متأخر", title: `تحصيل عقد وارد متأخر — جاري ${statement.sequence}`, detail: `${contract.name} · مر عليه أكثر من 14 يومًا دون صرف`, href: "/incoming" }))),
    ...accounts.flatMap((account) => account.statements.filter((statement) => statement.stage === "ACCOUNTING" && statement.statementDate.getTime() < period.to.getTime() - 14 * day && statement.payments.filter((payment) => payment.status !== "REVERSED").reduce((sum, payment) => sum + payment.amountCents, 0) < statement.netCents).map((statement) => ({ type: "subcontract", severity: "متأخر", title: `مستخلص مقاول ينتظر الصرف — جاري ${statement.sequence}`, detail: `${account.name} · ${account.company.name}`, href: "/expenses" }))),
  ].slice(0, 5);
  const payrollDay = Math.max(1, Math.min(28, Number(payrollSetting?.value || 0)));
  if (payrollDay && payrollRuns[0]?.status === "APPROVED") { const due = new Date(Date.UTC(period.to.getUTCFullYear(), period.to.getUTCMonth(), payrollDay)); const remaining = Math.ceil((due.getTime() - period.to.getTime()) / day); if (remaining <= 7) alerts.push({ type: "payroll", severity: remaining < 0 ? "متأخر" : "قريب", title: "صرف المرتبات", detail: remaining < 0 ? "موعد الصرف المحدد تجاوز تاريخ اليوم." : `موعد الصرف المحدد بعد ${remaining} يوم.`, href: "/salaries" }); }
  const documentSummary = canFinancial ? [
    { label: "العقود والوارد", count: documents[0], href: "/incoming" }, { label: "أعمال المقاولين", count: documents[1], href: "/expenses" }, { label: "المشتريات", count: documents[2], href: "/purchases" }, { label: "الخزنة والنثريات", count: documents[3], href: "/petty-cash" }, { label: "البنك", count: documents[4], href: "/bank" }, { label: "المرتبات", count: documents[5], href: "/salaries" },
  ] : [];
  return <RoleDashboard roleKey={profile.user.role!.key} permissions={profile.permissions} canFinancial={canFinancial} filter={{ projectId, from: dateOnly(period.from), to: dateOnly(period.to), projects: allProjects.map((project) => ({ id: project.id, name: project.name })) }} projects={rows.map((row) => ({ ...row, contractValue: money(row.contractValue), incoming: money(row.incoming), cost: money(row.cost), paid: money(row.paid), margin: money(row.incoming - row.cost), risk: row.incoming - row.cost < 0 ? "يتطلب متابعة" : "ضمن المتاح" }))} totals={{ contractValue: money(totals.contractValue), incoming: money(totals.incoming), cost: money(totals.cost), paid: money(totals.paid), liquidity: money(totals.incoming - totals.paid) }} insights={{ months, costComposition: [{ name: "أعمال المقاولين", value: totals.subcontract, color: "#2563eb" }, { name: "المشتريات", value: totals.purchases, color: "#f59e0b" }, { name: "النثريات", value: totals.petty, color: "#10b981" }], projectCount: selectedProjects.length, periodLabel: `${dateOnly(period.from)} إلى ${dateOnly(period.to)}`, comparison: { incoming: [totals.incoming, priorTotals.incoming], cost: [totals.cost, priorTotals.cost], liquidity: [totals.incoming - totals.paid, priorTotals.incoming - priorTotals.paid] }, alerts, documents: documentSummary, petty: { balance: mainBalance, in: pettyIn, out: pettyOut, previousOut: pettyPreviousOut, composition: Object.entries(cashComposition).map(([name, value], index) => ({ name, value, color: ["#2563eb", "#10b981", "#f59e0b", "#8b5cf6", "#64748b"][index % 5] })), recent: pettyPeriod.slice(0, 5).map((transaction) => ({ id: transaction.id, date: dateOnly(transaction.transactionDate), type: transaction.type, description: transaction.description, amount: transaction.amountCents, incoming: transaction.destinationAccountId === mainAccount?.id, project: transaction.project?.name || "عام الشركة" })) } }} />;
}
