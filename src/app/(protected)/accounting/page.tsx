import { redirect } from "next/navigation";
import { incomingUser } from "@/lib/incoming-server";
import { accountingSnapshot } from "@/lib/accounting";
import { AccountingCenter } from "@/components/accounting-center";

export default async function AccountingPage() {
  const viewer = await incomingUser("accounting.view");
  if (!viewer) redirect("/");
  const snapshot = await accountingSnapshot();

  return <AccountingCenter initial={snapshot} canManage={viewer.can("accounting.manage")} />;
}
