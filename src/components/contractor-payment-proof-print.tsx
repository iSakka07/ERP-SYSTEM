"use client";

import { ReceiptText, X } from "lucide-react";
import { useState } from "react";
import { createContractorPaymentProofUrl } from "@/components/contractor-payment-proof-pdf";
import type { ExpenseAccount, ExpenseAttachmentInfo } from "@/lib/expense-types";

export function ContractorPaymentProofPrint({ account, attachments }: { account: ExpenseAccount; attachments: ExpenseAttachmentInfo[] }) {
  const [open, setOpen] = useState(false); const [includeDeductions, setIncludeDeductions] = useState(true); const [working, setWorking] = useState(false);
  const paymentCount = account.statements.reduce((sum, statement) => sum + statement.payments.filter((payment) => payment.status !== "REVERSED").length, 0);
  async function print() {
    setWorking(true); const preview = window.open("", "_blank");
    if (!preview) { window.alert("اسمح بالنوافذ المنبثقة لفتح معاينة PDF."); setWorking(false); return; }
    preview.opener = null; preview.document.write("<title>جاري تجهيز كشف إثباتات الصرف</title><body style='font-family:Arial,sans-serif;padding:32px;color:#10192d'>جاري تجهيز كشف إثباتات الصرف…</body>"); preview.document.close();
    try { const url = await createContractorPaymentProofUrl(account, attachments, includeDeductions); preview.location.href = url; window.setTimeout(() => URL.revokeObjectURL(url), 120_000); setOpen(false); }
    catch (error) { console.error(error); preview.close(); window.alert("تعذّر تجهيز ملف PDF. حاول مرة أخرى."); }
    finally { setWorking(false); }
  }
  return <>
    <button type="button" onClick={() => setOpen(true)} className="inline-flex h-9 items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-bold text-emerald-800 transition hover:bg-emerald-100"><ReceiptText className="size-4" />كشف إثباتات الصرف</button>
    {open && <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/45 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !working) setOpen(false); }}><section role="dialog" aria-modal="true" className="w-full max-w-md rounded-2xl bg-white p-5 text-right shadow-2xl" dir="rtl"><header className="flex items-start justify-between gap-3"><div><h2 className="text-base font-black text-slate-950">كشف إثباتات صرف المقاول</h2><p className="mt-1 text-xs leading-5 text-slate-500">{paymentCount} دفعة مرتبة بالتاريخ؛ بعد كل دفعة تُضاف صفحات إثبات الصرف المرفق بها.</p></div><button type="button" disabled={working} onClick={() => setOpen(false)} aria-label="إغلاق" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="size-4" /></button></header><label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm"><input type="checkbox" checked={includeDeductions} onChange={(event) => setIncludeDeductions(event.target.checked)} className="mt-0.5 size-4 accent-blue-700"/><span><b className="block text-slate-800">إظهار خصم الـ5% وباقي الاستقطاعات</b><span className="mt-1 block text-xs leading-5 text-slate-500">عند إخفائها، يبقى صافي المستحق وقيمة الصرف والمتبقي ظاهرين فقط.</span></span></label><footer className="mt-5 flex justify-end gap-2"><button type="button" disabled={working} onClick={() => setOpen(false)} className="erp-back-tab">إلغاء</button><button type="button" disabled={working || !paymentCount} onClick={() => void print()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-700 px-4 text-sm font-bold text-white disabled:opacity-50"><ReceiptText className="size-4" />{working ? "جارٍ التجهيز…" : "تجهيز PDF"}</button></footer></section></div>}
  </>;
}
