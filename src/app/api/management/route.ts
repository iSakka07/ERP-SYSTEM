import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const createSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("company"), name: z.string().trim().min(2).max(200), companyType: z.enum(["OWNER", "SUBCONTRACTOR", "SUPPLIER"]), phone: z.string().trim().max(50).optional() }),
  z.object({ type: z.literal("project"), code: z.string().trim().min(2).max(80), name: z.string().trim().min(2).max(200), companyId: z.string().min(1) }),
  z.object({ type: z.literal("engineer"), employeeCode: z.string().trim().min(2).max(80), name: z.string().trim().min(2).max(200), jobTitle: z.string().trim().min(2).max(150), phone: z.string().trim().max(50).optional(), projectId: z.string().optional() }),
]);
const deleteSchema = z.object({ entity: z.enum(["company", "project", "engineer"]), id: z.string().min(1) });
const updateEngineerSchema = z.object({
  id: z.string().min(1),
  employeeCode: z.string().trim().min(2).max(80),
  name: z.string().trim().min(2).max(200),
  jobTitle: z.string().trim().min(2).max(150),
  phone: z.string().trim().max(50).optional(),
  projectId: z.string().optional(),
});

async function manager() {
  const session = await auth();
  return session?.user && can(session.user, "masterdata.manage") ? session : null;
}
function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try { return new URL(origin).host === request.headers.get("host"); } catch { return false; }
}

export async function POST(request: Request) {
  const session = await manager();
  if (!session) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "INVALID_ORIGIN" }, { status: 403 });
  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "INVALID_DATA" }, { status: 400 });
  const data = parsed.data;
  try {
    const target = await prisma.$transaction(async (tx) => {
      let id = "";
      if (data.type === "company") {
        const company = await tx.company.create({ data: { name: data.name, type: data.companyType, phone: data.companyType === "SUBCONTRACTOR" ? data.phone || null : null } });
        id = company.id;
      }
      if (data.type === "project") {
        const owner = await tx.company.findFirst({ where: { id: data.companyId, active: true, type: "OWNER" } });
        if (!owner) throw new Error("INVALID_OWNER");
        const project = await tx.project.create({ data: { code: data.code, name: data.name, companyId: owner.id } });
        id = project.id;
      }
      if (data.type === "engineer") {
        const project = data.projectId ? await tx.project.findFirst({ where: { id: data.projectId, active: true } }) : null;
        if (data.projectId && !project) throw new Error("INVALID_PROJECT");
        const engineer = await tx.employee.create({ data: { employeeCode: data.employeeCode, name: data.name, jobTitle: data.jobTitle, phone: data.phone || null } });
        if (project) await tx.projectEngineerAssignment.create({ data: { employeeId: engineer.id, projectId: project.id, startDate: new Date() } });
        id = engineer.id;
      }
      await tx.auditLog.create({ data: { actorId: session.user.id, action: `masterdata.${data.type}.create`, target: id, details: JSON.stringify({ projectId: data.type === "engineer" ? data.projectId || null : undefined }) } });
      return id;
    });
    return NextResponse.json({ ok: true, id: target }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "INVALID_OWNER" || message === "INVALID_PROJECT") return NextResponse.json({ error: message }, { status: 400 });
    return NextResponse.json({ error: "DUPLICATE_OR_INVALID" }, { status: 409 });
  }
}

export async function PATCH(request: Request) {
  const session = await manager();
  if (!session) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "INVALID_ORIGIN" }, { status: 403 });
  const parsed = updateEngineerSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "INVALID_DATA" }, { status: 400 });
  const data = parsed.data;
  try {
    await prisma.$transaction(async (tx) => {
      const engineer = await tx.employee.findFirst({ where: { id: data.id, active: true }, include: { supervisors: { where: { active: true }, select: { projectId: true } } } });
      if (!engineer) throw new Error("INVALID_ENGINEER");
      const project = data.projectId ? await tx.project.findFirst({ where: { id: data.projectId, active: true } }) : null;
      if (data.projectId && !project) throw new Error("INVALID_PROJECT");
      const now = new Date();
      await tx.employee.update({ where: { id: data.id }, data: { employeeCode: data.employeeCode, name: data.name, jobTitle: data.jobTitle, phone: data.phone || null } });
      await tx.projectEngineerAssignment.updateMany({ where: { employeeId: data.id, active: true }, data: { active: false, endDate: now } });
      if (project) await tx.projectEngineerAssignment.create({ data: { employeeId: data.id, projectId: project.id, startDate: now } });
      await tx.auditLog.create({ data: { actorId: session.user.id, action: "masterdata.engineer.update", target: data.id, details: JSON.stringify({ previousProjectIds: engineer.supervisors.map(item => item.projectId), projectId: project?.id || null, effectiveAt: now.toISOString() }) } });
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "INVALID_ENGINEER" || message === "INVALID_PROJECT") return NextResponse.json({ error: message }, { status: 400 });
    return NextResponse.json({ error: "DUPLICATE_OR_INVALID" }, { status: 409 });
  }
}

export async function DELETE(request: Request) {
  const session = await manager();
  if (!session) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "INVALID_ORIGIN" }, { status: 403 });
  const parsed = deleteSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "INVALID_DATA" }, { status: 400 });
  const { entity, id } = parsed.data;
  try {
    await prisma.$transaction(async (tx) => {
      const now = new Date();
      if (entity === "company") await tx.company.update({ where: { id }, data: { active: false } });
      if (entity === "project") {
        await tx.project.update({ where: { id }, data: { active: false } });
        await tx.projectEngineerAssignment.updateMany({ where: { projectId: id, active: true }, data: { active: false, endDate: now } });
        await tx.employeeSalaryAllocation.updateMany({ where: { projectId: id, endDate: null }, data: { endDate: now } });
      }
      if (entity === "engineer") {
        await tx.employee.update({ where: { id }, data: { active: false } });
        await tx.projectEngineerAssignment.updateMany({ where: { employeeId: id, active: true }, data: { active: false, endDate: now } });
        await tx.employeeSalaryAllocation.updateMany({ where: { employeeId: id, endDate: null }, data: { endDate: now } });
      }
      await tx.auditLog.create({ data: { actorId: session.user.id, action: `masterdata.${entity}.delete`, target: id, details: JSON.stringify({ safeDelete: true }) } });
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "NOT_FOUND_OR_INVALID" }, { status: 404 });
  }
}
