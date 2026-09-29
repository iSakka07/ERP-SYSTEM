import "server-only";
import { prisma } from "@/lib/prisma";
import { financials } from "@/lib/incoming";
import { expenseSummary } from "@/lib/expenses";
import { isProjectCost } from "@/lib/petty-cash";
import { buildCostControlTotals } from "@/lib/project-cost-control-math";
import { centsNumber, type CentsValue } from "@/lib/money";

const sum = (values: CentsValue[]) => Math.round(values.reduce<number>((total, value) => total + centsNumber(value), 0));

export type ProjectCostControl = {
  project: { id: string; code: string; name: string };
  revenue: { contractValueCents: number; certifiedRevenueCents: number; collectedCents: number; outstandingCents: number; executionPercent: number | null; collectionPercent: number | null; contractsCount: number; statementsCount: number; paidStatementsCount: number; pendingStatementsCount: number; materialsCount: number; materialsCents: number };
  cost: { subcontractorsCents: number; purchasesCents: number; salariesCents: number; pettyCashCents: number; bankExpensesCents: number; ownerMaterialsCents: number; totalCostCents: number; subcontractorsCount: number; subcontractStatementsCount: number; purchaseInvoicesCount: number; payrollRunsCount: number; pettyExpensesCount: number };
  performance: { profitToDateCents: number; marginPercent: number | null; costRatioPercent: number | null };
  cash: { cashInCents: number; cashOutCents: number; netCashPositionCents: number; companyFinancingCents: number; supplierPaymentsIncluded: true; subcontractPaymentsCount: number; paidPayrollRunsCount: number; pettyExpensesCount: number };
};

function payrollShare(lines: { allocationJson: string }[], projectId: string) {
  return sum(lines.flatMap((line) => { try { return (JSON.parse(line.allocationJson) as { projectId: string | null; cents: number }[]).filter((item) => item.projectId === projectId).map((item) => item.cents); } catch { return []; } }));
}

export async function getProjectCostControl(projectId: string): Promise<ProjectCostControl | null> {
  const project = await prisma.project.findFirst({ where: { id: projectId, active: true }, select: { id: true, code: true, name: true } });
  if (!project) return null;
  const [contracts, accounts, purchases, stockIssues, stockReturns, petty, payrollRuns, bankExpenses, supplierPayments, ownerMaterialJournals] = await Promise.all([
    prisma.incomingContract.findMany({ where: { projectId, active: true }, include: { memos: true, statements: { include: { materials: true }, orderBy: { sequence: "asc" } } } }),
    prisma.subcontractAccount.findMany({ where: { projectId }, include: { statements: { include: { payments: true } } } }),
    prisma.purchaseInvoice.findMany({ where: { projectId, status: "POSTED", stockMode: "LEGACY_DIRECT" }, select: { totalCents: true } }),
    prisma.stockMovement.findMany({ where: { projectId, status: "POSTED", type: "ISSUE_PROJECT" }, include: { lines: { select: { totalCents: true } } } }),
    prisma.stockMovement.findMany({ where: { projectId, status: "POSTED", type: "RETURN_PROJECT" }, include: { lines: { select: { totalCents: true } } } }),
    prisma.pettyCashTransaction.findMany({ where: { projectId, status: "POSTED" }, select: { type: true, amountCents: true } }),
    prisma.payrollRun.findMany({ where: { status: { in: ["APPROVED", "PAID"] } }, include: { lines: { select: { allocationJson: true } } } }),
    prisma.bankTransaction.findMany({ where: { projectId, status: "POSTED", type: "MANUAL_EXPENSE" }, select: { amountCents: true } }),
    prisma.purchasePayment.findMany({ where: { status: "POSTED", invoice: { projectId } }, select: { amountCents: true } }),
    prisma.journalEntry.findMany({ where: { sourceType: "OWNER_MATERIAL_COST", status: "POSTED", projectId }, select: { sourceId: true, lines: { select: { debitCents: true, account: { select: { systemKey: true } } } } } }),
  ]);
  const contractValueCents = sum(contracts.map((contract) => financials(contract).value));
  const certifiedRevenueCents = sum(contracts.map((contract) => contract.statements.at(-1)?.grossCents ?? 0));
  const collectedCents = sum(contracts.map((contract) => financials(contract).net));
  const subcontractorsCents = sum(accounts.map((account) => expenseSummary(account.statements).grossCents));
  const subcontractorCashCents = sum(accounts.map((account) => expenseSummary(account.statements).paidCents));
  const issuedMaterialsCents = sum(stockIssues.flatMap((movement) => movement.lines.map((line) => line.totalCents)));
  const returnedMaterialsCents = sum(stockReturns.flatMap((movement) => movement.lines.map((line) => line.totalCents)));
  const purchasesCents = sum(purchases.map((invoice) => invoice.totalCents)) + issuedMaterialsCents - returnedMaterialsCents;
  const pettyCashCents = sum(petty.filter((transaction) => isProjectCost(transaction.type)).map((transaction) => transaction.amountCents));
  const salariesCents = sum(payrollRuns.map((run) => payrollShare(run.lines, projectId)));
  const paidSalariesCents = sum(payrollRuns.filter((run) => run.status === "PAID").map((run) => payrollShare(run.lines, projectId)));
  const bankExpensesCents = sum(bankExpenses.map((row) => row.amountCents));
  const supplierPaymentsCents = sum(supplierPayments.map((payment) => payment.amountCents));
  const ownerMaterialsCents = sum(ownerMaterialJournals.flatMap((entry) => entry.lines.filter((line) => line.account.systemKey === "PROJECT_MATERIAL_COST").map((line) => line.debitCents)));
  const base = buildCostControlTotals({ contractValueCents, certifiedRevenueCents, collectedCents, subcontractorsCents, subcontractorCashCents, purchasesCents, salariesCents, paidSalariesCents, pettyCashCents, bankExpensesCents, ownerMaterialsCents, supplierPaymentsCents });
  const statements = contracts.flatMap((contract) => contract.statements);
  const paidStatementsCount = statements.filter((statement) => statement.stage === "PAID").length;
  const pettyExpensesCount = petty.filter((transaction) => isProjectCost(transaction.type)).length;
  const subcontractPaymentsCount = accounts.flatMap((account) => account.statements).reduce((total, statement) => total + statement.payments.length, 0);
  return { project, ...base, revenue: { ...base.revenue, contractsCount: contracts.length, statementsCount: statements.length, paidStatementsCount, pendingStatementsCount: statements.length - paidStatementsCount, materialsCount: statements.reduce((total, statement) => total + statement.materials.length, 0), materialsCents: sum(statements.flatMap((statement) => statement.materials.map((material) => material.totalCents))) }, cost: { ...base.cost, subcontractorsCount: accounts.length, subcontractStatementsCount: accounts.reduce((total, account) => total + account.statements.length, 0), purchaseInvoicesCount: purchases.length + stockIssues.length + stockReturns.length, payrollRunsCount: payrollRuns.length, pettyExpensesCount }, cash: { ...base.cash, subcontractPaymentsCount, paidPayrollRunsCount: payrollRuns.filter((run) => run.status === "PAID").length, pettyExpensesCount } };
}
