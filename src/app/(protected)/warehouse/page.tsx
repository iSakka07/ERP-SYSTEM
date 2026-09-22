import { redirect } from "next/navigation";
import { incomingUser } from "@/lib/incoming-server";
import { warehouseSnapshot } from "@/lib/warehouse";
import { WarehouseCenter } from "@/components/warehouse-center";

export default async function WarehousePage() {
  const viewer = await incomingUser("warehouse.view");
  if (!viewer) redirect("/");
  const manager = await incomingUser("warehouse.manage");
  const snapshot = await warehouseSnapshot(viewer.isProjectScoped ? viewer.projectIds : undefined);
  return <WarehouseCenter initial={JSON.parse(JSON.stringify(snapshot))} canManage={Boolean(manager)} />;
}
