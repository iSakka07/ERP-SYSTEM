import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { incomingUser } from "@/lib/incoming-server";
import { PurchasesCenter } from "@/components/purchases-center";
import { balanceForAccount } from "@/lib/petty-cash";

export default async function PurchasesPage({ searchParams }: { searchParams: Promise<{ project?: string; invoiceId?: string }> }) {
  const viewer = await incomingUser("purchases.view");
  if (!viewer) redirect("/");
  const { project: requestedProject = "", invoiceId = "" } = await searchParams;
  const canManage = viewer.can("purchases.manage");
  const [invoices, projects, suppliers, attachments, custodyAccounts, pettyTransactions] = await Promise.all([
    prisma.purchaseInvoice.findMany({
      where: viewer.projectIdWhere(),
      include: {
        project: true,
        supplier: true,
        items: { orderBy: { position: "asc" } },
        stockMovements: { where: { status: "POSTED", type: "ISSUE_PROJECT" }, select: { type: true, projectId: true } },
        payments: { orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }] },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.project.findMany({
      where: { active: true, ...viewer.projectWhere() },
      orderBy: { name: "asc" },
    }),
    prisma.company.findMany({
      where: { active: true, type: "SUPPLIER" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.purchaseAttachment.findMany({
      select: { id: true, entityType: true, entityId: true, name: true, label: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.pettyCashAccount.findMany({ where: { active: true, type: "EMPLOYEE" }, include: { employee: { select: { name: true } } }, orderBy: { name: "asc" } }),
    prisma.pettyCashTransaction.findMany({ where: { status: "POSTED" }, select: { amountCents: true, sourceAccountId: true, destinationAccountId: true, status: true } }),
  ]);
  const employeeCustodies = custodyAccounts.map((account) => ({ id: account.id, name: account.employee?.name || account.name, balanceCents: balanceForAccount(pettyTransactions as never[], account.id) }));
  return (
    <PurchasesCenter
      invoices={JSON.parse(JSON.stringify(invoices))}
      projects={JSON.parse(JSON.stringify(projects))}
      suppliers={suppliers}
      attachments={attachments}
      employeeCustodies={employeeCustodies}
      canManage={canManage}
      initialProjectId={projects.some((project) => project.id === requestedProject) ? requestedProject : ""}
      initialInvoiceId={invoiceId}
    />
  );
}
