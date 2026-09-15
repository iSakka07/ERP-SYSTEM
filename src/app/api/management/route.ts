import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const createSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("company"), name: z.string().trim().min(2), companyType: z.enum(["OWNER", "SUBCONTRACTOR", "SUPPLIER"]), taxNumber: z.string().trim().optional(), phone: z.string().trim().optional() }),
  z.object({ type: z.literal("sector"), name: z.string().trim().min(2), companyId: z.string().optional() }),
  z.object({ type: z.literal("project"), code: z.string().trim().min(2), name: z.string().trim().min(2), companyId: z.string().min(1), sectorId: z.string().optional() }),
  z.object({ type: z.literal("engineer"), employeeCode: z.string().trim().min(2), name: z.string().trim().min(2), jobTitle: z.string().trim().min(2), phone: z.string().trim().optional() }),
  z.object({ type: z.literal("assignment"), projectId: z.string().min(1), employeeId: z.string().min(1), startDate: z.string().optional() }),
]);

const statusSchema = z.object({ entity: z.enum(["company", "sector", "project", "engineer", "assignment"]), id: z.string(), active: z.boolean() });

async function manager() {
  const session = await auth();
  return session?.user && can(session.user, "masterdata.manage") ? session : null;
}

export async function POST(request: Request) {
  const session = await manager();
  if (!session) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "INVALID_DATA" }, { status: 400 });
  const data = parsed.data;
  let target = "";

  try {
    if (data.type === "company") target = (await prisma.company.create({ data: { name: data.name, type: data.companyType, taxNumber: data.taxNumber || null, phone: data.phone || null } })).id;
    if (data.type === "sector") target = (await prisma.sector.create({ data: { name: data.name, companyId: data.companyId || null } })).id;
    if (data.type === "project") target = (await prisma.project.create({ data: { code: data.code, name: data.name, companyId: data.companyId, sectorId: data.sectorId || null } })).id;
    if (data.type === "engineer") target = (await prisma.employee.create({ data: { employeeCode: data.employeeCode, name: data.name, jobTitle: data.jobTitle, phone: data.phone || null } })).id;
    if (data.type === "assignment") target = (await prisma.projectEngineerAssignment.create({ data: { projectId: data.projectId, employeeId: data.employeeId, startDate: data.startDate ? new Date(data.startDate) : new Date() } })).id;
  } catch {
    return NextResponse.json({ error: "DUPLICATE_OR_INVALID" }, { status: 409 });
  }
  await prisma.auditLog.create({ data: { actorId: session.user.id, action: `masterdata.${data.type}.create`, target } });
  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function PATCH(request: Request) {
  const session = await manager();
  if (!session) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const parsed = statusSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "INVALID_DATA" }, { status: 400 });
  const { entity, id, active } = parsed.data;
  if (entity === "company") await prisma.company.update({ where: { id }, data: { active } });
  if (entity === "sector") await prisma.sector.update({ where: { id }, data: { active } });
  if (entity === "project") await prisma.project.update({ where: { id }, data: { active } });
  if (entity === "engineer") await prisma.employee.update({ where: { id }, data: { active } });
  if (entity === "assignment") await prisma.projectEngineerAssignment.update({ where: { id }, data: { active, endDate: active ? null : new Date() } });
  await prisma.auditLog.create({ data: { actorId: session.user.id, action: `masterdata.${entity}.status`, target: id, details: JSON.stringify({ active }) } });
  return NextResponse.json({ ok: true });
}
