import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ManagementCenter } from "@/components/management-center";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export default async function ManagementPage() {
  const session = await auth();
  if (!session?.user || !can(session.user, "masterdata.view")) redirect("/");
  const [companies, sectors, projects, engineers, assignments] = await Promise.all([
    prisma.company.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.sector.findMany({ include: { company: true }, orderBy: { createdAt: "desc" } }),
    prisma.project.findMany({ include: { company: true, sector: true, supervisors: { where: { active: true }, include: { employee: true } } }, orderBy: { createdAt: "desc" } }),
    prisma.employee.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.projectEngineerAssignment.findMany({ include: { project: true, employee: true }, orderBy: { createdAt: "desc" } }),
  ]);
  return <ManagementCenter canManage={can(session.user, "masterdata.manage")} companies={companies} sectors={sectors} projects={projects} engineers={engineers} assignments={assignments} />;
}
