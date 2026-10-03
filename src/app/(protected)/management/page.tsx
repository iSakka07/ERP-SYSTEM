import { redirect } from "next/navigation";
import { ManagementCenter } from "@/components/management-center";
import { requireAccess } from "@/lib/server-access";
import { prisma } from "@/lib/prisma";

export default async function ManagementPage() {
  const profile = await requireAccess("masterdata.view");
  if (!profile) redirect("/");

  const pWhere = { active: true, ...profile.projectWhere() };

  const eWhere = profile.isProjectScoped
    ? { active: true, supervisors: { some: { active: true, projectId: { in: profile.projectIds } } } }
    : { active: true };

  const [companies, projects, engineers] = await Promise.all([
    prisma.company.findMany({ where: { active: true }, orderBy: { createdAt: "desc" } }),
    prisma.project.findMany({
      where: pWhere,
      select: {
        id: true,
        code: true,
        name: true,
        companyId: true,
        active: true,
        createdAt: true,
        company: {
          select: {
            id: true,
            name: true,
            type: true,
            isEngineeringAuthority: true,
            workNature: true,
            phone: true,
          },
        },
        supervisors: {
          where: { active: true },
          select: {
            id: true,
            projectId: true,
            employeeId: true,
            startDate: true,
            active: true,
            employee: {
              select: {
                id: true,
                name: true,
                phone: true,
                jobTitle: true,
                employeeCode: true,
                active: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.employee.findMany({
      where: eWhere,
      select: {
        id: true,
        employeeCode: true,
        name: true,
        jobTitle: true,
        phone: true,
        active: true,
        createdAt: true,
        supervisors: {
          where: { active: true },
          select: {
            id: true,
            projectId: true,
            employeeId: true,
            startDate: true,
            active: true,
            project: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
          },
          orderBy: { startDate: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return <ManagementCenter canManage={profile.can("masterdata.manage")} companies={companies} projects={projects} engineers={engineers} />;
}
