import { redirect } from "next/navigation";
import { incomingUser } from "@/lib/incoming-server";
import { PettyCashCenter } from "@/components/petty-cash-center";
export default async function PettyCashPage() { if (!(await incomingUser("pettycash.view"))) redirect("/"); return <PettyCashCenter />; }
