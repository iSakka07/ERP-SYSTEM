import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export function KpiCard({ label, value, icon: Icon, tone = "blue", hint }: { label: string; value: string; icon: LucideIcon; tone?: "blue" | "emerald" | "amber" | "violet" | "rose"; hint?: string }) {
  return <article className={`erp-kpi-card erp-kpi-${tone}`}><div className="erp-kpi-icon"><Icon className="size-5" /></div><p className="erp-kpi-label">{label}</p><strong className="erp-kpi-value" dir="ltr">{value}</strong>{hint && <p className="erp-kpi-hint">{hint}</p>}</article>;
}

export function MoneyValue({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`erp-money-value ${className}`} dir="ltr">{children}</span>;
}

export function IconAction({ label, icon: Icon, tone = "default", className = "", ...props }: { label: string; icon: LucideIcon; tone?: "default" | "danger" | "success"; className?: string } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">) {
  return <button type="button" aria-label={label} title={label} className={`erp-icon-action erp-icon-action-${tone} ${className}`} {...props}><Icon className="size-4" /><span className="sr-only">{label}</span></button>;
}

export function DataTable({ headers, children, empty }: { headers: string[]; children: ReactNode; empty?: ReactNode }) {
  return <div className="erp-table-shell"><div className="erp-table-scroll"><table className="erp-data-table erp-responsive-table"><thead><tr>{headers.map(header => <th key={header}>{header}</th>)}</tr></thead><tbody>{children || <tr><td colSpan={headers.length} className="py-12 text-center text-slate-400">{empty || "لا توجد بيانات."}</td></tr>}</tbody></table></div></div>;
}
