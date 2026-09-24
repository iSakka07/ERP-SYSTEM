"use client";

import { useMemo, useState } from "react";
import { Download, Paperclip, Search } from "lucide-react";

export type AttachmentRow = { id: string; name: string; size: number; date: string; module: string; record: string; href: string };

function readableSize(size: number) {
  return size >= 1024 * 1024 ? (size / (1024 * 1024)).toFixed(2) + " ميجابايت" : (size / 1024).toFixed(0) + " كيلوبايت";
}

export function AttachmentsDirectory({ rows }: { rows: AttachmentRow[] }) {
  const [module, setModule] = useState(""); const [search, setSearch] = useState(""); const [page, setPage] = useState(1);
  const modules = useMemo(() => [...new Set(rows.map((row) => row.module))], [rows]);
  const filtered = rows.filter((row) => (!module || row.module === module) && (row.name + " " + row.record).toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visibleRows = filtered.slice((page - 1) * pageSize, page * pageSize);
  const totalBytes = rows.reduce((sum, row) => sum + row.size, 0);
  const moduleTotals = modules.map((name) => ({ name, count: rows.filter((row) => row.module === name).length, size: rows.filter((row) => row.module === name).reduce((sum, row) => sum + row.size, 0) })).sort((a, b) => b.size - a.size);
  return <div className="space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold text-blue-700">إدارة الملفات</p><h1 className="mt-1 text-2xl font-black">المرفقات</h1><p className="mt-1 text-sm text-slate-500">ملفات السجلات التي يحق لحسابك الاطلاع عليها.</p></div></header>
    <section className="grid gap-3 sm:grid-cols-2"><article className="rounded-xl border border-blue-200 bg-blue-50 p-4"><p className="text-xs font-bold text-blue-800">عدد الملفات</p><b className="mt-2 block text-2xl text-blue-900">{rows.length}</b></article><article className="rounded-xl border border-violet-200 bg-violet-50 p-4"><p className="text-xs font-bold text-violet-800">الحجم الإجمالي للملفات</p><b className="mt-2 block text-2xl text-violet-900">{readableSize(totalBytes)}</b></article></section>
    <section className="grid gap-4 lg:grid-cols-2"><article className="rounded-xl border bg-white p-4"><h2 className="font-black">المساحة حسب القسم</h2><div className="mt-3 grid gap-2">{moduleTotals.map((item) => <div key={item.name} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 p-3 text-sm"><span className="font-bold">{item.name}<small className="mt-1 block text-xs font-normal text-slate-500">{item.count} ملف</small></span><b className="text-violet-800">{readableSize(item.size)}</b></div>)}</div>{!rows.length && <p className="mt-3 text-sm text-slate-500">لا توجد مرفقات متاحة لحسابك حتى الآن.</p>}</article><article className="rounded-xl border bg-white p-4"><h2 className="font-black">أكبر الملفات حجمًا</h2><div className="mt-3 divide-y">{[...rows].sort((a,b)=>b.size-a.size).slice(0,5).map((row)=><div key={row.module+row.id} className="flex items-center justify-between gap-3 py-2.5 text-sm"><span className="min-w-0"><b className="block truncate">{row.name}</b><small className="block truncate text-xs text-slate-500">{row.module} · {row.record}</small></span><b className="shrink-0 text-violet-800">{readableSize(row.size)}</b></div>)}{!rows.length&&<p className="py-3 text-sm text-slate-500">لا توجد ملفات لعرضها.</p>}</div></article></section>
    <section className="overflow-hidden rounded-xl border bg-white"><div className="flex flex-wrap gap-2 border-b p-4"><label className="relative min-w-56 flex-1"><Search className="absolute right-3 top-3 size-4 text-slate-400"/><input value={search} onChange={(event)=>{setSearch(event.target.value);setPage(1);}} placeholder="ابحث باسم الملف أو السجل" className="erp-control w-full pr-9"/></label><select value={module} onChange={(event)=>{setModule(event.target.value);setPage(1);}} className="erp-control min-w-44"><option value="">كل الأقسام</option>{modules.map((name)=><option key={name}>{name}</option>)}</select></div>
      <div className="divide-y">{visibleRows.map((row)=><article key={row.module+row.id} className="flex flex-wrap items-center gap-3 p-4"><Paperclip className="size-4 shrink-0 text-blue-700"/><div className="min-w-0 flex-1"><b className="block truncate text-sm">{row.name}</b><p className="mt-1 truncate text-xs text-slate-500">{row.module} · {row.record}</p></div><span className="text-xs text-slate-500">{readableSize(row.size)}</span><time className="text-xs text-slate-500">{row.date}</time><a href={row.href} className="inline-flex items-center gap-1 rounded-lg border border-blue-200 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-50"><Download className="size-3.5"/>فتح الملف</a></article>)}{!filtered.length&&<p className="p-8 text-center text-sm text-slate-500">لا توجد ملفات مطابقة.</p>}</div>
      {filtered.length > 0 && <footer className="flex flex-wrap items-center justify-between gap-3 border-t bg-slate-50 px-4 py-3"><span className="text-xs text-slate-500">عرض {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)} من {filtered.length} مرفق</span><div className="flex items-center gap-2"><button type="button" disabled={page === 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className="rounded-lg border bg-white px-3 py-2 text-xs font-bold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40">السابق</button><span className="min-w-16 text-center text-xs font-bold text-slate-600">{page} / {pageCount}</span><button type="button" disabled={page >= pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))} className="rounded-lg border bg-white px-3 py-2 text-xs font-bold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40">التالي</button></div></footer>}
    </section>
  </div>;
}
