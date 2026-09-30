import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { isTrustedMutationOrigin } from "@/lib/request-security";
import { employeeJobPrefixes, nextEmployeeCode } from "@/lib/employee-codes";

const createSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("company"), name: z.string().trim().min(2).max(200), companyType: z.enum(["OWNER", "SUBCONTRACTOR", "SUPPLIER"]), isEngineeringAuthority: z.preprocess(value => value === true || value === "true" || value === "on", z.boolean()), workNature: z.string().trim().max(200).optional(), phone: z.string().trim().max(50).optional() }),
  z.object({ type: z.literal("project"), code: z.string().trim().min(2).max(80), name: z.string().trim().min(2).max(200), companyId: z.string().min(1) }),
  z.object({ type: z.literal("engineer"), name: z.string().trim().min(2).max(200), jobTitle: z.enum(Object.keys(employeeJobPrefixes) as [keyof typeof employeeJobPrefixes, ...(keyof typeof employeeJobPrefixes)[]]), phone: z.string().trim().max(50).optional(), projectId: z.string().optional() }),
]);
const deleteSchema = z.object({ entity: z.enum(["company", "project", "engineer"]), id: z.string().min(1) });
const updateSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("company"), id: z.string().min(1), name: z.string().trim().min(2).max(200), companyType: z.enum(["OWNER", "SUBCONTRACTOR", "SUPPLIER"]), isEngineeringAuthority: z.preprocess(value => value === true || value === "true" || value === "on", z.boolean()), workNature: z.string().trim().max(200).optional(), phone: z.string().trim().max(50).optional() }),
  z.object({ type: z.literal("project"), id: z.string().min(1), code: z.string().trim().min(2).max(80), name: z.string().trim().min(2).max(200), companyId: z.string().min(1) }),
  z.object({ type: z.literal("engineer"), id: z.string().min(1), name: z.string().trim().min(2).max(200), jobTitle: z.string().trim().min(2).max(150), phone: z.string().trim().max(50).optional(), projectId: z.string().optional() }),
]);

async function manager() {
  const session = await auth();
  return session?.user && can(session.user, "masterdata.manage") ? session : null;
}
function sameOrigin(request: Request) {
  return isTrustedMutationOrigin(request);
}

export async function GET(request: Request) {
  const session = await manager();
  if (!session) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const jobTitle = new URL(request.url).searchParams.get("jobTitle");
  if (!jobTitle || !(jobTitle in employeeJobPrefixes)) return NextResponse.json({ error: "INVALID_JOB_TITLE" }, { status: 400 });
  const prefix = employeeJobPrefixes[jobTitle as keyof typeof employeeJobPrefixes];
  const employees = await prisma.employee.findMany({ where: { employeeCode: { startsWith: `${prefix}-` } }, select: { employeeCode: true } });
  return NextResponse.json({ employeeCode: nextEmployeeCode(prefix, employees.map(item => item.employeeCode)) });
}

export async function POST(request: Request) {
  const session = await manager();
  if (!session) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "INVALID_ORIGIN" }, { status: 403 });
  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "INVALID_DATA" }, { status: 400 });
  const data = parsed.data;
  try {
    const create = () => prisma.$transaction(async (tx) => {
      let id = "";
      if (data.type === "company") {
        const company = await tx.company.create({ data: { name: data.name, type: data.companyType, isEngineeringAuthority: data.companyType === "OWNER" && data.isEngineeringAuthority, workNature: data.companyType === "OWNER" ? null : data.workNature || null, phone: ["SUBCONTRACTOR", "SUPPLIER"].includes(data.companyType) ? data.phone || null : null } });
        id = company.id;
      }
      if (data.type === "project") {
        const owner = await tx.company.findFirst({ where: { id: data.companyId, active: true, type: "OWNER" } });
        if (!owner) throw new Error("INVALID_OWNER");
        const project = await tx.project.create({ data: { code: data.code, name: data.name, companyId: owner.id } });
        await tx.warehouse.create({ data: { code: `PRJ-${data.code}`, name: `مخزن مشروع — ${data.name}`, type: "PROJECT", projectId: project.id } });
        id = project.id;
      }
      if (data.type === "engineer") {
        const project = data.projectId ? await tx.project.findFirst({ where: { id: data.projectId, active: true } }) : null;
        if (data.projectId && !project) throw new Error("INVALID_PROJECT");
        const prefix = employeeJobPrefixes[data.jobTitle];
        const existing = await tx.employee.findMany({ where: { employeeCode: { startsWith: `${prefix}-` } }, select: { employeeCode: true } });
        const employeeCode = nextEmployeeCode(prefix, existing.map(item => item.employeeCode));
        const engineer = await tx.employee.create({ data: { employeeCode, name: data.name, jobTitle: data.jobTitle, phone: data.phone || null } });
        if (project) await tx.projectEngineerAssignment.create({ data: { employeeId: engineer.id, projectId: project.id, startDate: new Date() } });
        id = engineer.id;
      }
      await tx.auditLog.create({ data: { actorId: session.user.id, action: `masterdata.${data.type}.create`, target: id, details: JSON.stringify({ projectId: data.type === "engineer" ? data.projectId || null : undefined }) } });
      return id;
    });
    let target = "";
    if (data.type === "engineer") {
      let lastError: unknown;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try { target = await create(); lastError = null; break; }
        catch (error) {
          lastError = error;
          const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
          if (code !== "P2002" && code !== "P2034") throw error;
        }
      }
      if (lastError) throw lastError;
    } else target = await create();
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
  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "INVALID_DATA" }, { status: 400 });
  const data = parsed.data;
  try {
    await prisma.$transaction(async (tx) => {
      let workflowReset: { fromEngineeringAuthority: boolean; toEngineeringAuthority: boolean; statementsReset: number } | null = null;
      if (data.type === "company") {
        const company = await tx.company.findFirst({ where: { id: data.id, active: true } });
        if (!company) throw new Error("INVALID_COMPANY");
        const isEngineeringAuthority = data.companyType === "OWNER" && data.isEngineeringAuthority;
        const workflowChanged = company.type === "OWNER" && company.isEngineeringAuthority !== isEngineeringAuthority;
        await tx.company.update({ where: { id: data.id }, data: { name: data.name, type: data.companyType, isEngineeringAuthority, workNature: data.companyType === "OWNER" ? null : data.workNature || null, phone: ["SUBCONTRACTOR", "SUPPLIER"].includes(data.companyType) ? data.phone || null : null } });
        if (workflowChanged) {
          const reset = await tx.incomingStatement.updateMany({ where: { stage: { not: "PAID" }, contract: { project: { companyId: data.id } } }, data: { stage: "COMPANY", paidAt: null, paymentMethod: null, paymentReference: null } });
          workflowReset = { fromEngineeringAuthority: company.isEngineeringAuthority, toEngineeringAuthority: isEngineeringAuthority, statementsReset: reset.count };
        }
      }
      if (data.type === "project") {
        const [project, owner] = await Promise.all([
          tx.project.findFirst({ where: { id: data.id, active: true } }),
          tx.company.findFirst({ where: { id: data.companyId, active: true, type: "OWNER" } }),
        ]);
        if (!project) throw new Error("INVALID_PROJECT");
        if (!owner) throw new Error("INVALID_OWNER");
        await tx.project.update({ where: { id: data.id }, data: { code: data.code, name: data.name, companyId: owner.id } });
        await tx.warehouse.updateMany({ where: { projectId: data.id, type: "PROJECT", active: true }, data: { code: `PRJ-${data.code}`, name: `مخزن مشروع — ${data.name}` } });
      }
      if (data.type === "engineer") {
        const engineer = await tx.employee.findFirst({ where: { id: data.id, active: true }, include: { supervisors: { where: { active: true }, select: { projectId: true } } } });
        if (!engineer) throw new Error("INVALID_ENGINEER");
        const project = data.projectId ? await tx.project.findFirst({ where: { id: data.projectId, active: true } }) : null;
        if (data.projectId && !project) throw new Error("INVALID_PROJECT");
        const now = new Date();
        await tx.employee.update({ where: { id: data.id }, data: { name: data.name, jobTitle: data.jobTitle, phone: data.phone || null } });
        await tx.projectEngineerAssignment.updateMany({ where: { employeeId: data.id, active: true }, data: { active: false, endDate: now } });
        if (project) await tx.projectEngineerAssignment.create({ data: { employeeId: data.id, projectId: project.id, startDate: now } });
      }
      await tx.auditLog.create({ data: { actorId: session.user.id, action: `masterdata.${data.type}.update`, target: data.id, details: JSON.stringify({ ...data, workflowReset }) } });
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (["INVALID_ENGINEER", "INVALID_PROJECT", "INVALID_COMPANY", "INVALID_OWNER"].includes(message)) return NextResponse.json({ error: message }, { status: 400 });
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
