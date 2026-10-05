import { redirect } from "next/navigation";
import { incomingUser } from "@/lib/incoming-server";
import { BankCenter } from "@/components/bank-center";
import { getBankData } from "@/lib/bank-data";

export default async function BankPage() {
  const user = await incomingUser("bank.view");
  if (!user) redirect("/");
  return <BankCenter initialData={await getBankData(user.can("bank.manage"))} />;
}
