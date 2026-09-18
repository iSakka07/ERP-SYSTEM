import { redirect } from "next/navigation";
import { incomingUser } from "@/lib/incoming-server";
import { accountingSnapshot } from "@/lib/accounting";
import { AccountingCenter } from "@/components/accounting-center";

export default async function AccountingPage() {
  if (!(await incomingUser("accounting.view"))) redirect("/");
  return <AccountingCenter initial={await accountingSnapshot()} canManage={Boolean(await incomingUser("accounting.manage"))} />;
}
