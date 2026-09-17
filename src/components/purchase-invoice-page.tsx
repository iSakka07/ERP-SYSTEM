"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Plus, Save, Trash2 } from "lucide-react";
import { CurrencyInput } from "@/components/currency-input";
import { ERPSelect } from "@/components/erp-select";
import { UploadBox } from "@/components/upload-box";
import { expenseButton, expenseInput, money } from "@/components/expense-sheet";
import { MoneyValue } from "@/components/erp-ui";

type Project = { id: string; name: string };
type Supplier = { id: string; name: string };
type Row = { key: string; name: string; unit: string; quantity: number; price: number };

function blankRow(): Row {
  return { key: crypto.randomUUID(), name: "", unit: "وحدة", quantity: 1, price: 0 };
}

export function PurchaseInvoicePage({
  projects,
  suppliers,
  returnHref = "/purchases",
}: {
  projects: Project[];
  suppliers: Supplier[];
  returnHref?: string;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([blankRow()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const total = rows.reduce((sum, row) => sum + Math.round(row.quantity * row.price * 100), 0);

  function updateRow(index: number, patch: Partial<Row>) {
    setRows((current) => current.map((row, n) => (n === index ? { ...row, ...patch } : row)));
  }

  function addRow() {
    const row = blankRow();
    setRows((current) => [...current, row]);
    requestAnimationFrame(() => document.getElementById(`purchase-item-${row.key}`)?.focus());
  }

  function addOnEnter(event: KeyboardEvent<HTMLInputElement>, index: number) {
    if (event.key !== "Enter" || event.nativeEvent.isComposing || index !== rows.length - 1) return;
    event.preventDefault();
    addRow();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
        notes: data.get("notes") || undefined,
        items: rows.map(({ name, unit, quantity, price }) => ({ name, unit, quantity, price })),
      }),
    );
    try {
      const response = await fetch("/api/purchases", { method: "POST", body: data });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "تعذر حفظ فاتورة المشتريات.");
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
          <p className="mt-2 text-sm text-slate-500">سجّل تكلفة المشتريات على المشروع، مع إرفاق إثبات الفاتورة.</p>
        </div>
        <button type="button" className={expenseButton} onClick={() => router.push(returnHref)}>
          <ArrowRight className="size-4" /> الرجوع للمشتريات
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
        </div>

        <section className="overflow-hidden rounded-xl border">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-slate-50 p-3">
            <div>
              <h2 className="text-sm font-extrabold">بنود المشتريات</h2>
              <p className="mt-1 text-[11px] text-slate-500">اضغط Enter في آخر سطر لإضافة بند جديد تلقائيًا.</p>
            </div>
            <MoneyValue>{money(total)} ج.م</MoneyValue>
          </div>
          <div className="divide-y">
            {rows.map((row, index) => {
              const rowTotal = Math.round(row.quantity * row.price * 100);
              return (
                <div key={row.key} className="grid gap-3 p-3 text-xs xl:grid-cols-[minmax(240px,1.5fr)_100px_120px_150px_150px_44px]">
                  <label className="space-y-1 font-bold"><span>الصنف / البند</span><input id={`purchase-item-${row.key}`} required value={row.name} onChange={(event) => updateRow(index, { name: event.target.value })} onKeyDown={(event) => addOnEnter(event, index)} className={expenseInput} /></label>
                  <label className="space-y-1 font-bold"><span>الوحدة</span><input required value={row.unit} onChange={(event) => updateRow(index, { unit: event.target.value })} onKeyDown={(event) => addOnEnter(event, index)} className={expenseInput} /></label>
                  <label className="space-y-1 font-bold"><span>الكمية</span><input required type="number" min="0.000001" max="1000000000" step="0.000001" value={row.quantity} onChange={(event) => updateRow(index, { quantity: Number(event.target.value) })} onKeyDown={(event) => addOnEnter(event, index)} className={expenseInput} /></label>
                  <label className="space-y-1 font-bold"><span>سعر الوحدة</span><CurrencyInput required value={row.price} onValueChange={(raw) => updateRow(index, { price: Number(raw) })} onKeyDown={(event) => addOnEnter(event, index)} className={expenseInput} min="0.01" /></label>
                  <div className="space-y-1 font-bold"><span>الإجمالي</span><div className="rounded-lg bg-blue-50 px-3 py-2 text-center"><MoneyValue>{money(rowTotal)} ج.م</MoneyValue></div></div>
                  <div className="flex items-end justify-center">{rows.length > 1 && <button type="button" aria-label={`حذف البند ${index + 1}`} title="حذف البند" className="rounded p-2 text-red-600 hover:bg-red-50" onClick={() => setRows((current) => current.filter((_, n) => n !== index))}><Trash2 className="size-4" /></button>}</div>
                </div>
              );
            })}
          </div>
          <div className="border-t p-3"><button type="button" className={expenseButton} onClick={addRow}><Plus className="size-4" />إضافة بند</button></div>
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
