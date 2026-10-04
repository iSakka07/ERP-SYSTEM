import { incomingUser } from "@/lib/incoming-server";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { assertMutation } from "@/lib/request-security";

const isTrustedMutationOrigin = (request: Request) => !assertMutation(request);
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await incomingUser("incoming.view");
  if (!user)
    return new Response("Forbidden", { status: 403 });
  const { id } = await context.params;
  const file = await prisma.incomingAttachment.findUnique({ where: { id } });
  if (!file) return new Response("Not found", { status: 404 });
 if (user.isProjectScoped) {
    const projectId = file.entityType === "contract" || file.entityType === "estimate"
      ? (await prisma.incomingContract.findUnique({ where: { id: file.entityId }, select: { projectId: true } }))?.projectId
      : file.entityType === "statement" || file.entityType === "payment-proof"
        ? (await prisma.incomingStatement.findUnique({ where: { id: file.entityId }, include: { contract: { select: { projectId: true } } } }))?.contract.projectId
        : file.entityType === "memo"
          ? (await prisma.incomingMemo.findUnique({ where: { id: file.entityId }, include: { contract: { select: { projectId: true } } } }))?.contract.projectId
          : file.entityType === "material"
            ? (await prisma.materialCertificate.findUnique({ where: { id: file.entityId }, include: { statement: { include: { contract: { select: { projectId: true } } } } } }))?.statement.contract.projectId
            : undefined;
    if (!user.canUseProject(projectId)) return new Response("Forbidden", { status: 403 });
  }
  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.mime,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) { const user = await incomingUser("incoming.manage"); if (!user || !isTrustedMutationOrigin(request)) return NextResponse.json({ error: "غير مسموح." }, { status: 403 }); const { id } = await context.params; const file = await prisma.incomingAttachment.findUnique({ where: { id } }); if (!file) return NextResponse.json({ error: "المرفق غير موجود." }, { status: 404 }); let projectId: string | undefined; if (["contract", "estimate"].includes(file.entityType)) projectId = (await prisma.incomingContract.findUnique({ where: { id: file.entityId }, select: { projectId: true } }))?.projectId; else if (["statement", "payment-proof"].includes(file.entityType)) projectId = (await prisma.incomingStatement.findUnique({ where: { id: file.entityId }, include: { contract: { select: { projectId: true } } } }))?.contract.projectId; else if (file.entityType === "memo") projectId = (await prisma.incomingMemo.findUnique({ where: { id: file.entityId }, include: { contract: { select: { projectId: true } } } }))?.contract.projectId; else if (file.entityType === "material") projectId = (await prisma.materialCertificate.findUnique({ where: { id: file.entityId }, include: { statement: { include: { contract: { select: { projectId: true } } } } } }))?.statement.contract.projectId; if (!user.canUseProject(projectId)) return NextResponse.json({ error: "غير مسموح." }, { status: 403 }); await prisma.$transaction([prisma.auditLog.create({ data: { actorId: user.id, action: "incoming.attachment.delete", target: file.entityId, details: JSON.stringify({ attachmentId: id, label: file.label, name: file.name, size: file.size }) } }), prisma.incomingAttachment.delete({ where: { id } })]); return NextResponse.json({ ok: true }); }
