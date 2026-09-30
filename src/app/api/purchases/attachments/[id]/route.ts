import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { incomingUser } from "@/lib/incoming-server";
import { isTrustedMutationOrigin } from "@/lib/request-security";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await incomingUser("purchases.view");
  if (!user)
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const { id } = await params;
  const file = await prisma.purchaseAttachment.findUnique({ where: { id } });
  if (!file) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (user.isProjectScoped) {
    const invoice = await prisma.purchaseInvoice.findUnique({ where: { id: file.entityId }, select: { projectId: true } });
    if (!invoice || !user.projectIds.includes(invoice.projectId)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  return new Response(new Uint8Array(file.data), {
    headers: {
      "content-type": file.mime,
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) { const user = await incomingUser("purchases.manage"); if (!user || !isTrustedMutationOrigin(request)) return NextResponse.json({ error: "غير مسموح." }, { status: 403 }); const { id } = await params; const file = await prisma.purchaseAttachment.findUnique({ where: { id } }); if (!file) return NextResponse.json({ error: "المرفق غير موجود." }, { status: 404 }); const invoice = await prisma.purchaseInvoice.findUnique({ where: { id: file.entityId }, select: { projectId: true } }); if (user.isProjectScoped && (!invoice || !user.projectIds.includes(invoice.projectId))) return NextResponse.json({ error: "غير مسموح." }, { status: 403 }); await prisma.$transaction([prisma.auditLog.create({ data: { actorId: user.id, action: "purchases.attachment.delete", target: file.entityId, details: JSON.stringify({ attachmentId: id, label: file.label, name: file.name, size: file.size }) } }), prisma.purchaseAttachment.delete({ where: { id } })]); return NextResponse.json({ ok: true }); }
