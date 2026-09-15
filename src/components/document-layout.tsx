import type { ReactNode } from "react";

export type Movement = { id: string; label: string; date?: string; note?: string };
export function DocumentLayout({ children, movements = [] }: { children: ReactNode; movements?: Movement[] }) {
  return <div className="erp-document-layout" dir="rtl">
    <div className="erp-document-data">{children}</div>
    <aside className="erp-movement-card" aria-label="سجل الحركات">
      <h2>سجل الحركات</h2>
      {!movements.length ? <p className="erp-empty-history">لا توجد حركات بعد</p> : <ol className="erp-history">{movements.map(m => <li key={m.id}>
        <p className="font-bold text-slate-700">{m.label}</p>
        {m.date && <time className="text-[11px] text-slate-500">{new Date(m.date).toLocaleString("ar-EG")}</time>}
        {m.note && <p className="mt-1 text-xs text-slate-500">{m.note}</p>}
      </li>)}</ol>}
    </aside>
  </div>;
}
