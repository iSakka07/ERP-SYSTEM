import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { accessProfile } from "@/lib/access-control";
import { financials, money } from "@/lib/incoming";
import { expenseSummary } from "@/lib/expenses";
import { isProjectCost } from "@/lib/petty-cash";
import { RoleDashboard } from "@/components/role-dashboard";

export default async function Home() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const profile = await accessProfile(session.user.id);
  if (!profile) redirect("/login");
  const scoped = profile.isProjectScoped ? { id: { in: profile.projectIds } } : {};
  const canFinancial = profile.permissions.includes("project_cost_control.view");
  const [projects, contracts, accounts, invoices, petty] = await Promise.all([
    prisma.project.findMany({ where: { active: true, ...scoped }, include: { company: true }, orderBy: { name: "asc" } }),
    canFinancial ? prisma.incomingContract.findMany({ where: profile.isProjectScoped ? { projectId: { in: profile.projectIds } } : undefined, include: { memos: true, statements: { orderBy: { sequence: "asc" }, include: { materials: true } } } }) : Promise.resolve([]),
    canFinancial ? prisma.subcontractAccount.findMany({ where: profile.isProjectScoped ? { projectId: { in: profile.projectIds } } : undefined, include: { statements: { include: { payments: true } } } }) : Promise.resolve([]),
    canFinancial ? prisma.purchaseInvoice.findMany({ where: { status: "POSTED", ...(profile.isProjectScoped ? { projectId: { in: profile.projectIds } } : {}) } }) : Promise.resolve([]),
    canFinancial ? prisma.pettyCashTransaction.findMany({ where: { status: "POSTED", ...(profile.isProjectScoped ? { projectId: { in: profile.projectIds } } : {}) }, select: { type: true, amountCents: true, projectId: true } }) : Promise.resolve([]),
  ]);
  const rows = projects.map((project) => {
    const incoming = contracts.filter((c) => c.projectId === project.id).reduce((sum, c) => sum + financials(c).net, 0);
    const contractValue = contracts.filter((c) => c.projectId === project.id).reduce((sum, c) => sum + financials(c).value, 0);
    const subcontract = accounts.filter((a) => a.projectId === project.id).reduce((sum, a) => sum + expenseSummary(a.statements).grossCents, 0);
    const subcontractPaid = accounts.filter((a) => a.projectId === project.id).reduce((sum, a) => sum + expenseSummary(a.statements).paidCents, 0);
    const purchases = invoices.filter((i) => i.projectId === project.id).reduce((sum, i) => sum + i.totalCents, 0);
    const pettyCost = petty.filter((t) => t.projectId === project.id && isProjectCost(t.type)).reduce((sum, t) => sum + t.amountCents, 0);
    return { id: project.id, name: project.name, owner: project.company.name, contractValue, incoming, cost: subcontract + purchases + pettyCost, paid: subcontractPaid + pettyCost };
  });
  const totals = rows.reduce((sum, row) => ({ contractValue: sum.contractValue + row.contractValue, incoming: sum.incoming + row.incoming, cost: sum.cost + row.cost, paid: sum.paid + row.paid }), { contractValue: 0, incoming: 0, cost: 0, paid: 0 });
  return <RoleDashboard roleKey={profile.user.role!.key} roleName={profile.user.role!.name} userName={profile.user.name} permissions={profile.permissions} canFinancial={canFinancial} projects={rows.map((row) => ({ ...row, contractValue: money(row.contractValue), incoming: money(row.incoming), cost: money(row.cost), paid: money(row.paid), margin: money(row.incoming - row.cost), risk: row.incoming - row.cost < 0 ? "يتطلب متابعة" : "ضمن المتاح" }))} totals={{ contractValue: money(totals.contractValue), incoming: money(totals.incoming), cost: money(totals.cost), paid: money(totals.paid), liquidity: money(totals.incoming - totals.paid) }} />;
}
