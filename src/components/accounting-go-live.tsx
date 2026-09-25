"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Period = { month: string; status: string; closedAt: Date | string | null; reopenReason: string | null };

export function AccountingGoLive({ value, canManage, periods = [] }: { value: string | null; canManage: boolean; periods?: Period[] }) {
  const router = useRouter();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [reopenMonth, setReopenMonth] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const closed = periods.filter((period) => period.status === "CLOSED");
  async function submit(body: Record<string, string>) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/accounting", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) { setMessage(data.error || "تعذر حفظ حالة الفترة."); return; }
      setMessage(body.action === "closePeriod" ? "تم إقفال الفترة ومنع أي قيود جديدة أو عكس داخلها." : "تمت إعادة فتح الفترة مع حفظ سبب الإجراء.");
      setReopenMonth(""); setReason(""); router.refresh();
    } finally { setBusy(false); }
  }
  return <details className={`rounded-xl border px-4 py-2.5 text-xs ${value ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-blue-200 bg-blue-50 text-blue-950"}`}><summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-bold focus-visible:outline-2 focus-visible:outline-blue-600"><span>{value ? `المحاسبة مفعّلة من ${value}` : "الترحيل الآلي نشط مع الاعتماد والصرف"}</span><span className="shrink-0 text-blue-700 underline underline-offset-2">تفاصيل التشغيل</span></summary><p className="mt-2 border-t border-current/15 pt-2 leading-6">{value ? "المستندات السابقة لتاريخ التشغيل لا تُرحّل تلقائيًا؛ تُعالج عند البدء بالأرصدة الافتتاحية." : "عند إطلاق النظام رسميًا نحدد تاريخ تشغيل وأرصدة افتتاحية، ثم نستخدم استيرادًا جماعيًا منفصلًا للبيانات التاريخية."}</p>{canManage && <div className="mt-3 border-t border-current/15 pt-3"><p className="font-black">إقفال الفترة المحاسبية</p><p className="mt-1 text-slate-600">الإقفال يمنع الترحيل والعكس بتاريخ هذا الشهر. أعد فتحه فقط بسبب موثق.</p><div className="mt-2 flex flex-wrap items-end gap-2"><label className="grid gap-1 font-bold">الشهر<input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="erp-control h-9" /></label><button type="button" disabled={busy || !month} onClick={() => void submit({ action: "closePeriod", month })} className="h-9 rounded-lg bg-slate-900 px-3 font-bold text-white disabled:opacity-50">إقفال الشهر</button></div>{closed.length > 0 && <div className="mt-3 space-y-2"><p className="font-bold">فترات مقفلة</p>{closed.map((period) => <div key={period.month} className="flex flex-wrap items-center gap-2 rounded-lg bg-white/70 p-2"><span className="font-bold">{period.month}</span>{reopenMonth === period.month ? <><input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="سبب إعادة الفتح" className="erp-control h-8 min-w-48 flex-1" /><button type="button" disabled={busy || reason.trim().length < 3} onClick={() => void submit({ action: "reopenPeriod", month: period.month, reason: reason.trim() })} className="h-8 rounded-lg border border-amber-300 bg-amber-50 px-3 font-bold text-amber-800 disabled:opacity-50">تأكيد الفتح</button><button type="button" onClick={() => { setReopenMonth(""); setReason(""); }} className="h-8 px-2 text-slate-600">إلغاء</button></> : <button type="button" onClick={() => setReopenMonth(period.month)} className="h-8 rounded-lg border border-slate-300 bg-white px-3 font-bold text-slate-700">إعادة فتح بسبب</button>}</div>)}</div>}{message && <p role="status" className="mt-3 rounded-lg bg-white/70 p-2 font-bold">{message}</p>}</div>}</details>;
}
