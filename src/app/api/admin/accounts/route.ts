import { hash } from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const createSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(128),
  roleId: z.string().min(1),
  employeeId: z.string().optional(),
});

const updateSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("user-role"), userId: z.string(), roleId: z.string() }),
  z.object({ type: z.literal("user-active"), userId: z.string(), active: z.boolean() }),
  z.object({ type: z.literal("user-profile"), userId: z.string(), employeeId: z.string().nullable().optional(), incomingVisible: z.boolean(), financialVisible: z.boolean() }),
  z.object({ type: z.literal("role-permissions"), roleId: z.string(), permissionIds: z.array(z.string()) }),
]);

async function adminSession() {
  const session = await auth();
  return session?.user && session.user.roleKey === "admin" && can(session.user, "accounts.manage") ? session : null;
}

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const session = await adminSession();
  if (!session) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "INVALID_ORIGIN" }, { status: 403 });
  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "INVALID_DATA" }, { status: 400 });

  const { password, ...userData } = parsed.data;
  const passwordHash = await hash(password, 12);
  try {
    await prisma.$transaction(async (tx) => {
      const [existing, role] = await Promise.all([
        tx.user.findUnique({ where: { email: userData.email } }),
        tx.role.findUnique({ where: { id: userData.roleId } }),
      ]);
      if (existing) throw new Error("EMAIL_EXISTS");
      if (!role) throw new Error("ROLE_NOT_FOUND");
      const employeeId = userData.employeeId || null;
      if (employeeId && !(await tx.employee.findUnique({ where: { id: employeeId } }))) throw new Error("EMPLOYEE_NOT_FOUND");
      const user = await tx.user.create({ data: { name: userData.name, email: userData.email, roleId: userData.roleId, employeeId, passwordHash } });
      await tx.auditLog.create({ data: { actorId: session.user.id, action: "account.create", target: user.id, details: JSON.stringify({ email: user.email, roleId: user.roleId }) } });
    });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    return NextResponse.json({ error: code === "EMAIL_EXISTS" || code === "ROLE_NOT_FOUND" ? code : "CREATE_FAILED" }, { status: code === "EMAIL_EXISTS" ? 409 : code === "ROLE_NOT_FOUND" ? 404 : 400 });
  }
}

export async function PATCH(request: Request) {
  const session = await adminSession();
  if (!session) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "INVALID_ORIGIN" }, { status: 403 });
  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "INVALID_DATA" }, { status: 400 });
  const data = parsed.data;

  if (data.type === "user-role") {
    if (data.userId === session.user.id) return NextResponse.json({ error: "SELF_ROLE_CHANGE" }, { status: 400 });
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: data.userId }, data: { roleId: data.roleId } });
      await tx.auditLog.create({ data: { actorId: session.user.id, action: "account.role.update", target: data.userId, details: JSON.stringify({ roleId: data.roleId }) } });
    });
  }
  if (data.type === "user-active") {
    if (data.userId === session.user.id) return NextResponse.json({ error: "SELF_DEACTIVATE" }, { status: 400 });
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: data.userId }, data: { active: data.active } });
      await tx.auditLog.create({ data: { actorId: session.user.id, action: "account.status.update", target: data.userId, details: JSON.stringify({ active: data.active }) } });
    });
  }
  if (data.type === "user-profile") {
    if (data.userId === session.user.id) return NextResponse.json({ error: "SELF_PROFILE_CHANGE" }, { status: 400 });
    await prisma.$transaction(async (tx) => {
      if (data.employeeId && !(await tx.employee.findUnique({ where: { id: data.employeeId } }))) throw new Error("EMPLOYEE_NOT_FOUND");
      const [incoming, financial] = await Promise.all([
        tx.permission.findUniqueOrThrow({ where: { key: "incoming.view" } }),
        tx.permission.findUniqueOrThrow({ where: { key: "project_cost_control.view" } }),
      ]);
      await tx.user.update({ where: { id: data.userId }, data: { employeeId: data.employeeId || null } });
      await tx.userPermissionOverride.upsert({ where: { userId_permissionId: { userId: data.userId, permissionId: incoming.id } }, update: { enabled: data.incomingVisible }, create: { userId: data.userId, permissionId: incoming.id, enabled: data.incomingVisible } });
      await tx.userPermissionOverride.upsert({ where: { userId_permissionId: { userId: data.userId, permissionId: financial.id } }, update: { enabled: data.financialVisible }, create: { userId: data.userId, permissionId: financial.id, enabled: data.financialVisible } });
      await tx.auditLog.create({ data: { actorId: session.user.id, action: "account.profile.update", target: data.userId, details: JSON.stringify({ employeeId: data.employeeId || null, incomingVisible: data.incomingVisible, financialVisible: data.financialVisible }) } });
    });
  }
  if (data.type === "role-permissions") {
    const role = await prisma.role.findUniqueOrThrow({ where: { id: data.roleId } });
    if (role.key === "admin") return NextResponse.json({ error: "ADMIN_LOCKED" }, { status: 400 });
    const requested = await prisma.permission.findMany({
      where: { id: { in: data.permissionIds } },
      select: { id: true, key: true },
    });
    if (requested.length !== new Set(data.permissionIds).size)
      return NextResponse.json({ error: "INVALID_PERMISSION" }, { status: 400 });
    if (requested.some((permission) => permission.key === "accounts.manage"))
      return NextResponse.json({ error: "ADMIN_PERMISSION_LOCKED" }, { status: 400 });
    await prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId: data.roleId } });
      await tx.rolePermission.createMany({ data: requested.map(({ id: permissionId }) => ({ roleId: data.roleId, permissionId })) });
      await tx.auditLog.create({ data: { actorId: session.user.id, action: "role.permissions.update", target: data.roleId, details: JSON.stringify({ permissionIds: data.permissionIds }) } });
    });
  }
  return NextResponse.json({ ok: true });
}
