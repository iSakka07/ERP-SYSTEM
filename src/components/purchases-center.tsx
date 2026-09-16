"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { FileText, Paperclip, Plus, Trash2 } from "lucide-react";
import { CurrencyInput } from "@/components/currency-input";
import { ERPSelect } from "@/components/erp-select";
import { UploadBox } from "@/components/upload-box";
import { expenseButton, expenseInput, money } from "@/components/expense-sheet";

type Project = { id: string; name: string; code: string; sector?: { name: string } | null };
type Supplier = { id: string; name: string };
type PurchaseItem = {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
};
type PurchaseInvoice = {
  id: string;
  number: string;
  invoiceDate: string;
  notes?: string | null;
  totalCents: number;
  projectId: string;
  supplierId?: string | null;
  project: Project;
  supplier?: Supplier | null;
  items: PurchaseItem[];
};
type Attachment = { id: string; entityType: string; entityId: string; name: string };
type Row = { key: string; name: string; unit: string; quantity: number; price: number };

function blankRow(): Row {
  return { key: crypto.randomUUID(), name: "", unit: "وحدة", quantity: 1, price: 0 };
}

export function PurchasesCenter({
  invoices,
  projects,
  suppliers,
  attachments,
  canManage,
}: {
  invoices: PurchaseInvoice[];
  projects: Project[];
  suppliers: Supplier[];
  attachments: Attachment[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [project, setProject] = useState("");
  const [supplier, setSupplier] = useState("");
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [rows, setRows] = useState<Row[]>([blankRow()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const visible = invoices.filter(
    (invoice) =>
      (!project || invoice.projectId === project) &&
      (!supplier || invoice.supplierId === supplier) &&
      `${invoice.number} ${invoice.project.name} ${invoice.supplier?.name ?? ""}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const total = visible.reduce((sum, invoice) => sum + invoice.totalCents, 0);
  const byProject = useMemo(() => {
    const map = new Map<string, number>();
    for (const invoice of invoices)
      map.set(invoice.projectId, (map.get(invoice.projectId) ?? 0) + invoice.totalCents);
    return map;
  }, [invoices]);
  const rowTotal = (row: Row) => Math.round(row.quantity * row.price * 100);
  const formTotal = rows.reduce((sum, row) => sum + rowTotal(row), 0);

  function updateRow(index: number, patch: Partial<Row>) {
    setRows(rows.map((row, n) => (n === index ? { ...row, ...patch } : row)));
  }

  function files(id: string) {
    const list = attachments.filter((file) => file.entityId === id);
    return (
      <div className="flex flex-wrap gap-2">
        {list.map((file) => (
          <a
            key={file.id}
            className="inline-flex max-w-full items-center gap-1 rounded bg-blue-50 px-2 py-1 text-[11px] text-blue-700"
            href={`/api/purchases/attachments/${file.id}`}
          >
            <Paperclip className="size-3 shrink-0" />
            <span className="truncate">{file.name}</span>
          </a>
        ))}
      </div>
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    const form = event.currentTarget;
    const data = new FormData(form);
    data.set(
      "payload",
      JSON.stringify({
        action: "invoice",
        projectId: data.get("projectId"),
        supplierId: data.get("supplierId") || undefined,
        invoiceDate: data.get("invoiceDate"),
        number: data.get("number") || undefined,
        notes: data.get("notes") || undefined,
        items: rows.map(({ name, unit, quantity, price }) => ({
          name,
          unit,
          quantity,
          price,
        })),
      }),
    );
    try {
      const response = await fetch("/api/purchases", { method: "POST", body: data });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "تعذر حفظ فاتورة المشتريات.");
      setNotice("تم تسجيل فاتورة المشتريات وإضافتها لتكلفة المشروع.");
      setRows([blankRow()]);
      setAdding(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر حفظ فاتورة المشتريات.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-blue-700">Purchases Module</p>
          <h1 className="mt-1 text-2xl font-black text-slate-950">مشتريات المشروع</h1>
          <p className="mt-2 text-sm text-slate-500">
            فواتير مشتريات مباشرة على المشروع، وتدخل ضمن تكلفة المشروع فور التسجيل.
          </p>
        </div>
        {canManage && (
          <button
            className={`${expenseButton} bg-blue-700 text-white`}
            onClick={() => setAdding((value) => !value)}
          >
            <Plus className="size-4" />
            إضافة فاتورة مشتريات
          </button>
        )}
      </section>

      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}

      {adding && (
        <form onSubmit={submit} className="space-y-4 rounded-2xl border bg-white p-5 shadow-sm">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="text-xs font-bold">
              المشروع *
              <ERPSelect name="projectId" required className={`${expenseInput} mt-2`}>
                <option value="">اختر المشروع</option>
                {projects.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </ERPSelect>
            </label>
            <label className="text-xs font-bold">
              المورد
              <ERPSelect name="supplierId" className={`${expenseInput} mt-2`}>
                <option value="">بدون مورد محدد</option>
                {suppliers.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </ERPSelect>
            </label>
            <label className="text-xs font-bold">
              تاريخ الفاتورة *
              <input
                name="invoiceDate"
                type="date"
                required
                defaultValue={new Date().toISOString().slice(0, 10)}
                className={`${expenseInput} mt-2`}
              />
            </label>
            <label className="text-xs font-bold">
              رقم الفاتورة — اختياري
              <input name="number" maxLength={80} className={`${expenseInput} mt-2`} placeholder="يتولد تلقائيًا عند تركه فارغًا" />
            </label>
          </div>

          <section className="overflow-hidden rounded-xl border">
            <div className="flex items-center justify-between gap-3 border-b bg-slate-50 p-3">
              <h2 className="text-sm font-extrabold">بنود المشتريات</h2>
              <strong className="text-sm text-blue-700" dir="ltr">{money(formTotal)} ج.م</strong>
            </div>
            <div className="divide-y">
              {rows.map((row, index) => (
                <div key={row.key} className="grid gap-3 p-3 text-xs xl:grid-cols-[minmax(260px,1.5fr)_100px_120px_150px_150px_44px]">
                  <label className="space-y-1 font-bold">
                    <span>الصنف / البند</span>
                    <input required value={row.name} onChange={(event) => updateRow(index, { name: event.target.value })} className={expenseInput} />
                  </label>
                  <label className="space-y-1 font-bold">
                    <span>الوحدة</span>
                    <input required value={row.unit} onChange={(event) => updateRow(index, { unit: event.target.value })} className={expenseInput} />
                  </label>
                  <label className="space-y-1 font-bold">
                    <span>الكمية</span>
                    <input required type="number" min="0.000001" max="1000000000" step="0.000001" value={row.quantity} onChange={(event) => updateRow(index, { quantity: Number(event.target.value) })} className={expenseInput} />
                  </label>
                  <label className="space-y-1 font-bold">
                    <span>سعر الوحدة</span>
                    <CurrencyInput required value={row.price} onValueChange={(raw) => updateRow(index, { price: Number(raw) })} className={expenseInput} min="0.01" />
                  </label>
                  <div className="space-y-1 font-bold">
                    <span>الإجمالي</span>
                    <div className="rounded-lg bg-blue-50 px-3 py-2 text-center text-blue-700" dir="ltr">
                      {money(rowTotal(row))}
                    </div>
                  </div>
                  <div className="flex items-end justify-center">
                    {rows.length > 1 && (
                      <button type="button" className="rounded p-2 text-red-600 hover:bg-red-50" onClick={() => setRows(rows.filter((_, n) => n !== index))}>
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t p-3">
              <button type="button" className={expenseButton} onClick={() => setRows([...rows, blankRow()])}>
                <Plus className="size-4" />
                إضافة بند
              </button>
            </div>
          </section>

          <label className="block text-xs font-bold">
            ملاحظات
            <textarea name="notes" maxLength={2000} className={`${expenseInput} mt-2`} />
          </label>
          <UploadBox name="files" required label="مرفق فاتورة المشتريات" />
          <div className="flex flex-wrap gap-2">
            <button disabled={busy} className={`${expenseButton} bg-blue-700 text-white`}>حفظ الفاتورة</button>
            <button type="button" className={expenseButton} onClick={() => setAdding(false)}>إلغاء</button>
          </div>
        </form>
      )}

      <section className="grid gap-3 md:grid-cols-3">
        <article className="rounded-2xl border bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">إجمالي المشتريات</p>
          <strong className="mt-2 block text-2xl text-slate-950" dir="ltr">{money(total)}</strong>
          <p className="mt-1 text-xs text-slate-500">ج.م · حسب الفلاتر الحالية</p>
        </article>
        <article className="rounded-2xl border bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">عدد الفواتير</p>
          <strong className="mt-2 block text-2xl text-slate-950">{visible.length}</strong>
          <p className="mt-1 text-xs text-slate-500">فاتورة مسجلة</p>
        </article>
        <article className="rounded-2xl border bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">أعلى مشروع تكلفة مشتريات</p>
          <strong className="mt-2 block text-lg text-slate-950">
            {projects
              .map((item) => ({ item, total: byProject.get(item.id) ?? 0 }))
              .sort((a, b) => b.total - a.total)[0]?.item.name ?? "—"}
          </strong>
          <p className="mt-1 text-xs text-slate-500">حسب الفواتير المسجلة</p>
        </article>
      </section>

      <section className="rounded-2xl border bg-white shadow-sm">
        <div className="grid gap-3 border-b p-4 lg:grid-cols-[1fr_220px_220px]">
          <input className={expenseInput} placeholder="بحث برقم الفاتورة أو المشروع أو المورد..." value={search} onChange={(event) => setSearch(event.target.value)} />
          <ERPSelect className={expenseInput} value={project} onValueChange={setProject}>
            <option value="">كل المشروعات</option>
            {projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </ERPSelect>
          <ERPSelect className={expenseInput} value={supplier} onValueChange={setSupplier}>
            <option value="">كل الموردين</option>
            {suppliers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </ERPSelect>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-right text-sm">
            <thead className="bg-slate-100 text-xs text-slate-500">
              <tr>
                {["الفاتورة", "المشروع", "المورد", "التاريخ", "عدد البنود", "الإجمالي", "المرفقات"].map((head) => (
                  <th key={head} className="p-3">{head}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {visible.map((invoice) => (
                <tr key={invoice.id} className="hover:bg-slate-50/70">
                  <td className="p-3 font-bold">
                    <span className="inline-flex items-center gap-2"><FileText className="size-4 text-blue-700" />{invoice.number}</span>
                    {invoice.notes && <p className="mt-1 text-[11px] font-normal text-slate-500">{invoice.notes}</p>}
                  </td>
                  <td className="p-3">{invoice.project.name}<p className="mt-1 text-[11px] text-slate-400">{invoice.project.sector?.name ?? invoice.project.code}</p></td>
                  <td className="p-3">{invoice.supplier?.name ?? "—"}</td>
                  <td className="p-3">{invoice.invoiceDate.slice(0, 10)}</td>
                  <td className="p-3">{invoice.items.length}</td>
                  <td className="p-3 font-bold text-blue-700" dir="ltr">{money(invoice.totalCents)} ج.م</td>
                  <td className="p-3">{files(invoice.id)}</td>
                </tr>
              ))}
              {!visible.length && (
                <tr><td colSpan={7} className="p-6 text-center text-sm text-slate-400">لا توجد فواتير مشتريات مطابقة.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
