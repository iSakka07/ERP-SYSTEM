import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { incomingUser } from "@/lib/incoming-server";
import { IncomingCenter } from "@/components/incoming-center";
import { incomingStages } from "@/lib/incoming";

function movementLabel(action: string, details: string) {
  const labels: Record<string, string> = {
    "incoming.contract": "حفظ العقد",
    "incoming.statement": "حفظ المستخلص",
    "incoming.material": "حفظ شهادة الخامات",
    "incoming.memo": "إضافة مذكرة",
    "incoming.stage": "تغيير مرحلة المستخلص",
  };
  try {
    const data = JSON.parse(details);
    const stage = incomingStages.find(s => s[0] === data.input?.stage)?.[1];
    return { label: action === "incoming.stage" && stage ? `نقل إلى ${stage}` : labels[action] || action, note: data.input?.reason || undefined };
  } catch { return { label: labels[action] || action }; }
}

export default async function IncomingPage({ searchParams }: { searchParams: Promise<{ project?: string; owner?: string; stage?: string; q?: string }> }) {
  const viewer = await incomingUser("incoming.view");
  if (!viewer) redirect("/");
  const requested = await searchParams;
  const requestedProject = requested.project ?? "";
  const manager = await incomingUser("incoming.manage");
  const [contracts, projects, attachments, movements] = await Promise.all([
    prisma.incomingContract.findMany({
      where: { active: true, ...(viewer.isProjectScoped ? { projectId: { in: viewer.projectIds } } : {}) },
      include: {
        project: {
          include: {
            company: true,
            supervisors: {
              where: { active: true },
              include: { employee: true },
            },
          },
        },
        memos: true,
        statements: {
          orderBy: { sequence: "asc" },
          include: { materials: { include: { items: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.project.findMany({
      where: { active: true, company: { active: true, type: "OWNER" }, ...(viewer.isProjectScoped ? { id: { in: viewer.projectIds } } : {}) },
      include: { company: true },
      orderBy: { name: "asc" },
    }),
    prisma.incomingAttachment.findMany({
      select: {
        id: true,
        entityType: true,
        entityId: true,
        name: true,
        size: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.auditLog.findMany({
      where: { action: { startsWith: "incoming." } },
      orderBy: { createdAt: "desc" },
      select: { id: true, target: true, action: true, createdAt: true, details: true },
    }),
  ]);
  return (
    <IncomingCenter
      contracts={JSON.parse(JSON.stringify(contracts))}
      projects={JSON.parse(JSON.stringify(projects))}
      attachments={attachments}
      canManage={Boolean(manager)}
      isAdmin={Boolean(manager?.admin)}
      initialProjectId={projects.some((project) => project.id === requestedProject) ? requestedProject : ""}
      initialOwnerId={requested.owner ?? ""}
      initialStage={requested.stage ?? ""}
      initialQuery={requested.q ?? ""}
      movements={movements.map(m => ({
        id: m.id, entityId: m.target || "", date: m.createdAt.toISOString(),
        ...movementLabel(m.action, m.details || "{}"),
      }))}
    />
  );
}
