import { redirect } from "next/navigation";
import { incomingUser } from "@/lib/incoming-server";
import { warehouseSnapshot } from "@/lib/warehouse";
import { WarehouseCenter } from "@/components/warehouse-center";

export default async function WarehousePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const tab = params.tab;
  const initialTab = tab === "project-stock" || tab === "receipts" || tab === "operations" || tab === "count" || tab === "ledger" ? tab : "stock";
  const receiptParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (key !== "tab" && value !== undefined) for (const entry of Array.isArray(value) ? value : [value]) receiptParams.append(key, entry);
  const viewer = await incomingUser("warehouse.view");
  if (!viewer) redirect("/");
  const manager = await incomingUser("warehouse.manage");
  const maySeeValues = Boolean(await incomingUser("purchases.view"));
  const snapshot = await warehouseSnapshot(viewer.isProjectScoped ? viewer.projectIds : undefined, maySeeValues);
  return <WarehouseCenter initial={JSON.parse(JSON.stringify(snapshot))} canManage={Boolean(manager)} canSeeValues={maySeeValues} initialTab={initialTab} initialReceiptQuery={receiptParams.toString()} />;
}
