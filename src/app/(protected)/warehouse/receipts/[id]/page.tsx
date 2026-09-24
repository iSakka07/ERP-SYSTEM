import { notFound, redirect } from "next/navigation";
import { incomingUser } from "@/lib/incoming-server";
import { receiptDetails } from "@/lib/warehouse-receipts";
import { WarehouseReceiptDetail } from "@/components/warehouse-receipt-detail";

export default async function WarehouseReceiptPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ returnTo?: string }> }) {
  const viewer = await incomingUser("warehouse.view");
  if (!viewer) redirect("/");
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const maySeeValues = Boolean(await incomingUser("purchases.view"));
  const detail = await receiptDetails(id, viewer.isProjectScoped ? viewer.projectIds : undefined, maySeeValues);
  if (!detail) notFound();
  const returnTo = query.returnTo?.startsWith("/warehouse?tab=receipts") && !query.returnTo.startsWith("//") ? query.returnTo : "/warehouse?tab=receipts";
  return <WarehouseReceiptDetail receipt={JSON.parse(JSON.stringify({ ...detail, maySeeValues }))} returnTo={returnTo} />;
}
