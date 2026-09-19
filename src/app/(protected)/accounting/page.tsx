import { redirect } from "next/navigation";
import { incomingUser } from "@/lib/incoming-server";
import { accountingSnapshot } from "@/lib/accounting";
import { AccountingCenter } from "@/components/accounting-center";
import { AccountingPeriods } from "@/components/accounting-periods";

export default async function AccountingPage() {
  if (!(await incomingUser("accounting.view"))) redirect("/");
  const [snapshot, manager] = await Promise.all([
    accountingSnapshot(),
    incomingUser("accounting.manage"),
  ]);

  return (
    <>
      <AccountingCenter initial={snapshot} canManage={Boolean(manager)} />
      <div className="mx-auto w-full max-w-7xl px-4 pb-8 sm:px-6 lg:px-8">
        <AccountingPeriods periods={snapshot.periods} canManage={Boolean(manager)} />
      </div>
    </>
  );
}
