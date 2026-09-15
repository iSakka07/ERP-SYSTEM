import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
export const expensePermissions = [
  ["expenses.approve_technical", "اعتماد حصر المكتب الفني"],
  ["expenses.approve_site", "اعتماد مهندس الموقع"],
  ["expenses.approve_executive", "اعتماد المدير التنفيذي"],
  ["expenses.pay", "استلام الحسابات وتسجيل دفعات المقاولين"],
  ["expenses.return", "رد مستخلص للمراجعة"],
];
try {
  for (const [key, name] of expensePermissions) {
    const permission = await prisma.permission.upsert({
      where: { key },
      update: { name, module: "expenses" },
      create: { key, name, module: "expenses" },
    });
    const roles = await prisma.role.findMany({
      where: {
        key: {
          in: key === "expenses.pay" ? ["admin", "accountant"] : ["admin"],
        },
      },
    });
    for (const role of roles)
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: { roleId: role.id, permissionId: permission.id },
        },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
  }
  console.log(
    "Expenses permissions added. Existing passwords, user status and other grants untouched.",
  );
} finally {
  await prisma.$disconnect();
}
