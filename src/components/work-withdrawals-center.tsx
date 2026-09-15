"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type {
  ExpenseAccount,
  ExpenseAttachmentInfo,
} from "@/lib/expense-types";
import { approvalPermissions } from "@/lib/expenses";
import {
  ExpenseFileInput,
  expenseButton,
  expenseInput,
  sendExpense,
  stageName,
} from "./expense-sheet";

export function WorkWithdrawalsCenter({
  account,
  companies,
  attachments,
  permissions,
  onClose,
}: {
  account: ExpenseAccount;
  companies: { id: string; name: string }[];
  attachments: ExpenseAttachmentInfo[];
  permissions: string[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [assignmentId, setAssignmentId] = useState<string | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [kind, setKind] = useState("PARTIAL");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const last = account.statements.at(-1);
  const changes = account.withdrawals ?? [];
  const assignment = changes.find((w) => w.id === assignmentId);
  const available = (last?.items ?? []).filter(
    (i) =>
      !i.sourceItemKey &&
      !changes.some((w) => w.stage !== "CANCELLED" && w.itemKey === i.itemKey),
  );
  const canCreate =
    permissions.includes("expenses.manage") &&
    last &&
    ["EXECUTIVE", "ACCOUNTING"].includes(last.stage) &&
    last.kind !== "FINAL" &&
    available.length > 0;
  async function perform(payload: unknown, form?: HTMLFormElement) {
    setBusy(true);
    setError("");
    try {
      await sendExpense(payload, form);
      setAdding(false);
      setAssignmentId(null);
      setCancelId(null);
      setCancelReason("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر الحفظ.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-4">
      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}
      {adding ? (
        <form
          className="space-y-4 rounded-xl border bg-white p-5"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const f = new FormData(form);
            void perform(
              {
                action: "withdrawal",
                sourceAccountId: account.id,
                sourceStatementId: last!.id,
                itemKey: f.get("itemKey"),
                kind,
                quantity: f.get("quantity")
                  ? Number(f.get("quantity"))
                  : undefined,
                withdrawnScope: f.get("withdrawnScope"),
                retainedScope:
                  kind === "PARTIAL" ? f.get("retainedScope") : undefined,
                reason: f.get("reason"),
                effectiveDate: f.get("effectiveDate"),
                destinationCompanyId:
                  f.get("destinationCompanyId") || undefined,
              },
              form,
            );
          }}
        >
          <h1 className="text-xl font-bold">طلب سحب أعمال وإعادة إسناد</h1>
          <p className="text-sm text-slate-500">
            {account.company.name} · {account.project.name} · {account.scope}
          </p>
          <p className="rounded-lg bg-amber-50 p-3 text-xs leading-6 text-amber-900">
            المسحوب هو أعمال غير منفذة، وليس خصمًا من الحصر السابق. المنفذ
            والمستحق والمدفوع للمقاول القديم لا يتغيرون. بعد اعتماد المدير
            التنفيذي يتوقف الحالي على البند الأصلي، ويظهر نطاق المتبقي كبند
            مستقل عند السحب الجزئي. المقاول الجديد يبدأ من صفر في أعمال مستقلة.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs">
              البند
              <select name="itemKey" required className={expenseInput}>
                {available.map((i) => (
                  <option key={i.itemKey} value={i.itemKey}>
                    {i.name} · {i.unit}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs">
              نوع السحب
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value)}
                className={expenseInput}
              >
                <option value="PARTIAL">جزء من البند</option>
                <option value="FULL">كامل الأعمال المتبقية للبند</option>
              </select>
            </label>
            <label className="text-xs">
              كمية الأعمال المسحوبة{" "}
              {kind === "FULL" ? "(اختيارية إن لم تحصر بعد)" : "(إلزامية)"}
              <input
                name="quantity"
                type="number"
                required={kind === "PARTIAL"}
                min="0.000001"
                max="1000000000"
                step="0.000001"
                className={expenseInput}
              />
            </label>
            <label className="text-xs">
              تاريخ السحب
              <input
                name="effectiveDate"
                type="date"
                required
                min={last?.statementDate.slice(0, 10)}
                max={new Date().toISOString().slice(0, 10)}
                defaultValue={new Date().toISOString().slice(0, 10)}
                className={expenseInput}
              />
            </label>
            <label className="text-xs">
              تحديد النطاق المسحوب
              <input
                name="withdrawnScope"
                required
                maxLength={1000}
                placeholder="مثال: نقاشة شقق الدور الثاني — 100 م2"
                className={expenseInput}
              />
            </label>
            {kind === "PARTIAL" && (
              <label className="text-xs">
                النطاق الذي سيكمله المقاول القديم
                <input
                  name="retainedScope"
                  required
                  maxLength={1000}
                  placeholder="مثال: نقاشة شقق الدور الأول فقط"
                  className={expenseInput}
                />
              </label>
            )}
            <label className="text-xs">
              إعادة إسناد لمقاول جديد
              <select
                name="destinationCompanyId"
                className={expenseInput}
                defaultValue=""
              >
                <option value="">سحب فقط — دون إعادة إسناد الآن</option>
                {companies
                  .filter((c) => c.id !== account.companyId)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <label className="block text-xs">
            سبب السحب
            <textarea
              name="reason"
              required
              maxLength={1000}
              className={expenseInput}
            />
          </label>
          <ExpenseFileInput />
          <div className="flex gap-2">
            <button
              disabled={busy}
              className={`${expenseButton} text-blue-700`}
            >
              حفظ طلب السحب للمراجعة
            </button>
            <button
              disabled={busy}
              type="button"
              className={expenseButton}
              onClick={() => {
                setAdding(false);
                setError("");
              }}
            >
              إلغاء
            </button>
          </div>
        </form>
      ) : assignment ? (
        <form
          className="space-y-4 rounded-xl border bg-white p-5"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void perform(
              {
                action: "withdrawalAssign",
                id: assignment.id,
                revision: assignment.revision,
                companyId: f.get("companyId"),
                reason: f.get("reason"),
              },
              e.currentTarget,
            );
          }}
        >
          <h1 className="text-xl font-bold">إعادة إسناد أعمال مسحوبة</h1>
          <p className="text-sm">
            {assignment.itemName} · {assignment.withdrawnScope}
          </p>
          <p className="rounded-lg bg-amber-50 p-3 text-xs leading-6">
            اعتماد المدير التنفيذي فقط، مع سبب وإثبات جديد. يبدأ المقاول الجديد
            بأعمال مستقلة من صفر، دون نقل مستحقات أو صرف المقاول القديم.
          </p>
          <label className="block text-xs">
            المقاول الجديد
            <select
              name="companyId"
              required
              defaultValue=""
              className={expenseInput}
            >
              <option value="" disabled>
                اختر مقاول باطن
              </option>
              {companies
                .filter((c) => c.id !== account.companyId)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="block text-xs">
            سبب إعادة الإسناد
            <textarea
              name="reason"
              required
              maxLength={1000}
              className={expenseInput}
            />
          </label>
          <ExpenseFileInput />
          <div className="flex gap-2">
            <button
              disabled={busy}
              className={`${expenseButton} text-blue-700`}
            >
              اعتماد إعادة الإسناد وإنشاء أعمال المقاول
            </button>
            <button
              disabled={busy}
              type="button"
              className={expenseButton}
              onClick={() => {
                setAssignmentId(null);
                setError("");
              }}
            >
              إلغاء
            </button>
          </div>
        </form>
      ) : (
        <>
          <button className={expenseButton} onClick={onClose}>
            الرجوع لأعمال المقاولين
          </button>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold">سحب وإعادة إسناد الأعمال</h1>
              <p className="mt-1 text-sm text-slate-500">
                {account.name} · {account.company.name}
              </p>
            </div>
            {canCreate && (
              <button
                className={`${expenseButton} text-blue-700`}
                onClick={() => setAdding(true)}
              >
                طلب سحب أعمال
              </button>
            )}
          </div>
          {!canCreate && permissions.includes("expenses.manage") && (
            <p className="text-xs text-slate-500">
              السحب يحتاج بندًا لم يسحب بعد في آخر جاري معتمد تنفيذيًا، دون
              مستخلص معلق أو ختامي.
            </p>
          )}
          {changes.length === 0 && (
            <p className="rounded-xl border bg-white p-6 text-sm text-slate-500">
              لا توجد إجراءات سحب.
            </p>
          )}
          {changes.map((w) => {
            const next = (
              {
                DRAFT: "TECHNICAL",
                TECHNICAL: "SITE",
                SITE: "EXECUTIVE",
              } as Record<string, string>
            )[w.stage];
            return (
              <article
                key={w.id}
                className="space-y-3 rounded-xl border bg-white p-4"
              >
                <div className="flex flex-wrap justify-between gap-2">
                  <h2 className="font-bold">
                    {w.itemName} ·{" "}
                    {w.kind === "FULL" ? "سحب كامل المتبقي" : "سحب جزئي"}
                  </h2>
                  <span className="text-xs text-blue-700">
                    {w.stage === "CANCELLED" ? "ملغى" : stageName(w.stage)}
                  </span>
                </div>
                <p className="text-sm">
                  المسحوب: {w.withdrawnScope}
                  {w.quantity !== null ? ` · ${w.quantity} ${w.unit}` : ""}
                </p>
                {w.retainedScope && (
                  <p className="text-sm">
                    المتبقي مع المقاول القديم: {w.retainedScope}
                  </p>
                )}
                <p className="text-xs text-slate-500">
                  {w.effectiveDate.slice(0, 10)} · السبب: {w.reason}
                </p>
                <p className="text-xs">
                  المقاول الجديد:{" "}
                  {companies.find((c) => c.id === w.destinationCompanyId)
                    ?.name ?? "دون إعادة إسناد"}
                  {w.destinationAccountId &&
                    " · تم إنشاء أعمال مستقلة؛ افتحها من القائمة لإضافة المستخلص."}
                </p>
                <div className="flex flex-wrap gap-2">
                  {attachments
                    .filter(
                      (f) =>
                        f.entityType === "withdrawal" && f.entityId === w.id,
                    )
                    .map((f) => (
                      <a
                        className="text-xs text-blue-700 underline"
                        key={f.id}
                        href={`/api/expenses/attachments/${f.id}`}
                      >
                        {f.name}
                      </a>
                    ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  {next && permissions.includes(approvalPermissions[next]) && (
                    <button
                      disabled={busy}
                      className={`${expenseButton} text-blue-700`}
                      onClick={() =>
                        void perform({
                          action: "withdrawalStage",
                          id: w.id,
                          revision: w.revision,
                          stage: next,
                        })
                      }
                    >
                      {stageName(next)}
                    </button>
                  )}
                  {next && permissions.includes("expenses.manage") && (
                    <button
                      disabled={busy}
                      className={expenseButton}
                      onClick={() => {
                        setCancelId(w.id);
                        setCancelReason("");
                      }}
                    >
                      إلغاء الطلب بسبب
                    </button>
                  )}
                  {w.stage === "EXECUTIVE" &&
                    !w.destinationAccountId &&
                    permissions.includes("expenses.approve_executive") && (
                      <button
                        disabled={busy}
                        className={`${expenseButton} text-blue-700`}
                        onClick={() => {
                          setAssignmentId(w.id);
                          setError("");
                        }}
                      >
                        إعادة إسناد لمقاول جديد
                      </button>
                    )}
                </div>
                {cancelId === w.id && (
                  <form
                    className="space-y-2 rounded-lg bg-slate-50 p-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void perform({
                        action: "withdrawalStage",
                        id: w.id,
                        revision: w.revision,
                        stage: "CANCELLED",
                        reason: cancelReason,
                      });
                    }}
                  >
                    <label className="block text-xs">
                      سبب إلغاء الطلب
                      <textarea
                        required
                        maxLength={1000}
                        value={cancelReason}
                        onChange={(e) => setCancelReason(e.target.value)}
                        className={expenseInput}
                      />
                    </label>
                    <button disabled={busy} className={expenseButton}>
                      تأكيد إلغاء الطلب
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      className={expenseButton}
                      onClick={() => setCancelId(null)}
                    >
                      تراجع
                    </button>
                  </form>
                )}
              </article>
            );
          })}
        </>
      )}
    </section>
  );
}
