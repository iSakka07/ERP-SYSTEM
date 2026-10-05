import { redirect } from "next/navigation";
import { incomingUser } from "@/lib/incoming-server";
import { getExecutiveFundData } from "@/lib/executive-fund-data";
import { ExecutiveFundCenter } from "@/components/executive-fund-center";

const managers = new Set(["admin", "accountant", "executive_director"]);

export default async function ExecutiveFundPage() {
  const user = await incomingUser("pettycash.view");
  if (!user) redirect("/");
  const canManage = user.can("pettycash.manage") && managers.has(user.roleKey);
  return <ExecutiveFundCenter initialData={await getExecutiveFundData(canManage)} />;
}
