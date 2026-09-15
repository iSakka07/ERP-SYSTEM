import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();
const permissions = [
  ["dashboard.view", "عرض لوحة الإدارة", "dashboard"],
  ["incoming.view", "عرض الوارد", "incoming"], ["incoming.manage", "إدارة الوارد", "incoming"],
  ["expenses.view", "عرض مستخلصات المقاولين", "expenses"], ["expenses.manage", "إدارة مستخلصات المقاولين", "expenses"],
  ["purchases.view", "عرض المشتريات", "purchases"], ["purchases.manage", "إدارة المشتريات", "purchases"],
  ["prose.view", "عرض النثريات", "prose"], ["prose.manage", "إدارة النثريات", "prose"],
  ["salaries.view", "عرض المرتبات", "salaries"], ["salaries.manage", "إدارة المرتبات", "salaries"],
  ["treasury.view", "عرض الخزنة", "treasury"], ["treasury.manage", "إدارة الخزنة", "treasury"],
  ["accounts.manage", "إدارة الحسابات والصلاحيات", "accounts"],
];

const roles = [["admin", "مدير النظام"], ["accountant", "محاسب"], ["storekeeper", "أمين مخزن"], ["sales", "مبيعات"]];
const grants = /** @type {Record<string, string[]>} */ ({
  admin: permissions.map(([key]) => key),
  accountant: permissions.map(([key]) => key).filter((key) => key !== "accounts.manage"),
  storekeeper: ["dashboard.view", "purchases.view", "purchases.manage"],
  sales: ["dashboard.view"],
});

try {
  for (const [key, name, module] of permissions) {
    await prisma.permission.upsert({ where: { key }, update: { name, module }, create: { key, name, module } });
  }
  for (const [key, name] of roles) {
    const role = await prisma.role.upsert({ where: { key }, update: { name }, create: { key, name } });
    const allowed = await prisma.permission.findMany({ where: { key: { in: grants[key] } } });
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({ data: allowed.map((permission) => ({ roleId: role.id, permissionId: permission.id })) });
  }

  const passwordHash = await hash("Admin@123456", 12);
  const seededUsers = [
    ["مدير النظام", "admin@erp.local", "admin"], ["المحاسب التجريبي", "accountant@erp.local", "accountant"],
    ["أمين المخزن التجريبي", "storekeeper@erp.local", "storekeeper"], ["مستخدم المبيعات التجريبي", "sales@erp.local", "sales"],
  ];
  for (const [name, email, roleKey] of seededUsers) {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
    await prisma.user.upsert({ where: { email }, update: { name, passwordHash, active: true, roleId: role.id }, create: { name, email, passwordHash, roleId: role.id } });
  }
  console.log("Phase 2 roles, permissions, and demo users are ready.");
} finally {
  await prisma.$disconnect();
}
