"use client";

import Link from "next/link";
import { Bell, ChevronLeft, LoaderCircle, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type Alert = { type: string; severity: string; title: string; detail: string; href: string; priority: number };

export function AttentionBell() {
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    function dismiss(event: MouseEvent) { if (root.current && !root.current.contains(event.target as Node)) setOpen(false); }
    function escape(event: KeyboardEvent) { if (event.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", dismiss);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", dismiss); document.removeEventListener("keydown", escape); };
  }, [open]);

  async function load() {
    setLoading(true); setError("");
    try {
      const projectId = window.location.pathname === "/" ? new URLSearchParams(window.location.search).get("project") : null;
      setProjectId(projectId);
      const url = projectId ? `/api/attention?project=${encodeURIComponent(projectId)}` : "/api/attention";
      const response = await fetch(url, { cache: "no-store" });
      const data = await response.json().catch(() => null) as { alerts?: Alert[] } | null;
      if (!response.ok || !Array.isArray(data?.alerts)) throw new Error("تعذر تحميل الإجراءات الآن.");
      setAlerts(data.alerts);
    } catch { setError("تعذر تحميل الإجراءات الآن. حاول مرة أخرى."); }
    finally { setLoading(false); }
  }

  return <div ref={root} className="relative">
    <button type="button" onClick={() => { if (!open) void load(); setOpen(!open); }} aria-label="الإجراءات التي تحتاج اهتمامك" aria-expanded={open} aria-haspopup="dialog" className="relative grid size-9 place-items-center rounded-lg text-slate-600 transition hover:bg-slate-100 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"><Bell className="size-4" /><span className="absolute left-1 top-1 size-1.5 rounded-full bg-amber-400 ring-2 ring-white" /></button>
    {open && <section role="dialog" aria-label="الإجراءات التي تحتاج اهتمامك" className="absolute left-0 top-11 z-50 w-[min(25rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white text-right text-slate-900 shadow-xl" dir="rtl">
      <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3"><div><h2 className="text-sm font-black">إجراءات تحتاج اهتمامك</h2><p className="mt-0.5 text-xs text-slate-500">{loading ? "جارٍ التحميل…" : error ? "تعذر عرض الإجراءات" : `${alerts.length} إجراء قائم`}</p></div><button type="button" onClick={() => setOpen(false)} aria-label="إغلاق الإشعارات" className="grid size-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"><X className="size-4" /></button></header>
      <div className="max-h-80 overflow-y-auto">{loading ? <p className="flex items-center justify-center gap-2 p-8 text-sm text-slate-500"><LoaderCircle className="size-4 animate-spin" />جارٍ التحميل…</p> : error ? <div className="p-6 text-center text-sm text-rose-700" role="alert">{error}<button type="button" onClick={() => void load()} className="mt-2 block w-full text-xs font-bold text-blue-700">إعادة المحاولة</button></div> : alerts.length ? alerts.slice(0, 5).map((alert, index) => <Link key={`${alert.type}-${alert.title}-${index}`} href={alert.href} onClick={() => setOpen(false)} className="flex items-start gap-2 border-b border-slate-100 px-4 py-3 transition hover:bg-slate-50"><span className={`mt-1 size-2 shrink-0 rounded-full ${alert.priority === 0 ? "bg-amber-500" : alert.severity === "متأخر" ? "bg-rose-500" : "bg-blue-500"}`} /><span className="min-w-0 flex-1"><b className="block text-xs text-slate-900">{alert.title}</b><small className="mt-1 block truncate text-[11px] text-slate-500">{alert.detail}</small></span><ChevronLeft className="mt-1 size-3.5 shrink-0 text-slate-400" /></Link>) : <p className="p-8 text-center text-sm text-emerald-700">لا توجد إجراءات تحتاج متابعة الآن.</p>}</div>
      <Link href={projectId ? `/attention?project=${encodeURIComponent(projectId)}` : "/attention"} onClick={() => setOpen(false)} className="block border-t border-slate-100 px-4 py-3 text-center text-xs font-bold text-blue-700 transition hover:bg-blue-50">إظهار الكل</Link>
    </section>}
  </div>;
}
