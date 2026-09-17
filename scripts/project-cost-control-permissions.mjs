import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
try {
  const permission = await prisma.permission.upsert({ where: { key: "project_cost_control.view" }, update: { name: "عرض موقف تكلفة المشروع", module: "project_cost_control" }, create: { key: "project_cost_control.view", name: "عرض موقف تكلفة المشروع", module: "project_cost_control" } });
  const roles = await prisma.role.findMany({ where: { key: { in: ["admin", "accountant"] } } });
  for (const role of roles) await prisma.rolePermission.upsert({ where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } }, update: {}, create: { roleId: role.id, permissionId: permission.id } });
  console.log("Project Cost Control permission is ready for admin and accountant.");
} finally { await prisma.$disconnect(); }
