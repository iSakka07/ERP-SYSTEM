"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { Boxes, FileText, List, Paperclip, Plus, ReceiptText } from "lucide-react";
import { ERPSelect } from "@/components/erp-select";
import { expenseButton, expenseInput, money } from "@/components/expense-sheet";
import { IconAction, KpiCard, MoneyValue } from "@/components/erp-ui";

type Project = { id: string; name: string; code: string };
type Supplier = { id: string; name: string };
type PurchaseItem = { id: string; name: string; unit: string; quantity: number; unitPriceCents: number; totalCents: number };
type PurchaseInvoice = {
  id: string;
  name: string;
  invoiceDate: string;
  notes?: string | null;
  totalCents: number;
  projectId: string;
  supplierId?: string | null;
  project: Project;
  supplier?: Supplier | null;
  items: PurchaseItem[];
};
type Attachment = { id: string; entityId: string; name: string };

function AttachmentMenu({ files }: { files: Attachment[] }) {
  if (!files.length) return <span className="text-slate-400">—</span>;
  return (
    <details className="relative inline-block">
      <summary className="erp-icon-action relative list-none cursor-pointer" aria-label={`عرض ${files.length} مرفق`} title={`عرض ${files.length} مرفق`}>
        <Paperclip className="size-4" />
        {files.length > 1 && <span className="absolute -left-1 -top-1 grid size-4 place-items-center rounded-full bg-blue-700 text-[9px] font-bold text-white">{files.length}</span>}
      </summary>
      <div className="absolute left-0 z-20 mt-2 w-64 rounded-lg border bg-white p-2 shadow-xl">
        {files.map((file) => <a key={file.id} href={`/api/purchases/attachments/${file.id}`} className="flex items-center gap-2 rounded-md px-2 py-2 text-xs text-blue-700 hover:bg-blue-50"><Paperclip className="size-3 shrink-0" /><span className="truncate">{file.name}</span></a>)}
      </div>
    </details>
  );
}

export function PurchasesCenter({ invoices, projects, suppliers, attachments, canManage, initialProjectId = "" }: {
  invoices: PurchaseInvoice[];
  projects: Project[];
  suppliers: Supplier[];
  attachments: Attachment[];
  canManage: boolean;
  initialProjectId?: string;
}) {
  const router = useRouter();
  const [project, setProject] = useState(initialProjectId);
  const [supplier, setSupplier] = useState("");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState("");
  const visible = invoices.filter((invoice) =>
    (!project || invoice.projectId === project) &&
    (!supplier || invoice.supplierId === supplier) &&
    `${invoice.name} ${invoice.project.name} ${invoice.supplier?.name ?? ""}`.toLowerCase().includes(search.toLowerCase()),
  );
  const total = visible.reduce((sum, invoice) => sum + invoice.totalCents, 0);
  const byProject = (() => {
    const totals = new Map<string, number>();
    for (const invoice of visible) totals.set(invoice.projectId, (totals.get(invoice.projectId) ?? 0) + invoice.totalCents);
    return projects.map((item) => ({ item, total: totals.get(item.id) ?? 0 })).sort((a, b) => b.total - a.total)[0];
  })();
  function newInvoice() {
    const params = new URLSearchParams();
    if (project) params.set("project", project);
    router.push(`/purchases/new?return=${encodeURIComponent(`/purchases${params.size ? `?${params}` : ""}`)}`);
  }

  return <div className="space-y-5">
    <section className="flex flex-wrap items-end justify-between gap-3">
      <div><p className="text-xs font-bold text-blue-700">Purchases Module</p><h1 className="mt-1 text-2xl font-black text-slate-950">مشتريات المشروع</h1><p className="mt-2 text-sm text-slate-500">فواتير المشتريات تُحمّل على تكلفة المشروع؛ الصرف الفعلي يسجل في دورته المالية.</p></div>
      {canManage && <button className={`${expenseButton} bg-blue-700 text-white`} onClick={newInvoice}><Plus className="size-4" />إضافة فاتورة مشتريات</button>}
    </section>

    <section className="grid gap-3 md:grid-cols-3">
      <KpiCard label="قيمة فواتير المشتريات" value={`${money(total)} ج.م`} icon={ReceiptText} tone="blue" />
      <KpiCard label="عدد الفواتير" value={visible.length.toLocaleString("en-US")} icon={FileText} tone="violet" hint="فاتورة مسجلة" />
      <KpiCard label="أعلى تكلفة مشتريات" value={`${money(byProject?.total ?? 0)} ج.م`} icon={Boxes} tone="amber" hint={byProject?.item.name ?? "لا توجد بيانات"} />
    </section>

    <section className="erp-table-shell">
      <div className="grid gap-3 border-b bg-white p-4 lg:grid-cols-[1fr_220px_220px]">
        <input className={expenseInput} placeholder="بحث باسم الفاتورة أو المشروع أو المورد..." value={search} onChange={(event) => setSearch(event.target.value)} />
        <ERPSelect aria-label="فلتر المشروع" className={expenseInput} value={project} onValueChange={setProject}><option value="">كل المشروعات</option>{projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</ERPSelect>
        <ERPSelect aria-label="فلتر المورد" className={expenseInput} value={supplier} onValueChange={setSupplier}><option value="">كل الموردين</option>{suppliers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</ERPSelect>
      </div>
      <div className="erp-table-scroll"><table className="erp-data-table erp-responsive-table min-w-[960px]">
        <thead><tr>{["اسم الفاتورة", "المشروع", "المورد", "التاريخ", "عدد البنود", "الإجمالي", "الإجراءات"].map((head) => <th key={head}>{head}</th>)}</tr></thead>
        <tbody>{visible.map((invoice) => {
          const isOpen = expanded === invoice.id;
          const invoiceFiles = attachments.filter((file) => file.entityId === invoice.id);
          return <Fragment key={invoice.id}>
            <tr>
              <td data-label="اسم الفاتورة" className="font-bold"><span className="inline-flex items-center gap-2"><FileText className="size-4 text-blue-700" />{invoice.name}</span>{invoice.notes && <p className="mt-1 text-[11px] font-normal text-slate-500">{invoice.notes}</p>}</td>
              <td data-label="المشروع">{invoice.project.name}<p className="mt-1 text-[11px] text-slate-400">{invoice.project.code}</p></td>
              <td data-label="المورد">{invoice.supplier?.name ?? "—"}</td>
              <td data-label="التاريخ" dir="ltr">{invoice.invoiceDate.slice(0, 10)}</td>
              <td data-label="عدد البنود"><button type="button" className="font-extrabold text-blue-700 underline decoration-blue-200 underline-offset-4" onClick={() => setExpanded(isOpen ? "" : invoice.id)}>{invoice.items.length} بند</button></td>
              <td data-label="الإجمالي" className="text-center"><MoneyValue>{money(invoice.totalCents)} ج.م</MoneyValue></td>
              <td data-label="الإجراءات"><div className="flex justify-end gap-2"><IconAction label={isOpen ? "إخفاء تفاصيل البنود" : "عرض تفاصيل البنود"} icon={List} onClick={() => setExpanded(isOpen ? "" : invoice.id)} /><AttachmentMenu files={invoiceFiles} /></div></td>
            </tr>
            {isOpen && <tr><td colSpan={7} className="erp-table-details"><h2 className="mb-3 text-sm font-black">تفاصيل بنود «{invoice.name}»</h2><div className="overflow-x-auto"><table className="w-full min-w-[600px] text-xs"><thead className="bg-slate-100 text-slate-600"><tr>{["الصنف", "الوحدة", "الكمية", "سعر الوحدة", "الإجمالي"].map((head) => <th key={head} className="p-2 text-right">{head}</th>)}</tr></thead><tbody>{invoice.items.map((item) => <tr key={item.id} className="border-b last:border-0"><td className="p-2 font-bold">{item.name}</td><td className="p-2">{item.unit}</td><td className="p-2" dir="ltr">{item.quantity}</td><td className="p-2 text-center"><MoneyValue>{money(item.unitPriceCents)} ج.م</MoneyValue></td><td className="p-2 text-center"><MoneyValue>{money(item.totalCents)} ج.م</MoneyValue></td></tr>)}</tbody></table></div></td></tr>}
          </Fragment>;
        })}{!visible.length && <tr><td colSpan={7} className="p-10 text-center text-sm text-slate-400">لا توجد فواتير مشتريات مطابقة.</td></tr>}</tbody>
        {!!visible.length && <tfoot><tr><td colSpan={5}>إجمالي {visible.length} فاتورة</td><td className="text-center"><MoneyValue>{money(total)} ج.م</MoneyValue></td><td /></tr></tfoot>}
      </table></div>
    </section>
  </div>;
}
