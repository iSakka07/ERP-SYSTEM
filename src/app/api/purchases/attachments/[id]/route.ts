import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { incomingUser } from "@/lib/incoming-server";

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
