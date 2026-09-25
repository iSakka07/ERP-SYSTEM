"use client";

import { FileDown, X } from "lucide-react";
import { useState } from "react";
import { previewDataPdf } from "@/components/pdf-data-export";
import { contractorStatementInvoiceReport } from "@/components/expenses-pdf-report";
import type { ExpenseAccount, ExpenseStatement } from "@/lib/expense-types";

export function ContractorStatementPrint({ account, statement }: { account: ExpenseAccount; statement: ExpenseStatement }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);

  function toggle(index: number) { setSelected((current) => current.includes(index) ? current.filter((item) => item !== index) : [...current, index]); }
  function createPdf() {
    setOpen(false);
    void previewDataPdf(contractorStatementInvoiceReport(account, statement, selected));
  }

  return <>
    <button type="button" onClick={() => { setSelected(statement.deductions.map((_, index) => index)); setOpen(true); }} className="inline-flex h-9 items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 text-xs font-bold text-blue-800 transition hover:bg-blue-100"><FileDown className="size-4" />طباعة مستخلص المقاول</button>
    {open && <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/45 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="contractor-statement-print-title" className="w-full max-w-lg rounded-2xl bg-white p-5 text-right shadow-2xl" dir="rtl">
        <header className="flex items-start justify-between gap-3"><div><h2 id="contractor-statement-print-title" className="text-base font-black text-slate-950">طباعة مستخلص المقاول</h2><p className="mt-1 text-xs text-slate-500">سيُفتح ملف PDF بحجم A4 قابل للطباعة أو الحفظ.</p></div><button type="button" onClick={() => setOpen(false)} aria-label="إغلاق" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="size-4" /></button></header>
        <div className="mt-5 rounded-xl border border-slate-200 p-3"><div className="flex items-center justify-between gap-3"><b className="text-sm text-slate-900">إظهار الخصومات والتأمينات</b><label className="inline-flex items-center gap-2 text-xs font-bold text-blue-700"><input type="checkbox" checked={selected.length === statement.deductions.length && statement.deductions.length > 0} onChange={(event) => setSelected(event.target.checked ? statement.deductions.map((_, index) => index) : [])} />تحديد الكل</label></div>{statement.deductions.length ? <div className="mt-3 divide-y divide-slate-100 border-t border-slate-100">{statement.deductions.map((deduction, index) => <label key={`${deduction.name}-${index}`} className="flex cursor-pointer items-center justify-between gap-3 py-2.5 text-xs"><span className="flex items-center gap-2"><input type="checkbox" checked={selected.includes(index)} onChange={() => toggle(index)} /><b>{deduction.name}</b>{deduction.kind === "PERCENT" && <span className="text-slate-500">{deduction.value}%</span>}</span><span className="font-bold text-slate-700" dir="ltr">{(deduction.amountCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م</span></label>)}</div> : <p className="mt-3 text-xs text-slate-500">لا توجد خصومات أو تأمينات لهذا المستخلص.</p>}</div>
        <footer className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setOpen(false)} className="erp-back-tab">إلغاء</button><button type="button" onClick={createPdf} className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-700 px-4 text-sm font-bold text-white"><FileDown className="size-4" />تجهيز PDF</button></footer>
      </section>
    </div>}
  </>;
}
