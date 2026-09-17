import "server-only";
import { prisma } from "@/lib/prisma";
import { financials } from "@/lib/incoming";
import { expenseSummary } from "@/lib/expenses";
import { isProjectCost } from "@/lib/petty-cash";
import { buildCostControlTotals } from "@/lib/project-cost-control-math";

const sum = (values: number[]) => Math.round(values.reduce((total, value) => total + value, 0));

export type ProjectCostControl = {
  project: { id: string; code: string; name: string };
  revenue: { contractValueCents: number; certifiedRevenueCents: number; collectedCents: number; outstandingCents: number; executionPercent: number | null; collectionPercent: number | null };
  cost: { subcontractorsCents: number; purchasesCents: number; salariesCents: number; pettyCashCents: number; totalCostCents: number };
  performance: { profitToDateCents: number; marginPercent: number | null; costRatioPercent: number | null };
  cash: { cashInCents: number; cashOutCents: number; netCashPositionCents: number; companyFinancingCents: number; supplierPaymentsIncluded: false };
};

function payrollShare(lines: { allocationJson: string }[], projectId: string) {
  return sum(lines.flatMap((line) => { try { return (JSON.parse(line.allocationJson) as { projectId: string | null; cents: number }[]).filter((item) => item.projectId === projectId).map((item) => item.cents); } catch { return []; } }));
}

export async function getProjectCostControl(projectId: string): Promise<ProjectCostControl | null> {
  const project = await prisma.project.findFirst({ where: { id: projectId, active: true }, select: { id: true, code: true, name: true } });
  if (!project) return null;
  const [contracts, accounts, purchases, petty, payrollRuns] = await Promise.all([
    prisma.incomingContract.findMany({ where: { projectId, active: true }, include: { memos: true, statements: { include: { materials: true }, orderBy: { sequence: "asc" } } } }),
    prisma.subcontractAccount.findMany({ where: { projectId }, include: { statements: { include: { payments: true } } } }),
    prisma.purchaseInvoice.findMany({ where: { projectId }, select: { totalCents: true } }),
    prisma.pettyCashTransaction.findMany({ where: { projectId, status: "POSTED" }, select: { type: true, amountCents: true } }),
    prisma.payrollRun.findMany({ where: { status: { in: ["APPROVED", "PAID"] } }, include: { lines: { select: { allocationJson: true } } } }),
  ]);
  const contractValueCents = sum(contracts.map((contract) => contract.originalCents));
  const certifiedRevenueCents = sum(contracts.map((contract) => contract.statements.at(-1)?.grossCents ?? 0));
  const collectedCents = sum(contracts.map((contract) => financials(contract).net));
  const subcontractorsCents = sum(accounts.map((account) => expenseSummary(account.statements).netCents));
  const subcontractorCashCents = sum(accounts.map((account) => expenseSummary(account.statements).paidCents));
  const purchasesCents = sum(purchases.map((invoice) => invoice.totalCents));
  const pettyCashCents = sum(petty.filter((transaction) => isProjectCost(transaction.type)).map((transaction) => transaction.amountCents));
  const salariesCents = sum(payrollRuns.map((run) => payrollShare(run.lines, projectId)));
  const paidSalariesCents = sum(payrollRuns.filter((run) => run.status === "PAID").map((run) => payrollShare(run.lines, projectId)));
  return { project, ...buildCostControlTotals({ contractValueCents, certifiedRevenueCents, collectedCents, subcontractorsCents, subcontractorCashCents, purchasesCents, salariesCents, paidSalariesCents, pettyCashCents }) };
}
