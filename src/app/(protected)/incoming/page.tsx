import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { incomingUser } from "@/lib/incoming-server";
import { IncomingCenter } from "@/components/incoming-center";

export default async function IncomingPage() {
  if (!(await incomingUser("incoming.view"))) redirect("/");
  const manager = await incomingUser("incoming.manage");
  const [contracts, projects, attachments] = await Promise.all([
    prisma.incomingContract.findMany({
      include: {
        project: {
          include: {
            company: true,
            sector: true,
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
      where: { active: true, company: { active: true, type: "OWNER" } },
      include: { company: true, sector: true },
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
  ]);
  return (
    <IncomingCenter
      contracts={JSON.parse(JSON.stringify(contracts))}
      projects={JSON.parse(JSON.stringify(projects))}
      attachments={attachments}
      canManage={Boolean(manager)}
      isAdmin={Boolean(manager?.admin)}
    />
  );
}
