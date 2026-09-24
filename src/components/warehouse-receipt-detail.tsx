"use client";

import Link from "next/link";
import { ArrowRight, FileText, Printer, Warehouse } from "lucide-react";

type ReceiptLine = { id: string; code: string; name: string; unit: string; orderedQuantity: number | null; previouslyReceivedQuantity: number | null; currentQuantity: number; totalReceivedQuantity: number | null; remainingQuantity: number | null; hasPurchaseLineLink: boolean; unitPriceCents?: number; totalCents?: number };
type ReceiptDetails = {
  id: string; number: string; type: string; status: string; movementDate: string; createdAt: string; notes: string | null; recipient: string | null; creator: string; creatorId: string;
  warehouse: { id: string; code: string; name: string; type: string; projectId: string | null } | null;
  sourceWarehouse: { id: string; code: string; name: string; type: string; projectId: string | null } | null;
  project: { id: string; code: string; name: string } | null;
  invoice: { id: string; number: string; name: string; invoiceDate: string; status: string; stockMode: string; project: { id: string; code: string; name: string }; supplier: { id: string; name: string; phone: string | null } | null; itemCount: number } | null;
  itemCount: number; invoiceReceiptState: string; lines: ReceiptLine[]; traceNote: string | null;
  trace: { id: string; number: string; type: string; status: string; movementDate: string; createdAt: string; fromWarehouse: { id: string; name: string } | null; toWarehouse: { id: string; name: string } | null; project: { id: string; code: string; name: string } | null; actor: string; lines: { code: string; name: string; unit: string; quantity: number }[] }[];
  audit: { id: string; action: string; target: string; createdAt: string; actor: string }[];
  maySeeValues: boolean;
};

const currency = (cents: number) => `${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;
const quantity = (value: number | null, unit: string) => value === null ? "غير متاح من بيانات المستند" : `${value.toLocaleString("en-US")} ${unit}`;
const dateTime = (value: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
const actionLabel = (action: string) => action === "purchases.invoice" ? "تسجيل فاتورة مشتريات" : action.replace(/^warehouse\./, "حركة مخزن: ");

export function WarehouseReceiptDetail({ receipt, returnTo }: { receipt: ReceiptDetails; returnTo: string }) {
  const back = returnTo.startsWith("/warehouse?tab=receipts") && !returnTo.startsWith("//") ? returnTo : "/warehouse?tab=receipts";
  const typeLabel = receipt.type === "DIRECT_PROJECT" ? "استلام مباشر للمشروع" : receipt.type === "WAREHOUSE" ? "استلام مخزني" : "استلام آخر";
  const statusLabel = receipt.status === "POSTED" ? "مرحّل" : receipt.status === "REVERSED" ? "معكوس" : receipt.status === "CANCELLED" ? "ملغي" : receipt.status;

  return <div className="receipt-detail-print mx-auto max-w-7xl space-y-5 p-4" dir="rtl">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold text-blue-700">المخزن وحركة الخامات · سجل الاستلام</p><h1 className="mt-1 text-2xl font-black text-slate-950">تفاصيل استلام {receipt.number}</h1><p className="mt-1 text-sm text-slate-500">التاريخ {dateTime(receipt.movementDate)} · {typeLabel}</p></div><div className="flex gap-2"><Link href={back} className="erp-back-tab"><ArrowRight className="size-4" />العودة للسجل</Link><button type="button" onClick={() => window.print()} className="erp-back-tab print:hidden"><Printer className="size-4" />طباعة</button></div></header>

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Info label="حالة حركة الاستلام" value={statusLabel} detail={receipt.invoiceReceiptState} />
      <Info label="المخزن المستلم" value={receipt.warehouse?.name || "غير محدد"} detail={receipt.warehouse?.code || ""} />
      <Info label="المشروع" value={receipt.project?.name || "غير مرتبط بمشروع"} detail={receipt.project?.code || ""} />
      <Info label="عدد البنود" value={`${receipt.itemCount} بند`} detail={receipt.recipient ? `المستلم: ${receipt.recipient}` : ""} />
    </section>

    <section className="grid gap-4 rounded-2xl border bg-white p-4 md:grid-cols-2 xl:grid-cols-4">
      <Info label="فاتورة المشتريات" value={receipt.invoice?.number || "لا توجد فاتورة مرتبطة"} detail={receipt.invoice?.name || ""} />
      <Info label="المورد" value={receipt.invoice?.supplier?.name || "غير محدد"} detail={receipt.invoice?.supplier?.phone || ""} />
      <Info label="أضيف بواسطة" value={receipt.creator} detail={`تاريخ الإنشاء: ${dateTime(receipt.createdAt)}`} />
      <Info label="مرجع أمر الشراء" value="غير متاح" detail="لا يوجد كيان مستقل لأوامر الشراء في النظام الحالي." />
      {receipt.invoice && <Link href={`/purchases?invoiceId=${encodeURIComponent(receipt.invoice.id)}`} className="inline-flex items-center gap-2 text-sm font-bold text-blue-700 hover:underline md:col-span-2"><FileText className="size-4" />فتح فاتورة المشتريات المرتبطة</Link>}
      {receipt.invoice?.status === "REVERSED" && <p className="rounded-lg bg-rose-50 p-3 text-sm font-bold text-rose-800 md:col-span-2">الفاتورة المرتبطة ملغاة؛ حركة الاستلام معروضة كما سُجلت تاريخيًا.</p>}
      <p className="text-xs text-slate-500 md:col-span-2 xl:col-span-4">لا توجد مرحلة اعتماد مستقلة لحركات الاستلام في البيانات الحالية.</p>
    </section>

    <section className="erp-table-shell">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-white p-4"><div><h2 className="font-black">بنود الاستلام</h2><p className="mt-1 text-xs text-slate-500">المستلم سابقًا والإجمالي والمتبقي محسوبة من حركات الاستلام المرتبطة ببند الفاتورة.</p></div>{receipt.maySeeValues && <span className="text-xs text-slate-500">القيم ظاهرة حسب صلاحية الحساب.</span>}</div>
      <div className="erp-table-scroll hidden md:block"><table className="erp-data-table min-w-[1000px]"><thead><tr>{["الكود", "الصنف", "الوحدة", "المطلوب", "المستلم سابقًا", "هذا الاستلام", "الإجمالي بعده", "المتبقي", ...(receipt.maySeeValues ? ["سعر الوحدة", "قيمة السطر"] : [])].map((heading) => <th key={heading}>{heading}</th>)}</tr></thead><tbody>{receipt.lines.map((line) => <tr key={line.id}><td dir="ltr">{line.code}</td><td className="font-bold">{line.name}{!line.hasPurchaseLineLink && <p className="mt-1 text-[10px] font-normal text-amber-700">لا يوجد ربط مباشر ببند فاتورة</p>}</td><td>{line.unit}</td><td>{quantity(line.orderedQuantity, line.unit)}</td><td>{quantity(line.previouslyReceivedQuantity, line.unit)}</td><td className="font-black">{quantity(line.currentQuantity, line.unit)}</td><td>{quantity(line.totalReceivedQuantity, line.unit)}</td><td>{quantity(line.remainingQuantity, line.unit)}</td>{receipt.maySeeValues && <><td>{line.unitPriceCents === undefined ? "—" : currency(line.unitPriceCents)}</td><td>{line.totalCents === undefined ? "—" : currency(line.totalCents)}</td></>}</tr>)}{!receipt.lines.length && <tr><td colSpan={receipt.maySeeValues ? 10 : 8} className="p-10 text-center text-slate-500">لا توجد بنود محفوظة على حركة الاستلام.</td></tr>}</tbody></table></div>
      <div className="space-y-2 p-3 md:hidden">{receipt.lines.map((line) => <article key={line.id} className="rounded-xl border bg-slate-50 p-3"><div className="flex items-start justify-between gap-2"><div><b>{line.name}</b><p className="mt-1 text-[11px] text-slate-500"><span dir="ltr">{line.code}</span> · {line.unit}</p></div><strong className="shrink-0">{quantity(line.currentQuantity, line.unit)}</strong></div>{!line.hasPurchaseLineLink && <p className="mt-2 text-[11px] text-amber-700">لا يوجد ربط مباشر ببند فاتورة</p>}<div className="mt-3 grid grid-cols-2 gap-2 text-xs"><Quantity label="المطلوب" value={line.orderedQuantity} unit={line.unit} /><Quantity label="المستلم سابقًا" value={line.previouslyReceivedQuantity} unit={line.unit} /><Quantity label="إجمالي المستلم" value={line.totalReceivedQuantity} unit={line.unit} /><Quantity label="المتبقي" value={line.remainingQuantity} unit={line.unit} /></div>{receipt.maySeeValues && <p className="mt-3 border-t pt-2 text-xs text-slate-600">سعر الوحدة: {line.unitPriceCents === undefined ? "—" : currency(line.unitPriceCents)} · قيمة السطر: {line.totalCents === undefined ? "—" : currency(line.totalCents)}</p>}</article>)}{!receipt.lines.length && <p className="py-8 text-center text-sm text-slate-500">لا توجد بنود محفوظة على حركة الاستلام.</p>}</div>
      {receipt.lines.some((line) => !line.hasPurchaseLineLink) && <p className="border-t bg-amber-50 p-3 text-xs text-amber-900">بعض الحركات القديمة لا تحتوي على مرجع بند فاتورة؛ لذلك لن نخمن كميتها السابقة أو المتبقية.</p>}
    </section>

    <section className="rounded-2xl border bg-white p-4"><div className="flex items-center gap-2"><Warehouse className="size-5 text-blue-700" /><h2 className="font-black">تتبع حركة المخزون</h2></div><div className="mt-3 rounded-xl border bg-slate-50 p-3 text-sm"><b dir="ltr">{receipt.number}</b><span className="mx-2 text-slate-400">·</span>استلام من المورد إلى {receipt.warehouse?.name || "مخزن غير محدد"}<p className="mt-1 text-xs text-slate-500">{statusLabel} · أنشأها {receipt.creator} في {dateTime(receipt.createdAt)}</p></div>
      {receipt.traceNote && <p className="mt-3 rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-900">{receipt.traceNote}</p>}
      {receipt.trace.map((movement) => <article key={movement.id} className="mt-3 rounded-xl border p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><b dir="ltr">{movement.number}</b><p className="mt-1 text-xs text-slate-500">توريد مرتبط بفاتورة الاستلام · {movement.project?.name || "مشروع غير محدد"}</p></div><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold">{movement.status === "POSTED" ? "مرحّل" : movement.status}</span></div><p className="mt-2 text-xs text-slate-600">{movement.fromWarehouse?.name || "المصدر غير محدد"} ← {movement.toWarehouse?.name || "الوجهة غير محددة"} · نفّذها {movement.actor} · {dateTime(movement.movementDate)}</p><div className="mt-2 flex flex-wrap gap-2">{movement.lines.map((line, index) => <span key={`${movement.id}:${index}`} className="rounded-md bg-slate-50 px-2 py-1 text-xs">{line.name}: {line.quantity} {line.unit}</span>)}</div></article>)}
      {!receipt.trace.length && <p className="mt-3 rounded-lg border border-dashed p-5 text-center text-sm text-slate-500">لا توجد حركة توريد مرتبطة بهذه الفاتورة؛ حركة الاستلام تزيد مخزون الوجهة فقط.</p>}
      {receipt.notes && <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm"><b>ملاحظات الاستلام</b><p className="mt-1 whitespace-pre-wrap text-slate-600">{receipt.notes}</p></div>}
    </section>

    <section className="rounded-2xl border bg-white p-4"><h2 className="font-black">سجل الحركة والتدقيق</h2><p className="mt-1 text-xs text-slate-500">يعرض المستخدم الذي أضاف أو عدّل السجلات المرتبطة، ولا يسمح بتعديل سجل التدقيق.</p>{receipt.audit.length ? <ol className="mt-3 divide-y">{receipt.audit.map((event) => <li key={event.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><span><b>{actionLabel(event.action)}</b><small className="mt-1 block text-xs text-slate-500">{event.actor} · مرجع: {event.target === receipt.id ? receipt.number : event.target}</small></span><time className="text-xs text-slate-500" dir="ltr">{dateTime(event.createdAt)}</time></li>)}</ol> : <p className="mt-3 rounded-lg border border-dashed p-5 text-center text-sm text-slate-500">لا توجد أحداث تدقيق مرتبطة محفوظة لهذه الحركة.</p>}</section>

    <div className="hidden print:block border-t pt-3 text-xs text-slate-500">ASGC ERP · سجل حركة المخزن</div>
  </div>;
}

function Info({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return <div className="min-w-0"><p className="text-xs font-bold text-slate-500">{label}</p><p className="mt-1 break-words font-black text-slate-950">{value}</p>{detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}</div>;
}

function Quantity({ label, value, unit }: { label: string; value: number | null; unit: string }) {
  return <p className="rounded-lg bg-white p-2 text-slate-500">{label}<b className="mt-1 block text-slate-900">{quantity(value, unit)}</b></p>;
}
