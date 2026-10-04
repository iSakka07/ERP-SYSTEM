import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { incomingUser } from "@/lib/incoming-server";
import { assertMutation } from "@/lib/request-security";
import { apiError } from "@/lib/api-error";

const isTrustedMutationOrigin = (request: Request) => !assertMutation(request);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await incomingUser("purchases.view");
  if (!user)
    return apiError("FORBIDDEN", 403);
  const { id } = await params;
  const file = await prisma.purchaseAttachment.findUnique({ where: { id } });
  if (!file) return apiError("NOT_FOUND", 404, "المرفق المطلوب غير موجود.");
  if (user.isProjectScoped) {
    const invoice = await prisma.purchaseInvoice.findUnique({ where: { id: file.entityId }, select: { projectId: true } });
    if (!invoice || !user.canUseProject(invoice.projectId)) return apiError("FORBIDDEN", 403, "ليس لديك صلاحية لعرض مرفقات هذا المشروع.");
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
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) { const user = await incomingUser("purchases.manage"); if (!user || !isTrustedMutationOrigin(request)) return NextResponse.json({ error: "غير مسموح." }, { status: 403 }); const { id } = await params; const file = await prisma.purchaseAttachment.findUnique({ where: { id } }); if (!file) return NextResponse.json({ error: "المرفق غير موجود." }, { status: 404 }); const invoice = await prisma.purchaseInvoice.findUnique({ where: { id: file.entityId }, select: { projectId: true } }); if (!invoice || !user.canUseProject(invoice.projectId)) return NextResponse.json({ error: "غير مسموح." }, { status: 403 }); await prisma.$transaction([prisma.auditLog.create({ data: { actorId: user.id, action: "purchases.attachment.delete", target: file.entityId, details: JSON.stringify({ attachmentId: id, label: file.label, name: file.name, size: file.size }) } }), prisma.purchaseAttachment.delete({ where: { id } })]); return NextResponse.json({ ok: true }); }
