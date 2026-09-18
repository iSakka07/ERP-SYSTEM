"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PlayCircle } from "lucide-react";

export function AccountingGoLive({ value, canManage }: { value: string | null; canManage: boolean }) {
  const router = useRouter();
  const [date, setDate] = useState(value || "");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  if (value) return <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">المحاسبة مفعّلة من {value}. لا تُرحّل المستندات السابقة تلقائيًا؛ تُعالج عند البدء بالأرصدة الافتتاحية.</div>;
  if (!canManage) return <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">المحاسبة غير مفعّلة بعد. يحدد المحاسب أو المدير التنفيذي تاريخ البدء النهائي.</div>;
  return <form className="flex flex-wrap items-end gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4" onSubmit={async (event) => { event.preventDefault(); setSaving(true); setMessage(""); const response = await fetch("/api/accounting", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ goLiveDate: date }) }); const body = await response.json(); setSaving(false); if (!response.ok) return setMessage(body.error || "تعذر الحفظ."); router.refresh(); }}><label className="grid gap-1 text-sm font-bold text-slate-800">تاريخ بدء المحاسبة<input required type="date" value={date} onChange={(event) => setDate(event.target.value)} className="h-10 rounded-lg border border-slate-300 bg-white px-3" /></label><button disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-700 px-4 text-sm font-bold text-white disabled:opacity-60"><PlayCircle size={17} />{saving ? "جارٍ التفعيل..." : "تفعيل الترحيل من هذا التاريخ"}</button><p className="max-w-xl text-xs leading-5 text-slate-600">سيبدأ الترحيل الآلي للمستندات الجديدة من هذا التاريخ فقط. لا تعيّنه إلا عندما تعتمد الأرصدة الافتتاحية.</p>{message && <p className="w-full text-sm font-bold text-red-600">{message}</p>}</form>;
}
