import { redirect } from "next/navigation";
import { IncomingDocumentPage } from "@/components/incoming-document-page";
import { incomingUser } from "@/lib/incoming-server";
import { prisma } from "@/lib/prisma";

function safeReturn(value?: string) { return value?.startsWith("/incoming") && !value.startsWith("//") ? value : "/incoming"; }

export default async function NewIncomingStatementPage({ params, searchParams }: { params: Promise<{ contractId: string }>; searchParams: Promise<{ return?: string }> }) {
  const user = await incomingUser("incoming.manage");
  if (!user) redirect("/incoming");
  const { contractId } = await params;
  const [contract, projects] = await Promise.all([
    prisma.incomingContract.findFirst({ where: { id: contractId, active: true }, include: { project: { include: { company: true, supervisors: { where: { active: true }, include: { employee: true } } } }, memos: true, statements: { orderBy: { sequence: "asc" }, include: { materials: { include: { items: true } } } } } }),
    prisma.project.findMany({ where: { active: true, company: { active: true, type: "OWNER" } }, include: { company: true }, orderBy: { name: "asc" } }),
  ]);
  if (!contract) redirect("/incoming");
  return <IncomingDocumentPage editor={{ action: "statement", contract: JSON.parse(JSON.stringify(contract)) }} projects={JSON.parse(JSON.stringify(projects))} isAdmin={Boolean(user.admin)} returnHref={safeReturn((await searchParams).return)} />;
}
