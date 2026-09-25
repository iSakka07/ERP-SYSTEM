"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { BanknoteArrowUp, Bell, BookOpenCheck, Boxes, Building2, ChartNoAxesCombined, ChevronDown, FileSpreadsheet, Landmark, LayoutDashboard, Menu, Paperclip, Settings2, ShoppingCart, UsersRound, Vault, X } from "lucide-react";
import { LogoutButton } from "@/components/logout-button";
import { can } from "@/lib/permissions";
import { companyBrand } from "@/lib/company-brand";
import { PdfExportButton } from "@/components/pdf-export-button";
import { AccountMenu } from "@/components/account-menu";

const homeNavItem = { label: "الرئيسية", icon: LayoutDashboard, href: "/", permission: "dashboard.view" };
const navGroups = [
  { title: "العقود والتوريد", items: [
    { label: "الوارد", icon: BanknoteArrowUp, href: "/incoming", permission: "incoming.view" },
    { label: "مستخلصات المقاولين", icon: FileSpreadsheet, href: "/expenses", permission: "expenses.view" },
    { label: "المشتريات", icon: ShoppingCart, href: "/purchases", permission: "purchases.view" },
    { label: "المخزن", icon: Boxes, href: "/warehouse", permission: "warehouse.view" },
    { label: "موقف تكلفة المشروع", icon: ChartNoAxesCombined, href: "/project-cost-control", permission: "project_cost_control.view" },
  ] },
  { title: "المالية", items: [
    { label: "صندوق النثريات", icon: Vault, href: "/petty-cash", permission: "pettycash.view" },
    { label: "البنك", icon: Landmark, href: "/bank", permission: "bank.view" },
    { label: "المحاسبة", icon: BookOpenCheck, href: "/accounting", permission: "accounting.view" },
  ] },
  { title: "الإدارة", items: [
    { label: "الإدارة والمشروعات", icon: Building2, href: "/management", permission: "masterdata.view" },
    { label: "المرتبات", icon: UsersRound, href: "/salaries", permission: "salaries.view" },
    { label: "المرفقات", icon: Paperclip, href: "/attachments", permission: "attachments.view" },
    { label: "إدارة الحسابات", icon: Settings2, href: "/admin/accounts", permission: "accounts.manage" },
  ] },
];

export function AppShell({ children, user }: { children: React.ReactNode; user: { name?: string | null; email?: string | null; roleKey: string; roleName: string; permissions: string[]; hasAvatar: boolean } }) {
  const [open, setOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const pathname = usePathname();
  const projectScopedEngineer = user.roleKey === "technical_office_engineer" || user.roleKey === "site_supervisor_engineer";
  const canAttachments = user.permissions.some((permission) =>
    ["incoming.view", "expenses.view", "purchases.view", "pettycash.view", "bank.view", "salaries.view"].includes(permission)
    && !(projectScopedEngineer && ["pettycash.view", "bank.view", "salaries.view"].includes(permission)),
  );
  const globalFinancialPermissions = new Set(["accounting.view", "accounting.manage", "bank.view", "bank.manage", "pettycash.view", "pettycash.manage", "salaries.view", "salaries.manage"]);
  const canAccessNav = (item: (typeof navGroups)[number]["items"][number]) =>
    (item.href === "/attachments" ? canAttachments : can(user, item.permission))
    && (item.href === "/attachments" || !projectScopedEngineer || !globalFinancialPermissions.has(item.permission))
    && (item.href !== "/admin/accounts" || user.roleKey === "admin");
  const initial = (user.name || "م").trim().slice(0, 1);
  return (
    <div className="min-h-screen">
      <header className="fixed inset-x-0 top-0 z-40 h-16 border-b border-white/10 bg-[#10192d] text-white shadow-sm">
        <div className="flex h-full items-center justify-between px-4 lg:pr-[294px] lg:pl-6">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setOpen(true)} className="grid size-10 place-items-center rounded-lg text-slate-200 transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-blue-300 lg:hidden" aria-label="فتح القائمة"><Menu className="size-5" /></button>
            <Link href="/" className="hidden items-center gap-2 text-sm font-bold text-slate-200 transition hover:text-white sm:flex"><span className="size-1.5 rounded-full bg-blue-400" />{pathname === "/" ? "لوحة التحكم" : "ASGC ERP"}</Link>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {pathname !== "/" && <div className="hidden md:block"><PdfExportButton /></div>}
            <Link href="/?attention=all" aria-label="الإجراءات التي تحتاج اهتمامك" className="relative grid size-9 place-items-center rounded-lg text-slate-300 transition hover:bg-white/10 hover:text-white"><Bell className="size-4" /><span className="absolute left-1 top-1 size-1.5 rounded-full bg-amber-400 ring-2 ring-[#10192d]" /></Link>
            <div data-export-user className="hidden text-left sm:block"><p className="text-xs font-bold">{user.name}</p><p className="text-[10px] text-slate-400">{user.email}</p></div>
            <AccountMenu name={user.name ?? "مستخدم النظام"} email={user.email ?? ""} hasAvatar={user.hasAvatar} />
          </div>
        </div>
      </header>
      {open && <button className="fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-[1px] lg:hidden" aria-label="إغلاق القائمة" onClick={() => setOpen(false)} />}
      <aside className={`fixed inset-y-0 right-0 z-50 flex w-[270px] flex-col border-l border-white/10 bg-[#10192d] text-white shadow-2xl transition-transform duration-300 ease-out lg:translate-x-0 lg:shadow-none ${open ? "translate-x-0" : "translate-x-full"}`}>
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 px-4">
          <Link href="/" className="flex items-center gap-3" onClick={() => setOpen(false)}>
            <span className="grid size-9 place-items-center overflow-hidden rounded-lg bg-white p-1.5 shadow-lg shadow-blue-950/30"><Image src={companyBrand.logoPath} alt="ASGC" width={40} height={40} className="size-full object-contain" priority /></span>
            <div><p className="text-[13px] font-extrabold tracking-wide">{companyBrand.arabicName}</p><p className="text-[10px] font-medium text-slate-400">ASGC ERP</p></div>
          </Link>
          <button type="button" onClick={() => setOpen(false)} className="grid size-8 place-items-center rounded-md text-slate-400 hover:bg-white/10 lg:hidden" aria-label="إغلاق القائمة"><X className="size-4" /></button>
        </div>
        <div className="mx-3 mt-3 flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.04] p-2.5"><span className="grid size-8 shrink-0 place-items-center rounded-full bg-blue-600 text-xs font-black text-white">{initial}</span><span className="min-w-0 flex-1"><b className="block truncate text-xs font-bold text-white">{user.name || "مستخدم النظام"}</b><small className="mt-0.5 inline-flex rounded-full bg-blue-500/15 px-1.5 py-0.5 text-[9px] font-bold text-blue-200">{user.roleName}</small></span></div>
        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-3">
          <p className="mb-1.5 px-3 text-[10px] font-bold tracking-wide text-slate-500">التنقل الرئيسي</p>
          {canAccessNav(homeNavItem) && <Link href="/" onClick={() => setOpen(false)} className={`flex h-9 items-center gap-3 rounded-lg border-r-2 px-3 text-[13px] font-semibold transition ${pathname === "/" ? "border-blue-400 bg-blue-500/15 text-blue-100" : "border-transparent text-slate-300 hover:bg-white/7 hover:text-white"}`}><LayoutDashboard className="size-4" /><span className="flex-1">الرئيسية</span></Link>}
          {navGroups.map((group) => {
            const items = group.items.filter(canAccessNav);
            if (!items.length) return null;
            const hasActiveItem = items.some((item) => pathname.startsWith(item.href));
            const collapsed = collapsedGroups[group.title] ?? !hasActiveItem;
            return <section key={group.title} className="space-y-0.5 pb-1.5 last:pb-0">
              <button type="button" onClick={() => setCollapsedGroups((current) => ({ ...current, [group.title]: !collapsed }))} className="flex h-7 w-full items-center justify-between rounded-lg px-3 text-[10px] font-bold tracking-wide text-slate-500 transition hover:bg-white/5 hover:text-slate-200" aria-expanded={!collapsed}><span>{group.title}</span><ChevronDown className={`size-3.5 transition-transform ${collapsed ? "-rotate-90" : ""}`} /></button>
              {!collapsed && items.map((item) => {
                const Icon = item.icon;
                const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                return <Link key={item.label} href={item.href} onClick={() => setOpen(false)} className={`flex h-9 items-center gap-3 rounded-lg border-r-2 px-3 text-[13px] font-medium transition ${active ? "border-blue-400 bg-blue-500/15 text-blue-100" : "border-transparent text-slate-300 hover:bg-white/7 hover:text-white"}`}><Icon className="size-4" /><span className="flex-1">{item.label}</span></Link>;
              })}
            </section>;
          })}
        </nav>
        <div className="mx-3 mb-3 shrink-0">
          <LogoutButton />
        </div>
      </aside>
      <main className="min-h-screen pt-16 lg:pr-[270px]"><div className="mx-auto max-w-[1500px] p-4 sm:p-6 lg:p-8">{children}</div></main>
    </div>
  );
}
