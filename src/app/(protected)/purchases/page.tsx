import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { incomingUser } from "@/lib/incoming-server";
import { PurchasesCenter } from "@/components/purchases-center";

export default async function PurchasesPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const viewer = await incomingUser("purchases.view");
  if (!viewer) redirect("/");
  const requestedProject = (await searchParams).project ?? "";
  const manager = await incomingUser("purchases.manage");
  const [invoices, projects, suppliers, attachments] = await Promise.all([
    prisma.purchaseInvoice.findMany({
      where: viewer.isProjectScoped ? { projectId: { in: viewer.projectIds } } : undefined,
      include: {
        project: true,
        supplier: true,
        items: { orderBy: { position: "asc" } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.project.findMany({
      where: { active: true, ...(viewer.isProjectScoped ? { id: { in: viewer.projectIds } } : {}) },
      orderBy: { name: "asc" },
    }),
    prisma.company.findMany({
      where: { active: true, type: "SUPPLIER" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.purchaseAttachment.findMany({
      select: { id: true, entityType: true, entityId: true, name: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return (
    <PurchasesCenter
      invoices={JSON.parse(JSON.stringify(invoices))}
      projects={JSON.parse(JSON.stringify(projects))}
      suppliers={suppliers}
      attachments={attachments}
      canManage={Boolean(manager)}
      initialProjectId={projects.some((project) => project.id === requestedProject) ? requestedProject : ""}
    />
  );
}
