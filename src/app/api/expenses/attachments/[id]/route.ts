import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { incomingUser } from "@/lib/incoming-server";
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
    const projectId = f.entityType === "account" ? (await prisma.subcontractAccount.findUnique({ where: { id: f.entityId }, select: { projectId: true } }))?.projectId : f.entityType === "statement" ? (await prisma.subcontractStatement.findUnique({ where: { id: f.entityId }, include: { account: { select: { projectId: true } } } }))?.account.projectId : (await prisma.subcontractPayment.findUnique({ where: { id: f.entityId }, include: { statement: { include: { account: { select: { projectId: true } } } } } }))?.statement.account.projectId;
    if (!projectId || !user.projectIds.includes(projectId)) return NextResponse.json({ error: "غير مسموح." }, { status: 403 });
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
