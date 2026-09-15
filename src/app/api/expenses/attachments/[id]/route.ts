import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { incomingUser } from "@/lib/incoming-server";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await incomingUser("expenses.view")))
    return NextResponse.json({ error: "غير مسموح." }, { status: 403 });
  const { id } = await params;
  const f = await prisma.expenseAttachment.findUnique({ where: { id } });
  if (!f)
    return NextResponse.json({ error: "المرفق غير موجود." }, { status: 404 });
  return new Response(new Uint8Array(f.data), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
