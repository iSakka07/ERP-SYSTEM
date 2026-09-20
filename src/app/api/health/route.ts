import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    // لا يكشف الفحص أي رصيد أو إعداد أو رسالة داخلية؛ يكفي التأكد من اتصال قاعدة البيانات.
    await prisma.systemMetadata.count();
    return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
