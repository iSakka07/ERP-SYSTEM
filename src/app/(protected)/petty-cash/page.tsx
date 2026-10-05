import { redirect } from "next/navigation";
import { incomingUser } from "@/lib/incoming-server";
import { PettyCashCenter } from "@/components/petty-cash-center";
import { getPettyCashData } from "@/lib/petty-cash-data";

export default async function PettyCashPage() {
  const user = await incomingUser("pettycash.view");
  if (!user) redirect("/");
  return (
    <PettyCashCenter
      initialData={await getPettyCashData(user.can("pettycash.manage"))}
    />
  );
}
