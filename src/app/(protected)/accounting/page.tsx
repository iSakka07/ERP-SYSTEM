import { redirect } from "next/navigation";
import { incomingUser } from "@/lib/incoming-server";
import { accountingSnapshot } from "@/lib/accounting";
import { AccountingCenter } from "@/components/accounting-center";

export default async function AccountingPage() {
  if (!(await incomingUser("accounting.view"))) redirect("/");
  const snapshot = await accountingSnapshot();

  return <AccountingCenter initial={snapshot} canManage={Boolean(await incomingUser("accounting.manage"))} />;
}
