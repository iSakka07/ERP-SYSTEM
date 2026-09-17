import { redirect } from "next/navigation";
import { IncomingDocumentPage } from "@/components/incoming-document-page";
import { incomingUser } from "@/lib/incoming-server";
import { prisma } from "@/lib/prisma";

function safeReturn(value?: string) { return value?.startsWith("/incoming") && !value.startsWith("//") ? value : "/incoming"; }

export default async function NewIncomingContractPage({ searchParams }: { searchParams: Promise<{ return?: string }> }) {
  const user = await incomingUser("incoming.manage");
  if (!user) redirect("/incoming");
  const projects = await prisma.project.findMany({ where: { active: true, company: { active: true, type: "OWNER" } }, include: { company: true }, orderBy: { name: "asc" } });
  return <IncomingDocumentPage editor={{ action: "contract" }} projects={JSON.parse(JSON.stringify(projects))} isAdmin={Boolean(user.admin)} returnHref={safeReturn((await searchParams).return)} />;
}
