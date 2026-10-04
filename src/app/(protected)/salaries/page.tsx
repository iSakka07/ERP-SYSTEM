import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { SalariesCenter } from "@/components/salaries-center";

export default async function SalariesPage() {
  const session = await auth();
  if (!session?.user || !can(session.user, "salaries.view")) redirect("/");
  const [employees, projects, allocations, statusPeriods, salaryRates, runs, advances, bonuses, deductions, paymentSetting] = await Promise.all([
    prisma.employee.findMany({ orderBy: { name: "asc" } }),
    prisma.project.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.employeeSalaryAllocation.findMany({ include: { employee: true, project: true }, orderBy: [{ startDate: "desc" }] }),
    prisma.employeeStatusPeriod.findMany({ select: { employeeId: true, startDate: true, endDate: true } }),
    prisma.employeeSalaryRate.findMany({ select: { id: true, employeeId: true, startDate: true, monthlySalaryCents: true } }),
    prisma.payrollRun.findMany({ include: { lines: { include: { employee: true } }, attachments: { select: { id: true, name: true, label: true } } }, orderBy: { month: "desc" } }),
    prisma.employeeAdvance.findMany({ include: { employee: true, installments: true }, orderBy: { issuedAt: "desc" } }),
    prisma.employeeBonus.findMany({ include: { employee: true }, orderBy: { createdAt: "desc" } }),
    prisma.employeeDeduction.findMany({ include: { employee: true }, orderBy: { createdAt: "desc" } }),
    prisma.systemMetadata.findUnique({ where: { key: "salary-payment-day" } }),
  ]);
  const paymentDay = Number(paymentSetting?.value || 0) || null;
  return <SalariesCenter employees={employees} projects={projects} allocations={allocations} statusPeriods={statusPeriods} salaryRates={salaryRates} runs={runs} advances={advances} bonuses={bonuses} deductions={deductions} paymentDay={paymentDay} canManage={can(session.user, "salaries.manage")} canPay={can(session.user, "salaries.pay")} />;
}
