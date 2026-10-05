"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Banknote,
  BadgeMinus,
  ChevronDown,
  FileText,
  Paperclip,
  Gift,
  Power,
  RotateCcw,
  UserRound,
  WalletCards,
} from "lucide-react";
import { CurrencyInput } from "@/components/currency-input";
import { ERPSelect } from "@/components/erp-select";
import { useToast } from "@/components/toast-provider";
import { useConfirm } from "@/components/confirm-provider";
import { UploadBox } from "@/components/upload-box";
import { expenseButton, expenseInput, money } from "@/components/expense-sheet";
import { IconAction, KpiCard, MoneyValue } from "@/components/erp-ui";
import {
  confirmSimilarFinancialOperation,
  financialHeaders,
  financialResult,
} from "@/lib/financial-submit";
import {
  pdfColumns,
  pdfMoney,
  previewDataPdf,
  usePdfDataExport,
} from "@/components/pdf-data-export";
import { buildPayrollDistribution, nextPayrollMonth } from "@/lib/salary-payroll";

type Employee = {
  id: string;
  employeeCode: string;
  name: string;
  jobTitle: string;
  monthlySalaryCents: number;
  active: boolean;
};
type Project = { id: string; name: string };
type Allocation = {
  id: string;
  employee: Employee;
  project: Project | null;
  startDate: string | Date;
  endDate: string | Date | null;
};
type StatusPeriod = { employeeId: string; startDate: string | Date; endDate: string | Date | null };
type SalaryRate = { id: string; employeeId: string; startDate: string | Date; monthlySalaryCents: number };
type Run = {
  id: string;
  month: string;
  status: string;
  totalCents: number;
  lines: { employee: Employee; netCents: number; allocationJson: string }[];
  attachments?: { id: string; name: string; label: string }[];
};
type Advance = {
  id: string;
  employee: Employee;
  remainingCents: number;
  repaymentMode: string;
  installmentCents: number | null;
  source: string;
};
type Adjustment = {
  id: string;
  employee: Employee;
  month: string;
  amountCents: number;
  name: string;
  reason: string;
};

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-xs font-bold text-slate-700">
      <span>{label}</span>
      <div className="mt-2">{children}</div>
    </label>
  );
}
function MonthInput({
  name = "month",
  value,
  onChange,
}: {
  name?: string;
  value?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <input
      name={name}
      type="month"
      required
      value={value}
      onChange={(event) => onChange?.(event.target.value)}
      className={expenseInput}
    />
  );
}
function Select({
  name,
  options,
  optional = false,
  value,
  onChange,
}: {
  name: string;
  options: { id: string; name: string }[];
  optional?: boolean;
  value?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <ERPSelect
      name={name}
      required={!optional}
      value={value}
      onValueChange={onChange}
      className={expenseInput}
    >
      <option value="">{optional ? "عام الشركة" : "اختر"}</option>
      {options.map((item) => (
        <option key={item.id} value={item.id}>
          {item.name}
        </option>
      ))}
    </ERPSelect>
  );
}

export function SalariesCenter({
  employees,
  projects,
  allocations,
  statusPeriods,
  salaryRates,
  runs,
  advances,
  bonuses,
  deductions,
  paymentDay,
  canManage,
  canPay,
}: {
  employees: Employee[];
  projects: Project[];
  allocations: Allocation[];
  statusPeriods: StatusPeriod[];
  salaryRates: SalaryRate[];
  runs: Run[];
  advances: Advance[];
  bonuses: Adjustment[];
  deductions: Adjustment[];
  paymentDay: number | null;
  canManage: boolean;
  canPay: boolean;
}) {
  const router = useRouter();
  const { notify } = useToast();
  const confirm = useConfirm();
  const [tab, setTab] = useState<"employees" | "payroll">("employees");
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [busy, setBusy] = useState("");
  const [advanceEmployee, setAdvanceEmployee] = useState<Employee | null>(null);
  const [adjustment, setAdjustment] = useState<{
    employee: Employee;
    type: "bonus" | "deduction";
  } | null>(null);
  const [statusChange, setStatusChange] = useState<{
    employee: Employee;
    status: "ACTIVE" | "INACTIVE";
  } | null>(null);
  const [salaryEditEmployee, setSalaryEditEmployee] = useState<Employee | null>(null);
  const [salaryOverrides, setSalaryOverrides] = useState<Record<string, { startDate: Date; monthlySalaryCents: number }>>({});
  const currentMonth = new Date().toISOString().slice(0, 7);
  const payrollMonth = nextPayrollMonth(runs.map((run) => run.month), currentMonth);
  const currentAllocations = useMemo(
    () =>
      new Map(
        employees.map((employee) => {
          const employeeAllocations = allocations
            .filter((item) => item.employee.id === employee.id)
            .sort((a, b) => +new Date(b.startDate) - +new Date(a.startDate));
          return [
            employee.id,
            employeeAllocations.find((item) => !item.endDate) ??
              employeeAllocations[0],
          ];
        }),
      ),
    [employees, allocations],
  );
  const monthlyBonuses = bonuses.filter((item) => item.month === month);
  const monthlyDeductions = deductions.filter((item) => item.month === month);
  const currentAdvances = advances.filter((item) => item.remainingCents > 0);
  const salaryDistribution = (employee: Employee) =>
    buildPayrollDistribution(
      month,
      employee.monthlySalaryCents,
      allocations.filter((allocation) => allocation.employee.id === employee.id).map((allocation) => ({ projectId: allocation.project?.id ?? null, startDate: new Date(allocation.startDate), endDate: allocation.endDate ? new Date(allocation.endDate) : null })),
      (() => {
        const periods = statusPeriods.filter((period) => period.employeeId === employee.id).map((period) => ({ startDate: new Date(period.startDate), endDate: period.endDate ? new Date(period.endDate) : null }));
        return periods.length || !employee.active ? periods : [{ startDate: new Date("1900-01-01T00:00:00.000Z"), endDate: null }];
      })(),
      [
        ...salaryRates.filter((rate) => rate.employeeId === employee.id).map((rate) => ({ startDate: new Date(rate.startDate), monthlySalaryCents: rate.monthlySalaryCents })),
        ...(salaryOverrides[employee.id] ? [salaryOverrides[employee.id]] : []),
      ],
    );
  usePdfDataExport(() => {
    if (tab === "payroll") {
      void previewDataPdf({
        title: "كشوف المرتبات",
        kpis: [
          {
            label: "الكشوف المعتمدة",
            value: String(
              runs.filter((run) => run.status === "APPROVED").length,
            ),
            tone: "blue",
          },
          {
            label: "الكشوف المصروفة",
            value: String(runs.filter((run) => run.status === "PAID").length),
            tone: "emerald",
          },
          {
            label: "إجمالي آخر كشف",
            value: pdfMoney(runs[0]?.totalCents ?? 0),
            tone: "violet",
          },
        ],
        tables: [
          {
            columns: pdfColumns(
              ["الشهر", 2],
              ["إجمالي الكشف", 2],
              ["الحالة", 2],
              ["مصدر الصرف", 2],
            ),
            rows: runs.map((run) => [
              run.month,
              pdfMoney(run.totalCents),
              run.status === "PAID" ? "مصروف" : "معتمد",
              "المدير التنفيذي",
            ]),
          },
        ],
      });
      return;
    }
    void previewDataPdf({
      title: "المرتبات وتكلفة الموظفين",
      filters: `الشهر: ${month}`,
      tables: [
        {
          columns: pdfColumns(
            ["الموظف", 3],
            ["التسكين", 2],
            ["الراتب الشهري", 2],
            ["المشروع", 2],
            ["السلف", 2],
            ["المكافآت", 2],
            ["الخصومات", 2],
            ["توزيع الراتب", 3],
            ["الحالة", 1],
          ),
          rows: employees.map((employee) => {
            const allocation = currentAllocations.get(employee.id);
            const distribution = salaryDistribution(employee);
            return [
              `${employee.name} · ${employee.employeeCode}`,
              allocation?.project ? "مشروع" : "عام الشركة",
              pdfMoney(distribution.reduce((sum, part) => sum + part.cents, 0)),
              allocation?.project?.name || "عام الشركة",
              pdfMoney(
                currentAdvances
                  .filter((item) => item.employee.id === employee.id)
                  .reduce((sum, item) => sum + item.remainingCents, 0),
              ),
              pdfMoney(
                monthlyBonuses
                  .filter((item) => item.employee.id === employee.id)
                  .reduce((sum, item) => sum + item.amountCents, 0),
              ),
              pdfMoney(
                monthlyDeductions
                  .filter((item) => item.employee.id === employee.id)
                  .reduce((sum, item) => sum + item.amountCents, 0),
              ),
              distribution.length > 1 ? distribution.map((part) => `${part.projectId ? projects.find((project) => project.id === part.projectId)?.name ?? "مشروع غير متاح" : "عام الشركة"}: ${part.days} يوم — ${pdfMoney(part.cents)}`).join("\n") : "—",
              employee.active ? "نشط" : "غير نشط",
            ];
          }),
        },
      ],
    });
  });

  async function send(form: HTMLFormElement, action: string, files = false) {
    setBusy(action);
    const formData = new FormData(form);
    const values = Object.fromEntries(formData);
    const body = new FormData();
    body.set("action", action);
    body.set("payload", JSON.stringify(values));
    if (files)
      for (const file of Array.from(
        (form.querySelector('input[type="file"]') as HTMLInputElement | null)
          ?.files ?? [],
      ))
        body.append("files", file);
    // UploadBox stores one description per selected file in filesLabels.
    // Forward those fields separately; putting them only in the JSON payload
    // makes the server think the uploaded file has no description.
    if (files)
      for (const label of formData.getAll("filesLabels"))
        body.append("filesLabels", String(label));
    const financial = [
        "advance",
        "bonus",
        "deduction",
        "create-payroll",
        "payroll-pay",
        "payroll-revert",
      ].includes(action),
      scope = `salary-${action}-${String(values.employeeId || values.id || values.month || "new")}`;
    try {
      let replayed = false;
      const submitRequest = async (): Promise<void> => {
        try {
          const response = await fetch("/api/salaries", {
            method: "POST",
            body,
            ...(financial ? { headers: financialHeaders(scope) } : {}),
          });
          if (financial) {
            replayed = (await financialResult(response, scope)).replayed;
            return;
          }
          const result = await response.json();
          if (!response.ok)
            throw new Error(result.error || "تعذر حفظ العملية.");
        } catch (reason) {
          const similar = (
            reason as {
              similarFinancialOperation?: { confirmationToken: string };
            }
          ).similarFinancialOperation;
          if (
            similar &&
            await confirm({ title: "عملية رواتب مشابهة", description: "توجد عملية رواتب مشابهة مسجلة من قبل. هل تريد إنشاءها كعملية مستقلة؟", tone: "warning" })
          ) {
            confirmSimilarFinancialOperation(scope, similar.confirmationToken);
            return submitRequest();
          }
          throw reason;
        }
      };
      await submitRequest();
      if (action === "employee-salary-update" && !replayed) {
        const employeeId = String(values.employeeId || "");
        const salaryCents = Math.round(Number(values.amount) * 100);
        const effectiveDate = String(values.effectiveMode) === "MONTH_START"
          ? new Date(`${String(values.effectiveDate)}-01T00:00:00.000Z`)
          : new Date(`${String(values.effectiveDate)}T00:00:00.000Z`);
        setSalaryOverrides((current) => ({ ...current, [employeeId]: { startDate: effectiveDate, monthlySalaryCents: salaryCents } }));
        notify(`تم حفظ راتب الموظف للفترة المحددة بقيمة ${Number(values.amount).toLocaleString("ar-EG")} ج.م، وتم تحديث الجدول فورًا.`, "success");
      } else {
        notify(replayed ? "العملية مسجلة بالفعل ولم تتكرر." : "تم حفظ العملية بنجاح.", replayed ? "info" : "success");
      }
      form.reset();
      setAdvanceEmployee(null);
      setAdjustment(null);
      setStatusChange(null);
      setSalaryEditEmployee(null);
      router.refresh();
    } catch (error) {
      notify(error instanceof Error ? error.message : "تعذر حفظ العملية.", "error");
    } finally {
      setBusy("");
    }
  }
  async function submit(
    event: FormEvent<HTMLFormElement>,
    action: string,
    files = false,
  ) {
    event.preventDefault();
    await send(event.currentTarget, action, files);
  }
  async function pay(id: string, source = "EXECUTIVE_DIRECTOR") {
    const form = new FormData();
    form.set("action", "payroll-pay");
    form.set("payload", JSON.stringify({ id, source }));
    const scope = `salary-payroll-pay-${id}`;
    setBusy(`pay-${id}`);
    try {
      const result = await financialResult(
        await fetch("/api/salaries", {
          method: "POST",
          body: form,
          headers: financialHeaders(scope),
        }),
        scope,
      );
      notify(
        result.replayed
          ? "الصرف مسجل بالفعل ولم يتكرر."
          : "تم تسجيل صرف المدير التنفيذي.",
        result.replayed ? "info" : "success",
      );
      router.refresh();
    } catch (reason) {
      notify(
        reason instanceof Error ? reason.message : "تعذر تسجيل الصرف.",
        "error",
      );
    } finally {
      setBusy("");
    }
  }
  async function revertPayroll(id: string, monthValue: string) {
    const reason = window.prompt(`اكتب سبب إرجاع كشف رواتب ${monthValue}:`, "تصحيح بيانات كشف المرتبات");
    if (reason === null) return;
    if (reason.trim().length < 3) {
      notify("اكتب سببًا واضحًا لإرجاع كشف المرتبات.", "error");
      return;
    }
    const form = new FormData();
    form.set("action", "payroll-revert");
    form.set("payload", JSON.stringify({ id, reason: reason.trim() }));
    const scope = `salary-payroll-revert-${id}`;
    setBusy(`revert-${id}`);
    try {
      await financialResult(await fetch("/api/salaries", { method: "POST", body: form, headers: financialHeaders(scope) }), scope);
      notify(`تم إرجاع كشف شهر ${monthValue}. عادت خصومات السلف كما كانت ويمكنك الآن تعديل البيانات وإعادة إنشاء الكشف.`, "success");
      router.refresh();
    } catch (reasonError) {
      notify(reasonError instanceof Error ? reasonError.message : "تعذر إرجاع كشف المرتبات.", "error");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-blue-700">
            إدارة الموظفين والرواتب
          </p>
          <h1 className="mt-1 text-2xl font-black text-slate-950">
            المرتبات والسلف وتكلفة المشروعات
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            الرواتب ثابتة؛ المحاسب يعتمد الكشف والمدير التنفيذي يسجّل صرفه.
          </p>
        </div>
      </section>
      <nav
        className="flex w-full gap-2 rounded-xl border bg-white p-1"
        aria-label="أقسام المرتبات"
      >
        <button
          className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-black ${tab === "employees" ? "bg-blue-700 text-white shadow-sm" : "text-slate-500 hover:bg-slate-50"}`}
          onClick={() => setTab("employees")}
        >
          الموظفون والتسكين
        </button>
        <button
          className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-black ${tab === "payroll" ? "bg-blue-700 text-white shadow-sm" : "text-slate-500 hover:bg-slate-50"}`}
          onClick={() => setTab("payroll")}
        >
          كشوف المرتبات
        </button>
      </nav>

      {tab === "employees" ? (
        <EmployeesTab
          employees={employees}
          projects={projects}
          salaryDistribution={salaryDistribution}
          currentAllocations={currentAllocations}
          advances={currentAdvances}
          bonuses={monthlyBonuses}
          deductions={monthlyDeductions}
          salaryRates={salaryRates}
          month={month}
          setMonth={setMonth}
          canManage={canManage}
          busy={busy}
          onSubmit={submit}
          onAdvance={setAdvanceEmployee}
          onAdjustment={setAdjustment}
          onStatusChange={setStatusChange}
          onEditSalary={setSalaryEditEmployee}
        />
      ) : (
        <>
          <>
            {canManage && (
              <section className="inline-flex max-w-full rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
                <form
                  onSubmit={(event) => submit(event, "payroll-settings")}
                  className="flex flex-wrap items-center gap-2"
                >
                  <div className="ml-1">
                    <h2 className="text-xs font-black text-slate-800">
                      تنبيه صرف المرتبات
                    </h2>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      يوم الصرف الشهري{paymentDay ? `: ${paymentDay}` : ""}
                    </p>
                  </div>
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-700">
                    <span>يوم الصرف</span>
                    <input
                      name="paymentDay"
                      type="number"
                      min="1"
                      max="28"
                      required
                      defaultValue={paymentDay ?? undefined}
                      className={`${expenseInput} h-8 w-16 py-1 text-center`}
                    />
                  </label>
                  <button
                    disabled={busy === "payroll-settings"}
                    className="h-8 rounded-lg border border-blue-200 px-3 text-xs font-bold text-blue-700 hover:bg-blue-50"
                  >
                    حفظ
                  </button>
                </form>
              </section>
            )}
          </>
          <PayrollTab
            runs={runs}
            projects={projects}
            canManage={canManage}
            canPay={canPay}
            busy={busy}
            onSubmit={submit}
            onPay={pay}
            onRevert={revertPayroll}
            payrollMonth={payrollMonth}
          />
        </>
      )}
      {advanceEmployee && (
        <AdvanceDialog
          employee={advanceEmployee}
          busy={busy}
          onClose={() => setAdvanceEmployee(null)}
          onSubmit={submit}
        />
      )}
      {adjustment && (
        <AdjustmentDialog
          employee={adjustment.employee}
          type={adjustment.type}
          defaultMonth={runs.some((run) => run.month === month) ? payrollMonth : month}
          busy={busy}
          onClose={() => setAdjustment(null)}
          onSubmit={submit}
        />
      )}
      {statusChange && (
        <EmployeeStatusDialog
          employee={statusChange.employee}
          status={statusChange.status}
          busy={busy}
          onClose={() => setStatusChange(null)}
          onSubmit={submit}
        />
      )}
      {salaryEditEmployee && <SalaryEditDialog employee={salaryEditEmployee} rates={salaryRates.filter((rate) => rate.employeeId === salaryEditEmployee.id)} selectedMonth={month} lockedMonths={runs.map((run) => run.month)} busy={busy} onClose={() => setSalaryEditEmployee(null)} onSubmit={submit} />}
    </div>
  );
}

function EmployeesTab({
  employees,
  projects,
  salaryDistribution,
  currentAllocations,
  advances,
  bonuses,
  deductions,
  salaryRates,
  month,
  setMonth,
  canManage,
  busy,
  onSubmit,
  onAdvance,
  onAdjustment,
  onStatusChange,
  onEditSalary,
}: {
  employees: Employee[];
  projects: Project[];
  salaryDistribution: (employee: Employee) => { projectId: string | null; days: number; cents: number }[];
  currentAllocations: Map<string, Allocation | undefined>;
  advances: Advance[];
  bonuses: Adjustment[];
  deductions: Adjustment[];
  salaryRates: SalaryRate[];
  month: string;
  setMonth: (value: string) => void;
  canManage: boolean;
  busy: string;
  onSubmit: (
    event: FormEvent<HTMLFormElement>,
    action: string,
    files?: boolean,
  ) => Promise<void>;
  onAdvance: (employee: Employee) => void;
  onAdjustment: (adjustment: {
    employee: Employee;
    type: "bonus" | "deduction";
  }) => void;
  onStatusChange: (change: { employee: Employee; status: "ACTIVE" | "INACTIVE" }) => void;
  onEditSalary: (employee: Employee) => void;
}) {
  const [statusTab, setStatusTab] = useState<"ACTIVE" | "INACTIVE">("ACTIVE");
  const [expandedSalaryDistribution, setExpandedSalaryDistribution] = useState<string | null>(null);
  const activeEmployees = employees.filter((employee) => employee.active);
  const inactiveEmployees = employees.filter((employee) => !employee.active);
  const visibleEmployees = statusTab === "ACTIVE" ? activeEmployees : inactiveEmployees;
  return (
    <div className="space-y-5">
      {canManage && (
        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="text-base font-black">التسكين</h2>
          <p className="mt-1 text-xs text-slate-500">
            اختيار تسكين جديد يقفل السابق تلقائيًا من تاريخ اليوم.
          </p>
          <form
            onSubmit={(event) => onSubmit(event, "employee-config")}
            className="mt-4 grid gap-3 md:grid-cols-[1.2fr_1fr_auto]"
          >
            <Field label="الموظف *">
              <Select name="employeeId" options={activeEmployees} />
            </Field>
            <Field label="المشروع / عام الشركة">
              <Select name="projectId" options={projects} optional />
            </Field>
            <button
              disabled={busy === "employee-config"}
              className="mt-7 h-10 rounded-lg bg-blue-700 px-5 text-sm font-bold text-white disabled:opacity-50"
            >
              حفظ
            </button>
          </form>
        </section>
      )}
      <section className="erp-table-shell">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b bg-white p-4">
          <div>
            <h2 className="text-base font-black">الموظفون</h2>
            <p className="mt-1 text-xs text-slate-500">
              السلف والمكافآت والخصومات المعروضة تخص الشهر المختار.
            </p>
          </div>
          <Field label="فلتر الشهر">
            <MonthInput value={month} onChange={setMonth} />
          </Field>
        </div>
        <div className="flex gap-2 border-b bg-slate-50 p-3">
          <button type="button" onClick={() => setStatusTab("ACTIVE")} className={`rounded-lg px-4 py-2 text-sm font-bold ${statusTab === "ACTIVE" ? "bg-emerald-700 text-white" : "bg-white text-slate-600"}`}>نشط ({activeEmployees.length})</button>
          <button type="button" onClick={() => setStatusTab("INACTIVE")} className={`rounded-lg px-4 py-2 text-sm font-bold ${statusTab === "INACTIVE" ? "bg-slate-700 text-white" : "bg-white text-slate-600"}`}>غير نشط ({inactiveEmployees.length})</button>
        </div>
        <div className="erp-table-scroll">
          <table className="erp-data-table erp-responsive-table min-w-[1050px]">
            <thead>
              <tr>
                {[
                  "الموظف",
                  "التسكين",
                  "الراتب الشهري",
                  "المشروع",
                  "السلف",
                  "المكافآت",
                  "الخصومات",
                  "الحالة",
                  "الإجراءات",
                ].map((head) => (
                  <th key={head}>{head}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleEmployees.map((employee) => {
                const allocation = currentAllocations.get(employee.id);
                const distribution = salaryDistribution(employee);
                const employeeAdvances = advances
                  .filter((item) => item.employee.id === employee.id)
                  .reduce((sum, item) => sum + item.remainingCents, 0);
                const employeeBonuses = bonuses
                  .filter((item) => item.employee.id === employee.id)
                  .reduce((sum, item) => sum + item.amountCents, 0);
                const employeeDeductions = deductions
                  .filter((item) => item.employee.id === employee.id)
                  .reduce((sum, item) => sum + item.amountCents, 0);
                const employeeRateHistory = salaryRates
                  .filter((rate) => rate.employeeId === employee.id && new Date(rate.startDate).getUTCFullYear() > 1900)
                  .sort((left, right) => +new Date(right.startDate) - +new Date(left.startDate));
                return (
                  <tr key={employee.id}>
                    <td data-label="الموظف" className={`font-bold ${employee.active ? "" : "text-slate-400 line-through"}`}>
                      {employee.name}
                      <p className="mt-1 text-[11px] text-slate-400">
                        {employee.employeeCode} · {employee.jobTitle}
                      </p>
                    </td>
                    <td data-label="التسكين">
                      {allocation?.project ? "مشروع" : "عام الشركة"}
                    </td>
                    <td data-label="الراتب الشهري" className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <MoneyValue>{money(distribution.reduce((sum, part) => sum + part.cents, 0))} ج.م</MoneyValue>
                        {distribution.length > 1 && (
                          <button
                            type="button"
                            aria-label={`عرض توزيع راتب ${employee.name}`}
                            aria-expanded={expandedSalaryDistribution === employee.id}
                            onClick={() => setExpandedSalaryDistribution((current) => current === employee.id ? null : employee.id)}
                            className="rounded p-1 text-blue-700 hover:bg-blue-50"
                          >
                            <ChevronDown className={`size-4 transition-transform ${expandedSalaryDistribution === employee.id ? "rotate-180" : ""}`} />
                          </button>
                        )}
                      </div>
                      {distribution.length > 1 && expandedSalaryDistribution === employee.id && (
                        <div className="mt-2 space-y-1 text-right text-[11px] font-medium text-slate-500">
                          <p className="font-bold text-blue-700">توزيع راتب {month}</p>
                          {distribution.map((part, index) => (
                            <p key={`${part.projectId ?? "general"}-${index}`}>
                              {part.projectId ? projects.find((project) => project.id === part.projectId)?.name ?? "مشروع غير متاح" : "عام الشركة"}: {part.days} يوم — {money(part.cents)} ج.م
                            </p>
                          ))}
                        </div>
                      )}
                      {employeeRateHistory[0] && (
                        <p className="mt-1 text-[11px] font-medium text-slate-500">
                          آخر تعديل: {new Date(employeeRateHistory[0].startDate).toISOString().slice(0, 10)}
                          {employeeRateHistory.length > 1 ? ` · ${employeeRateHistory.length} تعديلات` : ""}
                        </p>
                      )}
                    </td>
                    <td data-label="المشروع">
                      {allocation?.project?.name ?? "عام الشركة"}
                    </td>
                    <td data-label="السلف" className="text-center">
                      <MoneyValue>{money(employeeAdvances)} ج.م</MoneyValue>
                    </td>
                    <td data-label="المكافآت" className="text-center">
                      <MoneyValue>{money(employeeBonuses)} ج.م</MoneyValue>
                    </td>
                    <td data-label="الخصومات" className="text-center">
                      <MoneyValue>{money(employeeDeductions)} ج.م</MoneyValue>
                    </td>
                    <td data-label="الحالة">
                      <span className={`rounded-full px-2 py-1 text-xs font-bold ${employee.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                        {employee.active ? "نشط" : "غير نشط"}
                      </span>
                    </td>
                    <td data-label="الإجراءات">
                      <div className="flex justify-start gap-2">
                        {canManage && employee.active && (
                          <IconAction
                            label="تعديل الراتب"
                            icon={Banknote}
                            onClick={() => onEditSalary(employee)}
                          />
                        )}
                        {canManage && employee.active && (
                          <IconAction
                            label="إضافة سلفة"
                            icon={WalletCards}
                            onClick={() => onAdvance(employee)}
                          />
                        )}
                        {canManage && employee.active && (
                          <IconAction
                            label="إضافة مكافأة"
                            icon={Gift}
                            tone="success"
                            onClick={() =>
                              onAdjustment({ employee, type: "bonus" })
                            }
                          />
                        )}
                        {canManage && employee.active && (
                          <IconAction
                            label="إضافة خصم"
                            icon={BadgeMinus}
                            tone="danger"
                            onClick={() =>
                              onAdjustment({ employee, type: "deduction" })
                            }
                          />
                        )}
                        {canManage && (
                          <IconAction
                            label={employee.active ? "إيقاف الموظف" : "إعادة تفعيل الموظف"}
                            icon={employee.active ? Power : RotateCcw}
                            tone={employee.active ? "danger" : "success"}
                            disabled={busy === "employee-status"}
                            onClick={() => onStatusChange({ employee, status: employee.active ? "INACTIVE" : "ACTIVE" })}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!visibleEmployees.length && (
                <tr>
                  <td colSpan={9} className="p-10 text-center text-slate-400">
                    {statusTab === "ACTIVE" ? "لا يوجد موظفون نشطون." : "لا يوجد موظفون غير نشطين."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function EmployeeStatusDialog({
  employee,
  status,
  busy,
  onClose,
  onSubmit,
}: {
  employee: Employee;
  status: "ACTIVE" | "INACTIVE";
  busy: string;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>, action: string) => Promise<void>;
}) {
  const activating = status === "ACTIVE";
  const [effectiveMode, setEffectiveMode] = useState<"MONTH_START" | "TODAY">("TODAY");
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = `${today.slice(0, 7)}-01`;
  const effectiveDate = effectiveMode === "MONTH_START" ? monthStart : today;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4">
      <form onSubmit={(event) => onSubmit(event, "employee-status")} className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        <h2 className="text-lg font-black">{activating ? "إعادة تفعيل الموظف" : "إيقاف الموظف"}</h2>
        <p className="mt-2 text-sm text-slate-600">
          {activating
            ? `سيعود «${employee.name}» إلى قوائم الموظفين النشطين والرواتب مباشرة.`
            : `سيبقى سجل «${employee.name}» محفوظًا وينتقل مباشرة إلى الموظفين غير النشطين.`}
        </p>
        <input type="hidden" name="employeeId" value={employee.id} />
        <input type="hidden" name="status" value={status} />
        <input type="hidden" name="effectiveDate" value={effectiveDate} />
        <fieldset className="mt-5">
          <legend className="text-sm font-bold text-slate-800">{activating ? "تريد احتساب راتبه من متى؟" : "تريد عدم احتساب راتبه من متى؟"}</legend>
          <div className="mt-3 grid gap-2">
            <label className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm font-bold ${effectiveMode === "MONTH_START" ? "border-blue-500 bg-blue-50 text-blue-900" : "border-slate-200"}`}><input type="radio" name="effectiveMode" value="MONTH_START" checked={effectiveMode === "MONTH_START"} onChange={() => setEffectiveMode("MONTH_START")} className="accent-blue-700" />من أول الشهر</label>
            <label className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm font-bold ${effectiveMode === "TODAY" ? "border-blue-500 bg-blue-50 text-blue-900" : "border-slate-200"}`}><input type="radio" name="effectiveMode" value="TODAY" checked={effectiveMode === "TODAY"} onChange={() => setEffectiveMode("TODAY")} className="accent-blue-700" />من أول اليوم</label>
          </div>
        </fieldset>
        <p className="mt-3 text-xs text-slate-500">لن تتغير حالة حساب الدخول. إذا كان الشهر مقفلاً بكشف رواتب معتمد، ستظهر رسالة توضح أقرب تاريخ مسموح.</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm font-bold">إلغاء</button>
          <button disabled={busy === "employee-status"} className={`rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-50 ${activating ? "bg-emerald-700" : "bg-rose-700"}`}>{activating ? "إعادة التفعيل" : "إيقاف الموظف"}</button>
        </div>
      </form>
    </div>
  );
}

function SalaryEditDialog({
  employee,
  rates,
  selectedMonth,
  lockedMonths,
  busy,
  onClose,
  onSubmit,
}: {
  employee: Employee;
  rates: SalaryRate[];
  selectedMonth: string;
  lockedMonths: string[];
  busy: string;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>, action: string) => Promise<void>;
}) {
  const [effectiveMode, setEffectiveMode] = useState<"MONTH_START" | "DATE">("MONTH_START");
  const [effectiveValue, setEffectiveValue] = useState(selectedMonth);
  const [amount, setAmount] = useState("");
  const history = [...rates]
    .filter((rate) => new Date(rate.startDate).getUTCFullYear() > 1900)
    .sort((left, right) => +new Date(right.startDate) - +new Date(left.startDate));
  const normalizedDate = effectiveMode === "MONTH_START" ? `${effectiveValue}-01` : effectiveValue;
  const matchingRate = history.find((rate) => new Date(rate.startDate).toISOString().slice(0, 10) === normalizedDate);
  const selectedMonthLocked = lockedMonths.includes(normalizedDate.slice(0, 7));
  const chooseRate = (rate: SalaryRate) => {
    const date = new Date(rate.startDate).toISOString().slice(0, 10);
    const startsAtMonth = date.endsWith("-01");
    setEffectiveMode(startsAtMonth ? "MONTH_START" : "DATE");
    setEffectiveValue(startsAtMonth ? date.slice(0, 7) : date);
    setAmount(String(rate.monthlySalaryCents / 100));
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4">
      <form onSubmit={(event) => onSubmit(event, "employee-salary-update")} className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <header className="border-b bg-gradient-to-l from-blue-50 to-white p-5">
          <h2 className="text-lg font-black">سجل راتب {employee.name}</h2>
          <p className="mt-1 text-sm text-slate-600">حدد الشهر أو اليوم والقيمة. التاريخ المحفوظ يُحدّث، والتاريخ الجديد يُضاف للسجل.</p>
        </header>
        <input type="hidden" name="employeeId" value={employee.id} />
        <div className="grid gap-5 p-5 md:grid-cols-[1.05fr_.95fr]">
          <section className="space-y-4">
            <Field label="طريقة بدء الراتب">
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
                <button type="button" onClick={() => { setEffectiveMode("MONTH_START"); setEffectiveValue(normalizedDate.slice(0, 7)); }} className={`rounded-lg px-3 py-2 text-sm font-bold ${effectiveMode === "MONTH_START" ? "bg-white text-blue-800 shadow-sm" : "text-slate-600"}`}>شهر كامل</button>
                <button type="button" onClick={() => { setEffectiveMode("DATE"); setEffectiveValue(normalizedDate); }} className={`rounded-lg px-3 py-2 text-sm font-bold ${effectiveMode === "DATE" ? "bg-white text-blue-800 shadow-sm" : "text-slate-600"}`}>من يوم محدد</button>
              </div>
            </Field>
            <input type="hidden" name="effectiveMode" value={effectiveMode} />
            <Field label={effectiveMode === "MONTH_START" ? "الشهر الذي يسري منه الراتب *" : "يوم بدء الراتب *"}>
              <input name="effectiveDate" type={effectiveMode === "MONTH_START" ? "month" : "date"} required value={effectiveValue} onChange={(event) => setEffectiveValue(event.target.value)} className={expenseInput} />
            </Field>
            <Field label="الراتب الشهري *">
              <CurrencyInput name="amount" value={amount} onValueChange={setAmount} required min="0.01" />
            </Field>
            {matchingRate && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-900">يوجد راتب محفوظ في هذا التاريخ بقيمة {money(matchingRate.monthlySalaryCents)} ج.م. الحفظ سيحدّث نفس السجل.</p>}
            {selectedMonthLocked && <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-800">شهر {normalizedDate.slice(0, 7)} له كشف معتمد أو مصروف. أرجع الكشف أولًا قبل تغيير الراتب.</p>}
            {!matchingRate && !selectedMonthLocked && <p className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-800">يمكن تسجيل راتب لهذا الشهر وراتب مختلف للشهر التالي؛ كل كشف يحسب القيمة السارية داخله فقط.</p>}
          </section>
          <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-black text-slate-900">تاريخ تعديلات الراتب</h3><span className="rounded-full bg-white px-2 py-1 text-xs font-bold text-slate-500">{history.length} سجل</span></div>
            <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
              {history.map((rate, index) => {
                const date = new Date(rate.startDate).toISOString().slice(0, 10);
                return <button key={rate.id} type="button" onClick={() => chooseRate(rate)} className="flex w-full items-center justify-between gap-3 rounded-xl border bg-white p-3 text-right transition hover:border-blue-300 hover:bg-blue-50"><span><b className="block text-sm text-slate-900">{money(rate.monthlySalaryCents)} ج.م</b><small className="mt-1 block text-xs text-slate-500">يسري من {date}</small></span><span className="text-xs font-bold text-blue-700">{index === 0 ? "آخر راتب" : "تعديل"}</span></button>;
              })}
              {!history.length && <p className="rounded-xl border border-dashed p-4 text-center text-sm text-slate-500">لا توجد تعديلات سابقة. سيُحفظ أول تعديل هنا.</p>}
            </div>
          </section>
        </div>
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t p-5"><p className="text-xs text-slate-500">الشهور المعتمدة لا تتغير إلا بعد إرجاع كشفها.</p><div className="flex gap-2"><button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm font-bold">إلغاء</button><button disabled={busy === "employee-salary-update" || selectedMonthLocked} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">حفظ الراتب</button></div></footer>
      </form>
    </div>
  );
}

function AdvanceDialog({
  employee,
  busy,
  onClose,
  onSubmit,
}: {
  employee: Employee;
  busy: string;
  onClose: () => void;
  onSubmit: (
    event: FormEvent<HTMLFormElement>,
    action: string,
    files?: boolean,
  ) => Promise<void>;
}) {
  const [repaymentMode, setRepaymentMode] = useState("NEXT_PAYROLL");
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/35 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="advance-title"
    >
      <form
        onSubmit={(event) => onSubmit(event, "advance", true)}
        className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="advance-title" className="text-lg font-black">
              إضافة سلفة
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {employee.name} · {employee.employeeCode}
            </p>
          </div>
          <button type="button" className={expenseButton} onClick={onClose}>
            إغلاق
          </button>
        </div>
        <input type="hidden" name="employeeId" value={employee.id} />
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Field label="قيمة السلفة *">
            <CurrencyInput name="amount" required min="0.01" max={String(employee.monthlySalaryCents / 100)} />
            <p className="mt-1 text-[10px] text-slate-500">الحد الأقصى لإجمالي السلف القائمة هو الراتب الشهري: {money(employee.monthlySalaryCents)} ج.م.</p>
          </Field>
          <Field label="تاريخ الصرف *">
            <input
              name="issuedAt"
              type="date"
              required
              defaultValue={new Date().toISOString().slice(0, 10)}
              className={expenseInput}
            />
          </Field>
          <Field label="طريقة الاسترداد">
            <ERPSelect name="repaymentMode" value={repaymentMode} onValueChange={setRepaymentMode} className={expenseInput}>
              <option value="NEXT_PAYROLL">المرتب القادم</option>
              <option value="INSTALLMENTS">أقساط</option>
            </ERPSelect>
          </Field>
          <Field label="قيمة القسط عند التقسيط">
            <CurrencyInput name="installment" min="0.01" required={repaymentMode === "INSTALLMENTS"} disabled={repaymentMode !== "INSTALLMENTS"} aria-describedby="installment-help" />
            {repaymentMode === "NEXT_PAYROLL" && <p id="installment-help" className="mt-1 text-[10px] text-slate-500">مقفلة لأن كامل السلفة سيُخصم من المرتب القادم.</p>}
          </Field>
          <Field label="مصدر تمويل السلفة *">
            <ERPSelect name="source" defaultValue="EXECUTIVE_DIRECTOR" required className={expenseInput}>
              <option value="EXECUTIVE_DIRECTOR">من المدير التنفيذي</option>
              <option value="PETTY_CASH">من الخزنة الرئيسية</option>
            </ERPSelect>
            <p className="mt-1 text-[10px] text-slate-500">
              تمويل المدير التنفيذي يدخل الخزنة ثم يُصرف دون خفض رصيدها، أما تمويل الخزنة فيُخصم من رصيدها.
            </p>
          </Field>
          <Field label="ملاحظات">
            <input name="note" maxLength={2000} className={expenseInput} />
          </Field>
        </div>
        <div className="mt-4">
          <UploadBox
            name="files"
            label="إثبات السلفة"
            required
            multiple={false}
          />
        </div>
        <div className="mt-5 flex gap-2">
          <button
            disabled={busy === "advance"}
            className={`${expenseButton} !border-blue-700 !bg-blue-700 !text-white hover:!bg-blue-800`}
          >
            {busy === "advance" ? "جارٍ الحفظ…" : "حفظ السلفة"}
          </button>
          <button type="button" className={expenseButton} onClick={onClose}>
            إلغاء
          </button>
        </div>
      </form>
    </div>
  );
}

function AdjustmentDialog({
  employee,
  type,
  defaultMonth,
  busy,
  onClose,
  onSubmit,
}: {
  employee: Employee;
  type: "bonus" | "deduction";
  defaultMonth: string;
  busy: string;
  onClose: () => void;
  onSubmit: (
    event: FormEvent<HTMLFormElement>,
    action: string,
  ) => Promise<void>;
}) {
  const isBonus = type === "bonus";
  const title = isBonus ? "إضافة مكافأة" : "إضافة خصم";
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/35 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="adjustment-title"
    >
      <form
        onSubmit={(event) => onSubmit(event, type)}
        className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="adjustment-title" className="text-lg font-black">
              {title}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {employee.name} · {employee.employeeCode}
            </p>
          </div>
          <button type="button" className={expenseButton} onClick={onClose}>
            إغلاق
          </button>
        </div>
        <input type="hidden" name="employeeId" value={employee.id} />
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Field label="الشهر *">
            <input value={defaultMonth} readOnly className={`${expenseInput} bg-slate-50 font-bold`} />
            <input type="hidden" name="month" value={defaultMonth} />
            <p className="mt-1 text-[10px] text-slate-500">لا يمكن إضافة تعديل على شهر له كشف معتمد.</p>
          </Field>
          <Field label="القيمة *">
            <CurrencyInput name="amount" required min="0.01" max={isBonus ? undefined : String(employee.monthlySalaryCents / 100)} />
          </Field>
          <Field label="الاسم *">
            <input
              name="name"
              required
              className={expenseInput}
              placeholder={isBonus ? "مثال: مكافأة إنجاز" : "مثال: خصم غياب"}
            />
          </Field>
          <Field label="السبب *">
            <input name="reason" required className={expenseInput} />
          </Field>
        </div>
        <p className="mt-3 text-[11px] text-slate-500">
          المرفق اختياري لهذه العملية.
        </p>
        <div className="mt-5 flex gap-2">
          <button
            disabled={busy === type}
            className={`${expenseButton} ${isBonus ? "!border-emerald-600 !bg-emerald-600" : "!border-amber-600 !bg-amber-600"} !text-white`}
          >
            {busy === type ? "جارٍ الحفظ…" : title}
          </button>
          <button type="button" className={expenseButton} onClick={onClose}>
            إلغاء
          </button>
        </div>
      </form>
    </div>
  );
}

function PayrollTab({
  runs,
  projects,
  canManage,
  canPay,
  busy,
  onSubmit,
  onPay,
  onRevert,
  payrollMonth,
}: {
  runs: Run[];
  projects: Project[];
  canManage: boolean;
  canPay: boolean;
  busy: string;
  onSubmit: (
    event: FormEvent<HTMLFormElement>,
    action: string,
    files?: boolean,
  ) => Promise<void>;
  onPay: (id: string, source?: string) => Promise<void>;
  onRevert: (id: string, month: string) => Promise<void>;
  payrollMonth: string;
}) {
  const [sources, setSources] = useState<Record<string, string>>({});
  const approvedCost = runs
    .filter((run) => ["APPROVED", "PAID"].includes(run.status))
    .flatMap((run) =>
      run.lines.flatMap((line) => {
        try {
          return JSON.parse(line.allocationJson) as {
            projectId: string | null;
            cents: number;
          }[];
        } catch {
          return [];
        }
      }),
    )
    .reduce<Record<string, number>>(
      (all, row) => ({
        ...all,
        [row.projectId ?? "general"]:
          (all[row.projectId ?? "general"] ?? 0) + row.cents,
      }),
      {},
    );
  return (
    <div className="space-y-5">
      <section className="grid gap-3 md:grid-cols-3">
        <KpiCard
          label="الكشوف المعتمدة"
          value={String(runs.filter((run) => run.status === "APPROVED").length)}
          icon={FileText}
          tone="blue"
        />
        <KpiCard
          label="الكشوف المصروفة"
          value={String(runs.filter((run) => run.status === "PAID").length)}
          icon={Banknote}
          tone="emerald"
        />
        <KpiCard
          label="إجمالي آخر كشف"
          value={`${money(runs[0]?.totalCents ?? 0)} ج.م`}
          icon={UserRound}
          tone="violet"
        />
      </section>
      {canManage && (
        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="text-base font-black">إنشاء واعتماد كشف شهر</h2>
          <form
            onSubmit={(event) => onSubmit(event, "create-payroll", true)}
            className="mt-4 grid gap-3 md:grid-cols-[220px_1fr_auto]"
          >
            <Field label="الشهر *">
              <input value={payrollMonth} readOnly className={`${expenseInput} bg-slate-50 font-bold`} />
              <input type="hidden" name="month" value={payrollMonth} />
              <p className="mt-1 text-[10px] text-slate-500">يعرض النظام الشهر التالي فقط لمنع تكرار كشف معتمد أو تخطي شهر.</p>
            </Field>
            <UploadBox
              name="files"
              label="مرفق كشف المرتبات"
              required
              multiple={false}
            />
            <button
              disabled={busy === "create-payroll"}
              className="mt-7 h-10 rounded-lg bg-blue-700 px-5 text-sm font-bold text-white disabled:opacity-50"
            >
              إنشاء واعتماد
            </button>
          </form>
        </section>
      )}
      <section className="erp-table-shell">
        <div className="border-b bg-white p-4">
          <h2 className="text-base font-black">كشوف المرتبات</h2>
        </div>
        <div className="erp-table-scroll">
          <table className="erp-data-table erp-responsive-table min-w-[760px]">
            <thead>
              <tr>
                {[
                  "الشهر",
                  "إجمالي الكشف",
                  "الحالة",
                  "مصدر الصرف",
                  "المرفقات",
                  "الإجراءات",
                ].map((head) => (
                  <th key={head}>{head}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id}>
                  <td data-label="الشهر">{run.month}</td>
                  <td data-label="إجمالي الكشف" className="text-center">
                    <MoneyValue>{money(run.totalCents)} ج.م</MoneyValue>
                  </td>
                  <td data-label="الحالة">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-bold ${run.status === "PAID" ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"}`}
                    >
                      {run.status === "PAID" ? "مصروف" : "معتمد"}
                    </span>
                  </td>
                  <td data-label="مصدر الصرف">
                    {run.status === "APPROVED" ? (
                      <select value={sources[run.id] || "EXECUTIVE_DIRECTOR"} onChange={(event) => setSources((current) => ({ ...current, [run.id]: event.target.value }))} className="h-8 min-w-32 rounded border border-slate-200 bg-white px-2 text-xs">
                        <option value="EXECUTIVE_DIRECTOR">المدير التنفيذي</option>
                        <option value="PETTY_CASH">الخزنة الرئيسية</option>
                      </select>
                    ) : "المدير التنفيذي"}
                  </td>
                  <td data-label="المرفقات">{run.attachments?.[0] ? <a className="relative inline-flex text-blue-700" href={`/api/salaries/attachments/${run.attachments[0].id}`} title={run.attachments[0].label}><Paperclip className="size-4" />{run.attachments.length > 1 && <span className="absolute -left-2 -top-2 rounded-full bg-blue-700 px-1 text-[9px] text-white">{run.attachments.length}</span>}</a> : "—"}</td>
                  <td data-label="الإجراءات">
                    <div className="flex flex-wrap gap-2">
                      {canPay && run.status === "APPROVED" && (
                        <button
                          disabled={busy === `pay-${run.id}` || busy === `revert-${run.id}`}
                          onClick={() => onPay(run.id, sources[run.id] || "EXECUTIVE_DIRECTOR")}
                          className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                        >
                          تسجيل الصرف
                        </button>
                      )}
                      {canManage && run.status === "APPROVED" && (
                        <button
                          disabled={busy === `revert-${run.id}` || busy === `pay-${run.id}`}
                          onClick={() => onRevert(run.id, run.month)}
                          className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800 disabled:opacity-50"
                        >
                          {busy === `revert-${run.id}` ? "جارٍ الإرجاع…" : "إرجاع الكشف"}
                        </button>
                      )}
                      {run.status !== "APPROVED" && "—"}
                    </div>
                  </td>
                </tr>
              ))}
              {!runs.length && (
                <tr>
                  <td colSpan={6} className="p-10 text-center text-slate-400">
                    لا توجد كشوف بعد.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      <section className="rounded-2xl border bg-white p-5">
        <h2 className="text-base font-black">
          تكلفة المرتبات المعتمدة حسب المشروع
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(approvedCost).map(([projectId, cents]) => (
            <article
              key={projectId}
              tabIndex={0}
              title="قيمة تكلفة الرواتب في الكشوف المعتمدة أو المصروفة"
              className="rounded-xl border p-4"
            >
              <p className="text-xs text-slate-500">
                {projectId === "general"
                  ? "عام الشركة"
                  : (projects.find((project) => project.id === projectId)
                      ?.name ?? "مشروع محذوف")}
              </p>
              <MoneyValue className="mt-2">{money(cents)} ج.م</MoneyValue>
            </article>
          ))}
          {!Object.keys(approvedCost).length && (
            <p className="text-sm text-slate-500">
              ستظهر تكلفة الكشوف المعتمدة هنا.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
