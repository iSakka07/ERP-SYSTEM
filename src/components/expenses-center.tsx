"use client";
import { ERPSelect } from "@/components/erp-select";
import { CurrencyInput } from "@/components/currency-input";
import { DocumentLayout } from "@/components/document-layout";
import { previewDataPdf, usePdfDataExport } from "@/components/pdf-data-export";
import { filteredExpensesReport, singleExpensesReport } from "@/components/expenses-pdf-report";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { WorkWithdrawalsCenter } from "./work-withdrawals-center";
import { IconAction, KpiCard, MoneyValue } from "@/components/erp-ui";
import {
  Plus,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  Check,
  FileSpreadsheet,
  Paperclip,
  BriefcaseBusiness,
  WalletCards,
  HandCoins,
  CircleDollarSign,
  Scissors,
  Trash2,
  FilePlus2,
  Eye,
} from "lucide-react";
import {
  approvalPermissions,
  expenseStages,
  expenseSummary,
  expensePayableCents,
  newExpenseStatementBlockReason,
  expenseCumulativeQuantity,
} from "@/lib/expenses";
import type {
  ExpenseAccount,
  ExpenseAttachmentInfo,
  ExpenseStatement,
} from "@/lib/expense-types";
import {
  ExpenseSheet,
  ExpenseFileInput,
  expenseButton,
  expenseInput,
  money,
  sendExpense,
  stageName,
} from "./expense-sheet";

export function ExpensesCenter({
  accounts,
  projects,
  companies,
  attachments,
  permissions,
  initialProjectId = "",
  initialEditorAccountId = "",
}: {
  accounts: ExpenseAccount[];
  projects: { id: string; name: string }[];
  companies: { id: string; name: string }[];
  attachments: ExpenseAttachmentInfo[];
  permissions: string[];
  initialProjectId?: string;
  initialEditorAccountId?: string;
}) {
  const router = useRouter();
  const allowed = (p: string) => permissions.includes(p);
  const [search, setSearch] = useState("");
  const [project, setProject] = useState(initialProjectId);
  const [company, setCompany] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [editor, setEditor] = useState<{
    accountId: string;
    statementId?: string;
  } | null>(initialEditorAccountId ? { accountId: initialEditorAccountId } : null);
  const [newAccount, setNewAccount] = useState(false);
  const [changeAccountId, setChangeAccountId] = useState<string | null>(null);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [reversePaymentId, setReversePaymentId] = useState<string | null>(null);
  const [returnId, setReturnId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [pdfChoiceOpen, setPdfChoiceOpen] = useState(false);
  usePdfDataExport(() => setPdfChoiceOpen(true));
  const visible = accounts.filter(
    (a) =>
      (!project || a.projectId === project) &&
      (!company || a.companyId === company) &&
      `${a.name} ${a.scope} ${a.company.name} ${a.project.name}`.includes(
        search,
      ),
  );
  const totals = visible.map((a) => expenseSummary(a.statements));
  const totalGross = totals.reduce((sum, total) => sum + total.grossCents, 0);
  const totalNet = totals.reduce((sum, total) => sum + total.netCents, 0);
  const totalPaid = totals.reduce((sum, total) => sum + total.paidCents, 0);
  const totalRemaining = totals.reduce((sum, total) => sum + total.remainingCents, 0);
  const totalDebt = totals.reduce((sum, total) => sum + total.debtCents, 0);
  const totalAdvance = totals.reduce((sum, total) => sum + total.advanceCents, 0);
  const totalStatements = visible.reduce((sum, account) => sum + account.statements.length, 0);
  function exportExpensesPdf(single: boolean) {
    const account = visible.find((item) => item.id === expanded);
    if (single && !account) return;
    const filters = [search && `بحث: ${search}`, project && `المشروع: ${projects.find((item) => item.id === project)?.name || project}`, company && `المقاول: ${companies.find((item) => item.id === company)?.name || company}`].filter(Boolean).join(" · ") || "كل المقاولات";
    setPdfChoiceOpen(false);
    void previewDataPdf(single && account ? singleExpensesReport(account) : filteredExpensesReport(visible, filters));
  }
  function saved() {
    setEditor(null);
    setNewAccount(false);
    setPaymentId(null);
    setReversePaymentId(null);
    setReturnId(null);
    setError("");
    setNotice("تم حفظ العملية وتسجيلها في سجل المراجعة.");
    router.refresh();
  }
  async function perform(
    payload: unknown,
    form?: HTMLFormElement,
    openSheet = false,
  ) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await sendExpense(payload, form);
      saved();
      if (openSheet) setEditor({ accountId: result.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر الحفظ.");
    } finally {
      setBusy(false);
    }
  }
  async function removeAccount(account: ExpenseAccount) {
    if (!window.confirm(`مسح «${account.name}» من القوائم؟ سيظل تاريخه المالي محفوظًا.`)) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/expenses", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: account.id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "تعذر المسح.");
      setExpanded(null);
      setNotice("تم مسح أعمال المقاول من القوائم مع الاحتفاظ بالتاريخ المالي.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر المسح.");
    } finally {
      setBusy(false);
    }
  }
  function files(type: string, id: string, compact = false) {
    const list = attachments.filter(
      (f) => f.entityType === type && f.entityId === id,
    );
    if (!list.length)
      return compact ? null : <p className="text-xs text-slate-400">لا توجد مرفقات.</p>;
    if (compact)
      return (
        <details className="relative">
          <summary
            className="erp-icon-action erp-icon-action-default cursor-pointer list-none"
            aria-label={`عرض ${list.length} مرفق`}
            title={`عرض ${list.length} مرفق`}
          >
            <Paperclip className="size-4" />
            {list.length > 1 && <span className="text-[9px] font-black">{list.length}</span>}
          </summary>
          <div className="absolute left-0 z-30 mt-2 w-64 space-y-1 rounded-lg border bg-white p-2 shadow-xl">
            {list.map((f) => (
              <a key={f.id} className="flex items-center gap-2 rounded px-2 py-2 text-xs text-blue-700 hover:bg-blue-50" href={`/api/expenses/attachments/${f.id}`}>
                <Paperclip className="size-3" />
                <span className="truncate">{f.name}</span>
              </a>
            ))}
          </div>
        </details>
      );
    return (
      <div className="flex flex-wrap gap-2">
        {list.map((f) => (
          <a
            key={f.id}
            className="inline-flex max-w-full items-center gap-1 rounded bg-blue-50 px-2 py-1 text-[11px] text-blue-700"
            href={`/api/expenses/attachments/${f.id}`}
          >
            <Paperclip className="size-3 shrink-0" />
            <span className="truncate">{f.name}</span>
          </a>
        ))}
      </div>
    );
  }
  const editAccount = editor
    ? accounts.find((a) => a.id === editor.accountId)
    : undefined;
  const changeAccount = accounts.find((a) => a.id === changeAccountId);
  if (changeAccount)
    return (
      <WorkWithdrawalsCenter account={changeAccount} companies={companies}
        attachments={attachments} permissions={permissions}
        onClose={() => setChangeAccountId(null)} />
    );
  if (editAccount)
    return (
      <ExpenseSheet
        key={editor?.statementId ?? editAccount.id}
        account={editAccount}
        statement={editAccount.statements.find(
          (s) => s.id === editor?.statementId,
        )}
        onClose={() => setEditor(null)}
        onSaved={saved}
      />
    );
  const detailAccount = accounts.find((a) =>
    a.statements.some((s) => s.id === selected),
  );
  const detail = detailAccount?.statements.find((s) => s.id === selected);
  function paymentForm(st: ExpenseStatement, account: ExpenseAccount) {
    const paidCents = account.statements.reduce(
      (sum, statement) =>
        sum + statement.payments.filter((payment) => payment.status !== "REVERSED").reduce((value, payment) => value + payment.amountCents, 0),
      0,
    );
    const approvingAccounting = st.stage === "EXECUTIVE";
    const dueCents = approvingAccounting
      ? Math.max(0, st.netCents - paidCents)
      : expensePayableCents(account.statements, st.id);
    return (
      <form
        className="space-y-3 rounded-xl border border-emerald-200 bg-white p-4 shadow-sm"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void perform(
            {
              action: approvingAccounting ? "accountingPayment" : "payment",
              statementId: st.id,
              revision: st.revision,
              amount: Number(f.get("amount")),
              paymentDate: f.get("paymentDate"),
              notes: f.get("notes"),
            },
            e.currentTarget,
          );
        }}
      >
        <h3 className="text-sm font-extrabold">
          {approvingAccounting ? "اعتماد الحسابات وتسجيل الدفعة" : "استكمال الصرف"} · جاري {st.sequence}
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs">
            قيمة الدفعة (ج.م)
            <CurrencyInput
              name="amount"
              min="0.01"
              step="0.01"
              required
              className={`${expenseInput} mt-1`}
              value={dueCents / 100}
              max={dueCents / 100}
            />
          </label>
          <label className="text-xs">
            تاريخ الصرف
            <input
              name="paymentDate"
              type="date"
              required
              defaultValue={new Date().toISOString().slice(0, 10)}
              className={`${expenseInput} mt-1`}
            />
          </label>
        </div>
        <label className="block text-xs">
          ملاحظات
          <textarea
            name="notes"
            maxLength={2000}
            className={`${expenseInput} mt-1`}
          />
        </label>
        <div className="rounded-lg bg-emerald-50 p-3 text-xs leading-6 text-emerald-800">
          المستحق للتسجيل الآن:{" "}
          <strong dir="ltr">{money(dueCents)} ج.م</strong>. الدفعة لا تتجاوز
          صافي المستحق الحالي، والمرفق هو إثبات الصرف.
        </div>
        <ExpenseFileInput />
        <div className="flex gap-2">
          <button
            disabled={busy}
            className={`${expenseButton} bg-blue-700 text-white`}
          >
            {approvingAccounting ? "اعتماد وتسجيل الصرف" : "تسجيل الصرف"}
          </button>
          <button
            type="button"
            className={expenseButton}
            onClick={() => setPaymentId(null)}
          >
            إلغاء
          </button>
        </div>
        <p className="text-[10px] text-slate-500">
          دفعة موثقة من المدير التنفيذي؛ لا تمر عبر Petty Cash ولا تكرر تكلفة المشروع.
        </p>
      </form>
    );
  }
  function statementDetail(st: ExpenseStatement, account: ExpenseAccount) {
    const index = expenseStages.findIndex((s) => s[0] === st.stage);
    const next = expenseStages[index + 1];
    const summary = expenseSummary(account.statements);
    const paidCents = account.statements.reduce(
      (sum, statement) => sum + statement.payments.filter((payment) => payment.status !== "REVERSED").reduce((value, payment) => value + payment.amountCents, 0),
      0,
    );
    const paymentStatus = st.stage === "ACCOUNTING"
      ? paidCents >= st.netCents
        ? { label: "تم الصرف", className: "border-emerald-200 bg-emerald-50 text-emerald-800" }
        : paidCents > 0
          ? { label: "صرف جزئي", className: "border-amber-200 bg-amber-50 text-amber-800" }
          : { label: "الحسابات", className: "border-blue-200 bg-blue-50 text-blue-800" }
      : { label: stageName(st.stage), className: "border-blue-200 bg-blue-50 text-blue-800" };
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-extrabold">
              {st.kind === "FINAL" ? "ختامي" : "جاري"} {st.sequence} ·{" "}
              {account.company.name}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {account.project.name} · {account.scope} ·{" "}
              {st.statementDate.slice(0, 10)}
            </p>
          </div>
          <span className={`rounded-lg border px-3 py-2 text-xs font-bold ${paymentStatus.className}`}>
            {paymentStatus.label}
          </span>
        </div>
        <ol className="grid gap-2 sm:grid-cols-5">
          {expenseStages.map(([key, label], n) => (
            <li
              key={key}
              className={`rounded-lg border p-3 text-[11px] font-bold ${n <= index ? "border-blue-200 bg-blue-50 text-blue-800" : "bg-white text-slate-400"}`}
            >
              <span className="mb-1 block">{n <= index ? "✓" : n + 1}</span>
              {label}
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap gap-2">
          {st.stage === "DRAFT" && allowed("expenses.manage") && (
            <button
              className={expenseButton}
              onClick={() =>
                setEditor({ accountId: account.id, statementId: st.id })
              }
            >
              تعديل الشيت
            </button>
          )}
          {next && allowed(approvalPermissions[next[0]]) && (
            <button
              disabled={busy}
              className={`${expenseButton} border-blue-200 text-blue-700`}
              onClick={() => {
                if (next[0] === "ACCOUNTING") {
                  setPaymentId(st.id);
                  return;
                }
                void perform({
                  action: "stage",
                  id: st.id,
                  revision: st.revision,
                  stage: next[0],
                });
              }}
            >
              <Check className="size-4" />
              {next[0] === "ACCOUNTING" ? "اعتماد الحسابات والصرف" : next[1]}
            </button>
          )}
          {st.stage !== "DRAFT" &&
            allowed("expenses.return") &&
            !st.payments.length &&
            !account.statements.some((s) => s.sequence > st.sequence) && (
              <button
                className={expenseButton}
                onClick={() => setReturnId(st.id)}
              >
                رد للمراجعة
              </button>
            )}
          {st.stage === "ACCOUNTING" &&
            expensePayableCents(account.statements, st.id) > 0 &&
            allowed("expenses.pay") && (
              <button
                className={`${expenseButton} text-emerald-700`}
                onClick={() => setPaymentId(paymentId === st.id ? null : st.id)}
              >
                تسجيل دفعة
              </button>
            )}
        </div>
        {paymentId === st.id && paymentForm(st, account)}
        {returnId === st.id && (
          <form
            className="flex flex-wrap gap-2 rounded-lg border bg-white p-3"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void perform({
                action: "stage",
                id: st.id,
                revision: st.revision,
                stage: "DRAFT",
                reason: f.get("reason"),
              });
            }}
          >
            <label className="flex-1 text-xs">
              سبب الرد (إلزامي)
              <input
                name="reason"
                required
                maxLength={1000}
                className={`${expenseInput} mt-1`}
              />
            </label>
            <button disabled={busy} className={expenseButton}>
              رد إلى المسودة وإعادة الدورة
            </button>
            <button
              type="button"
              className={expenseButton}
              onClick={() => setReturnId(null)}
            >
              إلغاء
            </button>
          </form>
        )}
        <div className="erp-table-shell">
          <div className="erp-table-scroll">
          <table className="erp-data-table erp-responsive-table text-xs">
            <thead className="bg-slate-100">
              <tr>
                {[
                  "#",
                  "بيان الأعمال",
                  "الوحدة",
                  "سابق",
                  "حالي",
                  ...(st.items.some(i => (i.correctionQuantity ?? 0) > 0) ? ["تصحيح (-)"] : []),
                  "تراكمي",
                  "سعر الوحدة",
                  "استحقاق %",
                  "الإجمالي",
                ].map((h) => (
                  <th key={h} className="p-3 text-right">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {st.items.map((i, n) => (
                <tr key={i.itemKey} className="border-t">
                  <td data-label="#" className="p-3 text-slate-400">{n + 1}</td>
                  <td data-label="بيان الأعمال" className="p-3 font-semibold">
                    {i.name}
                    {i.sourceItemKey && (
                      <p className="mt-1 text-[10px] text-amber-700">
                        إصدار سعر جديد للكميات الجديدة · {i.priceChangeReason}
                      </p>
                    )}
                    {(i.correctionQuantity ?? 0) > 0 && <p className="mt-1 text-[10px] text-amber-800">تصحيح الحصر: {i.correctionReason}</p>}
                  </td>
                  <td data-label="الوحدة" className="p-3">{i.unit}</td>
                  <td data-label="سابق" className="p-3">{i.previousQuantity}</td>
                  <td data-label="حالي" className="p-3">{i.currentQuantity}</td>
                  {st.items.some(item => (item.correctionQuantity ?? 0) > 0) &&
                    <td data-label="تصحيح (-)" className="p-3 text-amber-800" dir="ltr">{i.correctionQuantity ? `−${i.correctionQuantity}` : "—"}</td>}
                  <td data-label="تراكمي" className="p-3 font-bold">
                    {expenseCumulativeQuantity(i)}
                  </td>
                  <td data-label="سعر الوحدة" className="p-3 text-center">
                    <MoneyValue>{money(i.unitPriceCents)} ج.م</MoneyValue>
                  </td>
                  <td data-label="استحقاق %" className="p-3">{i.entitlementPercent}%</td>
                  <td data-label="الإجمالي" className="p-3 text-center">
                    <MoneyValue>{money(i.totalCents)} ج.م</MoneyValue>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 rounded-xl border bg-white p-4">
            <h3 className="mb-3 text-sm font-bold">ملخص المستخلص التراكمي</h3>
            {[
              ["إجمالي الأعمال", st.grossCents],
              ["أعمال السابق", st.previousGrossCents],
              ["أعمال الجاري", st.grossCents - st.previousGrossCents],
              ...st.deductions.map((d) => [
                `${d.name} ${d.kind === "PERCENT" ? `(${d.value}%)` : "(مبلغ ثابت)"}`,
                d.amountCents,
              ]),
              ["صافي المستحق", st.netCents],
            ].map(([label, value], n) => (
              <div
                className="flex justify-between gap-3 border-b pb-2 text-xs last:border-0"
                key={n}
              >
                <span>{label}</span>
                <strong dir="ltr">{money(Number(value))}</strong>
              </div>
            ))}
            <p className="pt-2 text-[10px] text-slate-500">
              هذه لقطة محفوظة لهذا الجاري؛ إجمالي أعمال المقاول يعتمد آخر جاري
              معتمد فقط.
            </p>
          </div>
          <div className="space-y-3 rounded-xl border bg-white p-4">
            <h3 className="text-sm font-bold">إثباتات الحصر والمراجعة</h3>
            {files("statement", st.id)}
            {st.notes && (
              <p className="text-xs leading-6 text-slate-600">{st.notes}</p>
            )}
            <h4 className="border-t pt-3 text-xs font-bold">سجل الاعتمادات</h4>
            {st.approvals.map((a) => (
              <p key={a.id} className="text-[11px] leading-6 text-slate-500">
                {stageName(a.toStage)} · {a.actorName} ·{" "}
                {new Date(a.createdAt).toLocaleString("ar-EG")}
                {a.reason && ` · السبب: ${a.reason}`}
              </p>
            ))}
            {!st.approvals.length && (
              <p className="text-xs text-slate-400">لم يبدأ الاعتماد بعد.</p>
            )}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          {[
            ["إجمالي تكلفة أعمال المقاول", summary.grossCents],
            ["المدفوع فعليًا لأعمال المقاول", summary.paidCents],
            ["المتبقي للمقاول", summary.remainingCents],
            ["رصيد مقدم للمقاول", summary.advanceCents],
            ["مديونية على المقاول", summary.debtCents],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-xl border bg-white p-4">
              <p className="text-[11px] text-slate-500">{label}</p>
              <p
                className="mt-2 text-lg font-extrabold text-blue-800"
                dir="ltr"
              >
                {money(Number(value))}
              </p>
            </div>
          ))}
        </div>
        <section className="space-y-3 rounded-xl border bg-white p-4">
          <h3 className="text-sm font-bold">
            دفعات أعمال المقاول — جميع الجوارى
          </h3>
          {account.statements.flatMap((s) =>
            s.payments.map((p) => (
              <div
                key={p.id}
                className={`flex flex-wrap justify-between gap-2 border-t pt-3 text-xs ${p.status === "REVERSED" ? "text-slate-400" : ""}`}
              >
                <div>
                  <p className={`font-bold ${p.status === "REVERSED" ? "line-through" : ""}`}>
                    {money(p.amountCents)} ج.م · جاري {s.sequence}
                  </p>
                  <p className="mt-1 text-slate-500">
                    {p.paymentDate.slice(0, 10)} · إثبات الصرف مرفق
                  </p>
                  {p.notes && <p className="mt-1 text-slate-500">{p.notes}</p>}
                  {p.status === "REVERSED" && <p className="mt-1 font-bold text-rose-700">ملغاة · {p.reversalReason || "إلغاء موثق"}</p>}
                </div>
                <div className="space-y-2">{files("payment", p.id)}{allowed("expenses.pay") && p.status === "POSTED" && <button type="button" disabled={busy} className="text-xs font-bold text-rose-700" onClick={() => setReversePaymentId(reversePaymentId === p.id ? null : p.id)}>إلغاء الدفعة</button>}{reversePaymentId === p.id && <form className="mt-2 w-full max-w-md space-y-2 rounded-lg border border-rose-200 bg-rose-50 p-3" onSubmit={(event) => { event.preventDefault(); void perform({ action: "reversePayment", paymentId: p.id, reason: String(new FormData(event.currentTarget).get("reason") || "") }, event.currentTarget); }}><p className="text-[11px] font-bold text-rose-800">سيُعكس قيد الدفعة ويعود المبلغ إلى المستحق للمقاول.</p><input name="reason" required placeholder="سبب الإلغاء" className={expenseInput} /><ExpenseFileInput /><div className="flex gap-2"><button disabled={busy} className="text-xs font-bold text-rose-700">تأكيد الإلغاء</button><button type="button" className="text-xs" onClick={() => setReversePaymentId(null)}>إلغاء</button></div></form>}</div>
              </div>
            )),
          )}
          {!summary.paidCents && (
            <p className="text-xs text-slate-400">لا توجد دفعات فعلية.</p>
          )}
        </section>
      </div>
    );
  }
  return (
    <div className="space-y-5">
      {pdfChoiceOpen && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPdfChoiceOpen(false); }}><div role="dialog" aria-modal="true" aria-labelledby="expenses-pdf-title" dir="rtl" className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 text-right shadow-2xl"><h2 id="expenses-pdf-title" className="text-base font-extrabold">تصدير PDF لمستخلصات مقاولي الباطن</h2><p className="mt-2 text-xs text-slate-500">بيانات المقاولات والجواري دون المرفقات.</p><div className="mt-5 grid gap-2"><button type="button" onClick={() => exportExpensesPdf(false)} className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-right text-sm font-bold text-blue-800">كل المقاولات المطابقة للفلاتر ({visible.length})</button>{visible.some((item) => item.id === expanded) && <button type="button" onClick={() => exportExpensesPdf(true)} className="rounded-lg border border-slate-200 px-4 py-3 text-right text-sm font-bold text-slate-800">المقاولة المفتوحة: {visible.find((item) => item.id === expanded)?.name}</button>}</div><button type="button" onClick={() => setPdfChoiceOpen(false)} className="mt-4 text-xs text-slate-500">إلغاء</button></div></div>}
      {!newAccount && (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">مستخلصات مقاولي الباطن</h1>
          <p className="mt-1 text-sm text-slate-500">
            حصر الأعمال · جوارى تراكمية · الاعتمادات والصرف الفعلي
          </p>
        </div>
        {allowed("expenses.manage") && !detail && (
          <button
            className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-3 text-sm font-bold text-white"
            onClick={() => {
              const returnHref = `/expenses${project ? `?project=${encodeURIComponent(project)}` : ""}`;
              router.push(`/expenses/new?return=${encodeURIComponent(returnHref)}`);
            }}
          >
            <Plus className="size-4" />
            إضافة مقاولة جديدة
          </button>
        )}
      </div>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800"
        >
          {notice}
        </p>
      )}
      {detail && detailAccount ? (
        <>
          <button
            className="erp-back-tab"
            onClick={() => {
              setSelected(null);
              setPaymentId(null);
              setReturnId(null);
              setError("");
            }}
          >
            <ArrowRight className="size-4" />
            رجوع
          </button>
          {statementDetail(detail, detailAccount)}
        </>
      ) : (
        <>
          {newAccount ? (
            <DocumentLayout><form
              className="space-y-3 rounded-xl border border-blue-200 bg-white p-4"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void perform(
                  {
                    action: "account",
                    name: f.get("name"),
                    companyId: f.get("companyId"),
                    projectId: f.get("projectId"),
                    scope: f.get("scope"),
                    notes: f.get("notes"),
                  },
                  e.currentTarget,
                  true,
                );
              }}
            >
              <h2 className="text-sm font-bold">
                إضافة مقاولة جديدة — بدون سقف قيمة
              </h2>
              <p className="text-xs leading-6 text-slate-500">
                اختر المقاول والمشروع وحدد نطاق الأعمال. بعد الحفظ سيفتح شيت أول
                مستخلص مباشرة لإدخال البنود والكميات ونسب الاستحقاق.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs">
                  اسم المقاولة / الأعمال
                  <input
                    name="name"
                    required
                    maxLength={300}
                    placeholder="أعمال نقاشة عمارة 27"
                    className={`${expenseInput} mt-1`}
                  />
                </label>
                <label className="text-xs">
                  المقاول
                  <ERPSelect
                    name="companyId"
                    required
                    className={`${expenseInput} mt-1`}
                    defaultValue=""
                  >
                    <option value="" disabled>
                      اختر مقاول باطن
                    </option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </ERPSelect>
                </label>
                <label className="text-xs">
                  المشروع
                  <ERPSelect
                    name="projectId"
                    required
                    defaultValue=""
                    className={`${expenseInput} mt-1`}
                  >
                    <option value="" disabled>
                      اختر المشروع
                    </option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </ERPSelect>
                </label>
                <label className="text-xs">
                  وحدة التنفيذ / نطاق العمل
                  <input
                    name="scope"
                    required
                    maxLength={300}
                    placeholder="عمارة 27 — نقاشة الدور الأرضي"
                    className={`${expenseInput} mt-1`}
                  />
                </label>
              </div>
              <label className="block text-xs">
                ملاحظات
                <textarea
                  name="notes"
                  maxLength={2000}
                  className={`${expenseInput} mt-1`}
                />
              </label>
              <ExpenseFileInput />
              <div className="flex gap-2">
                <button
                  disabled={busy}
                  className={`${expenseButton} text-blue-700`}
                >
                  حفظ أعمال المقاول وفتح الشيت
                </button>
                <button
                  type="button"
                  className={expenseButton}
                  onClick={() => {
                    setNewAccount(false);
                    setError("");
                  }}
                >
                  إلغاء
                </button>
              </div>
              {!companies.length && (
                <p className="text-xs text-amber-700">
                  أضف مقاول باطن من صفحة الإدارة والمشروعات أولًا.
                </p>
              )}
            </form></DocumentLayout>
          ) : (
          <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="تكلفة الأعمال المعتمدة" value={`${money(totals.reduce((s, t) => s + t.grossCents, 0))} ج.م`} icon={BriefcaseBusiness} tone="blue" />
            <KpiCard label="صافي مستحق المقاولين" value={`${money(totals.reduce((s, t) => s + t.netCents, 0))} ج.م`} icon={WalletCards} tone="violet" />
            <KpiCard label="المدفوع فعليًا" value={`${money(totals.reduce((s, t) => s + t.paidCents, 0))} ج.م`} icon={HandCoins} tone="emerald" />
            <KpiCard label="المتبقي للمقاولين" value={`${money(totals.reduce((s, t) => s + t.remainingCents, 0))} ج.م`} icon={CircleDollarSign} tone="amber" />
            {totals.some((total) => total.debtCents > 0) && (
              <KpiCard label="مديونية على المقاولين" value={`${money(totals.reduce((sum, total) => sum + total.debtCents, 0))} ج.م`} icon={CircleDollarSign} tone="rose" />
            )}
          </div>
          <div className="grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-[2fr_1fr_1fr]">
            <input
              aria-label="بحث أعمال المقاولين"
              className={expenseInput}
              placeholder="ابحث بالمقاول أو المشروع أو نطاق الأعمال…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <ERPSelect
              aria-label="فلتر المشروع"
              className={expenseInput}
              value={project}
              onValueChange={(e) => setProject(e)}
            >
              <option value="">كل المشروعات</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </ERPSelect>
            <ERPSelect
              aria-label="فلتر المقاول"
              className={expenseInput}
              value={company}
              onValueChange={(e) => setCompany(e)}
            >
              <option value="">كل المقاولين</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </ERPSelect>
            <p className="text-[11px] text-slate-400 sm:col-span-3">
              {visible.length} مقاولة · التكلفة تظهر عند اعتماد المدير التنفيذي،
              والصرف عند تسجيل دفعة.
            </p>
          </div>
          <div className="erp-table-shell">
            <div className="erp-table-scroll">
              <table className="erp-data-table erp-responsive-table">
                <thead>
                  <tr>
                    {[
                      "المقاولة / النطاق",
                      "المقاول",
                      "المشروع",
                      "تكلفة الأعمال",
                      "صافي المستحق",
                      "المدفوع",
                      "المتبقي / المديونية / المقدم",
                      "الجوارى",
                      "الإجراءات",
                    ].map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((a) => {
                    const s = expenseSummary(a.statements);
                    const last = a.statements.at(-1);
                    const blockReason = (a.withdrawals ?? []).some(
                      (w) => !["EXECUTIVE", "CANCELLED"].includes(w.stage),
                    ) ? "أكمل اعتماد أو إلغاء طلب السحب المعلق أولًا."
                      : newExpenseStatementBlockReason(last);
                    const draft = last?.stage === "DRAFT" ? last : undefined;
                    return (
                      <Row key={a.id}>
                        <tr>
                          <td data-label="المقاولة / النطاق">
                            <p className="font-bold">{a.name}</p>
                            <p className="mt-1 text-[10px] text-slate-400">
                              {a.scope}
                            </p>
                          </td>
                          <td data-label="المقاول">{a.company.name}</td>
                          <td data-label="المشروع">{a.project.name}</td>
                          <td data-label="تكلفة الأعمال" className="text-center"><MoneyValue>{money(s.grossCents)} ج.م</MoneyValue></td>
                          <td data-label="صافي المستحق" className="text-center"><MoneyValue>{money(s.netCents)} ج.م</MoneyValue></td>
                          <td data-label="المدفوع" className="text-center"><MoneyValue>{money(s.paidCents)} ج.م</MoneyValue></td>
                          <td data-label="المتبقي / المديونية / المقدم" className={`text-center font-bold ${s.advanceCents || s.debtCents ? "text-amber-700" : "text-slate-700"}`}>
                            <MoneyValue>{money(s.debtCents || s.advanceCents || s.remainingCents)} ج.م</MoneyValue>
                            {s.debtCents > 0 && <span className="block text-[10px]">مديونية على المقاول</span>}
                            {s.advanceCents > 0 && (
                              <span className="block text-[10px]">
                                رصيد مقدم {s.debtCents > 0 && money(s.advanceCents)}
                              </span>
                            )}
                          </td>
                          <td data-label="الجوارى">
                            <button
                              aria-expanded={expanded === a.id}
                              className={`${expenseButton} text-blue-700`}
                              onClick={() =>
                                setExpanded(expanded === a.id ? null : a.id)
                              }
                            >
                              {a.statements.length} جاري{" "}
                              {expanded === a.id ? (
                                <ChevronUp className="size-3" />
                              ) : (
                                <ChevronDown className="size-3" />
                              )}
                            </button>
                          </td>
                          <td data-label="الإجراءات">
                            <div className="flex flex-wrap items-center gap-1">
                              {last && <IconAction label="عرض آخر جاري" icon={Eye} onClick={() => setSelected(last.id)} />}
                              {allowed("expenses.manage") && (
                                <IconAction
                                  label={draft ? `فتح شيت جاري ${draft.sequence}` : blockReason || `إضافة جاري ${(last?.sequence ?? 0) + 1}`}
                                  icon={draft ? FileSpreadsheet : FilePlus2}
                                  disabled={Boolean(!draft && blockReason)}
                                  onClick={() => setEditor({ accountId: a.id, ...(draft ? { statementId: draft.id } : {}) })}
                                />
                              )}
                              <IconAction label="سحب وإعادة إسناد الأعمال" icon={Scissors} onClick={() => setChangeAccountId(a.id)} />
                              {files("account", a.id, true)}
                              {allowed("expenses.manage") && <IconAction label="مسح أعمال المقاول" icon={Trash2} tone="danger" disabled={busy} onClick={() => void removeAccount(a)} />}
                            </div>
                          </td>
                        </tr>
                        {expanded === a.id && (
                          <tr>
                            <td
                              colSpan={9}
                              className="erp-table-details"
                            >
                              <div className="flex flex-wrap gap-3 pb-2">
                                {a.statements.map((st) => {
                                  const paidThrough = a.statements
                                    .filter((statement) => statement.sequence <= st.sequence)
                                    .reduce((sum, statement) => sum + statement.payments.filter((payment) => payment.status !== "REVERSED").reduce((value, payment) => value + payment.amountCents, 0), 0);
                                  const status = st.stage === "ACCOUNTING"
                                    ? paidThrough >= st.netCents
                                      ? { label: "تم الصرف", cls: "border-emerald-200 bg-emerald-50 text-emerald-800" }
                                      : paidThrough > 0
                                        ? { label: "صرف جزئي", cls: "border-amber-200 bg-amber-50 text-amber-800" }
                                        : { label: "الحسابات", cls: "border-blue-200 bg-blue-50 text-blue-800" }
                                    : { label: stageName(st.stage), cls: "border-slate-200 bg-white text-slate-600" };
                                  return (
                                    <article className={`min-w-[180px] rounded-xl border p-3 text-center shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${status.cls}`} key={st.id}>
                                      <button className="w-full" onClick={() => { setSelected(st.id); setError(""); }}>
                                        <p className="text-xs font-extrabold">{st.kind === "FINAL" ? "ختامي" : "جاري"} {st.sequence}</p>
                                        <MoneyValue className="mt-2 block">{money(st.grossCents)} ج.م</MoneyValue>
                                        <p className="mt-2 text-[10px] font-bold">{status.label}</p>
                                      </button>
                                      <div className="mt-3 flex justify-center gap-1 border-t border-current/10 pt-2">
                                        {files("statement", st.id, true)}
                                        {st.payments.map((payment) => <span key={payment.id}>{files("payment", payment.id, true)}</span>)}
                                      </div>
                                    </article>
                                  );
                                })}
                                {allowed("expenses.manage") && (
                                  <button
                                    type="button"
                                    disabled={Boolean(blockReason)}
                                    title={blockReason || `إضافة جاري ${(last?.sequence ?? 0) + 1}`}
                                    className="min-w-[180px] rounded-xl border-2 border-dashed border-blue-200 bg-blue-50/40 p-4 text-center text-blue-700 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
                                    onClick={() => setEditor({ accountId: a.id })}
                                  >
                                    <Plus className="mx-auto size-5" />
                                    <span className="mt-2 block text-xs font-extrabold">إضافة جاري {(last?.sequence ?? 0) + 1}</span>
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Row>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-blue-700 bg-blue-50 font-black text-slate-900">
                    <td colSpan={3} className="p-4 text-right">
                      <span className="text-blue-800">الإجمالي</span>
                      <span className="mr-2 text-xs font-bold text-slate-500">({visible.length} مقاولة)</span>
                    </td>
                    <td data-label="إجمالي تكلفة الأعمال" className="p-4 text-center"><MoneyValue>{money(totalGross)} ج.م</MoneyValue></td>
                    <td data-label="إجمالي صافي المستحق" className="p-4 text-center"><MoneyValue>{money(totalNet)} ج.م</MoneyValue></td>
                    <td data-label="إجمالي المدفوع" className="p-4 text-center"><MoneyValue>{money(totalPaid)} ج.م</MoneyValue></td>
                    <td data-label="إجمالي المتبقي" className="p-4 text-center"><MoneyValue>{money(totalRemaining)} ج.م</MoneyValue>{totalDebt > 0 && <span className="mt-1 block text-[10px] font-bold text-amber-700">مديونية: {money(totalDebt)} ج.م</span>}{totalAdvance > 0 && <span className="block text-[10px] font-bold text-amber-700">مقدم: {money(totalAdvance)} ج.م</span>}</td>
                    <td data-label="إجمالي الجواري" className="p-4 text-center text-blue-800">{totalStatements} جاري</td>
                    <td className="p-4 text-center text-slate-400">—</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {!visible.length && (
              <div className="grid place-items-center gap-2 p-12 text-slate-400">
                <FileSpreadsheet className="size-8" />
                <p className="text-sm">
                  لا توجد مقاولات مطابقة. اضغط «إضافة مقاولة جديدة» للبدء.
                </p>
              </div>
            )}
          </div>
          </>
          )}
        </>
      )}
    </div>
  );
}
import { Fragment, type ReactNode } from "react";
function Row({ children }: { children: ReactNode }) {
  return <Fragment>{children}</Fragment>;
}
