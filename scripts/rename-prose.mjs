import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
try {
  await db.$transaction(async tx => {
    for (const [action, label] of [["view", "عرض"], ["manage", "إدارة"]]) {
      const next = await tx.permission.upsert({ where: { key: `pettycash.${action}` }, update: { name: `${label} Petty Cash`, module: "pettycash" }, create: { key: `pettycash.${action}`, name: `${label} Petty Cash`, module: "pettycash" } });
      const old = await tx.permission.findUnique({ where: { key: `prose.${action}` }, include: { roles: true } });
      if (!old) continue;
      for (const grant of old.roles) await tx.rolePermission.upsert({ where: { roleId_permissionId: { roleId: grant.roleId, permissionId: next.id } }, update: {}, create: { roleId: grant.roleId, permissionId: next.id } });
      await tx.rolePermission.deleteMany({ where: { permissionId: old.id } });
      await tx.permission.delete({ where: { id: old.id } });
    }
  });
  console.log("Prose renamed to Petty Cash; existing role grants preserved. No financial records or users changed.");
} finally { await db.$disconnect(); }
