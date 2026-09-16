import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ManagementCenter } from "@/components/management-center";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export default async function ManagementPage() {
  const session = await auth();
  if (!session?.user || !can(session.user, "masterdata.view")) redirect("/");
  const [companies, projects, engineers] = await Promise.all([
    prisma.company.findMany({ where: { active: true }, orderBy: { createdAt: "desc" } }),
    prisma.project.findMany({ where: { active: true }, include: { company: true, supervisors: { where: { active: true }, include: { employee: true } } }, orderBy: { createdAt: "desc" } }),
    prisma.employee.findMany({ where: { active: true }, include: { supervisors: { where: { active: true }, include: { project: true }, orderBy: { startDate: "desc" } } }, orderBy: { createdAt: "desc" } }),
  ]);
  return <ManagementCenter canManage={can(session.user, "masterdata.manage")} companies={companies} projects={projects} engineers={engineers} />;
}
