import "server-only";
import { prisma } from "@/lib/prisma";

export const engineerRoleKeys = new Set(["technical_office_engineer", "site_supervisor_engineer"]);

export function applyPermissionOverrides(base: string[], overrides: { enabled: boolean; permission: { key: string } }[]) {
  const effective = new Set(base);
  for (const override of overrides) {
    if (override.enabled) effective.add(override.permission.key);
    else effective.delete(override.permission.key);
  }
  return [...effective];
}

export async function accessProfile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      role: { include: { permissions: { include: { permission: true } } } },
      permissionOverrides: { include: { permission: true } },
      employee: { include: { supervisors: { where: { active: true }, select: { projectId: true } } } },
    },
  });
  if (!user?.active || !user.role) return null;
  const base = user.role.permissions.map(({ permission }) => permission.key);
  const permissions = user.role.key === "admin" ? base : applyPermissionOverrides(base, user.permissionOverrides);
  return { user, permissions, projectIds: user.employee?.supervisors.map(({ projectId }) => projectId) ?? [], isProjectScoped: engineerRoleKeys.has(user.role.key) };
}

export function projectWhere(profile: { isProjectScoped: boolean; projectIds: string[] }) {
  return profile.isProjectScoped ? { id: { in: profile.projectIds } } : {};
}
