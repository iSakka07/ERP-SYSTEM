import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status });
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).transform((value) => new Date(`${value}T00:00:00.000Z`));
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("salary"), employeeId: z.string().min(1), monthlySalaryCents: z.number().int().min(0).max(1_000_000_000_00) }),
  z.object({ action: z.literal("allocation"), employeeId: z.string().min(1), projectId: z.string().min(1).optional(), startDate: date, endDate: date.optional() }),
]);

async function access(permission: string) {
  const session = await auth();
  return session?.user && can(session.user, permission) ? session : null;
}

export async function GET() {
  const session = await access("salaries.view");
  if (!session) return json({ error: "غير مصرح" }, 403);
  const [employees, projects, allocations] = await Promise.all([
    prisma.employee.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.project.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.employeeSalaryAllocation.findMany({ include: { employee: true, project: true }, orderBy: [{ startDate: "desc" }] }),
  ]);
  return json({ employees, projects, allocations, canManage: !!(await access("salaries.manage")) });
}

export async function POST(request: Request) {
  const session = await access("salaries.manage");
  if (!session) return json({ error: "غير مصرح" }, 403);
  try {
    const input = schema.parse(await request.json());
    if (input.action === "salary") {
      await prisma.employee.update({ where: { id: input.employeeId }, data: { monthlySalaryCents: input.monthlySalaryCents } });
      await prisma.auditLog.create({ data: { actorId: session.user.id, action: "salary.employee.update", target: input.employeeId, details: JSON.stringify({ monthlySalaryCents: input.monthlySalaryCents }) } });
    } else {
      if (input.endDate && input.endDate <= input.startDate) return json({ error: "تاريخ النهاية يجب أن يكون بعد البداية." }, 400);
      const employee = await prisma.employee.findFirst({ where: { id: input.employeeId, active: true } });
      const project = input.projectId ? await prisma.project.findFirst({ where: { id: input.projectId, active: true } }) : true;
      if (!employee || !project) return json({ error: "الموظف أو المشروع غير صحيح." }, 400);
      const allocation = await prisma.employeeSalaryAllocation.create({ data: { employeeId: input.employeeId, projectId: input.projectId || null, startDate: input.startDate, endDate: input.endDate || null } });
      await prisma.auditLog.create({ data: { actorId: session.user.id, action: "salary.allocation.create", target: allocation.id, details: JSON.stringify({ employeeId: input.employeeId, projectId: input.projectId || null, startDate: input.startDate, endDate: input.endDate || null }) } });
    }
    return json({ ok: true }, 201);
  } catch (error) {
    return json({ error: error instanceof z.ZodError ? "بيانات المرتب غير صحيحة." : "تعذر حفظ البيانات." }, 400);
  }
}
