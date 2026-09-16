import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { SalariesCenter } from "@/components/salaries-center";

export default async function SalariesPage() {
  const session = await auth();
  if (!session?.user || !can(session.user, "salaries.view")) redirect("/");
  const [employees, projects, allocations] = await Promise.all([
    prisma.employee.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.project.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.employeeSalaryAllocation.findMany({ include: { employee: true, project: true }, orderBy: [{ startDate: "desc" }] }),
  ]);
  return <SalariesCenter employees={employees} projects={projects} allocations={allocations} canManage={can(session.user, "salaries.manage")} />;
}
