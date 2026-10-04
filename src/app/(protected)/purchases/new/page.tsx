import { redirect } from "next/navigation";
import { PurchaseInvoicePage } from "@/components/purchase-invoice-page";
import { incomingUser } from "@/lib/incoming-server";
import { projectWhere } from "@/lib/access-control";
import { prisma } from "@/lib/prisma";
import { balanceForAccount } from "@/lib/petty-cash";

function safeReturn(value?: string) {
  return value?.startsWith("/purchases") && !value.startsWith("//") ? value : "/purchases";
}

export default async function NewPurchaseInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ return?: string }>;
}) {
  const user = await incomingUser("purchases.manage");
  if (!user) redirect("/purchases");
  const [projects, suppliers, warehouses, custodyAccounts, pettyTransactions] = await Promise.all([
    prisma.project.findMany({ where: { active: true, ...projectWhere(user) }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.company.findMany({ where: { active: true, type: "SUPPLIER" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.warehouse.findMany({ where: { active: true, type: { not: "PROJECT" } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.pettyCashAccount.findMany({ where: { active: true, type: "EMPLOYEE" }, include: { employee: { select: { name: true } } }, orderBy: { name: "asc" } }),
    prisma.pettyCashTransaction.findMany({ where: { status: "POSTED" }, select: { amountCents: true, sourceAccountId: true, destinationAccountId: true, status: true } }),
  ]);
  const employeeCustodies = custodyAccounts.map((account) => ({ id: account.id, name: account.employee?.name || account.name, balanceCents: balanceForAccount(pettyTransactions as never[], account.id) }));
  return <PurchaseInvoicePage projects={projects} suppliers={suppliers} warehouses={warehouses} employeeCustodies={employeeCustodies} returnHref={safeReturn((await searchParams).return)} />;
}
