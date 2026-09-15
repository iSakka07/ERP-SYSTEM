export type PermissionUser = { permissions?: string[] | null };

export function can(user: PermissionUser | null | undefined, permission: string) {
  return Boolean(user?.permissions?.includes(permission));
}
