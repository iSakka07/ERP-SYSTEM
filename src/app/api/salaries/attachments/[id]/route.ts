import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { incomingUser } from "@/lib/incoming-server";
import { isTrustedMutationOrigin } from "@/lib/request-security";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await incomingUser("salaries.view");
  if (!user) return NextResponse.json({ error: "غير مسموح." }, { status: 403 });
  const { id } = await params;
  const file = await prisma.salaryAttachment.findUnique({ where: { id } });
  if (!file) return NextResponse.json({ error: "المرفق غير موجود." }, { status: 404 });
  return new Response(new Uint8Array(file.data), { headers: { "Content-Type": "application/octet-stream", "Content-Disposition": "attachment; filename*=UTF-8''" + encodeURIComponent(file.name), "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store" } });
}
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) { const user = await incomingUser("salaries.manage"); if (!user || !isTrustedMutationOrigin(request)) return NextResponse.json({ error: "غير مسموح." }, { status: 403 }); const { id } = await params; const file = await prisma.salaryAttachment.findUnique({ where: { id } }); if (!file) return NextResponse.json({ error: "المرفق غير موجود." }, { status: 404 }); const target = file.payrollRunId || file.advanceId || file.bonusId || file.deductionId || id; await prisma.$transaction([prisma.auditLog.create({ data: { actorId: user.id, action: "salary.attachment.delete", target, details: JSON.stringify({ attachmentId: id, label: file.label, name: file.name, size: file.size }) } }), prisma.salaryAttachment.delete({ where: { id } })]); return NextResponse.json({ ok: true }); }
