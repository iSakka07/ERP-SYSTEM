import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { incomingUser } from "@/lib/incoming-server";
import { assertMutation } from "@/lib/request-security";

const isTrustedMutationOrigin = (request: Request) => !assertMutation(request);
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await incomingUser("expenses.view");
  if (!user)
    return NextResponse.json({ error: "غير مسموح." }, { status: 403 });
  const { id } = await params;
  const f = await prisma.expenseAttachment.findUnique({ where: { id } });
  if (!f)
    return NextResponse.json({ error: "المرفق غير موجود." }, { status: 404 });
  if (user.isProjectScoped) {
    const projectId = f.entityType === "account" ? (await prisma.subcontractAccount.findUnique({ where: { id: f.entityId }, select: { projectId: true } }))?.projectId : f.entityType === "statement" ? (await prisma.subcontractStatement.findUnique({ where: { id: f.entityId }, include: { account: { select: { projectId: true } } } }))?.account.projectId : f.entityType === "withdrawal" ? (await prisma.workWithdrawal.findUnique({ where: { id: f.entityId }, include: { sourceAccount: { select: { projectId: true } } } }))?.sourceAccount.projectId : (await prisma.subcontractPayment.findUnique({ where: { id: f.entityId }, include: { statement: { include: { account: { select: { projectId: true } } } } } }))?.statement.account.projectId;
    if (!user.canUseProject(projectId)) return NextResponse.json({ error: "غير مسموح." }, { status: 403 });
  }
  return new Response(new Uint8Array(f.data), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) { const user = await incomingUser("expenses.manage"); if (!user || !isTrustedMutationOrigin(request)) return NextResponse.json({ error: "غير مسموح." }, { status: 403 }); const { id } = await params; const file = await prisma.expenseAttachment.findUnique({ where: { id } }); if (!file) return NextResponse.json({ error: "المرفق غير موجود." }, { status: 404 }); let projectId: string | undefined; if (file.entityType === "account") projectId = (await prisma.subcontractAccount.findUnique({ where: { id: file.entityId }, select: { projectId: true } }))?.projectId; else if (file.entityType === "statement") projectId = (await prisma.subcontractStatement.findUnique({ where: { id: file.entityId }, include: { account: { select: { projectId: true } } } }))?.account.projectId; else if (file.entityType === "payment") projectId = (await prisma.subcontractPayment.findUnique({ where: { id: file.entityId }, include: { statement: { include: { account: { select: { projectId: true } } } } } }))?.statement.account.projectId; if (!user.canUseProject(projectId)) return NextResponse.json({ error: "غير مسموح." }, { status: 403 }); await prisma.$transaction([prisma.auditLog.create({ data: { actorId: user.id, action: "expenses.attachment.delete", target: file.entityId, details: JSON.stringify({ attachmentId: id, label: file.label, name: file.name, size: file.size }) } }), prisma.expenseAttachment.delete({ where: { id } })]); return NextResponse.json({ ok: true }); }
