"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Plus, Save, Trash2 } from "lucide-react";
import { CurrencyInput } from "@/components/currency-input";
import { ERPSelect } from "@/components/erp-select";
import { UploadBox } from "@/components/upload-box";
import { InventoryItemPicker, type InventoryItemOption } from "@/components/inventory-item-picker";
import { expenseButton, expenseInput, money } from "@/components/expense-sheet";
import { MoneyValue } from "@/components/erp-ui";
import { confirmSimilarFinancialOperation, financialHeaders, financialResult } from "@/lib/financial-submit";

type Project = { id: string; name: string };
type Supplier = { id: string; name: string };
type Warehouse = { id: string; name: string };
type Row = { key: string; name: string; unit: string; quantity: number; receivedQuantity: number; price: number; inventoryItem: InventoryItemOption | null; nonStock: boolean };

function blankRow(): Row {
  return { key: crypto.randomUUID(), name: "", unit: "وحدة", quantity: 1, receivedQuantity: 0, price: 0, inventoryItem: null, nonStock: false };
}

export function PurchaseInvoicePage({
  projects,
  suppliers,
  warehouses,
  returnHref = "/purchases",
}: {
  projects: Project[];
  suppliers: Supplier[];
  warehouses: Warehouse[];
  returnHref?: string;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([blankRow()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [paidAmount, setPaidAmount] = useState<number | null>(null);
  const [stockMode, setStockMode] = useState<"WAREHOUSE" | "DIRECT_PROJECT" | "LEGACY_DIRECT">("WAREHOUSE");
  const total = rows.reduce((sum, row) => sum + Math.round(row.quantity * row.price * 100), 0);

  function updateRow(index: number, patch: Partial<Row>) {
    setRows((current) => current.map((row, n) => {
      if (n !== index) return row;
      const updated = { ...row, ...patch };
      if (patch.quantity !== undefined) updated.receivedQuantity = Math.min(updated.receivedQuantity, updated.quantity);
      return updated;
    }));
  }

  function changeStockMode(value: string) {
    const next = value as typeof stockMode;
    setStockMode(next);
    if (next !== "LEGACY_DIRECT") setRows((current) => current.map((row) => row.nonStock ? { ...row, name: "", unit: "وحدة", inventoryItem: null, nonStock: false } : row));
  }

  function addRow() {
    const row = blankRow();
    setRows((current) => [...current, row]);
  }

  function addOnEnter(event: KeyboardEvent<HTMLInputElement>, index: number) {
    if (event.key !== "Enter" || event.nativeEvent.isComposing || index !== rows.length - 1) return;
    event.preventDefault();
    addRow();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (stockMode !== "LEGACY_DIRECT" && rows.some((row) => !row.inventoryItem)) {
      setError("اختر صنفًا مخزنيًا لكل بند، أو أضفه من زر «صنف جديد».");
      return;
    }
    const actualPaidAmount = paidAmount ?? total / 100;
    if (!Number.isFinite(actualPaidAmount) || actualPaidAmount < 0 || Math.round(actualPaidAmount * 100) !== actualPaidAmount * 100 || actualPaidAmount * 100 > total) {
      setError("راجع المسدد بالفعل؛ يجب أن يكون مبلغًا صحيحًا حتى قرشين ولا يتجاوز إجمالي الفاتورة.");
      return;
    }
    setBusy(true);
    setError("");
    const form = event.currentTarget;
    const data = new FormData(form);
    data.set(
      "payload",
      JSON.stringify({
        action: "invoice",
        name: data.get("name"),
        projectId: data.get("projectId"),
        supplierId: data.get("supplierId") || undefined,
        invoiceDate: data.get("invoiceDate"),
        paymentSource: data.get("paymentSource"),
        stockMode,
        paidAmount: actualPaidAmount,
        warehouseId: stockMode === "LEGACY_DIRECT" ? undefined : data.get("warehouseId"),
        notes: data.get("notes") || undefined,
        items: rows.map(({ name, unit, quantity, receivedQuantity, price, inventoryItem, nonStock }) => ({ name, unit, quantity, price, ...(stockMode !== "LEGACY_DIRECT" ? { receivedQuantity } : {}), ...(inventoryItem && !nonStock ? { inventoryItemId: inventoryItem.id } : {}) })),
      }),
    );
    try {
      const scope = "purchase-new";
      const send = async (): Promise<void> => { try { await financialResult(await fetch("/api/purchases", { method: "POST", body: data, headers: financialHeaders(scope) }), scope); } catch (reason) { const similar = (reason as { similarFinancialOperation?: { confirmationToken: string } }).similarFinancialOperation; if (similar && window.confirm("توجد فاتورة مشتريات مشابهة. هل تريد إنشاءها كفاتورة مستقلة؟")) { confirmSimilarFinancialOperation(scope, similar.confirmationToken); return send(); } throw reason; } };
      await send();
      router.replace(returnHref);
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر حفظ فاتورة المشتريات.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-blue-700">Purchases Module</p>
          <h1 className="mt-1 text-2xl font-black text-slate-950">إضافة فاتورة مشتريات</h1>
          <p className="mt-2 text-sm text-slate-500">سجّل الفاتورة وحدد هل تدخل الخامات المخزن أو تُستلم وتُصرف للمشروع في نفس العملية.</p>
        </div>
        <button type="button" className="erp-back-tab" onClick={() => router.push(returnHref)}>
          <ArrowRight className="size-4" /> رجوع
        </button>
      </section>

      <form onSubmit={submit} className="space-y-5 rounded-2xl border bg-white p-5 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="text-xs font-bold">
            اسم الفاتورة *
            <input name="name" required maxLength={160} autoFocus className={`${expenseInput} mt-2`} placeholder="مثال: خامات نقاشة عمارة 27" />
          </label>
          <label className="text-xs font-bold">
            المشروع *
            <ERPSelect name="projectId" required className={`${expenseInput} mt-2`}>
              <option value="">اختر المشروع</option>
              {projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </ERPSelect>
            {stockMode === "DIRECT_PROJECT" && <small className="mt-1 block font-normal leading-5 text-slate-500">الخامات ستُضاف تلقائيًا إلى مخزن المشروع، وتظهر في رصيده وجرده واستهلاكه ومرتجعاته.</small>}
          </label>
          <label className="text-xs font-bold">
            المورد
            <ERPSelect name="supplierId" className={`${expenseInput} mt-2`}>
              <option value="">بدون مورد محدد</option>
              {suppliers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </ERPSelect>
          </label>
          <label className="text-xs font-bold">
            تاريخ الفاتورة *
            <input name="invoiceDate" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className={`${expenseInput} mt-2`} />
          </label>
          <label className="text-xs font-bold">
            مصدر الصرف *
            <ERPSelect name="paymentSource" required defaultValue="EXECUTIVE_DIRECTOR" className={`${expenseInput} mt-2`}>
              <option value="EXECUTIVE_DIRECTOR">المدير التنفيذي</option>
              <option value="PETTY_CASH">Petty Cash</option>
            </ERPSelect>
          </label>
          <label className="text-xs font-bold md:col-span-2">
            مسار الخامات *
            <ERPSelect value={stockMode} onValueChange={changeStockMode} className={`${expenseInput} mt-2`}>
              <option value="WAREHOUSE">استلام وإضافة إلى رصيد المخزن</option>
              <option value="DIRECT_PROJECT">استلام وصرف مباشر على المشروع</option>
              <option value="LEGACY_DIRECT">خدمة أو مصروف مباشر بدون مخزن</option>
            </ERPSelect>
          </label>
          {stockMode !== "LEGACY_DIRECT" && <label className="text-xs font-bold">
            المخزن المستلم *
            <ERPSelect name="warehouseId" required className={`${expenseInput} mt-2`}>
              <option value="">اختر المخزن</option>
              {warehouses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </ERPSelect>
          </label>}
        </div>

        <div className={`rounded-xl border p-3 text-xs ${stockMode === "DIRECT_PROJECT" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-blue-100 bg-blue-50 text-blue-900"}`}>
          {stockMode === "WAREHOUSE" && "السداد لا يُحمّل تكلفة المشروع. تُسجل الفاتورة بقيمتها كاملة، لكن رصيد المخزن يزيد بالكمية المستلمة الآن فقط؛ وتُحمّل الخامات على المشروع عند صرفها."}
          {stockMode === "DIRECT_PROJECT" && 'تُسجل الفاتورة بقيمتها كاملة، وتنتقل الكمية المستلمة الآن فقط عبر المخزن إلى مخزن المشروع، وتُحمّل قيمتها على مصاريف "المشروع" فورًا؛ والباقي يظل منتظرًا.'}
          {stockMode === "LEGACY_DIRECT" && "استخدم هذا المسار للخدمات والمصروفات التي لا تمثل خامات مخزنية؛ ستُحمّل القيمة مباشرة على المشروع."}
        </div>

        <section className="overflow-hidden rounded-xl border">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-slate-50 p-3">
            <div>
              <h2 className="text-sm font-extrabold">بنود المشتريات</h2>
          <p className="mt-1 text-[11px] text-slate-500">اضغط Enter في آخر سطر لإضافة بند جديد تلقائيًا. أدخل ما وصل فعلًا الآن، واكتب 0 إن لم يصل شيء؛ الباقي سيظل منتظرًا للاستلام.</p>
            </div>
            <MoneyValue>{money(total)} ج.م</MoneyValue>
          </div>
          <div className="divide-y">
            {rows.map((row, index) => {
              const rowTotal = Math.round(row.quantity * row.price * 100);
              return (
                <div key={row.key} className={`grid gap-3 p-3 text-xs ${stockMode === "LEGACY_DIRECT" ? "xl:grid-cols-[minmax(240px,1.5fr)_100px_120px_150px_150px_44px]" : "xl:grid-cols-[minmax(220px,1.5fr)_85px_100px_120px_120px_140px_44px]"}`}>
                  <div className="space-y-1 font-bold"><div className="flex items-center justify-between gap-2"><span>{row.nonStock ? "بند غير مخزني" : "الصنف المخزني"}</span>{stockMode === "LEGACY_DIRECT" && <button type="button" onClick={() => updateRow(index, row.nonStock ? { nonStock: false, name: "", unit: "وحدة", inventoryItem: null } : { nonStock: true, name: "", unit: "وحدة", inventoryItem: null })} className="text-[10px] font-bold text-blue-700 underline underline-offset-2">{row.nonStock ? "اختيار صنف مخزني" : "إدخال بند غير مخزني"}</button>}</div>{row.nonStock ? <input required aria-label="اسم البند غير المخزني" value={row.name} onChange={(event) => updateRow(index, { name: event.target.value })} onKeyDown={(event) => addOnEnter(event, index)} className={expenseInput} placeholder="مثال: أجرة نقل" /> : <InventoryItemPicker value={row.inventoryItem} onSelect={(item) => updateRow(index, { inventoryItem: item, name: item.name, unit: item.unit, nonStock: false })} label="صنف" />}</div>
                  <label className="space-y-1 font-bold"><span>الوحدة</span>{row.nonStock ? <input required value={row.unit} onChange={(event) => updateRow(index, { unit: event.target.value })} onKeyDown={(event) => addOnEnter(event, index)} className={expenseInput} /> : <div className={`${expenseInput} flex items-center text-slate-700`}>{row.inventoryItem?.unit || "—"}</div>}</label>
                  <label className="space-y-1 font-bold"><span>الكمية</span><input required type="number" min="1" max="1000000000" step="1" value={row.quantity} onChange={(event) => updateRow(index, { quantity: Number(event.target.value) })} onKeyDown={(event) => addOnEnter(event, index)} className={expenseInput} /></label>
                  {stockMode !== "LEGACY_DIRECT" && <label className="space-y-1 font-bold"><span>المستلم الآن</span><input aria-label={`الكمية المستلمة الآن للبند ${index + 1}`} type="number" min="0" max={row.quantity} step="1" value={row.receivedQuantity} onChange={(event) => updateRow(index, { receivedQuantity: Number(event.target.value) })} onKeyDown={(event) => addOnEnter(event, index)} className={expenseInput} /><small className="font-normal text-slate-500">من {row.quantity} {row.unit}</small></label>}
                  <label className="space-y-1 font-bold"><span>سعر الوحدة</span><CurrencyInput required value={row.price} onValueChange={(raw) => updateRow(index, { price: Number(raw) })} onKeyDown={(event) => addOnEnter(event, index)} className={expenseInput} min="0.01" /></label>
                  <div className="space-y-1 font-bold"><span>الإجمالي</span><div className="rounded-lg bg-blue-50 px-3 py-2 text-center"><MoneyValue>{money(rowTotal)} ج.م</MoneyValue></div></div>
                  <div className="flex items-end justify-center">{rows.length > 1 && <button type="button" aria-label={`حذف البند ${index + 1}`} title="حذف البند" className="rounded p-2 text-red-600 hover:bg-red-50" onClick={() => setRows((current) => current.filter((_, n) => n !== index))}><Trash2 className="size-4" /></button>}</div>
                </div>
              );
            })}
          </div>
          <div className="border-t p-3"><button type="button" className={expenseButton} onClick={addRow}><Plus className="size-4" />إضافة بند</button></div>
        </section>

        <section className="grid gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 sm:grid-cols-[minmax(0,1fr)_240px] sm:items-end">
          <div><h2 className="text-sm font-extrabold text-slate-950">المدفوع للمورد عند تسجيل الفاتورة</h2><p className="mt-1 text-xs leading-5 text-slate-600">افتراضيًا يساوي إجمالي الفاتورة. قلّله إذا كان السداد جزئيًا، أو اجعله صفرًا إذا لم يتم السداد؛ وسيظهر الباقي كمستحق للمورد.</p></div>
          <label className="grid gap-1 text-xs font-bold">المسدد بالفعل (ج.م)<input aria-label="المبلغ المسدد بالفعل للمورد" type="number" min="0" max={total / 100} step="0.01" value={paidAmount ?? total / 100} onChange={(event) => setPaidAmount(event.target.value === "" ? 0 : Number(event.target.value))} className={expenseInput} /></label>
          <p className="text-xs font-bold sm:col-span-2">{(paidAmount ?? total / 100) === total / 100 ? <span className="text-emerald-800">الحالة: مسددة بالكامل</span> : (paidAmount ?? total / 100) > 0 ? <span className="text-amber-800">الحالة: مسددة جزئيًا · المتبقي {money(Math.max(0, total - Math.round((paidAmount ?? 0) * 100)))} ج.م</span> : <span className="text-rose-800">الحالة: لم تُسدد · المستحق {money(total)} ج.م</span>}</p>
        </section>

        <label className="block text-xs font-bold">ملاحظات<textarea name="notes" maxLength={2000} className={`${expenseInput} mt-2`} rows={3} /></label>
        <UploadBox name="files" required label="مرفق فاتورة المشتريات" />
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <button disabled={busy} className={`${expenseButton} bg-blue-700 text-white`}><Save className="size-4" />{busy ? "جارٍ الحفظ…" : "حفظ الفاتورة"}</button>
          <button type="button" className={expenseButton} onClick={() => router.push(returnHref)}>إلغاء</button>
        </div>
      </form>
    </div>
  );
}
