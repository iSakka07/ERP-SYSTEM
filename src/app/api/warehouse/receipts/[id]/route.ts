import { NextResponse } from "next/server";
import { incomingUser } from "@/lib/incoming-server";
import { receiptDetails } from "@/lib/warehouse-receipts";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await incomingUser("warehouse.view");
  if (!user) return NextResponse.json({ error: "غير مصرح بعرض تفاصيل الاستلام." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  const { id } = await params;
  const maySeeValues = Boolean(await incomingUser("purchases.view"));
  const result = await receiptDetails(id, user.isProjectScoped ? user.projectIds : undefined, maySeeValues);
  if (!result) return NextResponse.json({ error: "سجل الاستلام غير موجود أو غير متاح لحسابك." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({ ...result, maySeeValues }, { headers: { "Cache-Control": "private, no-store" } });
}
