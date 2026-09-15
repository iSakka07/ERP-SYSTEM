import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AccountsManager } from "@/components/accounts-manager";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export default async function AccountsPage() {
  const session = await auth();
  if (!session?.user || !can(session.user, "accounts.manage")) redirect("/");

  const [users, roles, permissions] = await Promise.all([
    prisma.user.findMany({ include: { role: true }, orderBy: { createdAt: "asc" } }),
    prisma.role.findMany({ include: { permissions: true }, orderBy: { createdAt: "asc" } }),
    prisma.permission.findMany({ orderBy: [{ module: "asc" }, { key: "asc" }] }),
  ]);

  return <AccountsManager currentUserId={session.user.id} users={users.map((user) => ({ id: user.id, name: user.name, email: user.email, active: user.active, roleId: user.roleId, role: user.role }))} roles={roles} permissions={permissions} />;
}
