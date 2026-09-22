import { redirect } from "next/navigation";
import { PurchaseInvoicePage } from "@/components/purchase-invoice-page";
import { incomingUser } from "@/lib/incoming-server";
import { prisma } from "@/lib/prisma";

function safeReturn(value?: string) {
  return value?.startsWith("/purchases") && !value.startsWith("//") ? value : "/purchases";
}

export default async function NewPurchaseInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ return?: string }>;
}) {
  if (!(await incomingUser("purchases.manage"))) redirect("/purchases");
  const [projects, suppliers, warehouses] = await Promise.all([
    prisma.project.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.company.findMany({ where: { active: true, type: "SUPPLIER" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.warehouse.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return <PurchaseInvoicePage projects={projects} suppliers={suppliers} warehouses={warehouses} returnHref={safeReturn((await searchParams).return)} />;
}
