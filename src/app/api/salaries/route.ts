import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { auth } from "@/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { readIncomingFiles } from "@/lib/incoming-server";
import { assertBalances } from "@/lib/petty-cash";
import { postExecutiveAdvance, postPayrollApproval, postPayrollPayment, postPettyCashJournal } from "@/lib/accounting-posting";
import { completeFinancialOperation, guardFinancialOperation, replayAfterConflict, type FinancialOperationContext } from "@/lib/financial-idempotency";
import { isTrustedMutationOrigin } from "@/lib/request-security";

const money = (value: unknown) => { const cents = Math.round(Number(value) * 100); if (!Number.isSafeInteger(cents) || cents < 1 || cents > 1_000_000_000_000) throw new Error("راجع القيمة المالية."); return cents; };
const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).transform((value) => new Date(`${value}T00:00:00.000Z`));
const json = (body: unknown, status = 200) => NextResponse.json(body, { status });

async function currentUser(permission: string) { const session = await auth(); return session?.user && can(session.user, permission) ? session : null; }
function monthDays(value: string) { const [year, month] = value.split("-").map(Number); return new Date(Date.UTC(year, month, 0)).getUTCDate(); }
function daysInPeriod(start: Date, end: Date | null, year: number, month: number) { const first = new Date(Date.UTC(year, month - 1, 1)); const last = new Date(Date.UTC(year, month, 0)); const from = start > first ? start : first; const to = !end || end > last ? last : end; return to < from ? 0 : Math.floor((to.getTime() - from.getTime()) / 86400000) + 1; }

export async function GET() {
  const session = await currentUser("salaries.view"); if (!session) return json({ error: "غير مصرح" }, 403);
  const [employees, projects, allocations, runs, advances, bonuses, deductions] = await Promise.all([
    prisma.employee.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.project.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.employeeSalaryAllocation.findMany({ include: { employee: true, project: true }, orderBy: { startDate: "desc" } }),
    prisma.payrollRun.findMany({ include: { lines: { include: { employee: true } }, attachments: { select: { id: true, name: true } } }, orderBy: { month: "desc" } }),
    prisma.employeeAdvance.findMany({ include: { employee: true, installments: true, attachments: { select: { id: true, name: true } } }, orderBy: { issuedAt: "desc" } }),
    prisma.employeeBonus.findMany({ orderBy: { createdAt: "desc" } }), prisma.employeeDeduction.findMany({ orderBy: { createdAt: "desc" } }),
  ]);
  return json({ employees, projects, allocations, runs, advances, bonuses, deductions, canManage: !!(await currentUser("salaries.manage")) });
}

export async function POST(request: Request) {
  const session = await currentUser("salaries.manage"); if (!session) return json({ error: "غير مصرح" }, 403);
  if (!isTrustedMutationOrigin(request)) return json({ error: "مصدر الطلب غير موثوق." }, 403);
  let operationContext: FinancialOperationContext | null = null;
  try {
    const form = await request.formData(); const action = String(form.get("action") || ""); const payload = JSON.parse(String(form.get("payload") || "{}")); const files = await readIncomingFiles(form);
    const requiredFiles = new Set(["create-payroll", "advance"]); if (requiredFiles.has(action) && !files.length) throw new Error("المرفق إلزامي لهذه العملية.");
    if (["advance", "bonus", "deduction", "create-payroll", "payroll-pay"].includes(action)) {
      const guarded = await guardFinancialOperation(request, { actorId: session.user.id, operation: `salary.${action}`, requestData: payload, businessData: payload });
      if ("response" in guarded) return guarded.response;
      operationContext = guarded.context;
    }
    const result = await prisma.$transaction(async (tx) => {
      const audit = (actionName: string, target: string, details: unknown) => tx.auditLog.create({ data: { actorId: session.user.id, action: actionName, target, details: JSON.stringify(details) } });
      const finish = async (body: { id: string }, entityType: string, summary: Record<string, unknown>) => { if (operationContext) await completeFinancialOperation(tx, operationContext, { status: 201, body: { ok: true, ...body }, entityType, entityId: body.id, summary }); return body; };
      if (action === "employee-config") {
        const employee = await tx.employee.findFirst({ where: { id: String(payload.employeeId), active: true } });
        const project = payload.projectId ? await tx.project.findFirst({ where: { id: String(payload.projectId), active: true } }) : true;
        if (!employee || !project) throw new Error("الموظف أو المشروع غير صحيح.");
        const monthlySalaryCents = money(payload.monthlySalaryCents);
        const today = new Date(); today.setUTCHours(0, 0, 0, 0);
        const activeAllocation = await tx.employeeSalaryAllocation.findFirst({ where: { employeeId: employee.id, endDate: null }, orderBy: { startDate: "desc" } });
        const nextProjectId = payload.projectId ? String(payload.projectId) : null;
        if (!activeAllocation || activeAllocation.projectId !== nextProjectId) {
          const startsToday = activeAllocation?.startDate.toISOString().slice(0, 10) === today.toISOString().slice(0, 10);
          if (activeAllocation && startsToday) {
            await tx.employeeSalaryAllocation.update({ where: { id: activeAllocation.id }, data: { projectId: nextProjectId } });
          } else {
            if (activeAllocation) { const yesterday = new Date(today); yesterday.setUTCDate(yesterday.getUTCDate() - 1); await tx.employeeSalaryAllocation.update({ where: { id: activeAllocation.id }, data: { endDate: yesterday } }); }
            await tx.employeeSalaryAllocation.create({ data: { employeeId: employee.id, projectId: nextProjectId, startDate: today } });
          }
        }
        await tx.employee.update({ where: { id: employee.id }, data: { monthlySalaryCents } });
        await audit("salary.employee.configure", employee.id, { monthlySalaryCents, projectId: nextProjectId, effectiveDate: today.toISOString() });
        return { id: employee.id };
      }
      if (action === "employee-delete") {
        const employee = await tx.employee.findFirst({ where: { id: String(payload.employeeId), active: true } });
        if (!employee) throw new Error("الموظف غير موجود أو تم مسحه بالفعل.");
        await tx.employee.update({ where: { id: employee.id }, data: { active: false } });
        await audit("salary.employee.delete", employee.id, { safeDelete: true });
        return { id: employee.id };
      }
      if (action === "salary") {
        const value = money(payload.monthlySalaryCents); const employee = await tx.employee.update({ where: { id: String(payload.employeeId) }, data: { monthlySalaryCents: value } }); await audit("salary.employee.update", employee.id, { value }); return { id: employee.id };
      }
      if (action === "allocation") {
        const startDate = dateSchema.parse(payload.startDate); const endDate = payload.endDate ? dateSchema.parse(payload.endDate) : null; if (endDate && endDate <= startDate) throw new Error("تاريخ النهاية يجب أن يكون بعد البداية."); const employee = await tx.employee.findFirst({ where: { id: String(payload.employeeId), active: true } }); const project = payload.projectId ? await tx.project.findFirst({ where: { id: String(payload.projectId), active: true } }) : true; if (!employee || !project) throw new Error("الموظف أو المشروع غير صحيح.");
        const existing = await tx.employeeSalaryAllocation.findMany({ where: { employeeId: employee.id } }); const overlaps = existing.filter((item) => item.startDate <= (endDate ?? new Date("9999-12-31")) && (!item.endDate || item.endDate >= startDate));
        if (overlaps.length) { const continuing = overlaps.filter((item) => item.startDate < startDate && (!item.endDate || item.endDate >= startDate)); if (continuing.length !== 1 || overlaps.length !== 1) throw new Error("يوجد تسكين متداخل لهذا الموظف؛ أغلق الفترة السابقة أولًا."); const previousEnd = new Date(startDate); previousEnd.setUTCDate(previousEnd.getUTCDate() - 1); await tx.employeeSalaryAllocation.update({ where: { id: continuing[0].id }, data: { endDate: previousEnd } }); }
        const created = await tx.employeeSalaryAllocation.create({ data: { employeeId: employee.id, projectId: payload.projectId || null, startDate, endDate } }); await audit("salary.allocation.create", created.id, payload); return { id: created.id };
      }
      if (action === "advance") {
        const employee = await tx.employee.findFirst({ where: { id: String(payload.employeeId), active: true } }); if (!employee) throw new Error("اختر موظفًا صحيحًا."); const amountCents = money(payload.amount); const repaymentMode = payload.repaymentMode === "INSTALLMENTS" ? "INSTALLMENTS" : "NEXT_PAYROLL"; const installmentCents = repaymentMode === "INSTALLMENTS" ? money(payload.installment) : null; if (installmentCents && installmentCents > amountCents) throw new Error("القسط أكبر من السلفة."); const source = payload.source === "PETTY_CASH" ? "PETTY_CASH" : "EXECUTIVE_DIRECTOR"; const issuedAt = dateSchema.parse(payload.issuedAt);
        const created = await tx.employeeAdvance.create({ data: { employeeId: employee.id, amountCents, remainingCents: amountCents, issuedAt, repaymentMode, installmentCents, source, note: String(payload.note || "").trim().slice(0, 2000), attachments: { create: files.map((file) => ({ ...file, actorId: session.user.id })) } } });
        if (source === "PETTY_CASH") { const [accounts, movements] = await Promise.all([tx.pettyCashAccount.findMany(), tx.pettyCashTransaction.findMany()]); const main = accounts.find((account) => account.type === "MAIN" && account.active); if (!main) throw new Error("لم يتم إعداد Petty Cash لصرف السلفة."); const custody = await tx.pettyCashAccount.create({ data: { name: `سلفة ${employee.name} — ${payload.issuedAt}`, type: "CUSTODY", employeeId: employee.id } }); const id = randomUUID(); const movement = { id, number: `PC-${id}`, type: "CUSTODY_ISSUE", status: "POSTED", amountCents, transactionDate: issuedAt, sourceAccountId: main.id, destinationAccountId: custody.id, projectId: null, categoryId: null, description: `سلفة موظف: ${employee.name}`, documentNumber: `SALADV-${created.id}`, fundingSource: null, recordedById: session.user.id }; assertBalances([...movements, movement]); await tx.pettyCashTransaction.create({ data: { ...movement, attachments: { create: files.map((file) => ({ ...file, actorId: session.user.id })) } } }); await postPettyCashJournal(tx, movement); await audit("pettycash.custody_issue", id, { advanceId: created.id, amountCents, employeeId: employee.id }); } else await postExecutiveAdvance(tx, created, session.user.id);
        await audit("salary.advance.create", created.id, { amountCents, repaymentMode, source }); return finish({ id: created.id }, "employeeAdvance", { employeeId: employee.id, amountCents, issuedAt: payload.issuedAt, source });
      }
      if (action === "bonus" || action === "deduction") {
        const employee = await tx.employee.findFirst({ where: { id: String(payload.employeeId), active: true } }); const label = String(payload.name || "").trim(); const reason = String(payload.reason || "").trim(); if (!employee || label.length < 2 || reason.length < 2) throw new Error("الموظف والاسم والسبب مطلوبون."); const data = { employeeId: employee.id, month: monthSchema.parse(payload.month), name: label.slice(0, 150), reason: reason.slice(0, 1000), amountCents: money(payload.amount) }; const record = action === "bonus" ? await tx.employeeBonus.create({ data: { ...data, attachments: { create: files.map((file) => ({ ...file, actorId: session.user.id })) } } }) : await tx.employeeDeduction.create({ data: { ...data, attachments: { create: files.map((file) => ({ ...file, actorId: session.user.id })) } } }); await audit(`salary.${action}.create`, record.id, data); return finish({ id: record.id }, action === "bonus" ? "employeeBonus" : "employeeDeduction", { ...data, employeeName: employee.name });
      }
      if (action === "create-payroll") {
        const payrollMonth = monthSchema.parse(payload.month); if (await tx.payrollRun.findUnique({ where: { month: payrollMonth } })) throw new Error("تم إنشاء كشف هذا الشهر بالفعل."); const [employees, allocations, bonuses, deductions, advances] = await Promise.all([tx.employee.findMany({ where: { active: true } }), tx.employeeSalaryAllocation.findMany(), tx.employeeBonus.findMany({ where: { month: payrollMonth } }), tx.employeeDeduction.findMany({ where: { month: payrollMonth } }), tx.employeeAdvance.findMany({ where: { status: "OPEN" } })]); const [year, month] = payrollMonth.split("-").map(Number); const days = monthDays(payrollMonth);
        const lineData = employees.map((employee) => { const units = allocations.filter((allocation) => allocation.employeeId === employee.id).map((allocation) => ({ projectId: allocation.projectId, days: daysInPeriod(allocation.startDate, allocation.endDate, year, month) })).filter((allocation) => allocation.days > 0); const covered = units.reduce((sum, allocation) => sum + allocation.days, 0); if (covered < days) units.push({ projectId: null, days: days - covered }); const distribution = units.map((allocation) => ({ ...allocation, cents: Math.floor(employee.monthlySalaryCents * allocation.days / days) })); let residue = employee.monthlySalaryCents - distribution.reduce((sum, allocation) => sum + allocation.cents, 0); distribution.forEach((allocation) => { if (residue > 0) { allocation.cents += 1; residue -= 1; } }); const bonusCents = bonuses.filter((bonus) => bonus.employeeId === employee.id).reduce((sum, bonus) => sum + bonus.amountCents, 0); const deductionCents = deductions.filter((deduction) => deduction.employeeId === employee.id).reduce((sum, deduction) => sum + deduction.amountCents, 0); let available = Math.max(0, employee.monthlySalaryCents + bonusCents - deductionCents); const advanceApplications = advances.filter((advance) => advance.employeeId === employee.id).map((advance) => { const requested = advance.repaymentMode === "NEXT_PAYROLL" ? advance.remainingCents : Math.min(advance.remainingCents, advance.installmentCents || 0); const appliedCents = Math.min(available, requested); available -= appliedCents; return { advanceId: advance.id, appliedCents }; }).filter((application) => application.appliedCents > 0); return { employeeId: employee.id, basicCents: employee.monthlySalaryCents, bonusCents, deductionCents, advanceCents: advanceApplications.reduce((sum, application) => sum + application.appliedCents, 0), netCents: available, allocationJson: JSON.stringify(distribution), advanceApplications }; });
        const totalCents = lineData.reduce((sum, line) => sum + line.netCents, 0); const run = await tx.payrollRun.create({ data: { month: payrollMonth, status: "APPROVED", totalCents, paymentSource: "EXECUTIVE_DIRECTOR", approvedById: session.user.id, lines: { create: lineData.map((item) => ({ employeeId: item.employeeId, basicCents: item.basicCents, bonusCents: item.bonusCents, deductionCents: item.deductionCents, advanceCents: item.advanceCents, netCents: item.netCents, allocationJson: item.allocationJson })) }, attachments: { create: files.map((file) => ({ ...file, actorId: session.user.id })) } }, include: { lines: true } });
        for (const line of run.lines) for (const application of lineData.find((item) => item.employeeId === line.employeeId)?.advanceApplications || []) { const advance = advances.find((item) => item.id === application.advanceId)!; const remainingCents = advance.remainingCents - application.appliedCents; await tx.employeeAdvance.update({ where: { id: advance.id }, data: { remainingCents, status: remainingCents === 0 ? "SETTLED" : "OPEN" } }); await tx.advanceInstallment.create({ data: { advanceId: advance.id, payrollLineId: line.id, dueMonth: payrollMonth, amountCents: application.appliedCents, appliedCents: application.appliedCents } }); }
        await postPayrollApproval(tx, run); await audit("salary.payroll.approve", run.id, { payrollMonth, totalCents }); return finish({ id: run.id }, "payrollRun", { month: payrollMonth, totalCents, status: "APPROVED" });
      }
      if (action === "payroll-pay") { const id = String(payload.id); const updated = await tx.payrollRun.updateMany({ where: { id, status: "APPROVED" }, data: { status: "PAID", paidAt: new Date(), paidById: session.user.id } }); if (updated.count !== 1) throw new Error("الكشف غير جاهز للصرف أو تم صرفه بالفعل."); const run = await tx.payrollRun.findUniqueOrThrow({ where: { id } }); await postPayrollPayment(tx, run); await audit("salary.payroll.pay", id, { source: "EXECUTIVE_DIRECTOR" }); return finish({ id }, "payrollRun", { month: run.month, totalCents: run.totalCents, status: "PAID" }); }
      throw new Error("إجراء غير معروف.");
    }, { maxWait: 10000, timeout: 20000 }); return json({ ok: true, ...result }, 201);
  } catch (error) { const replay = await replayAfterConflict(error, operationContext); if (replay) return replay; return json({ error: error instanceof Error ? error.message : "تعذر حفظ العملية." }, 400); }
}
