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
});

const updateSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("user-role"), userId: z.string(), roleId: z.string() }),
  z.object({ type: z.literal("user-active"), userId: z.string(), active: z.boolean() }),
  z.object({ type: z.literal("role-permissions"), roleId: z.string(), permissionIds: z.array(z.string()) }),
]);

async function adminSession() {
  const session = await auth();
  return session?.user && session.user.roleKey === "admin" && can(session.user, "accounts.manage") ? session : null;
}

export async function POST(request: Request) {
  const session = await adminSession();
  if (!session) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "INVALID_DATA" }, { status: 400 });

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) return NextResponse.json({ error: "EMAIL_EXISTS" }, { status: 409 });
  const role = await prisma.role.findUnique({ where: { id: parsed.data.roleId } });
  if (!role) return NextResponse.json({ error: "ROLE_NOT_FOUND" }, { status: 404 });

  const { password, ...userData } = parsed.data;
  const user = await prisma.user.create({ data: { ...userData, passwordHash: await hash(password, 12) } });
  await prisma.auditLog.create({ data: { actorId: session.user.id, action: "account.create", target: user.id, details: JSON.stringify({ email: user.email, roleId: user.roleId }) } });
  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function PATCH(request: Request) {
  const session = await adminSession();
  if (!session) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "INVALID_DATA" }, { status: 400 });
  const data = parsed.data;

  if (data.type === "user-role") {
    if (data.userId === session.user.id) return NextResponse.json({ error: "SELF_ROLE_CHANGE" }, { status: 400 });
    await prisma.user.update({ where: { id: data.userId }, data: { roleId: data.roleId } });
    await prisma.auditLog.create({ data: { actorId: session.user.id, action: "account.role.update", target: data.userId, details: JSON.stringify({ roleId: data.roleId }) } });
  }
  if (data.type === "user-active") {
    if (data.userId === session.user.id) return NextResponse.json({ error: "SELF_DEACTIVATE" }, { status: 400 });
    await prisma.user.update({ where: { id: data.userId }, data: { active: data.active } });
    await prisma.auditLog.create({ data: { actorId: session.user.id, action: "account.status.update", target: data.userId, details: JSON.stringify({ active: data.active }) } });
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
    await prisma.$transaction([
      prisma.rolePermission.deleteMany({ where: { roleId: data.roleId } }),
      prisma.rolePermission.createMany({ data: requested.map(({ id: permissionId }) => ({ roleId: data.roleId, permissionId })) }),
    ]);
    await prisma.auditLog.create({ data: { actorId: session.user.id, action: "role.permissions.update", target: data.roleId, details: JSON.stringify({ permissionIds: data.permissionIds }) } });
  }
  return NextResponse.json({ ok: true });
}
