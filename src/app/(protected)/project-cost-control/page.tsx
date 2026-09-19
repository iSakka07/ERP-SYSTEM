import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { incomingUser } from "@/lib/incoming-server";
import { getProjectCostControl } from "@/lib/project-cost-control";
import { ProjectCostControlCenter } from "@/components/project-cost-control-center";

export default async function ProjectCostControlPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const viewer = await incomingUser("project_cost_control.view");
  if (!viewer) redirect("/");
  const projects = await prisma.project.findMany({ where: { active: true, ...(viewer.isProjectScoped ? { id: { in: viewer.projectIds } } : {}) }, select: { id: true, name: true, code: true }, orderBy: { name: "asc" } });
  const requested = (await searchParams).project || "";
  const projectId = projects.some((project) => project.id === requested) ? requested : projects[0]?.id;
  const initial = projectId ? await getProjectCostControl(projectId) : null;
  return <ProjectCostControlCenter projects={projects} initial={initial} />;
}
