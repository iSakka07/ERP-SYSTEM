import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { readIncomingFiles } from "@/lib/incoming-server";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status });
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).transform((v) => new Date(`${v}T00:00:00.000Z`));
const money = (v: unknown) => { const n = Math.round(Number(v) * 100); if (!Number.isSafeInteger(n) || n < 1 || n > 1_000_000_000_000) throw new Error("راجع القيمة المالية."); return n; };
async function permitted(p: string) { const s = await auth(); return s?.user && can(s.user, p) ? s : null; }
function daysInMonth(m: string) { const [y, n] = m.split("-").map(Number); return new Date(Date.UTC(y, n, 0)).getUTCDate(); }
function overlap(start: Date, end: Date | null, y: number, m: number) { const from = new Date(Date.UTC(y, m - 1, 1)); const to = new Date(Date.UTC(y, m, 0)); const a = start > from ? start : from; const b = !end || end > to ? to : end; return b < a ? 0 : Math.floor((b.getTime() - a.getTime()) / 86400000) + 1; }

export async function GET() {
  const s = await permitted("salaries.view"); if (!s) return json({ error: "غير مصرح" }, 403);
  const [employees, projects, allocations, runs, advances, bonuses, deductions] = await Promise.all([
    prisma.employee.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.project.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.employeeSalaryAllocation.findMany({ include: { employee: true, project: true }, orderBy: { startDate: "desc" } }),
    prisma.payrollRun.findMany({ include: { lines: { include: { employee: true } }, attachments: { select: { id: true, name: true } } }, orderBy: { month: "desc" } }),
    prisma.employeeAdvance.findMany({ include: { employee: true, installments: true, attachments: { select: { id: true, name: true } } }, orderBy: { issuedAt: "desc" } }),
    prisma.employeeBonus.findMany({ orderBy: { createdAt: "desc" } }), prisma.employeeDeduction.findMany({ orderBy: { createdAt: "desc" } }),
  ]);
  return json({ employees, projects, allocations, runs, advances, bonuses, deductions, canManage: !!(await permitted("salaries.manage")) });
}

export async function POST(request: Request) {
  const s = await permitted("salaries.manage"); if (!s) return json({ error: "غير مصرح" }, 403);
  try {
    const form = await request.formData(); const action = String(form.get("action") || ""); const p = JSON.parse(String(form.get("payload") || "{}")); const files = await readIncomingFiles(form);
    if (["create-payroll", "advance", "bonus", "deduction"].includes(action) && !files.length) throw new Error("المرفق إلزامي لهذه العملية.");
    const result = await prisma.$transaction(async (tx) => {
      if (action === "advance") {
        const amount = money(p.amount); const employee = await tx.employee.findFirst({ where: { id: p.employeeId, active: true } }); if (!employee) throw new Error("اختر موظفًا صحيحًا.");
        const mode = p.repaymentMode === "INSTALLMENTS" ? "INSTALLMENTS" : "NEXT_PAYROLL"; const installment = mode === "INSTALLMENTS" ? money(p.installment) : null; if (installment && installment > amount) throw new Error("القسط أكبر من قيمة السلفة.");
        const created = await tx.employeeAdvance.create({ data: { employeeId: employee.id, amountCents: amount, remainingCents: amount, issuedAt: date.parse(p.issuedAt), repaymentMode: mode, installmentCents: installment, source: p.source === "PETTY_CASH" ? "PETTY_CASH" : "EXECUTIVE_DIRECTOR", note: String(p.note || "").slice(0, 2000), attachments: { create: files.map((f) => ({ ...f, actorId: s.user.id })) } } });
        await tx.auditLog.create({ data: { actorId: s.user.id, action: "salary.advance.create", target: created.id, details: JSON.stringify({ amount, mode, source: created.source }) } }); return { id: created.id };
      }
      if (action === "bonus" || action === "deduction") {
        const employee = await tx.employee.findFirst({ where: { id: p.employeeId, active: true } }); if (!employee) throw new Error("اختر موظفًا صحيحًا."); const amount = money(p.amount); const name = String(p.name || "").trim(); const reason = String(p.reason || "").trim(); if (name.length < 2 || reason.length < 2) throw new Error("الاسم والسبب مطلوبان."); const data = { employeeId: employee.id, month: month.parse(p.month), name: name.slice(0, 150), amountCents: amount, reason: reason.slice(0, 1000) }; const created = action === "bonus" ? await tx.employeeBonus.create({ data }) : await tx.employeeDeduction.create({ data }); await tx.auditLog.create({ data: { actorId: s.user.id, action: `salary.${action}.create`, target: created.id, details: JSON.stringify(data) } }); return { id: created.id };
      }
      if (action === "create-payroll") {
        const payrollMonth = month.parse(p.month); if (await tx.payrollRun.findUnique({ where: { month: payrollMonth } })) throw new Error("تم إنشاء كشف هذا الشهر بالفعل."); const [employees, allocations, bonuses, deductions, advances] = await Promise.all([tx.employee.findMany({ where: { active: true } }), tx.employeeSalaryAllocation.findMany(), tx.employeeBonus.findMany({ where: { month: payrollMonth } }), tx.employeeDeduction.findMany({ where: { month: payrollMonth } }), tx.employeeAdvance.findMany({ where: { status: "OPEN" }, include: { installments: true } })]); const [y, mn] = payrollMonth.split("-").map(Number); const totalDays = daysInMonth(payrollMonth);
        const lines = employees.map((e) => { const rows = allocations.filter((a) => a.employeeId === e.id).map((a) => ({ projectId: a.projectId, days: overlap(a.startDate, a.endDate, y, mn) })).filter((a) => a.days > 0); const used = rows.reduce((n, a) => n + a.days, 0); if (used < totalDays) rows.push({ projectId: null, days: totalDays - used }); const alloc = rows.map((r) => ({ ...r, cents: Math.floor((e.monthlySalaryCents * r.days) / totalDays) })); let remainder = e.monthlySalaryCents - alloc.reduce((n, r) => n + r.cents, 0); for (const r of alloc) { if (remainder-- <= 0) break; r.cents++; } const bonusCents = bonuses.filter((b) => b.employeeId === e.id).reduce((n, b) => n + b.amountCents, 0); const deductionCents = deductions.filter((d) => d.employeeId === e.id).reduce((n, d) => n + d.amountCents, 0); let available = Math.max(0, e.monthlySalaryCents + bonusCents - deductionCents); const advanceCents = advances.filter((a) => a.employeeId === e.id).reduce((n, a) => { const requested = a.repaymentMode === "NEXT_PAYROLL" ? a.remainingCents : Math.min(a.remainingCents, a.installmentCents || 0); const applied = Math.min(requested, available); available -= applied; return n + applied; }, 0); return { employeeId: e.id, basicCents: e.monthlySalaryCents, bonusCents, deductionCents, advanceCents, netCents: Math.max(0, available), allocationJson: JSON.stringify(alloc) }; }); const totalCents = lines.reduce((n, l) => n + l.netCents, 0); const run = await tx.payrollRun.create({ data: { month: payrollMonth, totalCents, approvedById: s.user.id, status: "APPROVED", paymentSource: "EXECUTIVE_DIRECTOR", lines: { create: lines }, attachments: { create: files.map((f) => ({ ...f, actorId: s.user.id })) } } }); const createdLines = await tx.payrollLine.findMany({ where: { payrollRunId: run.id } }); for (const advance of advances) { const line = createdLines.find((x) => x.employeeId === advance.employeeId); if (!line || line.advanceCents <= 0) continue; const applied = Math.min(advance.remainingCents, line.advanceCents); await tx.employeeAdvance.update({ where: { id: advance.id }, data: { remainingCents: advance.remainingCents - applied, status: advance.remainingCents - applied <= 0 ? "SETTLED" : "OPEN" } }); await tx.advanceInstallment.create({ data: { advanceId: advance.id, payrollLineId: line.id, dueMonth: payrollMonth, amountCents: applied, appliedCents: applied } }); } await tx.auditLog.create({ data: { actorId: s.user.id, action: "salary.payroll.approve", target: run.id, details: JSON.stringify({ month: payrollMonth, totalCents }) } }); return { id: run.id };
      }
      if (action === "payroll-pay") { const run = await tx.payrollRun.findUnique({ where: { id: String(p.id) } }); if (!run || run.status !== "APPROVED") throw new Error("الكشف غير جاهز للصرف."); const changed = await tx.payrollRun.updateMany({ where: { id: run.id, status: "APPROVED" }, data: { status: "PAID", paidAt: new Date(), paidById: s.user.id } }); if (changed.count !== 1) throw new Error("تم تسجيل الصرف بالفعل."); await tx.auditLog.create({ data: { actorId: s.user.id, action: "salary.payroll.pay", target: run.id, details: JSON.stringify({ source: "EXECUTIVE_DIRECTOR", totalCents: run.totalCents }) } }); return { id: run.id }; }
      throw new Error("إجراء غير معروف.");
    }, { maxWait: 10000, timeout: 20000 }); return json({ ok: true, ...result }, 201);
  } catch (e) { return json({ error: e instanceof Error ? e.message : "تعذر حفظ العملية." }, 400); }
}
