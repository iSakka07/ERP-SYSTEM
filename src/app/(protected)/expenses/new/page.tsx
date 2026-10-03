import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { incomingUser } from "@/lib/incoming-server";
import { projectWhere } from "@/lib/access-control";
import { ExpenseAccountPage } from "@/components/expense-account-page";

function safeReturn(value?: string) {
  return value?.startsWith("/expenses") ? value : "/expenses";
}

export default async function NewExpenseAccountPage({ searchParams }: { searchParams: Promise<{ return?: string }> }) {
  const user = await incomingUser("expenses.manage");
  if (!user) redirect("/expenses");
  const [projects, companies] = await Promise.all([
    prisma.project.findMany({ where: { active: true, ...projectWhere(user) }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.company.findMany({ where: { active: true, type: "SUBCONTRACTOR" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const params = await searchParams;
  return <ExpenseAccountPage projects={projects} companies={companies} returnHref={safeReturn(params.return)} />;
}
