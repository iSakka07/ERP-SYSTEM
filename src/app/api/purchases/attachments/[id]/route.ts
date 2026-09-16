import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { incomingUser } from "@/lib/incoming-server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await incomingUser("purchases.view")))
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const { id } = await params;
  const file = await prisma.purchaseAttachment.findUnique({ where: { id } });
  if (!file) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return new Response(new Uint8Array(file.data), {
    headers: {
      "content-type": file.mime,
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    },
  });
}
