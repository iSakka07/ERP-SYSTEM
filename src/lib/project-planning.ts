import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { expenseSummary } from "@/lib/expenses";
import { centsNumber } from "@/lib/money";
import type { ProjectBudget } from "./project-planning-math";

type Db = Prisma.TransactionClient;
export async function planningSources(projectId: string, db: Db = prisma) {
  const [accounts, invoices] = await Promise.all([
    db.subcontractAccount.findMany({ where: { projectId }, include: { company: true, statements: { include: { payments: true } } } }),
    db.purchaseInvoice.findMany({ where: { projectId }, include: { supplier: true, payments: true, items: { include: { stockLines: { include: { movement: true } } } } } }),
  ]);
  return [
    ...accounts.map(account => {
      const summary = expenseSummary(account.statements);
      return { sourceType: "SUBCONTRACT", sourceId: account.id, name: account.name, partyId: account.id, partyName: account.company.name, partyType: "SUBCONTRACT", category: "SUBCONTRACTORS", realizedCents: summary.grossCents, payableCents: summary.remainingCents };
    }),
    ...invoices.map(invoice => {
      const realizedCents = invoice.status !== "POSTED" ? 0 : invoice.stockMode === "LEGACY_DIRECT" ? centsNumber(invoice.totalCents) : invoice.items.flatMap(item => item.stockLines).filter(line => line.movement.projectId === projectId && line.movement.status === "POSTED").reduce((total, line) => total + (line.movement.type === "ISSUE_PROJECT" ? centsNumber(line.totalCents) : line.movement.type === "RETURN_PROJECT" ? -centsNumber(line.totalCents) : 0), 0);
      const paid = invoice.payments.filter(p => p.status === "POSTED").reduce((total, p) => total + centsNumber(p.amountCents), 0);
      return { sourceType: "PURCHASE", sourceId: invoice.id, name: invoice.number + " · " + invoice.name, partyId: invoice.supplierId ?? "", partyName: invoice.supplier?.name ?? "بدون مورد", partyType: "SUPPLIER", category: "MATERIALS", realizedCents, payableCents: invoice.status !== "POSTED" ? 0 : Math.max(0, centsNumber(invoice.totalCents) - (invoice.paymentTrackingStarted ? paid : centsNumber(invoice.paidCents))) };
    }),
  ];
}
export async function getProjectPlanning(projectId: string) {
  const [plan, commitments, sources, events, suppliers] = await Promise.all([
    prisma.projectPlan.findUnique({ where: { projectId } }),
    prisma.projectCommitment.findMany({ where: { projectId }, include: { sources: true }, orderBy: { createdAt: "desc" } }),
    planningSources(projectId),
    prisma.auditLog.findMany({ where: { target: projectId, action: { startsWith: "project.plan." } }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.company.findMany({ where: { type: "SUPPLIER", active: true }, select: { id: true, name: true } }),
  ]);
  const actors = await prisma.user.findMany({ where: { id: { in: events.map(e => e.actorId) } }, select: { id: true, name: true } });
  return {
    revision: plan?.revision ?? 0,
    budget: plan?.budgetJson ? JSON.parse(plan.budgetJson) as ProjectBudget : null,
    progressPercent: plan?.progressPercent ?? null, progressDate: plan?.progressDate ?? null,
    suppliers,
    sources: sources.map(source => ({ ...source, commitmentId: commitments.find(c => c.sources.some(s => s.sourceType === source.sourceType && s.sourceId === source.sourceId))?.id ?? null })),
    commitments: commitments.map(commitment => {
      const realizedCents = commitment.sources.reduce((sum, link) => sum + (sources.find(s => s.sourceType === link.sourceType && s.sourceId === link.sourceId)?.realizedCents ?? 0), 0);
      return { ...commitment, totalCents: centsNumber(commitment.totalCents), createdAt: commitment.createdAt.toISOString(), updatedAt: commitment.updatedAt.toISOString(), realizedCents, remainingCents: commitment.active ? Math.max(0, centsNumber(commitment.totalCents) - realizedCents) : 0 };
    }),
    history: events.map(event => ({ id: event.id, action: event.action, date: event.createdAt.toISOString(), actor: actors.find(a => a.id === event.actorId)?.name ?? "مستخدم سابق", details: event.details })),
  };
}
export type ProjectPlanning = Awaited<ReturnType<typeof getProjectPlanning>>;
