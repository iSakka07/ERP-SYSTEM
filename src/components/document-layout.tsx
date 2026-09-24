import type { ReactNode } from "react";

export type Movement = { id: string; label: string; date?: string; note?: string; actor?: string };
export function DocumentLayout({ children, movements = [], movementPosition = "side" }: { children: ReactNode; movements?: Movement[]; movementPosition?: "side" | "bottom" }) {
  return <div className={`erp-document-layout ${movementPosition === "bottom" ? "erp-document-layout-bottom" : ""}`} dir="rtl">
    <div className="erp-document-data">{children}</div>
    <aside className="erp-movement-card" aria-label="سجل الحركات">
      <h2>سجل الحركات</h2>
      {!movements.length ? <p className="erp-empty-history">لا توجد حركات بعد</p> : <ol className="erp-history">{movements.map(m => <li key={m.id}>
        <p className="font-bold text-slate-700">{m.label}</p>
        {m.date && <time className="text-[11px] text-slate-500">{new Date(m.date).toLocaleString("ar-EG")}</time>}
        {m.actor && <p className="mt-1 text-xs font-semibold text-slate-600">بواسطة: {m.actor}</p>}
        {m.note && <p className="mt-1 text-xs text-slate-500">{m.note}</p>}
      </li>)}</ol>}
    </aside>
  </div>;
}
