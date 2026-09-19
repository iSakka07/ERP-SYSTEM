"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

type Period = { month: string; status: string; closedAt: string | Date | null; reopenReason: string | null };

export function AccountingPeriods({ periods, canManage }: { periods: Period[]; canManage: boolean }) {
  const router = useRouter(); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setError(""); try { const response = await fetch("/api/accounting", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "period", month: form.get("month"), status: form.get("status"), reason: form.get("reason") }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error || "تعذر تحديث الفترة."); router.refresh(); } catch (reason) { setError(reason instanceof Error ? reason.message : "تعذر تحديث الفترة."); } finally { setBusy(false); } }
  return <section className="rounded-2xl border bg-white p-5"><h2 className="font-black">الفترات المحاسبية</h2><p className="mt-1 text-xs text-slate-500">الفترة المقفلة تمنع إنشاء قيد أو عكس بتاريخها. إعادة الفتح تحتاج سببًا موثقًا.</p>{canManage && <form onSubmit={submit} className="mt-4 grid gap-3 md:grid-cols-4"><input name="month" type="month" required className="erp-control" /><select name="status" className="erp-control" defaultValue="CLOSED"><option value="CLOSED">إقفال الفترة</option><option value="OPEN">إعادة فتح الفترة</option></select><input name="reason" required placeholder="سبب الإقفال أو إعادة الفتح" className="erp-control" /><button disabled={busy} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white">{busy ? "جارٍ الحفظ…" : "تأكيد"}</button></form>}{error && <p role="alert" className="mt-3 text-sm font-bold text-rose-700">{error}</p>}<div className="mt-4 space-y-2">{periods.map((period) => <div key={period.month} className="flex justify-between rounded-lg border px-3 py-2 text-sm"><b dir="ltr">{period.month}</b><span className={period.status === "CLOSED" ? "font-bold text-rose-700" : "font-bold text-emerald-700"}>{period.status === "CLOSED" ? "مقفلة" : "مفتوحة"}</span></div>)}</div></section>;
}
