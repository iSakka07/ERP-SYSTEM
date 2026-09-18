import { redirect } from "next/navigation";
import { incomingUser } from "@/lib/incoming-server";
import { BankCenter } from "@/components/bank-center";
export default async function BankPage() { if (!(await incomingUser("bank.view"))) redirect("/"); return <BankCenter />; }
