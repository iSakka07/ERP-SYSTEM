"use client";

import Link from "next/link";
import { useState } from "react";
import { BanknoteArrowUp, Building2, FileSpreadsheet, LayoutDashboard, LockKeyhole, Menu, Paperclip, ReceiptText, Settings2, ShoppingCart, UsersRound, Vault, X } from "lucide-react";

const navItems = [
  { label: "الرئيسية", icon: LayoutDashboard, href: "/", active: true },
  { label: "المشروعات", icon: Building2, href: "/#modules" },
  { label: "الوارد", icon: BanknoteArrowUp, href: "/#modules" },
  { label: "مستخلصات المقاولين", icon: FileSpreadsheet, href: "/#modules" },
  { label: "المشتريات", icon: ShoppingCart, href: "/#modules" },
  { label: "النثريات", icon: ReceiptText, href: "/#modules" },
  { label: "المرتبات", icon: UsersRound, href: "/#modules" },
  { label: "الخزنة", icon: Vault, href: "/#modules" },
  { label: "المرفقات", icon: Paperclip, href: "/#modules" },
  { label: "الإدارة", icon: Settings2, href: "/#modules" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen">
      <header className="fixed inset-x-0 top-0 z-40 h-16 border-b border-white/10 bg-[#10192d] text-white shadow-sm">
        <div className="flex h-full items-center justify-between px-4 lg:pr-[294px] lg:pl-6">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setOpen(true)} className="grid size-10 place-items-center rounded-lg text-slate-200 hover:bg-white/10 lg:hidden" aria-label="فتح القائمة"><Menu className="size-5" /></button>
            <div><p className="text-sm font-bold">لوحة الإدارة</p><p className="text-[10px] text-slate-400">Phase 0 · Setup</p></div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-left sm:block"><p className="text-xs font-bold">مدير النظام</p><p className="text-[10px] text-slate-400">نسخة تجريبية</p></div>
            <span className="grid size-9 place-items-center rounded-full bg-blue-600 text-xs font-extrabold ring-2 ring-white/15">م</span>
          </div>
        </div>
      </header>
      {open && <button className="fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-[1px] lg:hidden" aria-label="إغلاق القائمة" onClick={() => setOpen(false)} />}
      <aside className={`fixed inset-y-0 right-0 z-50 w-[270px] border-l border-white/10 bg-[#10192d] text-white transition-transform duration-200 lg:translate-x-0 ${open ? "translate-x-0" : "translate-x-full"}`}>
        <div className="flex h-16 items-center justify-between border-b border-white/10 px-5">
          <Link href="/" className="flex items-center gap-3" onClick={() => setOpen(false)}>
            <span className="grid size-10 place-items-center rounded-xl bg-blue-600 shadow-lg shadow-blue-950/30"><Building2 className="size-5" /></span>
            <div><p className="text-sm font-extrabold tracking-wide">ERP-SYSTEM V1</p><p className="text-[10px] text-slate-400">إدارة شركة المقاولات</p></div>
          </Link>
          <button type="button" onClick={() => setOpen(false)} className="grid size-8 place-items-center rounded-md text-slate-400 hover:bg-white/10 lg:hidden" aria-label="إغلاق القائمة"><X className="size-4" /></button>
        </div>
        <nav className="space-y-1 overflow-y-auto px-3 py-5">
          <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-widest text-slate-500">التنقل الرئيسي</p>
          {navItems.map((item) => {
            const Icon = item.icon;
            return <Link key={item.label} href={item.href} onClick={() => setOpen(false)} className={`flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-semibold transition ${item.active ? "bg-blue-600 text-white shadow-md shadow-blue-950/20" : "text-slate-300 hover:bg-white/7 hover:text-white"}`}><Icon className="size-4.5" /><span className="flex-1">{item.label}</span>{!item.active && <span className="rounded bg-white/6 px-1.5 py-0.5 text-[9px] text-slate-500">قريبًا</span>}</Link>;
          })}
        </nav>
        <div className="absolute inset-x-3 bottom-4 rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-200"><LockKeyhole className="size-3.5 text-blue-400" />تسجيل الدخول في Phase 1</div>
          <p className="mt-1 text-[10px] leading-5 text-slate-500">الهيكل الحالي مخصص لمراجعة الشكل والتأسيس.</p>
        </div>
      </aside>
      <main className="min-h-screen pt-16 lg:pr-[270px]"><div className="mx-auto max-w-[1500px] p-4 sm:p-6 lg:p-8">{children}</div></main>
    </div>
  );
}
