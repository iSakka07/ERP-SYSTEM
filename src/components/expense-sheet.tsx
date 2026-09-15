"use client";
import { useState } from "react";
import type { DeductionInput, ExpenseItemInput } from "@/lib/expenses";
import type { ExpenseAccount, ExpenseStatement } from "@/lib/expense-types";
import { expenseSummary } from "@/lib/expenses";
import { withdrawnKeys } from "@/lib/work-withdrawals";
import { Plus, Trash2, Save, ArrowRight, Paperclip } from "lucide-react";
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
export function ExpenseFileInput({ required = true }: { required?: boolean }) {
  return (
    <label className="block rounded-xl border border-dashed border-blue-200 bg-blue-50/40 p-3 text-xs font-semibold text-slate-600">
      <span className="flex items-center gap-2">
        <Paperclip className="size-4 text-blue-700" />
        المرفقات {required ? "(إلزامية)" : "— إضافة إثبات جديد (اختياري)"}
      </span>
      <input
        className="mt-2 block w-full text-xs file:ml-3 file:rounded-md file:border-0 file:bg-blue-100 file:px-3 file:py-2 file:text-blue-800"
        type="file"
        name="files"
        multiple
        required={required}
        accept=".pdf,.xlsx,.xls,.png,.jpg,.jpeg,.webp"
      />
      <span className="mt-2 block text-[10px] text-slate-500">
        PDF / Excel / صور · حتى 5 ملفات بإجمالي 10 ميجابايت
      </span>
    </label>
  );
}
export async function sendExpense(payload: unknown, form?: HTMLFormElement) {
  const body = form ? new FormData(form) : new FormData();
  body.set("payload", JSON.stringify(payload));
  const response = await fetch("/api/expenses", { method: "POST", body });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "تعذر الحفظ.");
  return data as { id: string };
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
  const [rows, setRows] = useState<ExpenseItemInput[]>(
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
        }))
      : previousItems.length
        ? [
            ...previousItems.map((i) => ({
              itemKey: i.itemKey,
              name: i.name,
              unit: i.unit,
              currentQuantity: 0,
              price: i.unitPriceCents / 100,
              entitlementPercent: i.entitlementPercent,
              sourceItemKey: i.sourceItemKey,
              priceChangeReason: i.priceChangeReason,
            })),
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
          ]
        : [
            {
              itemKey: crypto.randomUUID(),
              name: account.assignments?.[0]
                ? `${account.assignments[0].itemName} — ${account.scope}`
                : "",
              unit: account.assignments?.[0]?.unit ?? "م2",
              currentQuantity: 0,
              price: 0,
              entitlementPercent: 100,
            },
          ],
  );
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
  const computed = rows.map((i) => {
    const old = previousItems.find((p) => p.itemKey === i.itemKey);
    const previousQuantity = old
      ? old.previousQuantity + old.currentQuantity
      : 0;
    return {
      previousQuantity,
      quantity: previousQuantity + i.currentQuantity,
      total: Math.round(
        (previousQuantity + i.currentQuantity) * i.price * i.entitlementPercent,
      ),
      old,
    };
  });
  const gross = computed.reduce((s, i) => s + i.total, 0);
  const discountAmounts = deductions.map((d) =>
    Math.round(d.kind === "PERCENT" ? (gross * d.value) / 100 : d.value * 100),
  );
  const discount = discountAmounts.reduce((s, d) => s + d, 0);
  const paid = expenseSummary(account.statements).paidCents;
  const net = gross - discount;
  function updateRow(index: number, patch: Partial<ExpenseItemInput>) {
    setRows(rows.map((r, n) => (n === index ? { ...r, ...patch } : r)));
  }
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <button
            type="button"
            className="mb-2 flex items-center gap-1 text-xs text-blue-700"
            onClick={onClose}
          >
            <ArrowRight className="size-3" />
            الرجوع لأعمال المقاولين
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
                items: rows,
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
        <div className="grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-3">
          <label className="text-xs font-bold">
            نوع المستخلص
            <select
              name="kind"
              className={`${expenseInput} mt-2`}
              defaultValue={statement?.kind ?? "CURRENT"}
            >
              <option value="CURRENT">جاري</option>
              <option value="FINAL">ختامي</option>
            </select>
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
          <div className="rounded-lg bg-slate-50 p-3 text-xs leading-6 text-slate-600">
            الكمية: حصر فعلي. نسبة الاستحقاق: قيمة المرحلة المستحقة. السابق ثابت
            من آخر جاري معتمد.
          </div>
        </div>
        <div className="overflow-hidden rounded-xl border bg-white">
          <p className="border-b bg-blue-50/40 p-3 text-xs leading-6 text-slate-600">
            لتغيير سعر بند سابق، اضغط «سعر جديد للكميات الجديدة» تحت اسم البند.
            السابق يبقى بسعره القديم، وأدخل السعر والكمية الجديدة وسبب التغيير
            في السطر الجديد، مع إرفاق إثبات.
          </p>
          <div className="flex items-center justify-between gap-3 border-b p-4">
            <h2 className="text-sm font-extrabold">شيت حصر الأعمال</h2>
            <span className="text-[11px] text-slate-500">
              اسحب الجدول أفقيًا لاستعراض كل الأعمدة
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1060px] table-fixed text-xs">
              <colgroup>
                <col className="w-10" />
                <col className="w-64" />
                <col className="w-20" />
                <col className="w-24" />
                <col className="w-24" />
                <col className="w-24" />
                <col className="w-28" />
                <col className="w-28" />
                <col className="w-32" />
                <col className="w-12" />
              </colgroup>
              <thead className="bg-slate-100">
                <tr>
                  {[
                    "#",
                    "اسم البند",
                    "الوحدة",
                    "سابق",
                    "حالي",
                    "تراكمي",
                    "سعر الوحدة",
                    "الاستحقاق %",
                    "الإجمالي (ج.م)",
                    "",
                  ].map((h, n) => (
                    <th className="border-b p-3 text-right" key={n}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, n) => (
                  <tr key={r.itemKey} className="border-b last:border-0">
                    <td className="p-2 text-center text-slate-400">{n + 1}</td>
                    <td className="p-2">
                      <input
                        aria-label={`اسم البند ${n + 1}`}
                        className={expenseInput}
                        required
                        value={r.name}
                        readOnly={Boolean(computed[n].old || r.sourceItemKey)}
                        onChange={(e) => updateRow(n, { name: e.target.value })}
                      />
                      {computed[n].old &&
                        !blocked.has(r.itemKey) &&
                        !rows.some((x) => x.sourceItemKey === r.itemKey) &&
                        rows.length < 200 && (
                          <button
                            type="button"
                            className="mt-2 text-[10px] font-bold text-blue-700 underline underline-offset-2"
                            onClick={() =>
                              setRows([
                                ...rows.map((x, j) =>
                                  j === n ? { ...x, currentQuantity: 0 } : x,
                                ),
                                {
                                  itemKey: crypto.randomUUID(),
                                  name: r.name,
                                  unit: r.unit,
                                  currentQuantity: r.currentQuantity,
                                  price: r.price,
                                  entitlementPercent: r.entitlementPercent,
                                  sourceItemKey: r.itemKey,
                                  priceChangeReason: "",
                                },
                              ])
                            }
                          >
                            سعر جديد للكميات الجديدة
                          </button>
                        )}
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
                      {r.sourceItemKey && !computed[n].old && (
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
                    </td>
                    <td className="p-2">
                      <input
                        aria-label={`الوحدة ${n + 1}`}
                        required
                        className={expenseInput}
                        value={r.unit}
                        readOnly={Boolean(computed[n].old || r.sourceItemKey)}
                        onChange={(e) => updateRow(n, { unit: e.target.value })}
                      />
                    </td>
                    <td className="bg-slate-50 p-2 text-center tabular-nums">
                      {computed[n].previousQuantity.toLocaleString("en-US")}
                    </td>
                    <td className="p-2">
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
                    </td>
                    <td className="bg-blue-50/40 p-2 text-center font-bold tabular-nums">
                      {computed[n].quantity.toLocaleString("en-US")}
                    </td>
                    <td className="p-2">
                      <input
                        aria-label={`سعر الوحدة ${n + 1}`}
                        type="number"
                        min="0.01"
                        step="0.01"
                        required
                        readOnly={Boolean(computed[n].old)}
                        className={expenseInput}
                        value={r.price}
                        onChange={(e) =>
                          updateRow(n, { price: Number(e.target.value) })
                        }
                      />
                    </td>
                    <td className="p-2">
                      <input
                        aria-label={`نسبة الاستحقاق ${n + 1}`}
                        type="number"
                        min={computed[n].old?.entitlementPercent ?? 0}
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
                    </td>
                    <td
                      className="p-2 text-center font-bold tabular-nums text-blue-700"
                      dir="ltr"
                    >
                      {money(computed[n].total)}
                    </td>
                    <td className="p-2">
                      {!computed[n].old && (
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t p-3">
            <button
              type="button"
              disabled={rows.length >= 200}
              className={expenseButton}
              onClick={() =>
                setRows([
                  ...rows,
                  {
                    itemKey: crypto.randomUUID(),
                    name: "",
                    unit: "م2",
                    currentQuantity: 0,
                    price: 0,
                    entitlementPercent: 100,
                  },
                ])
              }
            >
              <Plus className="size-4" />
              إضافة بند جديد
            </button>
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
                <select
                  aria-label={`نوع الخصم ${n + 1}`}
                  className={expenseInput}
                  value={d.kind}
                  onChange={(e) =>
                    setDeductions(
                      deductions.map((x, i) =>
                        i === n
                          ? {
                              ...x,
                              kind: e.target.value as DeductionInput["kind"],
                            }
                          : x,
                      ),
                    )
                  }
                >
                  <option value="PERCENT">نسبة %</option>
                  <option value="FIXED">مبلغ ثابت</option>
                </select>
                <input
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
                />
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
            {[
              ["إجمالي الأعمال التراكمي", gross],
              ["الأعمال السابقة", previous?.grossCents ?? 0],
              ["أعمال الجاري الحالي", gross - (previous?.grossCents ?? 0)],
              ["إجمالي الخصومات", discount],
              ["صافي المستحق التراكمي", net],
              ["سابق الصرف الفعلي لأعمال المقاول", paid],
              [
                net >= paid ? "المتبقي للمقاول" : "رصيد مقدم للمقاول",
                Math.abs(net - paid),
              ],
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
                  {money(Number(value))}
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
        <ExpenseFileInput required={!statement} />
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
    </section>
  );
}
