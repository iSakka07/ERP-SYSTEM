"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Download, ExternalLink, FilterX, LoaderCircle, Search } from "lucide-react";
import { ERPSelect } from "@/components/erp-select";
import { money } from "@/components/expense-sheet";

type Choice = { id: string; name: string };
type ReceiptRow = {
  id: string; number: string; movementDate: string; createdAt: string; status: string; type: string; itemCount: number;
  items: { code: string; name: string; unit: string; quantity: number }[];
  invoice: { id: string; number: string; name: string; status: string; paidCents: number; totalCents: number } | null;
  supplier: { id: string; name: string } | null; warehouse: { id: string; name: string } | null;
  project: { id: string; code: string; name: string } | null; creator: string; hasPostedIssue: boolean; state: string;
};
type RegisterData = { total: number; page: number; pageSize: number; totalPages: number; warehouses: Choice[]; projects: Choice[]; suppliers: Choice[]; statuses: string[]; creators: Choice[]; rows: ReceiptRow[] };
type FilterValues = { q: string; invoice: string; status: string[]; kind: string; warehouse: string; project: string; supplier: string; receiptFrom: string; receiptTo: string; createdFrom: string; createdTo: string; creator: string; issue: string; sort: string; size: number };

const blankFilters = (): FilterValues => ({ q: "", invoice: "", status: [], kind: "", warehouse: "", project: "", supplier: "", receiptFrom: "", receiptTo: "", createdFrom: "", createdTo: "", creator: "", issue: "", sort: "newest", size: 25 });
function fromQuery(query: string): FilterValues {
  const params = new URLSearchParams(query);
  return { ...blankFilters(), q: params.get("q") || "", invoice: params.get("invoice") || "", status: params.getAll("status").flatMap((value) => value.split(",")).filter(Boolean), kind: params.get("kind") || "", warehouse: params.get("warehouse") || "", project: params.get("project") || "", supplier: params.get("supplier") || "", receiptFrom: params.get("receiptFrom") || "", receiptTo: params.get("receiptTo") || "", createdFrom: params.get("createdFrom") || "", createdTo: params.get("createdTo") || "", creator: params.get("creator") || "", issue: params.get("issue") || "", sort: params.get("sort") || "newest", size: Number(params.get("size")) || 25 };
}
function statusLabel(status: string) { return status === "POSTED" ? "مرحّل" : status === "REVERSED" ? "معكوس" : status === "CANCELLED" ? "ملغي" : status; }
function day(date: string) { return new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(date)); }
function paidLabel(invoice: ReceiptRow["invoice"]) { if (!invoice) return "—"; return invoice.paidCents >= invoice.totalCents ? "مسددة بالكامل" : invoice.paidCents > 0 ? "مسددة جزئيًا" : "لم تُسدد"; }
function ReceiptItems({ items, count }: { items: ReceiptRow["items"]; count: number }) {
  if (!items.length) return <span>{count} بند</span>;
  return <div className="min-w-32 space-y-1">
    {items.slice(0, 2).map((item, index) => <p key={`${item.code}:${index}`} className="text-xs font-bold text-slate-900">{item.name} <span className="whitespace-nowrap text-slate-600">· {item.quantity.toLocaleString("en-US")} {item.unit}</span></p>)}
    {count > items.length && <p className="text-[11px] text-slate-500">+ {count - items.length} بنود أخرى</p>}
    {count > 1 && count <= items.length && <p className="text-[11px] text-slate-500">{count} بنود</p>}
  </div>;
}

export function WarehouseReceiptRegister({ initialQuery = "" }: { initialQuery?: string }) {
  const router = useRouter();
  const [filters, setFilters] = useState(() => fromQuery(initialQuery));
  const [query, setQuery] = useState(initialQuery);
  const [data, setData] = useState<RegisterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const [advanced, setAdvanced] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/warehouse/receipts${query ? `?${query}` : ""}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => { const body = await response.json(); if (response.status === 403) { setForbidden(true); throw new Error(body.error || "لا تملك صلاحية عرض سجل الاستلام."); } if (!response.ok) throw new Error(body.error || "تعذر تحميل السجل."); return body as RegisterData; })
      .then(setData)
      .catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "تعذر تحميل سجل الاستلام."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [query]);

  const activeFilters = useMemo(() => {
    const params = new URLSearchParams(query);
    return [...params.keys()].filter((key) => !["tab", "page", "size", "sort"].includes(key)).length;
  }, [query]);
  const activeFilterChips = useMemo(() => {
    const applied = fromQuery(query);
    const choice = (options: Choice[] | undefined, id: string) => options?.find((option) => option.id === id)?.name || id;
    return [
      applied.q && `بحث: ${applied.q}`,
      applied.invoice && `الفاتورة: ${applied.invoice}`,
      ...applied.status.map((status) => `الحالة: ${statusLabel(status)}`),
      applied.kind && `النوع: ${applied.kind === "WAREHOUSE" ? "مخزني" : applied.kind === "DIRECT_PROJECT" ? "مباشر للمشروع" : "آخر"}`,
      applied.warehouse && `المخزن: ${choice(data?.warehouses, applied.warehouse)}`,
      applied.project && `المشروع: ${choice(data?.projects, applied.project)}`,
      applied.supplier && `المورد: ${choice(data?.suppliers, applied.supplier)}`,
      applied.receiptFrom && `الاستلام من: ${applied.receiptFrom}`,
      applied.receiptTo && `الاستلام إلى: ${applied.receiptTo}`,
      applied.createdFrom && `الإنشاء من: ${applied.createdFrom}`,
      applied.createdTo && `الإنشاء إلى: ${applied.createdTo}`,
      applied.creator && `أضيف بواسطة: ${choice(data?.creators, applied.creator)}`,
      applied.issue === "linked" && "له حركة توريد مرتبطة بالفاتورة",
      applied.issue === "none" && "بدون حركة توريد مرتبطة بالفاتورة",
      ["POSTED", "REVERSED", "CANCELLED"].includes(applied.issue) && `حركة التوريد: ${statusLabel(applied.issue)}`,
    ].filter((value): value is string => Boolean(value));
  }, [query, data]);

  function set<K extends keyof FilterValues>(key: K, value: FilterValues[K]) { setFilters((current) => ({ ...current, [key]: value })); }
  function apply(event: FormEvent) {
    event.preventDefault();
    const params = new URLSearchParams();
    for (const key of ["q", "invoice", "kind", "warehouse", "project", "supplier", "receiptFrom", "receiptTo", "createdFrom", "createdTo", "creator", "issue", "sort"] as const) if (filters[key]) params.set(key, filters[key]);
    filters.status.forEach((status) => params.append("status", status));
    params.set("size", String(filters.size)); params.set("page", "1");
    const next = params.toString();
    if (next === query) return;
    setLoading(true); setError(""); setForbidden(false);
    setQuery(next); router.replace(`/warehouse?tab=receipts${next ? `&${next}` : ""}`, { scroll: false });
  }
  function clear() {
    setFilters(blankFilters());
    if (!query) return;
    setLoading(true); setError(""); setForbidden(false);
    setQuery(""); router.replace("/warehouse?tab=receipts", { scroll: false });
  }
  function goPage(page: number) {
    const params = new URLSearchParams(query); params.set("page", String(page));
    const next = params.toString();
    setLoading(true); setError(""); setForbidden(false);
    setQuery(next); router.replace(`/warehouse?tab=receipts&${next}`, { scroll: false });
  }
  const returnTo = `/warehouse?tab=receipts${query ? `&${query}` : ""}`;
  const downloadQuery = new URLSearchParams(query); downloadQuery.set("format", "csv"); downloadQuery.delete("page"); downloadQuery.delete("size");

  return <section className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-white p-4">
      <div><h2 className="font-black text-slate-950">سجل استلام الخامات</h2><p className="mt-1 text-xs text-slate-500">كل حركات الاستلام المسجلة، بما فيها الجزئي والكامل والحالات غير المرحلة، مع تتبع الفاتورة والمخزن والمشروع.</p></div>
      <a href={`/api/warehouse/receipts?${downloadQuery}`} className="erp-back-tab"><Download className="size-4" />تصدير النتائج CSV</a>
    </div>

    <form onSubmit={apply} className="space-y-3 rounded-2xl border bg-white p-4">
      <div className="grid gap-3 lg:grid-cols-[minmax(240px,1.5fr)_minmax(160px,1fr)_auto]">
        <label className="grid gap-1 text-xs font-bold">بحث شامل<input aria-label="بحث في سجل الاستلام" className="erp-control" value={filters.q} onChange={(event) => set("q", event.target.value)} placeholder="الفاتورة أو المورد أو الصنف أو الحركة المرتبطة" /></label>
        <label className="grid gap-1 text-xs font-bold">رقم فاتورة المشتريات<input className="erp-control" value={filters.invoice} onChange={(event) => set("invoice", event.target.value)} placeholder="اكتب رقم الفاتورة" /></label>
        <div className="flex items-end gap-2"><button type="submit" className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-700 px-4 text-sm font-bold text-white"><Search className="size-4" />تطبيق</button><button type="button" onClick={() => setAdvanced((value) => !value)} className="erp-back-tab h-10">{advanced ? "إخفاء الفلاتر" : "فلاتر إضافية"}{activeFilters > 0 && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-blue-800">{activeFilters}</span>}</button></div>
      </div>
      {advanced && <div className="grid gap-3 border-t pt-3 sm:grid-cols-2 xl:grid-cols-4">
        <label className="grid gap-1 text-xs font-bold">حالة الحركة<select multiple size={3} aria-label="تصفية حالات حركة الاستلام" className="erp-control min-h-24" value={filters.status} onChange={(event) => set("status", Array.from(event.currentTarget.selectedOptions, (option) => option.value))}>{[...new Set(["POSTED", "REVERSED", "CANCELLED", ...(data?.statuses || [])])].map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select><small className="font-normal text-slate-500">يمكن اختيار أكثر من حالة.</small></label>
        <label className="grid gap-1 text-xs font-bold">نوع الاستلام<ERPSelect value={filters.kind} onValueChange={(value) => set("kind", value)}><option value="">كل الأنواع</option><option value="WAREHOUSE">استلام مخزني</option><option value="DIRECT_PROJECT">استلام مباشر للمشروع</option><option value="OTHER">نوع آخر / دون فاتورة</option></ERPSelect></label>
        <label className="grid gap-1 text-xs font-bold">المخزن المستلم<ERPSelect value={filters.warehouse} onValueChange={(value) => set("warehouse", value)}><option value="">كل المخازن المتاحة</option>{(data?.warehouses || []).map((choice) => <option key={choice.id} value={choice.id}>{choice.name}</option>)}</ERPSelect></label>
        <label className="grid gap-1 text-xs font-bold">المشروع<ERPSelect value={filters.project} onValueChange={(value) => set("project", value)}><option value="">كل المشروعات المتاحة</option>{(data?.projects || []).map((choice) => <option key={choice.id} value={choice.id}>{choice.name}</option>)}</ERPSelect></label>
        <label className="grid gap-1 text-xs font-bold">المورد<ERPSelect value={filters.supplier} onValueChange={(value) => set("supplier", value)}><option value="">كل الموردين</option>{(data?.suppliers || []).map((choice) => <option key={choice.id} value={choice.id}>{choice.name}</option>)}</ERPSelect></label>
        <label className="grid gap-1 text-xs font-bold">تاريخ الاستلام من<input type="date" className="erp-control" value={filters.receiptFrom} onChange={(event) => set("receiptFrom", event.target.value)} /></label>
        <label className="grid gap-1 text-xs font-bold">تاريخ الاستلام إلى<input type="date" className="erp-control" value={filters.receiptTo} onChange={(event) => set("receiptTo", event.target.value)} /></label>
        <label className="grid gap-1 text-xs font-bold">تاريخ الإنشاء من<input type="date" className="erp-control" value={filters.createdFrom} onChange={(event) => set("createdFrom", event.target.value)} /></label>
        <label className="grid gap-1 text-xs font-bold">تاريخ الإنشاء إلى<input type="date" className="erp-control" value={filters.createdTo} onChange={(event) => set("createdTo", event.target.value)} /></label>
        <label className="grid gap-1 text-xs font-bold">أضيف بواسطة<ERPSelect value={filters.creator} onValueChange={(value) => set("creator", value)}><option value="">كل المستخدمين</option>{(data?.creators || []).map((choice) => <option key={choice.id} value={choice.id}>{choice.name}</option>)}</ERPSelect></label>
        <label className="grid gap-1 text-xs font-bold">حالة حركة التوريد المرتبطة<ERPSelect value={filters.issue} onValueChange={(value) => set("issue", value)}><option value="">الكل</option><option value="linked">له حركة توريد على الفاتورة</option><option value="POSTED">حركة التوريد مرحّلة</option><option value="REVERSED">حركة التوريد معكوسة</option><option value="CANCELLED">حركة التوريد ملغية</option><option value="none">لا توجد حركة توريد على الفاتورة</option></ERPSelect><small className="font-normal text-slate-500">الربط المتاح على مستوى الفاتورة، وليس بكل استلام على حدة.</small></label>
        <label className="grid gap-1 text-xs font-bold">ترتيب النتائج<ERPSelect value={filters.sort} onValueChange={(value) => set("sort", value)}><option value="newest">الأحدث استلامًا</option><option value="oldest">الأقدم استلامًا</option></ERPSelect></label>
        <label className="grid gap-1 text-xs font-bold">عدد السجلات بالصفحة<ERPSelect value={String(filters.size)} onValueChange={(value) => set("size", Number(value))}><option value="10">10</option><option value="25">25</option><option value="50">50</option><option value="100">100</option></ERPSelect></label>
      </div>}
      {advanced && <div className="border-t pt-3"><p className="text-xs text-slate-500">لا توجد أوامر شراء مستقلة في نموذج البيانات الحالي؛ يمكن البحث برقم فاتورة المورد أو رقم حركة المخزن المرتبطة بالفاتورة.</p></div>}
    </form>

    {activeFilterChips.length > 0 && <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-slate-50 p-3" aria-label="الفلاتر النشطة"><span className="text-xs font-bold text-slate-700">الفلاتر النشطة</span>{activeFilterChips.map((filter, index) => <span key={`${filter}:${index}`} className="rounded-full border bg-white px-2.5 py-1 text-[11px] text-slate-700">{filter}</span>)}<button type="button" onClick={clear} className="ms-auto inline-flex items-center gap-1 text-xs font-bold text-blue-700 hover:underline"><FilterX className="size-3.5" />مسح الكل</button></div>}

    {loading && <div className="flex items-center justify-center gap-2 rounded-2xl border bg-white p-12 text-sm text-slate-500"><LoaderCircle className="size-5 animate-spin" />جاري تحميل سجل الاستلام…</div>}
    {!loading && error && <div role="alert" className={`rounded-2xl border p-8 text-center text-sm ${forbidden ? "border-amber-200 bg-amber-50 text-amber-900" : "border-rose-200 bg-rose-50 text-rose-800"}`}>{error}</div>}
    {!loading && !error && data && <>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500"><p>عدد النتائج: <b className="text-slate-900">{data.total.toLocaleString("en-US")}</b></p><p>الصفحة {data.page} من {data.totalPages}</p></div>
      <section className="erp-table-shell hidden md:block"><div className="erp-table-scroll"><table className="erp-data-table min-w-[1280px]"><thead><tr>{["حالة الاستلام", "تاريخ الاستلام", "فاتورة المشتريات", "حالة السداد", "المورد", "النوع", "المخزن المستلم", "المشروع", "الأصناف والكميات", "أضيف بواسطة / الإنشاء", "التفاصيل"].map((heading) => <th key={heading}>{heading}</th>)}</tr></thead><tbody>{data.rows.map((row) => <tr key={row.id}><td><b>{statusLabel(row.status)}</b><p className="mt-1 text-[11px]">{row.state}</p></td><td dir="ltr">{day(row.movementDate)}</td><td>{row.invoice?.name || "—"}</td><td>{row.invoice && <><b className="text-xs">{paidLabel(row.invoice)}</b><p className="mt-1 text-[11px] text-slate-500">سُدد {money(row.invoice.paidCents)} من {money(row.invoice.totalCents)} ج.م</p></>}</td><td>{row.supplier?.name || "—"}</td><td>{row.type === "DIRECT_PROJECT" ? "مباشر للمشروع" : row.type === "WAREHOUSE" ? "مخزني" : "آخر"}</td><td>{row.warehouse?.name || "—"}</td><td>{row.project?.name || "—"}</td><td><ReceiptItems items={row.items} count={row.itemCount} /></td><td>{row.creator}<p className="mt-1 text-[11px] text-slate-500">{day(row.createdAt)}</p></td><td><ReceiptDetailLink row={row} returnTo={returnTo} /></td></tr>)}{data.rows.length === 0 && <tr><td colSpan={11} className="p-12 text-center text-slate-500">{activeFilters ? "لا توجد نتائج مطابقة للفلاتر الحالية." : "لا توجد حركات استلام مسجلة حتى الآن."}</td></tr>}</tbody></table></div></section>
      <section className="space-y-2 md:hidden">{data.rows.map((row) => <article key={row.id} className="rounded-xl border bg-white p-4"><div className="flex items-start justify-between gap-3"><div><b>{statusLabel(row.status)}</b><p className="mt-1 text-xs text-slate-500">{row.state}</p></div><ReceiptDetailLink row={row} returnTo={returnTo} /></div><div className="mt-3 grid grid-cols-2 gap-3 text-xs"><span className="text-slate-500">تاريخ الاستلام <b className="block pt-1 text-slate-900">{day(row.movementDate)}</b></span><span className="text-slate-500">فاتورة <b className="block pt-1 text-slate-900">{row.invoice?.name || "—"}</b></span><span className="text-slate-500">حالة السداد <b className="block pt-1 text-slate-900">{paidLabel(row.invoice)}</b></span><span className="text-slate-500">المورد <b className="block pt-1 text-slate-900">{row.supplier?.name || "—"}</b></span><span className="text-slate-500">المخزن <b className="block pt-1 text-slate-900">{row.warehouse?.name || "—"}</b></span><span className="text-slate-500">المشروع <b className="block pt-1 text-slate-900">{row.project?.name || "—"}</b></span><span className="text-slate-500">عدد البنود <b className="block pt-1 text-slate-900">{row.itemCount}</b></span></div><div className="mt-3 border-t pt-3"><p className="mb-2 text-[11px] font-bold text-slate-500">الأصناف والكميات</p><ReceiptItems items={row.items} count={row.itemCount} /></div><p className="mt-3 border-t pt-3 text-xs text-slate-500">أضافه {row.creator} في {day(row.createdAt)}</p></article>)}{!data.rows.length && <div className="rounded-xl border bg-white p-8 text-center text-sm text-slate-500">{activeFilters ? "لا توجد نتائج مطابقة للفلاتر الحالية." : "لا توجد حركات استلام مسجلة حتى الآن."}</div>}</section>
      <nav className="flex items-center justify-between rounded-xl border bg-white p-3" aria-label="صفحات سجل الاستلام"><button type="button" disabled={data.page <= 1} onClick={() => goPage(data.page - 1)} className="erp-back-tab disabled:opacity-40"><ChevronRight className="size-4" />السابق</button><span className="text-xs font-bold text-slate-600">{data.page} / {data.totalPages}</span><button type="button" disabled={data.page >= data.totalPages} onClick={() => goPage(data.page + 1)} className="erp-back-tab disabled:opacity-40">التالي<ChevronLeft className="size-4" /></button></nav>
    </>}
  </section>;
}

function ReceiptDetailLink({ row, returnTo }: { row: ReceiptRow; returnTo: string }) {
  return <Link href={`/warehouse/receipts/${encodeURIComponent(row.id)}?returnTo=${encodeURIComponent(returnTo)}`} className="inline-flex items-center gap-1 text-xs font-bold text-blue-700 hover:underline"><ExternalLink className="size-3.5" />التفاصيل</Link>;
}
