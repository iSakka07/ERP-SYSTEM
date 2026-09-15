import { incomingUser } from "@/lib/incoming-server";
import { prisma } from "@/lib/prisma";
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!(await incomingUser("incoming.view")))
    return new Response("Forbidden", { status: 403 });
  const { id } = await context.params;
  const file = await prisma.incomingAttachment.findUnique({ where: { id } });
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.mime,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
