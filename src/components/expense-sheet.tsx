"use client";
import { ERPSelect } from "@/components/erp-select";
import { CurrencyInput } from "@/components/currency-input";
import { DocumentLayout } from "@/components/document-layout";
import { UploadBox } from "@/components/upload-box";
import { useState, type KeyboardEvent } from "react";
import type { DeductionInput, ExpenseItemInput } from "@/lib/expenses";
import type { ExpenseAccount, ExpenseStatement } from "@/lib/expense-types";
import {
  calculateExpense,
  expenseSummary,
  expenseCumulativeQuantity,
  correctionDebtAfterApproval,
} from "@/lib/expenses";
import { withdrawnKeys } from "@/lib/work-withdrawals";
import { Plus, Trash2, Save, ArrowRight } from "lucide-react";
import { confirmSimilarFinancialOperation, financialHeaders, financialResult } from "@/lib/financial-submit";
export const expenseInput =
  "w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100";
export const expenseButton =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold hover:bg-slate-50 disabled:opacity-50";
export const money = (cents: number) =>
  (cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
export const stageName = (key: string) =>
  ({
    DRAFT: "مسودة",
    TECHNICAL: "اعتماد المكتب الفني",
    SITE: "اعتماد مهندس الموقع",
    EXECUTIVE: "اعتماد المدير التنفيذي",
    ACCOUNTING: "الحسابات",
  })[key] ?? key;
type SheetRow = ExpenseItemInput & { priceVersionKey?: string | null };
export function ExpenseFileInput({ required = true }: { required?: boolean }) {
  return (
    <UploadBox
      name="files"
      required={required}
      label={required ? "مرفق مستخلص المقاول" : "إضافة إثبات لمستخلص المقاول"}
      hint="A3 · PDF / Excel / صورة · حتى 5 ملفات بإجمالي 10 ميجابايت"
    />
  );
}
export async function sendExpense(payload: unknown, form?: HTMLFormElement) {
  const body = form ? new FormData(form) : new FormData();
  body.set("payload", JSON.stringify(payload));
  const action = typeof payload === "object" && payload && "action" in payload ? String((payload as { action: unknown }).action) : "unknown";
  const financial = ["stage", "payment", "accountingPayment", "reversePayment"].includes(action);
  const record = payload as { id?: string; statementId?: string };
  const scope = `expenses-${action}-${record.id || record.statementId || "new"}`;
  const send = async (): Promise<{ id: string }> => { try { const response = await fetch("/api/expenses", { method: "POST", body, ...(financial ? { headers: financialHeaders(scope) } : {}) }); if (financial) return (await financialResult(response, scope)).body as { id: string }; const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "تعذر الحفظ."); return data as { id: string }; } catch (reason) { const similar = (reason as { similarFinancialOperation?: { confirmationToken: string } }).similarFinancialOperation; if (similar && window.confirm("توجد عملية مشابهة على مستخلص المقاول. هل تريد تسجيلها كعملية مستقلة؟")) { confirmSimilarFinancialOperation(scope, similar.confirmationToken); return send(); } throw reason; } };
  return send();
}
export function ExpenseSheet({
  account,
  statement,
  onClose,
  onSaved,
}: {
  account: ExpenseAccount;
  statement?: ExpenseStatement;
  onClose: () => void;
  onSaved: () => void;
}) {
  const previous = account.statements
    .filter(
      (s) =>
        s.id !== statement?.id &&
        s.sequence < (statement?.sequence ?? Infinity) &&
        ["EXECUTIVE", "ACCOUNTING"].includes(s.stage),
    )
    .at(-1);
  const previousItems = previous?.items ?? [];
  const blocked = withdrawnKeys(account.withdrawals ?? []);
  const remaining = (account.withdrawals ?? []).filter(
    (w) =>
      w.stage === "EXECUTIVE" &&
      w.retainedItemKey &&
      !previousItems.some((i) => i.itemKey === w.retainedItemKey),
  );
  function blankRow(): SheetRow {
    return {
      itemKey: crypto.randomUUID(),
      name: account.assignments?.[0]
        ? `${account.assignments[0].itemName} — ${account.scope}`
        : "",
      unit: account.assignments?.[0]?.unit ?? "م2",
      currentQuantity: 0,
      price: 0,
      entitlementPercent: 100,
    };
  }
  const [rows, setRows] = useState<SheetRow[]>(
    statement
      ? statement.items.map((i) => ({
          itemKey: i.itemKey,
          name: i.name,
          unit: i.unit,
          currentQuantity: i.currentQuantity,
          price: i.unitPriceCents / 100,
          entitlementPercent: i.entitlementPercent,
          sourceItemKey: i.sourceItemKey,
          priceChangeReason: i.priceChangeReason,
          correctionQuantity: i.correctionQuantity ?? 0,
          correctionReason: i.correctionReason,
        })).filter((i) => {
          const savedPrevious = previousItems.find((p) => p.itemKey === i.itemKey);
          return (
            i.currentQuantity > 0 ||
            Boolean(i.sourceItemKey) ||
            (i.correctionQuantity ?? 0) > 0 ||
            !savedPrevious
          );
        })
      : [
          blankRow(),
          ...remaining.map((w) => ({
            itemKey: w.retainedItemKey!,
            name: `${w.itemName} — ${w.retainedScope}`,
            unit: w.unit,
            currentQuantity: 0,
            price:
              (previousItems
                .filter((i) =>
                  (JSON.parse(w.itemKeysJson) as string[]).includes(
                    i.itemKey,
                  ),
                )
                .at(-1)?.unitPriceCents ?? 0) / 100,
            entitlementPercent: 100,
          })),
        ],
  );
  const [selectedPrevious, setSelectedPrevious] = useState("");
  const [deductions, setDeductions] = useState<DeductionInput[]>(
    (
      statement?.deductions ??
      previous?.deductions ?? [
        { name: "تأمين أعمال", kind: "PERCENT", value: 5 },
      ]
    ).map((d) => ({ name: d.name, kind: d.kind, value: d.value })),
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showCorrections, setShowCorrections] = useState(
    statement?.items.some((i) => (i.correctionQuantity ?? 0) > 0) ?? false,
  );
  const hasCorrections = rows.some((i) => (i.correctionQuantity ?? 0) > 0);
  const correctionChanged = rows.some((i) => {
    const saved = statement?.items.find((x) => x.itemKey === i.itemKey);
    return (
      (i.correctionQuantity ?? 0) !== (saved?.correctionQuantity ?? 0) ||
      ((i.correctionQuantity ?? 0) > 0
        ? i.correctionReason?.trim() || null
        : null) !== (saved?.correctionReason ?? null)
    );
  });
  const priceChanged = rows.some((i) => {
    const old = previousItems.find((p) => p.itemKey === i.itemKey);
    return old && Math.round(i.price * 100) !== old.unitPriceCents;
  });
  const availablePreviousItems = previousItems.filter(
    (i) =>
      !blocked.has(i.itemKey) &&
      !rows.some((r) => r.itemKey === i.itemKey || r.sourceItemKey === i.itemKey),
  );
  function addPreviousItem(itemKey: string) {
    const old = previousItems.find((i) => i.itemKey === itemKey);
    if (!old) return;
    setRows([
      ...rows,
      {
        itemKey: old.itemKey,
        name: old.name,
        unit: old.unit,
        currentQuantity: 0,
        price: old.unitPriceCents / 100,
        entitlementPercent: old.entitlementPercent,
        sourceItemKey: old.sourceItemKey,
        priceChangeReason: old.priceChangeReason,
        correctionQuantity: 0,
        correctionReason: null,
        priceVersionKey: crypto.randomUUID(),
      },
    ]);
    setSelectedPrevious("");
  }
  function buildSubmissionRows(sourceRows: SheetRow[], preview = false) {
    return sourceRows.flatMap((row) => {
      const old = previousItems.find((p) => p.itemKey === row.itemKey);
      if (!old || Math.round(row.price * 100) === old.unitPriceCents) {
        const clean = { ...row };
        delete clean.priceVersionKey;
        return [clean];
      }
      const oldCarry: ExpenseItemInput = {
        itemKey: old.itemKey,
        name: old.name,
        unit: old.unit,
        currentQuantity: 0,
        price: old.unitPriceCents / 100,
        entitlementPercent: old.entitlementPercent,
        sourceItemKey: old.sourceItemKey ?? null,
        priceChangeReason: old.priceChangeReason ?? null,
        correctionQuantity: row.correctionQuantity ?? 0,
        correctionReason: row.correctionReason ?? null,
      };
      const newVersion: ExpenseItemInput = {
        itemKey: row.priceVersionKey ?? (preview ? `preview-${row.itemKey}` : crypto.randomUUID()),
        name: row.name,
        unit: row.unit,
        currentQuantity: row.currentQuantity,
        price: row.price,
        entitlementPercent: row.entitlementPercent,
        sourceItemKey: old.itemKey,
        priceChangeReason: row.priceChangeReason ?? "",
        correctionQuantity: 0,
        correctionReason: null,
      };
      return [oldCarry, newVersion];
    });
  }
  const previewRows = buildSubmissionRows(rows, true).filter(
    (row) =>
      row.name.trim() &&
      row.unit.trim() &&
      Number.isFinite(row.price) &&
      row.price > 0 &&
      Number.isFinite(row.currentQuantity) &&
      row.currentQuantity >= 0 &&
      Number.isFinite(row.entitlementPercent) &&
      row.entitlementPercent >= 0 &&
      row.entitlementPercent <= 100,
  );
  const hasIncompleteStartedRow = rows.some((row) => {
    const started = Boolean(row.name.trim()) || row.currentQuantity > 0 || row.price > 0 || (row.correctionQuantity ?? 0) > 0;
    if (!started) return false;
    return !row.name.trim() || !row.unit.trim() || !Number.isFinite(row.price) || row.price <= 0 || !Number.isFinite(row.currentQuantity) || row.currentQuantity < 0 || !Number.isFinite(row.entitlementPercent) || row.entitlementPercent < 0 || row.entitlementPercent > 100;
  });
  let submissionPreview: ReturnType<typeof calculateExpense> | null = null;
  try {
    if (previewRows.length)
      submissionPreview = calculateExpense(
        previewRows,
        deductions,
        previousItems,
      );
  } catch {
    submissionPreview = null;
  }
  const previewReady = previewRows.length > 0 && !hasIncompleteStartedRow && Boolean(submissionPreview);
  const computed = rows.map((i) => {
    const old = previousItems.find((p) => p.itemKey === i.itemKey);
    const previousQuantity = old ? expenseCumulativeQuantity(old) : 0;
    return {
      previousQuantity,
      quantity: expenseCumulativeQuantity({ ...i, previousQuantity }),
      total: Math.round(
        expenseCumulativeQuantity({ ...i, previousQuantity }) *
          i.price *
          i.entitlementPercent,
      ),
      old,
    };
  });
  const gross = submissionPreview?.grossCents ?? previous?.grossCents ?? 0;
  const discountAmounts = deductions.map((d) =>
    Math.round(d.kind === "PERCENT" ? (gross * d.value) / 100 : d.value * 100),
  );
  const discount = discountAmounts.reduce((s, d) => s + d, 0);
  const summary = expenseSummary(account.statements);
  const paid = summary.paidCents;
  const net = gross - discount;
  const previewDebt =
    net >= 0 ? correctionDebtAfterApproval(summary, net, hasCorrections) : 0;
  const previewAdvance = Math.max(0, paid - net) - previewDebt;
  function updateRow(index: number, patch: Partial<ExpenseItemInput>) {
    setRows(rows.map((r, n) => (n === index ? { ...r, ...patch } : r)));
  }
  function addBlankRow() {
    setRows((current) =>
      current.length >= 200
        ? current
        : [...current, { ...blankRow(), name: "", unit: "م2" }],
    );
  }
  function handleSheetKeyDown(event: KeyboardEvent<HTMLDivElement>, rowIndex: number) {
    const target = event.target as HTMLElement;
    if (target.tagName === "TEXTAREA") return;
    const isLast = rowIndex === rows.length - 1;
    if (event.key === "Enter") {
      event.preventDefault();
      if (isLast) addBlankRow();
    } else if (
      event.key === "Tab" &&
      !event.shiftKey &&
      isLast &&
      target.getAttribute("aria-label") === `نسبة الاستحقاق ${rowIndex + 1}`
    ) {
      addBlankRow();
    }
  }
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <button
            type="button"
            className="erp-back-tab mb-2"
            onClick={onClose}
          >
            <ArrowRight className="size-3" />
            رجوع
          </button>
          <h1 className="text-xl font-extrabold">
            {statement
              ? `تعديل جاري ${statement.sequence}`
              : `إضافة جاري ${(account.statements.at(-1)?.sequence ?? 0) + 1}`}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {account.company.name} · {account.project.name} · {account.scope}
          </p>
        </div>
        <span className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          الحفظ كمسودة — لا تأثير مالي قبل اعتماد المدير التنفيذي
        </span>
      </div>
      <DocumentLayout movementPosition="bottom" movements={statement?.approvals.map(a => ({ id:a.id, label:`${stageName(a.toStage)} · ${a.actorName}`, date:a.createdAt, note:a.reason || undefined }))}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const f = new FormData(form);
          setBusy(true);
          setError("");
          try {
            await sendExpense(
              {
                action: "statement",
                id: statement?.id,
                revision: statement?.revision,
                accountId: account.id,
                kind: f.get("kind"),
                statementDate: f.get("statementDate"),
                notes: f.get("notes"),
                items: buildSubmissionRows(rows),
                deductions,
              },
              form,
            );
            onSaved();
          } catch (err) {
            setError(err instanceof Error ? err.message : "تعذر الحفظ.");
          } finally {
            setBusy(false);
          }
        }}
        className="space-y-4"
      >
        <div className="grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-2">
          <label className="text-xs font-bold">
            نوع المستخلص
            <ERPSelect
              name="kind"
              className={`${expenseInput} mt-2`}
              defaultValue={statement?.kind ?? "CURRENT"}
            >
              <option value="CURRENT">جاري</option>
              <option value="FINAL">ختامي</option>
            </ERPSelect>
          </label>
          <label className="text-xs font-bold">
            تاريخ الحصر
            <input
              name="statementDate"
              type="date"
              required
              defaultValue={
                statement?.statementDate.slice(0, 10) ??
                new Date().toISOString().slice(0, 10)
              }
              className={`${expenseInput} mt-2`}
            />
          </label>
        </div>
        <div className="overflow-hidden rounded-xl border bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
            <h2 className="text-sm font-extrabold">شيت حصر الأعمال</h2>
            {previousItems.some((i) => expenseCumulativeQuantity(i) > 0) &&
              !showCorrections && (
                <button
                  type="button"
                  className={`${expenseButton} text-amber-800`}
                  onClick={() => setShowCorrections(true)}
                >
                  تصحيح كميات الحصر السابق
                </button>
              )}
          </div>
          {availablePreviousItems.length > 0 && (
            <div className="grid gap-2 border-b bg-slate-50/60 p-3 md:grid-cols-[1fr_auto]">
              <ERPSelect
                aria-label="استدعاء بند سابق"
                className={expenseInput}
                value={selectedPrevious}
                onValueChange={setSelectedPrevious}
              >
                <option value="">استدعاء بند سابق من آخر جاري معتمد</option>
                {availablePreviousItems.map((i) => (
                  <option key={i.itemKey} value={i.itemKey}>
                    {i.name} · سابق {expenseCumulativeQuantity(i).toLocaleString("en-US")} {i.unit}
                  </option>
                ))}
              </ERPSelect>
              <button
                type="button"
                className={expenseButton}
                disabled={!selectedPrevious}
                onClick={() => addPreviousItem(selectedPrevious)}
              >
                إضافة للشيت
              </button>
            </div>
          )}
          {showCorrections && (
            <p className="border-b bg-amber-50 p-3 text-xs leading-6 text-amber-900">
              أدخل كمية موجبة في «تصحيح (-)» لتخصم من السابق بسعره الأصلي، وليس
              من الشغل الجديد. السبب والإثبات الجديد إلزاميان. الأثر المالي بعد
              الاعتماد التنفيذي؛ أي صرف زائد ينتج عن التصحيح يسجل مديونية على
              المقاول ويتسوى في الجوارى القادمة.
            </p>
          )}
          <div className="divide-y">
            {rows.map((r, n) => {
              const old = computed[n].old;
              const isPriceChanged =
                old && Math.round(r.price * 100) !== old.unitPriceCents;
              return (
                <div
                  key={r.itemKey}
                  className={`expense-sheet-row ${showCorrections ? "expense-sheet-row-correction" : ""}`}
                  onKeyDown={(event) => handleSheetKeyDown(event, n)}
                >
                  <div className="flex items-center justify-center rounded-lg bg-slate-50 font-bold text-slate-400">
                    {n + 1}
                  </div>
                  <label className="space-y-1 font-bold">
                    <span>اسم البند</span>
                      <input
                        aria-label={`اسم البند ${n + 1}`}
                        className={expenseInput}
                        required
                        value={r.name}
                        readOnly={Boolean(old || r.sourceItemKey)}
                        onChange={(e) => updateRow(n, { name: e.target.value })}
                      />
                      {r.sourceItemKey && (
                        <p className="mt-1 text-[10px] text-amber-700">
                          إصدار سعر مرتبط بالبند السابق · السابق بسعره القديم
                        </p>
                      )}
                      {blocked.has(r.itemKey) && (
                        <p className="mt-1 text-[10px] text-amber-800">
                          مسحوب · السابق محفوظ، الحالي صفر. الاستحقاق السابق
                          قابل للاستكمال بسعره القديم.
                        </p>
                      )}
                      {isPriceChanged && (
                        <input
                          aria-label={`سبب تغيير السعر ${n + 1}`}
                          required
                          maxLength={1000}
                          placeholder="سبب تغيير السعر (إلزامي)"
                          className={`${expenseInput} mt-2`}
                          value={r.priceChangeReason ?? ""}
                          onChange={(e) =>
                            updateRow(n, { priceChangeReason: e.target.value })
                          }
                        />
                      )}
                      {isPriceChanged && (
                        <p className="mt-1 text-[10px] text-blue-700">
                          السعر الجديد سيطبق على كمية هذا الجاري فقط.
                        </p>
                      )}
                  </label>
                  <label className="space-y-1 font-bold">
                    <span>الوحدة</span>
                      <input
                        aria-label={`الوحدة ${n + 1}`}
                        required
                        className={expenseInput}
                        value={r.unit}
                        readOnly={Boolean(old || r.sourceItemKey)}
                        onChange={(e) => updateRow(n, { unit: e.target.value })}
                      />
                  </label>
                  <div className="space-y-1 font-bold">
                    <span>سابق</span>
                    <div className="rounded-lg bg-slate-50 px-3 py-2 text-center tabular-nums">
                      {computed[n].previousQuantity.toLocaleString("en-US")}
                    </div>
                  </div>
                  <label className="space-y-1 font-bold">
                    <span>حالي</span>
                      <input
                        aria-label={`كمية الحالي ${n + 1}`}
                        readOnly={
                          blocked.has(r.itemKey) ||
                          rows.some((x) => x.sourceItemKey === r.itemKey)
                        }
                        type="number"
                        min="0"
                        max="1000000000"
                        step="0.000001"
                        required
                        className={expenseInput}
                        value={r.currentQuantity}
                        onChange={(e) =>
                          updateRow(n, {
                            currentQuantity: Number(e.target.value),
                          })
                        }
                      />
                  </label>
                  {showCorrections && (
                    <label className="space-y-1 rounded-lg bg-amber-50/30 font-bold">
                      <span>تصحيح (-)</span>
                        {old && computed[n].previousQuantity > 0 ? (
                          <>
                            <input
                              aria-label={`كمية التصحيح ${n + 1}`}
                              type="number"
                              min="0"
                              max={computed[n].previousQuantity}
                              step="0.000001"
                              required
                              className={expenseInput}
                              value={r.correctionQuantity ?? 0}
                              onChange={(e) =>
                                updateRow(n, {
                                  correctionQuantity: Number(e.target.value),
                                  correctionReason:
                                    Number(e.target.value) > 0
                                      ? r.correctionReason
                                      : null,
                                })
                              }
                            />
                            {(r.correctionQuantity ?? 0) > 0 && (
                              <textarea
                                aria-label={`سبب تصحيح الكمية ${n + 1}`}
                                required
                                maxLength={1000}
                                rows={2}
                                placeholder="سبب تصحيح الحصر (إلزامي)"
                                className={`${expenseInput} mt-2`}
                                value={r.correctionReason ?? ""}
                                onChange={(e) =>
                                  updateRow(n, {
                                    correctionReason: e.target.value,
                                  })
                                }
                              />
                            )}
                          </>
                        ) : (
                          <span className="block text-center text-slate-400">
                            — لا كمية سابقة
                          </span>
                        )}
                    </label>
                  )}
                  <div className="space-y-1 font-bold">
                    <span>تراكمي</span>
                    <div className="rounded-lg bg-blue-50/60 px-3 py-2 text-center tabular-nums text-blue-800">
                      {computed[n].quantity.toLocaleString("en-US")}
                    </div>
                  </div>
                  <label className="space-y-1 font-bold">
                    <span>سعر الوحدة</span>
                      <CurrencyInput
                        aria-label={`سعر الوحدة ${n + 1}`}
                        min="0.01"
                        step="0.01"
                        required
                        className={expenseInput}
                        value={r.price}
                        onValueChange={(raw) =>
                          updateRow(n, { price: Number(raw) })
                        }
                      />
                  </label>
                  <label className="space-y-1 font-bold">
                    <span>الاستحقاق %</span>
                      <input
                        aria-label={`نسبة الاستحقاق ${n + 1}`}
                        type="number"
                        min={old?.entitlementPercent ?? 0}
                        max="100"
                        step="0.01"
                        required
                        className={expenseInput}
                        value={r.entitlementPercent}
                        onChange={(e) =>
                          updateRow(n, {
                            entitlementPercent: Number(e.target.value),
                          })
                        }
                      />
                  </label>
                  <div className="space-y-1 font-bold">
                    <span>الإجمالي</span>
                    <div className="rounded-lg bg-slate-50 px-3 py-2 text-center tabular-nums text-blue-700" dir="ltr">
                      {money(computed[n].total)}
                    </div>
                  </div>
                  <div className="flex items-end justify-center">
                      {!old && (
                        <button
                          type="button"
                          aria-label={`حذف البند ${n + 1}`}
                          className="rounded p-2 text-red-600 hover:bg-red-50"
                          onClick={() =>
                            setRows(rows.filter((_, i) => i !== n))
                          }
                        >
                          <Trash2 className="size-4" />
                        </button>
                      )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="border-t p-3">
            <button
              type="button"
              disabled={rows.length >= 200}
              className={expenseButton}
              onClick={addBlankRow}
            >
              <Plus className="size-4" />
              إضافة بند جديد
            </button>
            <span className="mr-3 text-[10px] text-slate-500">اضغط Enter في آخر سطر لإضافة سطر جديد تلقائيًا.</span>
            <p className="mt-3 rounded-lg bg-blue-50 p-3 text-xs leading-6 text-blue-800">
              لو استدعيت بند سابق وغيرت سعره، السعر الجديد يطبق على كمية الجاري
              الحالي فقط. الأعمال السابقة تفضل محفوظة بسعرها القديم، والسبب
              والإثبات مطلوبان عند الحفظ.
            </p>
          </div>
        </div>
        <div className="grid items-start gap-4 xl:grid-cols-[1fr_340px]">
          <section className="space-y-3 rounded-xl border bg-white p-4">
            <div className="flex justify-between gap-3">
              <h2 className="text-sm font-extrabold">الخصومات والاستقطاعات</h2>
              <button
                type="button"
                className={expenseButton}
                disabled={deductions.length >= 30}
                onClick={() =>
                  setDeductions([
                    ...deductions,
                    { name: "", kind: "PERCENT", value: 0 },
                  ])
                }
              >
                <Plus className="size-3" />
                إضافة خصم
              </button>
            </div>
            <p className="text-xs leading-6 text-slate-500">
              النسبة تخصم من إجمالي الأعمال بالكامل، وليس من بند بعينه. جميع
              الخصومات هنا تراكمية لهذا الجاري؛ لا توجد ضريبة إلزامية ثابتة.
            </p>
            {deductions.map((d, n) => (
              <div
                key={n}
                className="grid grid-cols-[1fr_auto] gap-2 rounded-lg bg-slate-50 p-2 sm:grid-cols-[1fr_130px_100px_100px_auto]"
              >
                <input
                  required
                  aria-label={`اسم الخصم ${n + 1}`}
                  placeholder="تأمين / ضريبة / خصم آخر"
                  className={expenseInput}
                  value={d.name}
                  onChange={(e) =>
                    setDeductions(
                      deductions.map((x, i) =>
                        i === n ? { ...x, name: e.target.value } : x,
                      ),
                    )
                  }
                />
                <ERPSelect
                  aria-label={`نوع الخصم ${n + 1}`}
                  className={expenseInput}
                  value={d.kind}
                  onValueChange={(e) =>
                    setDeductions(
                      deductions.map((x, i) =>
                        i === n
                          ? {
                              ...x,
                              kind: e as DeductionInput["kind"],
                            }
                          : x,
                      ),
                    )
                  }
                >
                  <option value="PERCENT">نسبة %</option>
                  <option value="FIXED">مبلغ ثابت</option>
                </ERPSelect>
                {d.kind === "FIXED" ? <CurrencyInput required aria-label={`قيمة الخصم ${n + 1}`} value={d.value} onValueChange={raw => setDeductions(deductions.map((x,i) => i === n ? {...x,value:Number(raw)} : x))} /> : <input
                  required
                  type="number"
                  min="0"
                  max={d.kind === "PERCENT" ? 100 : 1e10}
                  step="0.01"
                  aria-label={`قيمة الخصم ${n + 1}`}
                  className={expenseInput}
                  value={d.value}
                  onChange={(e) =>
                    setDeductions(
                      deductions.map((x, i) =>
                        i === n ? { ...x, value: Number(e.target.value) } : x,
                      ),
                    )
                  }
                />}
                <span className="self-center text-xs font-bold" dir="ltr">
                  {money(discountAmounts[n])}
                </span>
                <button
                  type="button"
                  aria-label={`حذف الخصم ${n + 1}`}
                  className="p-2 text-red-600"
                  onClick={() =>
                    setDeductions(deductions.filter((_, i) => i !== n))
                  }
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
            {!deductions.length && (
              <p className="text-xs text-slate-400">
                بدون خصومات — أضف ما تحتاجه فقط.
              </p>
            )}
          </section>
          <section className="space-y-3 rounded-xl border bg-white p-4">
            {!previewReady && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-bold leading-6 text-amber-900">أكمل بيانات بند صالح (الاسم والوحدة والكمية والسعر ونسبة الاستحقاق) لعرض حسابات الجاري. لن يعرض النظام أرقامًا تقديرية أثناء الإدخال.</p>}
            {[
              ["إجمالي الأعمال التراكمي", previewReady ? gross : previous?.grossCents ?? 0],
              ["الأعمال السابقة", previous?.grossCents ?? 0],
              ["أعمال الجاري الحالي", previewReady ? gross - (previous?.grossCents ?? 0) : "—"],
              ["إجمالي الخصومات", previewReady ? discount : "—"],
              ["صافي المستحق التراكمي", previewReady ? net : "—"],
              ["سابق الصرف الفعلي لأعمال المقاول", paid],
              ["المتبقي للمقاول", previewReady ? Math.max(0, net - paid) : "—"],
              ...(previewReady && previewDebt > 0
                ? [["مديونية على المقاول — بعد الاعتماد", previewDebt]]
                : []),
              ...(previewReady && previewAdvance > 0
                ? [["رصيد مقدم للمقاول", previewAdvance]]
                : []),
            ].map(([label, value]) => (
              <div
                key={String(label)}
                className="flex justify-between gap-3 border-b pb-2 text-xs last:border-0"
              >
                <span className="text-slate-600">{label}</span>
                <span
                  className="font-extrabold tabular-nums text-blue-800"
                  dir="ltr"
                >
                  {typeof value === "number" ? money(value) : value}
                </span>
              </div>
            ))}
            <p className="text-[10px] leading-5 text-slate-400">
              الإجمالي بالعملة: جنيه مصري. الدفعات لا تضيف تكلفة ثانية.
            </p>
          </section>
        </div>
        <label className="block text-xs font-bold">
          ملاحظات الحصر
          <textarea
            name="notes"
            defaultValue={statement?.notes ?? ""}
            maxLength={2000}
            className={`${expenseInput} mt-2`}
            rows={2}
          />
        </label>
        {correctionChanged && (
          <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
            تغيير تصحيح الحصر يحتاج مرفقًا جديدًا، حتى لو للمسودة مرفقات سابقة.
          </p>
        )}
        <ExpenseFileInput required={!statement || correctionChanged || priceChanged} />
        {error && (
          <p
            role="alert"
            className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
          >
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <button
            disabled={busy || !rows.length}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            <Save className="size-4" />
            {busy ? "جارٍ الحفظ…" : "حفظ المستخلص كمسودة"}
          </button>
          <button type="button" onClick={onClose} className={expenseButton}>
            إلغاء
          </button>
        </div>
      </form>
      </DocumentLayout>
    </section>
  );
}
