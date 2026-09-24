"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, LoaderCircle, PackagePlus, Search, X } from "lucide-react";

export type InventoryItemOption = {
  id: string;
  name: string;
  unit: string;
  category?: string | null;
  minimumQuantity?: number;
};

type Props = {
  value: InventoryItemOption | null;
  onSelect: (item: InventoryItemOption) => void;
  label?: string;
  disabled?: boolean;
  defaultName?: string;
  defaultUnit?: string;
};

export function InventoryItemPicker({ value, onSelect, label = "الصنف المخزني", disabled = false, defaultName = "", defaultUnit = "وحدة" }: Props) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<InventoryItemOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [candidates, setCandidates] = useState<InventoryItemOption[]>([]);
  const [newName, setNewName] = useState("");
  const [newUnit, setNewUnit] = useState("وحدة");
  const [category, setCategory] = useState("");

  useEffect(() => {
    if (!open || creating) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/inventory-items?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "تعذر تحميل الأصناف.");
        setItems(body.items || []);
      } catch (reason) {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "تعذر تحميل الأصناف.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, query ? 180 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [open, creating, query]);

  function choose(item: InventoryItemOption) {
    onSelect(item);
    setOpen(false);
    setCreating(false);
    setError("");
    setCandidates([]);
  }

  async function createItem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setCandidates([]);
    try {
      const response = await fetch("/api/inventory-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName, unit: newUnit, category: category || undefined, minimumQuantity: 0 }),
      });
      const body = await response.json();
      if (response.status === 409 && body.code === "SIMILAR_ITEM_EXISTS") {
        setCandidates(body.candidates || []);
        setError(body.error || "اختر الصنف الموجود أو غيّر الاسم.");
        return;
      }
      if (!response.ok) throw new Error(body.error || "تعذر حفظ الصنف.");
      choose(body.item);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر حفظ الصنف.");
    } finally {
      setSaving(false);
    }
  }

  return <>
    <button type="button" disabled={disabled} aria-label={`اختيار ${label}`} onClick={() => { setOpen(true); setCreating(false); setQuery(""); setNewName(defaultName); setNewUnit(defaultUnit); setError(""); setCandidates([]); }} className="erp-control flex w-full items-center justify-between gap-3 text-right disabled:opacity-60">
      <span className={value ? "truncate font-bold text-slate-900" : "text-slate-500"}>{value ? `${value.name} (${value.unit})` : `اختر ${label}`}</span>
      <ChevronDown className="size-4 shrink-0 text-slate-500" />
    </button>
    {open && createPortal(<div className="fixed inset-0 z-[80] flex justify-end bg-slate-950/40" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <aside role="dialog" aria-modal="true" aria-labelledby="inventory-picker-title" className="flex h-full w-full max-w-lg flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b p-4">
          <div><h2 id="inventory-picker-title" className="font-black">{creating ? "إضافة صنف جديد" : "اختيار الصنف"}</h2><p className="mt-1 text-xs text-slate-500">اختر صنفًا موجودًا أو أضف صنفًا جديدًا.</p></div>
          <button type="button" aria-label="إغلاق" onClick={() => setOpen(false)} className="rounded-lg border p-2 text-slate-600 hover:bg-slate-50"><X className="size-4" /></button>
        </div>
        {!creating ? <>
          <label className="mx-4 mt-4 flex items-center gap-2 rounded-lg border bg-slate-50 px-3"><Search className="size-4 shrink-0 text-slate-500" /><span className="sr-only">ابحث عن صنف</span><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} className="w-full bg-transparent py-3 text-sm outline-none" placeholder="ابحث بالاسم، مثل: أسمنت" /></label>
          <button type="button" onClick={() => { setCreating(true); setNewName(query || defaultName); setNewUnit(defaultUnit); setError(""); setCandidates([]); }} className="mx-4 mt-3 flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-right text-sm font-bold text-blue-800 hover:bg-blue-100"><PackagePlus className="size-5" /><span>＋ صنف جديد</span></button>
          <div className="flex-1 overflow-y-auto p-4" aria-live="polite">
            {loading ? <p className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500"><LoaderCircle className="size-4 animate-spin" />جارٍ البحث…</p> : error ? <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : items.length ? <ul className="divide-y rounded-xl border">{items.map((item) => <li key={item.id}><button type="button" onClick={() => choose(item)} className="flex w-full items-center justify-between gap-3 p-3 text-right hover:bg-blue-50"><span><b className="block">{item.name}</b><small className="text-slate-500">{item.unit}{item.category ? ` · ${item.category}` : ""}</small></span>{value?.id === item.id && <Check className="size-4 text-emerald-700" />}</button></li>)}</ul> : <p className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">{query ? "لا توجد أصناف مطابقة. يمكنك إضافته كصنف جديد." : "لا توجد أصناف مخزنية مسجلة بعد."}</p>}
          </div>
        </> : <form onSubmit={createItem} className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
          <label className="grid gap-1 text-xs font-bold">اسم الصنف *<input autoFocus required minLength={2} maxLength={200} value={newName} onChange={(event) => setNewName(event.target.value)} className="erp-control" placeholder="مثال: أسمنت أسود" /></label>
          <label className="grid gap-1 text-xs font-bold">الوحدة *<input required maxLength={50} value={newUnit} onChange={(event) => setNewUnit(event.target.value)} className="erp-control" placeholder="طن، كيس، قطعة…" /></label>
          <label className="grid gap-1 text-xs font-bold">التصنيف (اختياري)<input maxLength={100} value={category} onChange={(event) => setCategory(event.target.value)} className="erp-control" placeholder="مواد بناء / مواد نقاشة / مواد صرف صحي" /></label>
          {error && <div role="alert" className="space-y-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><p>{error}</p>{candidates.map((item) => <button type="button" key={item.id} onClick={() => choose(item)} className="block w-full rounded-lg border bg-white p-2 text-right font-bold hover:bg-amber-100">استخدم الموجود: {item.name} ({item.unit})</button>)}</div>}
          <div className="mt-auto flex flex-wrap gap-2 border-t pt-4"><button type="submit" disabled={saving} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-60">{saving ? "جارٍ الحفظ…" : "حفظ واختيار الصنف"}</button><button type="button" onClick={() => { setCreating(false); setError(""); setCandidates([]); }} className="rounded-lg border px-4 py-2 text-sm">رجوع للبحث</button></div>
        </form>}
      </aside>
    </div>, document.body)}
  </>;
}
