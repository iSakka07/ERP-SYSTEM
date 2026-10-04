import "server-only";
import { auth } from "@/auth";
import { accessProfile, projectWhere, type AccessProfile } from "@/lib/access-control";

const globalFinancialPermissions = new Set([
  "accounting.view", "accounting.manage", "bank.view", "bank.manage",
  "pettycash.view", "pettycash.manage", "salaries.view", "salaries.manage",
]);

export class ProjectAccessDeniedError extends Error {
  constructor() {
    super("غير مصرح لهذا المشروع.");
    this.name = "ProjectAccessDeniedError";
  }
}

export type AccessContext = Omit<AccessProfile, "user"> & {
  id: string;
  user: AccessProfile["user"];
  admin: boolean;
  roleKey: string;
  can: (permission: string) => boolean;
  canUseProject: (projectId: string | null | undefined) => boolean;
  projectWhere: () => ReturnType<typeof projectWhere>;
  projectIdWhere: () => { projectId?: { in: string[] } };
  requireProject: (projectId: string | null | undefined) => void;
};

function toAccessContext(profile: AccessProfile): AccessContext {
  const roleKey = profile.user.role!.key;
  const can = (permission: string) =>
    profile.permissions.includes(permission) &&
    !(profile.isProjectScoped && globalFinancialPermissions.has(permission));
  const canUseProject = (projectId: string | null | undefined) =>
    !profile.isProjectScoped || Boolean(projectId && profile.projectIds.includes(projectId));

  return {
    ...profile,
    id: profile.user.id,
    admin: roleKey === "admin",
    roleKey,
    can,
    canUseProject,
    projectWhere: () => projectWhere(profile),
    projectIdWhere: () => profile.isProjectScoped ? { projectId: { in: profile.projectIds } } : {},
    requireProject: (projectId) => {
      if (!canUseProject(projectId)) throw new ProjectAccessDeniedError();
    },
  };
}

/** Resolves the current authenticated user once into a reusable access context. */
export async function currentAccess(): Promise<AccessContext | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  const profile = await accessProfile(session.user.id);
  return profile ? toAccessContext(profile) : null;
}

/**
 * Central permission gate for pages and route handlers. Project-scoped users
 * are also denied global financial modules here, rather than per module.
 */
export async function requireAccess(permission: string): Promise<AccessContext | null> {
  const access = await currentAccess();
  return access?.can(permission) ? access : null;
}
