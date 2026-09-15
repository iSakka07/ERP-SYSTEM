"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  Check,
  FileSpreadsheet,
  Paperclip,
} from "lucide-react";
import {
  approvalPermissions,
  expenseStages,
  expenseSummary,
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
}: {
  accounts: ExpenseAccount[];
  projects: { id: string; name: string }[];
  companies: { id: string; name: string }[];
  attachments: ExpenseAttachmentInfo[];
  permissions: string[];
}) {
  const router = useRouter();
  const allowed = (p: string) => permissions.includes(p);
  const [search, setSearch] = useState("");
  const [project, setProject] = useState("");
  const [company, setCompany] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [editor, setEditor] = useState<{
    accountId: string;
    statementId?: string;
  } | null>(null);
  const [newAccount, setNewAccount] = useState(false);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [returnId, setReturnId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const visible = accounts.filter(
    (a) =>
      (!project || a.projectId === project) &&
      (!company || a.companyId === company) &&
      `${a.name} ${a.scope} ${a.company.name} ${a.project.name}`.includes(
        search,
      ),
  );
  const totals = visible.map((a) => expenseSummary(a.statements));
  function saved() {
    setEditor(null);
    setNewAccount(false);
    setPaymentId(null);
    setReturnId(null);
    setError("");
    setNotice("تم حفظ العملية وتسجيلها في سجل المراجعة.");
    router.refresh();
  }
  async function perform(payload: unknown, form?: HTMLFormElement) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await sendExpense(payload, form);
      saved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر الحفظ.");
    } finally {
      setBusy(false);
    }
  }
  function files(type: string, id: string) {
    const list = attachments.filter(
      (f) => f.entityType === type && f.entityId === id,
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
  function paymentForm(st: ExpenseStatement) {
    return (
      <form
        className="space-y-3 rounded-xl border border-blue-200 bg-white p-4"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void perform(
            {
              action: "payment",
              statementId: st.id,
              revision: st.revision,
              amount: Number(f.get("amount")),
              paymentDate: f.get("paymentDate"),
              method: f.get("method"),
              reference: f.get("reference"),
              notes: f.get("notes"),
              confirmAdvance: f.get("confirmAdvance") === "on",
            },
            e.currentTarget,
          );
        }}
      >
        <h3 className="text-sm font-extrabold">
          تسجيل دفعة فعلية · جاري {st.sequence}
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs">
            قيمة الدفعة (ج.م)
            <input
              name="amount"
              type="number"
              min="0.01"
              step="0.01"
              required
              className={`${expenseInput} mt-1`}
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
          <label className="text-xs">
            وسيلة الصرف
            <select name="method" className={`${expenseInput} mt-1`}>
              <option value="CHEQUE">شيك</option>
              <option value="TRANSFER">تحويل</option>
              <option value="CASH">نقدي / إيصال صرف</option>
            </select>
          </label>
          <label className="text-xs">
            رقم الشيك / التحويل / الإيصال
            <input
              name="reference"
              required
              maxLength={300}
              className={`${expenseInput} mt-1`}
            />
          </label>
        </div>
        <label className="block text-xs">
          ملاحظات / سبب الرصيد المقدم
          <textarea
            name="notes"
            maxLength={2000}
            className={`${expenseInput} mt-1`}
          />
        </label>
        <label className="flex gap-2 text-xs leading-6">
          <input type="checkbox" name="confirmAdvance" />
          لو تجاوزت الدفعة صافي المستحق، أؤكد تسجيل الزيادة كرَصيد مقدم للمقاول
          مع توضيح السبب.
        </label>
        <ExpenseFileInput />
        <div className="flex gap-2">
          <button
            disabled={busy}
            className={`${expenseButton} bg-blue-700 text-white`}
          >
            تسجيل الصرف
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
          دفعة تشغيلية موثقة؛ الربط الفعلي بالخزنة والقيد اليومي في مرحلة
          المحاسبة.
        </p>
      </form>
    );
  }
  function statementDetail(st: ExpenseStatement, account: ExpenseAccount) {
    const index = expenseStages.findIndex((s) => s[0] === st.stage);
    const next = expenseStages[index + 1];
    const summary = expenseSummary(account.statements);
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
          <span className="rounded-lg bg-blue-50 px-3 py-2 text-xs font-bold text-blue-800">
            {stageName(st.stage)}
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
              onClick={() =>
                void perform({
                  action: "stage",
                  id: st.id,
                  revision: st.revision,
                  stage: next[0],
                })
              }
            >
              <Check className="size-4" />
              {next[0] === "ACCOUNTING" ? "استلام الحسابات" : next[1]}
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
            summary.latest?.id === st.id &&
            allowed("expenses.pay") && (
              <button
                className={`${expenseButton} text-emerald-700`}
                onClick={() => setPaymentId(st.id)}
              >
                تسجيل دفعة
              </button>
            )}
        </div>
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
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full min-w-[900px] text-xs">
            <thead className="bg-slate-100">
              <tr>
                {[
                  "#",
                  "بيان الأعمال",
                  "الوحدة",
                  "سابق",
                  "حالي",
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
                  <td className="p-3 text-slate-400">{n + 1}</td>
                  <td className="p-3 font-semibold">{i.name}</td>
                  <td className="p-3">{i.unit}</td>
                  <td className="p-3">{i.previousQuantity}</td>
                  <td className="p-3">{i.currentQuantity}</td>
                  <td className="p-3 font-bold">
                    {i.previousQuantity + i.currentQuantity}
                  </td>
                  <td className="p-3" dir="ltr">
                    {money(i.unitPriceCents)}
                  </td>
                  <td className="p-3">{i.entitlementPercent}%</td>
                  <td className="p-3 font-bold text-blue-700" dir="ltr">
                    {money(i.totalCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
              هذه لقطة محفوظة لهذا الجاري؛ إجمالي الملف يعتمد آخر جاري معتمد
              فقط.
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
            ["إجمالي تكلفة الأعمال للملف", summary.grossCents],
            ["المدفوع فعليًا للملف", summary.paidCents],
            ["المتبقي للمقاول", summary.remainingCents],
            ["رصيد مقدم للمقاول", summary.advanceCents],
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
        {paymentId === st.id && paymentForm(st)}
        <section className="space-y-3 rounded-xl border bg-white p-4">
          <h3 className="text-sm font-bold">دفعات الملف — جميع الجوارى</h3>
          {account.statements.flatMap((s) =>
            s.payments.map((p) => (
              <div
                key={p.id}
                className="flex flex-wrap justify-between gap-2 border-t pt-3 text-xs"
              >
                <div>
                  <p className="font-bold">
                    {money(p.amountCents)} ج.م · جاري {s.sequence}
                  </p>
                  <p className="mt-1 text-slate-500">
                    {p.paymentDate.slice(0, 10)} ·{" "}
                    {{ CHEQUE: "شيك", TRANSFER: "تحويل", CASH: "نقدي" }[
                      p.method
                    ] ?? p.method}{" "}
                    · {p.reference}
                  </p>
                  {p.notes && <p className="mt-1 text-slate-500">{p.notes}</p>}
                </div>
                {files("payment", p.id)}
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
              setNewAccount(true);
              setError("");
            }}
          >
            <Plus className="size-4" />
            إضافة ملف أعمال مقاول
          </button>
        )}
      </div>
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
            className="flex items-center gap-2 text-xs text-blue-700"
            onClick={() => {
              setSelected(null);
              setPaymentId(null);
              setReturnId(null);
              setError("");
            }}
          >
            <ArrowRight className="size-4" />
            الرجوع لملفات المقاولين
          </button>
          {statementDetail(detail, detailAccount)}
        </>
      ) : (
        <>
          {newAccount && (
            <form
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
                );
              }}
            >
              <h2 className="text-sm font-bold">
                ملف أعمال جديد — بدون سقف قيمة
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs">
                  اسم ملف الأعمال
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
                  <select
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
                  </select>
                </label>
                <label className="text-xs">
                  المشروع
                  <select
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
                  </select>
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
                  حفظ ملف الأعمال
                </button>
                <button
                  type="button"
                  className={expenseButton}
                  onClick={() => setNewAccount(false)}
                >
                  إلغاء
                </button>
              </div>
              {!companies.length && (
                <p className="text-xs text-amber-700">
                  أضف مقاول باطن من صفحة الإدارة والمشروعات أولًا.
                </p>
              )}
            </form>
          )}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              [
                "تكلفة الأعمال المعتمدة",
                totals.reduce((s, t) => s + t.grossCents, 0),
              ],
              [
                "صافي مستحق المقاولين",
                totals.reduce((s, t) => s + t.netCents, 0),
              ],
              ["المدفوع فعليًا", totals.reduce((s, t) => s + t.paidCents, 0)],
              [
                "المتبقي للمقاولين",
                totals.reduce((s, t) => s + t.remainingCents, 0),
              ],
            ].map(([label, value]) => (
              <article
                key={String(label)}
                className="rounded-xl border bg-white p-4"
              >
                <p className="text-xs text-slate-500">{label}</p>
                <p
                  className="mt-2 text-xl font-extrabold text-blue-800"
                  dir="ltr"
                >
                  {money(Number(value))}
                </p>
                <p className="mt-2 text-[10px] text-slate-400">
                  ج.م · حسب الفلاتر الحالية
                </p>
              </article>
            ))}
          </div>
          <div className="grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-[2fr_1fr_1fr]">
            <input
              aria-label="بحث ملفات المقاولين"
              className={expenseInput}
              placeholder="ابحث بالمقاول أو المشروع أو نطاق الأعمال…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              aria-label="فلتر المشروع"
              className={expenseInput}
              value={project}
              onChange={(e) => setProject(e.target.value)}
            >
              <option value="">كل المشروعات</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select
              aria-label="فلتر المقاول"
              className={expenseInput}
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            >
              <option value="">كل المقاولين</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-400 sm:col-span-3">
              {visible.length} ملف · التكلفة تظهر عند اعتماد المدير التنفيذي،
              والصرف عند تسجيل دفعة.
            </p>
          </div>
          <div className="overflow-hidden rounded-xl border bg-white">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-xs">
                <thead className="bg-slate-100">
                  <tr>
                    {[
                      "ملف الأعمال / النطاق",
                      "المقاول",
                      "المشروع",
                      "تكلفة الأعمال",
                      "صافي المستحق",
                      "المدفوع",
                      "المتبقي / المقدم",
                      "الجوارى",
                    ].map((h) => (
                      <th key={h} className="p-3 text-right">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((a) => {
                    const s = expenseSummary(a.statements);
                    const last = a.statements.at(-1);
                    return (
                      <Row key={a.id}>
                        <tr className="border-t">
                          <td className="p-3">
                            <p className="font-bold">{a.name}</p>
                            <p className="mt-1 text-[10px] text-slate-400">
                              {a.scope}
                            </p>
                          </td>
                          <td className="p-3">{a.company.name}</td>
                          <td className="p-3">{a.project.name}</td>
                          {[s.grossCents, s.netCents, s.paidCents].map(
                            (v, n) => (
                              <td className="p-3 font-bold" key={n} dir="ltr">
                                {money(v)}
                              </td>
                            ),
                          )}
                          <td
                            className={`p-3 font-bold ${s.advanceCents ? "text-amber-700" : "text-slate-700"}`}
                          >
                            <span dir="ltr">
                              {money(s.advanceCents || s.remainingCents)}
                            </span>
                            {s.advanceCents > 0 && (
                              <span className="block text-[10px]">
                                رصيد مقدم
                              </span>
                            )}
                          </td>
                          <td className="p-3">
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
                        </tr>
                        {expanded === a.id && (
                          <tr>
                            <td
                              colSpan={8}
                              className="border-t bg-slate-50 p-4"
                            >
                              <div className="mb-3 flex items-center justify-between gap-3">
                                {files("account", a.id)}
                                {allowed("expenses.manage") &&
                                  (!last ||
                                    (["EXECUTIVE", "ACCOUNTING"].includes(
                                      last.stage,
                                    ) &&
                                      last.kind !== "FINAL")) && (
                                    <button
                                      className={`${expenseButton} text-blue-700`}
                                      onClick={() =>
                                        setEditor({ accountId: a.id })
                                      }
                                    >
                                      <Plus className="size-3" />
                                      إضافة مستخلص
                                    </button>
                                  )}
                              </div>
                              <div className="flex gap-3 overflow-x-auto pb-2">
                                {a.statements.map((st) => (
                                  <button
                                    className="min-w-[185px] rounded-lg border bg-white p-3 text-right hover:border-blue-400"
                                    key={st.id}
                                    onClick={() => {
                                      setSelected(st.id);
                                      setError("");
                                    }}
                                  >
                                    <p className="text-xs font-extrabold">
                                      {st.kind === "FINAL" ? "ختامي" : "جاري"}{" "}
                                      {st.sequence}
                                    </p>
                                    <p
                                      className="mt-2 font-extrabold text-blue-800"
                                      dir="ltr"
                                    >
                                      {money(st.grossCents)}
                                    </p>
                                    <p className="mt-2 text-[10px] text-slate-500">
                                      {stageName(st.stage)}
                                    </p>
                                  </button>
                                ))}
                                {!a.statements.length && (
                                  <p className="text-xs text-slate-500">
                                    ابدأ بإضافة مستخلص من الحصر الفعلي.
                                  </p>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Row>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!visible.length && (
              <div className="grid place-items-center gap-2 p-12 text-slate-400">
                <FileSpreadsheet className="size-8" />
                <p className="text-sm">
                  لا توجد ملفات أعمال مطابقة. أضف ملف مقاول للبدء.
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
import { Fragment, type ReactNode } from "react";
function Row({ children }: { children: ReactNode }) {
  return <Fragment>{children}</Fragment>;
}
