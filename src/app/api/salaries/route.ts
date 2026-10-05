import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { auth } from "@/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { readIncomingFiles } from "@/lib/incoming-server";
import { assertAffectedBalances } from "@/lib/petty-cash";
import { fundMainCash, settleThroughMainCash } from "@/lib/cash-settlement";
import {
  postExecutiveAdvance,
  postPayrollApproval,
  postPayrollPayment,
  reversePostedJournal,
} from "@/lib/accounting-posting";
import {
  completeFinancialOperation,
  guardFinancialOperation,
  replayAfterConflict,
  type FinancialOperationContext,
} from "@/lib/financial-idempotency";
import { assertMutation } from "@/lib/request-security";
import { arabicErrorMessage } from "@/lib/api-error";
import { centsNumber } from "@/lib/money";
import {
  assertAdvanceWithinSalary,
  assertDeductionWithinSalary,
  assertPayrollMonthAvailable,
  buildPayrollDistribution,
} from "@/lib/salary-payroll";

const money = (value: unknown) => {
  const cents = Math.round(Number(value) * 100);
  if (!Number.isSafeInteger(cents) || cents < 1 || cents > 1_000_000_000_000)
    throw new Error("راجع القيمة المالية.");
  return cents;
};
const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .transform((value) => new Date(`${value}T00:00:00.000Z`));
const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status });

async function currentUser(permission: string) {
  const session = await auth();
  return session?.user && can(session.user, permission) ? session : null;
}
const statusSchema = z.enum(["ACTIVE", "INACTIVE"]);
const salaryChangeSchema = z.object({
  employeeId: z.string().min(1),
  amount: z.coerce.number().positive(),
  effectiveMode: z.enum(["MONTH_START", "DATE"]),
  effectiveDate: z.string(),
});
const advanceSourceSchema = z.enum(["EXECUTIVE_DIRECTOR", "PETTY_CASH"]);

export async function GET() {
  const session = await currentUser("salaries.view");
  if (!session) return json({ error: "غير مصرح" }, 403);
  const [
    employees,
    projects,
    allocations,
    runs,
    advances,
    bonuses,
    deductions,
    paymentDay,
  ] = await Promise.all([
    prisma.employee.findMany({
      orderBy: { name: "asc" },
    }),
    prisma.project.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.employeeSalaryAllocation.findMany({
      include: { employee: true, project: true },
      orderBy: { startDate: "desc" },
    }),
    prisma.payrollRun.findMany({
      include: {
        lines: { include: { employee: true } },
        attachments: { select: { id: true, name: true, label: true } },
      },
      orderBy: { month: "desc" },
    }),
    prisma.employeeAdvance.findMany({
      include: {
        employee: true,
        installments: true,
        attachments: { select: { id: true, name: true, label: true } },
      },
      orderBy: { issuedAt: "desc" },
    }),
    prisma.employeeBonus.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.employeeDeduction.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.systemMetadata.findUnique({ where: { key: "salary-payment-day" } }),
  ]);
  return json({
    employees,
    projects,
    allocations,
    runs,
    advances,
    bonuses,
    deductions,
    paymentDay: Number(paymentDay?.value || 0) || null,
    canManage: !!(await currentUser("salaries.manage")),
  });
}

export async function POST(request: Request) {
  const mutationErr = assertMutation(request);
  if (mutationErr) return mutationErr;

  const session = await auth();
  if (!session?.user) return json({ error: "غير مصرح" }, 403);

  let operationContext: FinancialOperationContext | null = null;
  try {
    const form = await request.formData();
    const action = String(form.get("action") || "");
    const payload = JSON.parse(String(form.get("payload") || "{}"));

    const requiredPermission = action === "payroll-pay" ? "salaries.pay" : "salaries.manage";
    if (!can(session.user, requiredPermission)) return json({ error: "غير مصرح" }, 403);
    const files = await readIncomingFiles(form);
    const requiredFiles = new Set(["create-payroll", "advance"]);
    if (requiredFiles.has(action) && !files.length)
      throw new Error("المرفق إلزامي لهذه العملية.");
    if (action === "create-payroll") {
      const requestedMonth = monthSchema.parse(payload.month);
      if (await prisma.payrollRun.findUnique({ where: { month: requestedMonth } }))
        throw new Error(`لا يمكن إنشاء كشف رواتب شهر ${requestedMonth} لأنه معتمد بالفعل. استخدم زر «إرجاع الكشف» أولًا إذا كنت تريد تعديله.`);
    }
    if (action === "bonus" || action === "deduction") {
      const requestedMonth = monthSchema.parse(payload.month);
      const run = await prisma.payrollRun.findUnique({ where: { month: requestedMonth }, select: { status: true } });
      if (run)
        throw new Error(`لا يمكن إضافة ${action === "bonus" ? "مكافأة" : "خصم"} على شهر ${requestedMonth} لأن كشفه ${run.status === "PAID" ? "مصروف" : "معتمد"}. أرجع الكشف أولًا إذا كنت تريد تعديله.`);
    }
    if (
      [
        "advance",
        "bonus",
        "deduction",
        "create-payroll",
        "payroll-pay",
        "payroll-revert",
      ].includes(action)
    ) {
      const guarded = await guardFinancialOperation(request, {
        actorId: session.user.id,
        operation: `salary.${action}`,
        requestData: payload,
        businessData: payload,
      });
      if ("response" in guarded) return guarded.response;
      operationContext = guarded.context;
    }
    const result = await prisma.$transaction(
      async (tx) => {
        const audit = (actionName: string, target: string, details: unknown) =>
          tx.auditLog.create({
            data: {
              actorId: session.user.id,
              action: actionName,
              target,
              details: JSON.stringify(details),
            },
          });
        const finish = async (
          body: { id: string },
          entityType: string,
          summary: Record<string, unknown>,
        ) => {
          if (operationContext)
            await completeFinancialOperation(tx, operationContext, {
              status: 201,
              body: { ok: true, ...body },
              entityType,
              entityId: body.id,
              summary,
            });
          return body;
        };
        if (action === "payroll-settings") {
          const paymentDay = Number(payload.paymentDay);
          if (
            !Number.isInteger(paymentDay) ||
            paymentDay < 1 ||
            paymentDay > 28
          )
            throw new Error("حدد يوم صرف من 1 إلى 28.");
          const setting = await tx.systemMetadata.upsert({
            where: { key: "salary-payment-day" },
            create: { key: "salary-payment-day", value: String(paymentDay) },
            update: { value: String(paymentDay) },
          });
          await audit("salary.payroll.settings", setting.key, { paymentDay });
          return { id: setting.key };
        }
        if (action === "employee-config") {
          const employee = await tx.employee.findFirst({
            where: { id: String(payload.employeeId), active: true },
          });
          const project = payload.projectId
            ? await tx.project.findFirst({
                where: { id: String(payload.projectId), active: true },
              })
            : true;
          if (!employee || !project)
            throw new Error("الموظف أو المشروع غير صحيح.");
          const today = new Date();
          today.setUTCHours(0, 0, 0, 0);
          const activeAllocation = await tx.employeeSalaryAllocation.findFirst({
            where: { employeeId: employee.id, endDate: null },
            orderBy: { startDate: "desc" },
          });
          const nextProjectId = payload.projectId
            ? String(payload.projectId)
            : null;
          if (
            !activeAllocation ||
            activeAllocation.projectId !== nextProjectId
          ) {
            const startsToday =
              activeAllocation?.startDate.toISOString().slice(0, 10) ===
              today.toISOString().slice(0, 10);
            if (activeAllocation && startsToday) {
              await tx.employeeSalaryAllocation.update({
                where: { id: activeAllocation.id },
                data: { projectId: nextProjectId },
              });
            } else {
              if (activeAllocation) {
                const yesterday = new Date(today);
                yesterday.setUTCDate(yesterday.getUTCDate() - 1);
                await tx.employeeSalaryAllocation.update({
                  where: { id: activeAllocation.id },
                  data: { endDate: yesterday },
                });
              }
              await tx.employeeSalaryAllocation.create({
                data: {
                  employeeId: employee.id,
                  projectId: nextProjectId,
                  startDate: today,
                },
              });
            }
          }
          await audit("salary.employee.configure", employee.id, {
            projectId: nextProjectId,
            effectiveDate: today.toISOString(),
          });
          return { id: employee.id };
        }
        if (action === "employee-delete") {
          throw new Error("إجراء مسح الموظف لم يعد متاحًا. استخدم تغيير الحالة.");
        }
        if (action === "employee-status") {
          const employeeId = String(payload.employeeId || "");
          const status = statusSchema.parse(payload.status);
          const effectiveDate = dateSchema.parse(payload.effectiveDate);
          const today = new Date();
          today.setUTCHours(0, 0, 0, 0);
          if (effectiveDate > today)
            throw new Error("لا يمكن تسجيل حالة موظف بتاريخ مستقبلي.");
          const employee = await tx.employee.findUnique({ where: { id: employeeId } });
          if (!employee) throw new Error("الموظف غير موجود.");
          if ((status === "ACTIVE") === employee.active)
            throw new Error(status === "ACTIVE" ? "الموظف نشط بالفعل." : "الموظف غير نشط بالفعل.");

          const latestRun = await tx.payrollRun.findFirst({ orderBy: { month: "desc" }, select: { month: true } });
          if (latestRun) {
            const [year, month] = latestRun.month.split("-").map(Number);
            const earliestAllowed = new Date(Date.UTC(year, month, 1));
            earliestAllowed.setUTCMonth(earliestAllowed.getUTCMonth() + 1);
            if (effectiveDate < earliestAllowed)
              throw new Error(`لا يمكن تغيير حالة الموظف بتاريخ ${effectiveDate.toISOString().slice(0, 10)} لأن كشف رواتب شهر ${latestRun.month} موجود. اختر تاريخًا من ${earliestAllowed.toISOString().slice(0, 10)} أو بعده.`);
          }

          if (status === "INACTIVE") {
            const openPeriod = await tx.employeeStatusPeriod.findFirst({
              where: { employeeId, endDate: null },
              orderBy: { startDate: "desc" },
            });
            if (!openPeriod) throw new Error("لا توجد فترة نشاط مفتوحة لهذا الموظف.");
            if (effectiveDate < openPeriod.startDate)
              throw new Error("لا يمكن أن يسبق تاريخ الإيقاف بداية فترة نشاط الموظف.");
            const lastActiveDate = new Date(effectiveDate);
            lastActiveDate.setUTCDate(lastActiveDate.getUTCDate() - 1);
            // When an employee is stopped on the exact day their active period began,
            // there is no valid one-day activity interval to preserve.
            if (effectiveDate.getTime() === openPeriod.startDate.getTime()) {
              await tx.employeeStatusPeriod.delete({ where: { id: openPeriod.id } });
            } else {
              await tx.employeeStatusPeriod.update({ where: { id: openPeriod.id }, data: { endDate: lastActiveDate, endedById: session.user.id } });
            }
            await tx.employee.update({ where: { id: employeeId }, data: { active: false } });
            await audit("salary.employee.deactivate", employeeId, { effectiveDate: effectiveDate.toISOString(), lastActiveDate: lastActiveDate.toISOString() });
          } else {
            const conflictingPeriod = await tx.employeeStatusPeriod.findFirst({
              where: { employeeId, startDate: { lte: effectiveDate }, OR: [{ endDate: null }, { endDate: { gte: effectiveDate } }] },
            });
            if (conflictingPeriod) throw new Error("تاريخ إعادة التفعيل يتداخل مع فترة نشاط محفوظة.");
            await tx.employeeStatusPeriod.create({ data: { employeeId, startDate: effectiveDate, startedById: session.user.id } });
            await tx.employee.update({ where: { id: employeeId }, data: { active: true } });
            await audit("salary.employee.reactivate", employeeId, { effectiveDate: effectiveDate.toISOString() });
          }
          return { id: employeeId };
        }
        if (action === "employee-salary-update") {
          const input = salaryChangeSchema.parse(payload);
          const employee = await tx.employee.findFirst({ where: { id: input.employeeId, active: true } });
          if (!employee) throw new Error("الموظف غير نشط أو غير موجود.");
          const value = money(input.amount);
          const effectiveDate = input.effectiveMode === "MONTH_START"
            ? new Date(`${z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).parse(input.effectiveDate)}-01T00:00:00.000Z`)
            : dateSchema.parse(input.effectiveDate);
          const rates = await tx.employeeSalaryRate.findMany({ where: { employeeId: employee.id }, orderBy: { startDate: "asc" } });
          const existingRate = rates.find((rate) => rate.startDate.getTime() === effectiveDate.getTime());
          const nextRate = rates.find((rate) => rate.startDate > effectiveDate);
          const impactEnd = nextRate ? new Date(nextRate.startDate.getTime() - 86_400_000) : null;
          const startMonth = effectiveDate.toISOString().slice(0, 7);
          const endMonth = impactEnd?.toISOString().slice(0, 7);
          const lockedRun = await tx.payrollRun.findFirst({
            where: { month: { gte: startMonth, ...(endMonth ? { lte: endMonth } : {}) } },
            orderBy: { month: "asc" },
            select: { month: true, status: true },
          });
          if (lockedRun)
            throw new Error(`لا يمكن تغيير الراتب لأنه سيؤثر على كشف شهر ${lockedRun.month} وهو ${lockedRun.status === "PAID" ? "مصروف" : "معتمد"}. أرجع الكشف أولًا ثم عدّل الراتب.`);
          if (!rates.length) {
            await tx.employeeSalaryRate.create({
              data: { employeeId: employee.id, startDate: new Date("1900-01-01T00:00:00.000Z"), monthlySalaryCents: employee.monthlySalaryCents, changedById: session.user.id },
            });
          }
          if (existingRate) {
            await tx.employeeSalaryRate.update({ where: { id: existingRate.id }, data: { monthlySalaryCents: value, changedById: session.user.id } });
          } else {
            await tx.employeeSalaryRate.create({ data: { employeeId: employee.id, startDate: effectiveDate, monthlySalaryCents: value, changedById: session.user.id } });
          }
          const latestRate = await tx.employeeSalaryRate.findFirstOrThrow({ where: { employeeId: employee.id }, orderBy: { startDate: "desc" } });
          await tx.employee.update({ where: { id: employee.id }, data: { monthlySalaryCents: latestRate.monthlySalaryCents } });
          await audit(existingRate ? "salary.employee.rate.correct" : "salary.employee.rate.update", employee.id, { monthlySalaryCents: value, effectiveDate: effectiveDate.toISOString(), effectiveMode: input.effectiveMode, replacedRateId: existingRate?.id ?? null });
          return { id: employee.id };
        }
        if (action === "allocation") {
          const startDate = dateSchema.parse(payload.startDate);
          const endDate = payload.endDate
            ? dateSchema.parse(payload.endDate)
            : null;
          if (endDate && endDate <= startDate)
            throw new Error("تاريخ النهاية يجب أن يكون بعد البداية.");
          const employee = await tx.employee.findFirst({
            where: { id: String(payload.employeeId), active: true },
          });
          const project = payload.projectId
            ? await tx.project.findFirst({
                where: { id: String(payload.projectId), active: true },
              })
            : true;
          if (!employee || !project)
            throw new Error("الموظف أو المشروع غير صحيح.");
          const existing = await tx.employeeSalaryAllocation.findMany({
            where: { employeeId: employee.id },
          });
          const overlaps = existing.filter(
            (item) =>
              item.startDate <= (endDate ?? new Date("9999-12-31")) &&
              (!item.endDate || item.endDate >= startDate),
          );
          if (overlaps.length) {
            const continuing = overlaps.filter(
              (item) =>
                item.startDate < startDate &&
                (!item.endDate || item.endDate >= startDate),
            );
            if (continuing.length !== 1 || overlaps.length !== 1)
              throw new Error(
                "يوجد تسكين متداخل لهذا الموظف؛ أغلق الفترة السابقة أولًا.",
              );
            const previousEnd = new Date(startDate);
            previousEnd.setUTCDate(previousEnd.getUTCDate() - 1);
            await tx.employeeSalaryAllocation.update({
              where: { id: continuing[0].id },
              data: { endDate: previousEnd },
            });
          }
          const created = await tx.employeeSalaryAllocation.create({
            data: {
              employeeId: employee.id,
              projectId: payload.projectId || null,
              startDate,
              endDate,
            },
          });
          await audit("salary.allocation.create", created.id, payload);
          return { id: created.id };
        }
        if (action === "advance") {
          const employee = await tx.employee.findFirst({
            where: { id: String(payload.employeeId), active: true },
          });
          if (!employee) throw new Error("اختر موظفًا صحيحًا.");
          const issuedAt = dateSchema.parse(payload.issuedAt);
          const amountCents = money(payload.amount);
          const [salaryRate, openAdvances] = await Promise.all([
            tx.employeeSalaryRate.findFirst({ where: { employeeId: employee.id, startDate: { lte: issuedAt } }, orderBy: { startDate: "desc" } }),
            tx.employeeAdvance.aggregate({ where: { employeeId: employee.id, status: "OPEN" }, _sum: { remainingCents: true } }),
          ]);
          const salaryCents = centsNumber(salaryRate?.monthlySalaryCents ?? employee.monthlySalaryCents);
          const outstandingAdvanceCents = centsNumber(openAdvances._sum.remainingCents || 0);
          assertAdvanceWithinSalary(salaryCents, outstandingAdvanceCents, amountCents);
          const repaymentMode =
            payload.repaymentMode === "INSTALLMENTS"
              ? "INSTALLMENTS"
              : "NEXT_PAYROLL";
          const installmentCents =
            repaymentMode === "INSTALLMENTS"
              ? money(payload.installment)
              : null;
          if (installmentCents && installmentCents > amountCents)
            throw new Error("القسط أكبر من السلفة.");
          const source = advanceSourceSchema.parse(payload.source);
          const created = await tx.employeeAdvance.create({
            data: {
              employeeId: employee.id,
              amountCents,
              remainingCents: amountCents,
              issuedAt,
              repaymentMode,
              installmentCents,
              source,
              note: String(payload.note || "")
                .trim()
                .slice(0, 2000),
              attachments: {
                create: files.map((file) => ({
                  ...file,
                  actorId: session.user.id,
                })),
              },
            },
          });
          if (source === "EXECUTIVE_DIRECTOR") {
            await fundMainCash(tx, { amountCents, date: issuedAt, actorId: session.user.id, documentNumber: `SALADV-${created.id}`, description: `سلفة موظف: ${employee.name}`, operationId: created.id });
          }
          {
            const [accounts, movements] = await Promise.all([
              tx.pettyCashAccount.findMany(),
              tx.pettyCashTransaction.findMany(),
            ]);
            const main = accounts.find(
              (account) => account.type === "MAIN" && account.active,
            );
            if (!main) throw new Error("لم يتم إعداد الخزنة الرئيسية لصرف السلفة.");
            const id = randomUUID();
            const movement = {
              id,
              number: `PC-ADV-${id}`,
              type: "EMPLOYEE_ADVANCE_PAYMENT",
              status: "POSTED",
              amountCents,
              transactionDate: issuedAt,
              sourceAccountId: main.id,
              destinationAccountId: null,
              projectId: null,
              categoryId: null,
              description: `سلفة موظف: ${employee.name}`,
              documentNumber: `SALADV-${created.id}`,
              fundingSource: null,
              recordedById: session.user.id,
              operationId: created.id,
              linkedEntityType: "EMPLOYEE_ADVANCE",
            };
            assertAffectedBalances([...movements, movement], movement);
            await tx.pettyCashTransaction.create({
              data: {
                ...movement,
                attachments: {
                  create: files.map((file) => ({
                    ...file,
                    actorId: session.user.id,
                  })),
                },
              },
            });
            await postExecutiveAdvance(tx, created, session.user.id);
            await audit("pettycash.employee_advance_payment", id, {
              advanceId: created.id,
              amountCents,
              employeeId: employee.id,
            });
          }
          await audit("salary.advance.create", created.id, {
            amountCents,
            repaymentMode,
            source,
          });
          return finish({ id: created.id }, "employeeAdvance", {
            employeeId: employee.id,
            amountCents,
            issuedAt: payload.issuedAt,
            source,
          });
        }
        if (action === "bonus" || action === "deduction") {
          const employee = await tx.employee.findFirst({
            where: { id: String(payload.employeeId), active: true },
          });
          const label = String(payload.name || "").trim();
          const reason = String(payload.reason || "").trim();
          if (!employee || label.length < 2 || reason.length < 2)
            throw new Error("الموظف والاسم والسبب مطلوبون.");
          const adjustmentMonth = monthSchema.parse(payload.month);
          const existingRun = await tx.payrollRun.findUnique({ where: { month: adjustmentMonth }, select: { status: true } });
          if (existingRun)
            throw new Error(`لا يمكن إضافة ${action === "bonus" ? "مكافأة" : "خصم"} على شهر ${adjustmentMonth} لأن كشفه ${existingRun.status === "PAID" ? "مصروف" : "معتمد"}. أرجع الكشف أولًا إذا كنت تريد تعديله.`);
          const adjustmentCents = money(payload.amount);
          if (action === "deduction") {
            const [employeeAllocations, employeePeriods, employeeRates, priorDeductions] = await Promise.all([
              tx.employeeSalaryAllocation.findMany({ where: { employeeId: employee.id } }),
              tx.employeeStatusPeriod.findMany({ where: { employeeId: employee.id } }),
              tx.employeeSalaryRate.findMany({ where: { employeeId: employee.id } }),
              tx.employeeDeduction.aggregate({ where: { employeeId: employee.id, month: adjustmentMonth }, _sum: { amountCents: true } }),
            ]);
            const periods = employeePeriods.length
              ? employeePeriods
              : [{ startDate: new Date("1900-01-01T00:00:00.000Z"), endDate: null }];
            const salaryForMonth = buildPayrollDistribution(
              adjustmentMonth,
              centsNumber(employee.monthlySalaryCents),
              employeeAllocations,
              periods,
              employeeRates.map((rate) => ({ startDate: rate.startDate, monthlySalaryCents: centsNumber(rate.monthlySalaryCents) })),
            ).reduce((sum, part) => sum + part.cents, 0);
            const priorDeductionCents = centsNumber(priorDeductions._sum.amountCents || 0);
            assertDeductionWithinSalary(adjustmentMonth, salaryForMonth, priorDeductionCents, adjustmentCents);
          }
          const data = {
            employeeId: employee.id,
            month: adjustmentMonth,
            name: label.slice(0, 150),
            reason: reason.slice(0, 1000),
            amountCents: adjustmentCents,
          };
          const record =
            action === "bonus"
              ? await tx.employeeBonus.create({
                  data: {
                    ...data,
                    attachments: {
                      create: files.map((file) => ({
                        ...file,
                        actorId: session.user.id,
                      })),
                    },
                  },
                })
              : await tx.employeeDeduction.create({
                  data: {
                    ...data,
                    attachments: {
                      create: files.map((file) => ({
                        ...file,
                        actorId: session.user.id,
                      })),
                    },
                  },
                });
          await audit(`salary.${action}.create`, record.id, data);
          return finish(
            { id: record.id },
            action === "bonus" ? "employeeBonus" : "employeeDeduction",
            { ...data, employeeName: employee.name },
          );
        }
        if (action === "create-payroll") {
          const payrollMonth = monthSchema.parse(payload.month);
          const existingRuns = await tx.payrollRun.findMany({ select: { month: true } });
          assertPayrollMonthAvailable(payrollMonth, existingRuns.map((run) => run.month), new Date().toISOString().slice(0, 7));
          const [employees, allocations, statusPeriods, salaryRates, bonuses, deductions, advances] =
            await Promise.all([
              tx.employee.findMany(),
              tx.employeeSalaryAllocation.findMany(),
              tx.employeeStatusPeriod.findMany(),
              tx.employeeSalaryRate.findMany(),
              tx.employeeBonus.findMany({ where: { month: payrollMonth } }),
              tx.employeeDeduction.findMany({ where: { month: payrollMonth } }),
              tx.employeeAdvance.findMany({ where: { status: "OPEN" } }),
            ]);
          const lineData = employees.flatMap((employee) => {
            // Legacy employees may not have an explicit status-period row. An active
            // employee is considered active for the month in that case.
            const storedPeriods = statusPeriods.filter((period) => period.employeeId === employee.id);
            const employeePeriods = storedPeriods.length || !employee.active
              ? storedPeriods
              : [{ startDate: new Date("1900-01-01T00:00:00.000Z"), endDate: null }];
            const monthlySalaryCents = centsNumber(employee.monthlySalaryCents);
            const distribution = buildPayrollDistribution(
              payrollMonth,
              monthlySalaryCents,
              allocations.filter((allocation) => allocation.employeeId === employee.id),
              employeePeriods,
              salaryRates.filter((rate) => rate.employeeId === employee.id).map((rate) => ({ startDate: rate.startDate, monthlySalaryCents: centsNumber(rate.monthlySalaryCents) })),
            );
            if (!distribution.length) return [];
            const proRatedSalaryCents = distribution.reduce((sum, allocation) => sum + allocation.cents, 0);
            const bonusCents = bonuses
              .filter((bonus) => bonus.employeeId === employee.id)
              .reduce((sum, bonus) => sum + centsNumber(bonus.amountCents), 0);
            const deductionCents = deductions
              .filter((deduction) => deduction.employeeId === employee.id)
              .reduce((sum, deduction) => sum + centsNumber(deduction.amountCents), 0);
            let available = Math.max(
              0,
              proRatedSalaryCents + bonusCents - deductionCents,
            );
            const advanceApplications = advances
              .filter((advance) => advance.employeeId === employee.id)
              .map((advance) => {
                const requested =
                  advance.repaymentMode === "NEXT_PAYROLL"
                    ? centsNumber(advance.remainingCents)
                    : Math.min(
                        centsNumber(advance.remainingCents),
                        advance.installmentCents ? centsNumber(advance.installmentCents) : 0,
                      );
                const appliedCents = Math.min(available, requested);
                available -= appliedCents;
                return { advanceId: advance.id, appliedCents };
              })
              .filter((application) => application.appliedCents > 0);
            return {
              employeeId: employee.id,
              basicCents: proRatedSalaryCents,
              bonusCents,
              deductionCents,
              advanceCents: advanceApplications.reduce(
                (sum, application) => sum + application.appliedCents,
                0,
              ),
              netCents: available,
              allocationJson: JSON.stringify(distribution),
              advanceApplications,
            };
          });
          const totalCents = lineData.reduce(
            (sum, line) => sum + line.netCents,
            0,
          );
          const run = await tx.payrollRun.create({
            data: {
              month: payrollMonth,
              status: "APPROVED",
              totalCents,
              paymentSource: "EXECUTIVE_DIRECTOR",
              approvedById: session.user.id,
              lines: {
                create: lineData.map((item) => ({
                  employeeId: item.employeeId,
                  basicCents: item.basicCents,
                  bonusCents: item.bonusCents,
                  deductionCents: item.deductionCents,
                  advanceCents: item.advanceCents,
                  netCents: item.netCents,
                  allocationJson: item.allocationJson,
                })),
              },
              attachments: {
                create: files.map((file) => ({
                  ...file,
                  actorId: session.user.id,
                })),
              },
            },
            include: { lines: true },
          });
          for (const line of run.lines)
            for (const application of lineData.find(
              (item) => item.employeeId === line.employeeId,
            )?.advanceApplications || []) {
              const advance = advances.find(
                (item) => item.id === application.advanceId,
              )!;
              const remainingCents =
                centsNumber(advance.remainingCents) - application.appliedCents;
              await tx.employeeAdvance.update({
                where: { id: advance.id },
                data: {
                  remainingCents,
                  status: remainingCents === 0 ? "SETTLED" : "OPEN",
                },
              });
              await tx.advanceInstallment.create({
                data: {
                  advanceId: advance.id,
                  payrollLineId: line.id,
                  dueMonth: payrollMonth,
                  amountCents: application.appliedCents,
                  appliedCents: application.appliedCents,
                },
              });
            }
          await postPayrollApproval(tx, run);
          await audit("salary.payroll.approve", run.id, {
            payrollMonth,
            totalCents,
          });
          return finish({ id: run.id }, "payrollRun", {
            month: payrollMonth,
            totalCents,
            status: "APPROVED",
          });
        }
        if (action === "payroll-revert") {
          const id = String(payload.id || "");
          const reason = String(payload.reason || "تصحيح كشف الرواتب").trim().slice(0, 500);
          const run = await tx.payrollRun.findUnique({
            where: { id },
            include: { lines: { include: { installments: true } } },
          });
          if (!run) throw new Error("كشف المرتبات غير موجود أو تم إرجاعه بالفعل.");
          if (run.status === "PAID")
            throw new Error(`لا يمكن إرجاع كشف شهر ${run.month} لأنه تم صرفه بالفعل. يجب عكس عملية الصرف أولًا بواسطة مسؤول الحسابات.`);
          if (run.status !== "APPROVED")
            throw new Error(`لا يمكن إرجاع كشف شهر ${run.month} في حالته الحالية.`);
          const laterRun = await tx.payrollRun.findFirst({ where: { month: { gt: run.month } }, orderBy: { month: "asc" }, select: { month: true } });
          if (laterRun)
            throw new Error(`لا يمكن إرجاع كشف شهر ${run.month} قبل إرجاع كشف الشهر اللاحق ${laterRun.month}. أرجع الكشوف من الأحدث إلى الأقدم.`);
          const installments = run.lines.flatMap((line) => line.installments);
          for (const installment of installments) {
            await tx.employeeAdvance.update({
              where: { id: installment.advanceId },
              data: { remainingCents: { increment: centsNumber(installment.appliedCents) }, status: "OPEN" },
            });
          }
          if (installments.length)
            await tx.advanceInstallment.deleteMany({ where: { id: { in: installments.map((installment) => installment.id) } } });
          const [year, monthNumber] = run.month.split("-").map(Number);
          const entryDate = new Date(Date.UTC(year, monthNumber, 0));
          await reversePostedJournal(tx, "PAYROLL_APPROVAL", run.id, entryDate, session.user.id, `إرجاع كشف رواتب ${run.month}: ${reason}`);
          await audit("salary.payroll.revert", run.id, { month: run.month, reason, restoredInstallments: installments.length });
          await tx.payrollRun.delete({ where: { id: run.id } });
          return finish({ id: run.id }, "payrollRunReversal", { month: run.month, status: "REVERTED", reason });
        }
        if (action === "payroll-pay") {
          const id = String(payload.id);
          const paymentSource = payload.source === "PETTY_CASH" ? "PETTY_CASH" : "EXECUTIVE_DIRECTOR";
          const existingRun = await tx.payrollRun.findUnique({ where: { id } });
          if (!existingRun || existingRun.status !== "APPROVED")
            throw new Error("الكشف غير جاهز للصرف أو تم صرفه بالفعل.");
          if (existingRun.approvedById === session.user.id && !process.env.ERP_ISOLATED_TEST)
            throw new Error("لا يمكن لمعتمد كشف المرتبات أن يقوم بصرفه بنفسه (فصل الصلاحيات).");
          const updated = await tx.payrollRun.updateMany({
            where: { id, status: "APPROVED" },
            data: {
              status: "PAID",
              paidAt: new Date(),
              paidById: session.user.id,
              paymentSource,
            },
          });
          if (updated.count !== 1)
            throw new Error("الكشف غير جاهز للصرف أو تم صرفه بالفعل.");
          const run = await tx.payrollRun.findUniqueOrThrow({ where: { id } });
          await settleThroughMainCash(tx, { source: paymentSource, amountCents: centsNumber(run.totalCents), date: run.paidAt!, actorId: session.user.id, documentNumber: `PAYROLL-${run.id}`, description: `صرف كشف رواتب ${run.month}`, operationId: run.id, linkedEntityType: "PAYROLL_PAYMENT" });
          await postPayrollPayment(tx, run);
          await audit("salary.payroll.pay", id, {
            source: paymentSource,
            paidById: session.user.id,
          });
          return finish({ id }, "payrollRun", {
            month: run.month,
            totalCents: run.totalCents,
            status: "PAID",
          });
        }
        throw new Error("إجراء غير معروف.");
      },
      { maxWait: 10000, timeout: 20000 },
    );
    return json({ ok: true, ...result }, 201);
  } catch (error) {
    const replay = await replayAfterConflict(error, operationContext);
    if (replay) return replay;
    return json(
      { error: arabicErrorMessage(error, "تعذر حفظ عملية الرواتب. راجع البيانات وحاول مرة أخرى.") },
      400,
    );
  }
}
