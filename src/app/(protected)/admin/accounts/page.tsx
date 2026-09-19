import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AccountsManager } from "@/components/accounts-manager";
import { prisma } from "@/lib/prisma";

export default async function AccountsPage() {
  const session = await auth();
  if (!session?.user || session.user.roleKey !== "admin") redirect("/");

  const [users, roles, permissions, employees] = await Promise.all([
    prisma.user.findMany({ include: { role: true, employee: true, permissionOverrides: { include: { permission: true } } }, orderBy: { createdAt: "asc" } }),
    prisma.role.findMany({ include: { permissions: true }, orderBy: { createdAt: "asc" } }),
    prisma.permission.findMany({ orderBy: [{ module: "asc" }, { key: "asc" }] }),
    prisma.employee.findMany({ where: { active: true }, select: { id: true, name: true, employeeCode: true }, orderBy: { name: "asc" } }),
  ]);

  return <AccountsManager currentUserId={session.user.id} employees={employees} users={users.map((user) => ({ id: user.id, name: user.name, email: user.email, active: user.active, roleId: user.roleId, role: user.role, employeeId: user.employeeId, employee: user.employee, overrides: Object.fromEntries(user.permissionOverrides.map((item) => [item.permission.key, item.enabled])) }))} roles={roles} permissions={permissions} />;
}
