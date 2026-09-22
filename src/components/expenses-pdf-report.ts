import type { ExpenseAccount } from "@/lib/expense-types";
import { expenseCumulativeQuantity, expenseSummary, expenseStages } from "@/lib/expenses";
import { pdfColumns, pdfMoney, type DataPdfReport } from "@/components/pdf-data-export";

const stageName = (stage: string) => expenseStages.find(([id]) => id === stage)?.[1] || stage;

export function filteredExpensesReport(accounts: ExpenseAccount[], filters: string): DataPdfReport {
  const summaries = accounts.map((account) => expenseSummary(account.statements));
  const sum = (key: "grossCents" | "netCents" | "paidCents" | "remainingCents") => summaries.reduce((total, summary) => total + summary[key], 0);
  return {
    title: "تقرير مستخلصات مقاولي الباطن", filters,
    kpis: [
      { label: "عدد المقاولات", value: String(accounts.length), tone: "blue" },
      { label: "تكلفة الأعمال المعتمدة", value: pdfMoney(sum("grossCents")), tone: "violet" },
      { label: "صافي مستحق المقاولين", value: pdfMoney(sum("netCents")), tone: "amber" },
      { label: "المدفوع فعليًا", value: pdfMoney(sum("paidCents")), tone: "emerald" },
      { label: "المتبقي للمقاولين", value: pdfMoney(sum("remainingCents")), tone: "rose" },
    ],
    tables: [{ columns: pdfColumns(["المقاولة / النطاق", 3], ["المقاول", 2], ["المشروع", 2], ["تكلفة الأعمال", 2], ["صافي المستحق", 2], ["المدفوع", 2], ["المتبقي / المديونية / المقدم", 3], ["الجوارى", 1]),
      rows: accounts.map((account) => {
        const s = expenseSummary(account.statements);
        return [`${account.name} · ${account.scope}`, account.company.name, account.project.name, pdfMoney(s.grossCents), pdfMoney(s.netCents), pdfMoney(s.paidCents), `${pdfMoney(s.debtCents || s.advanceCents || s.remainingCents)}${s.debtCents ? " · مديونية" : s.advanceCents ? " · مقدم" : ""}`, `${account.statements.length} جاري`];
      }),
      footer: [`${accounts.length} مقاولة`, "", "", pdfMoney(sum("grossCents")), pdfMoney(sum("netCents")), pdfMoney(sum("paidCents")), `${pdfMoney(sum("remainingCents"))}${summaries.some((s) => s.debtCents) ? ` · مديونية ${pdfMoney(summaries.reduce((total, s) => total + s.debtCents, 0))}` : ""}${summaries.some((s) => s.advanceCents) ? ` · مقدم ${pdfMoney(summaries.reduce((total, s) => total + s.advanceCents, 0))}` : ""}`, `${accounts.reduce((count, account) => count + account.statements.length, 0)} جاري`],
    }],
  };
}

export function singleExpensesReport(account: ExpenseAccount): DataPdfReport {
  const summary = expenseSummary(account.statements);
  const statements = [...account.statements].sort((a, b) => a.sequence - b.sequence);
  return {
    title: `تفاصيل مقاولة: ${account.name}`,
    kpis: [
      { label: "تكلفة الأعمال", value: pdfMoney(summary.grossCents), tone: "blue" },
      { label: "صافي المستحق", value: pdfMoney(summary.netCents), tone: "violet" },
      { label: "المدفوع", value: pdfMoney(summary.paidCents), tone: "emerald" },
      { label: "المتبقي", value: pdfMoney(summary.remainingCents), tone: "rose" },
    ],
    tables: [
      { title: "بيانات المقاولة", columns: pdfColumns(["البيان", 2], ["القيمة", 5]), rows: [["المقاولة", account.name], ["نطاق الأعمال", account.scope], ["المقاول", account.company.name], ["المشروع", account.project.name], ["مديونية على المقاول", pdfMoney(summary.debtCents)], ["رصيد مقدم", pdfMoney(summary.advanceCents)]] },
      { title: "الجواري التراكمية", columns: pdfColumns(["المستخلص", 2], ["التاريخ", 2], ["المرحلة", 2], ["إجمالي الأعمال", 2], ["أعمال الجاري", 2], ["الخصومات", 2], ["صافي المستحق", 2]), rows: statements.map((statement) => [`${statement.kind === "FINAL" ? "ختامي" : "جاري"} ${statement.sequence}`, statement.statementDate.slice(0, 10), stageName(statement.stage), pdfMoney(statement.grossCents), pdfMoney(statement.grossCents - statement.previousGrossCents), pdfMoney(statement.deductionCents), pdfMoney(statement.netCents)]) },
      { title: "بنود الأعمال والكميات", columns: pdfColumns(["المستخلص", 2], ["البند", 3], ["الوحدة", 1], ["سابق", 1], ["حالي", 1], ["تصحيح", 1], ["تراكمي", 1], ["سعر الوحدة", 2], ["الاستحقاق", 1], ["الإجمالي", 2]), rows: statements.flatMap((statement) => statement.items.map((item) => [`${statement.kind === "FINAL" ? "ختامي" : "جاري"} ${statement.sequence}`, item.name, item.unit, String(item.previousQuantity), String(item.currentQuantity), String(item.correctionQuantity ?? 0), String(expenseCumulativeQuantity(item)), pdfMoney(item.unitPriceCents), `${item.entitlementPercent}%`, pdfMoney(item.totalCents)])) },
      { title: "الخصومات", columns: pdfColumns(["المستخلص", 2], ["الخصم", 3], ["النوع", 2], ["القيمة", 2]), rows: statements.flatMap((statement) => statement.deductions.map((deduction) => [`جاري ${statement.sequence}`, deduction.name, deduction.kind === "PERCENT" ? `${deduction.value}%` : "مبلغ ثابت", pdfMoney(deduction.amountCents)])) },
      { title: "الدفعات", columns: pdfColumns(["المستخلص", 2], ["التاريخ", 2], ["القيمة", 2], ["الحالة", 2], ["الطريقة", 2]), rows: statements.flatMap((statement) => statement.payments.map((payment) => [`جاري ${statement.sequence}`, payment.paymentDate.slice(0, 10), pdfMoney(payment.amountCents), payment.status === "REVERSED" ? "ملغاة" : "مسجلة", payment.method])) },
    ],
  };
}
