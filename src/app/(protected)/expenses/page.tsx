import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { incomingUser } from "@/lib/incoming-server";
import { ExpensesCenter } from "@/components/expenses-center";
export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ project?: string; account?: string }> }) {
  const viewer = await incomingUser("expenses.view");
  if (!viewer) redirect("/");
  const params = await searchParams;
  const requestedProject = params.project ?? "";
  const session = await auth();
  const [accounts, projects, companies, attachments] = await Promise.all([
    prisma.subcontractAccount.findMany({
      where: { active: true, ...(viewer.isProjectScoped ? { projectId: { in: viewer.projectIds } } : {}) },
      include: {
        company: true,
        withdrawals: { orderBy: { createdAt: "asc" } },
        assignments: true,
        project: true,
        statements: {
          orderBy: { sequence: "asc" },
          include: {
            items: { orderBy: { position: "asc" } },
            deductions: { orderBy: { position: "asc" } },
            payments: { orderBy: { createdAt: "asc" } },
            approvals: { orderBy: { createdAt: "asc" } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.project.findMany({
      where: { active: true, ...(viewer.isProjectScoped ? { id: { in: viewer.projectIds } } : {}) },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.company.findMany({
      where: { active: true, type: "SUBCONTRACTOR" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.expenseAttachment.findMany({
      select: { id: true, entityType: true, entityId: true, name: true },
    }),
  ]);
  return (
    <ExpensesCenter
      accounts={JSON.parse(JSON.stringify(accounts))}
      projects={projects}
      companies={companies}
      attachments={attachments}
      permissions={session?.user.permissions ?? []}
      initialProjectId={projects.some((project) => project.id === requestedProject) ? requestedProject : ""}
      initialEditorAccountId={accounts.some((account) => account.id === params.account) ? params.account : ""}
    />
  );
}
