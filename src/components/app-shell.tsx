"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { BanknoteArrowUp, Bell, BookOpenCheck, Boxes, Building2, ChartNoAxesCombined, ChevronDown, ChevronLeft, FileSpreadsheet, Landmark, LayoutDashboard, Menu, Paperclip, Search, Settings2, ShoppingCart, UsersRound, Vault, X } from "lucide-react";
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


function getBreadcrumbs(pathname: string) {
  if (pathname === "/") return [{ label: "الرئيسية", href: "/" }];
  for (const group of navGroups) {
    for (const item of group.items) {
      if (item.href !== "/" && pathname.startsWith(item.href)) {
        return [
          { label: "الرئيسية", href: "/" },
          { label: group.title },
          { label: item.label, href: item.href, active: true },
        ];
      }
    }
  }
  return [
    { label: "الرئيسية", href: "/" },
    { label: pathname.replace(/^\//, ""), active: true },
  ];
}

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
      <header className="fixed inset-x-0 top-0 z-40 h-16 border-b border-slate-200/80 bg-white/95 text-slate-900 shadow-xs backdrop-blur-md">
        <div className="flex h-full items-center justify-between px-4 lg:pr-[290px] lg:pl-6">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setOpen(true)} className="grid size-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 lg:hidden" aria-label="فتح القائمة"><Menu className="size-5" /></button>
            <nav aria-label="مسار التصفح" className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
              {getBreadcrumbs(pathname).map((crumb, idx, list) => {
                const isLast = idx === list.length - 1;
                return (
                  <span key={idx} className="flex items-center gap-1.5">
                    {idx > 0 && <ChevronLeft className="size-3 text-slate-400" />}
                    {crumb.href && !isLast ? (
                      <Link href={crumb.href} className="transition hover:text-blue-700">{crumb.label}</Link>
                    ) : (
                      <span className={isLast ? "font-bold text-slate-900" : ""}>{crumb.label}</span>
                    )}
                  </span>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden md:flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-1.5 text-xs text-slate-400 transition focus-within:border-blue-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-100 w-60 lg:w-72">
              <Search className="size-3.5 shrink-0 text-slate-400" />
              <input type="search" placeholder="بحث سريع في المشاريع، الموردين، والمستندات..." className="w-full bg-transparent text-xs text-slate-900 placeholder-slate-400 outline-none" />
              <kbd className="hidden sm:inline-flex items-center rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px] text-slate-500">Ctrl K</kbd>
            </div>
            {pathname !== "/" && <div className="hidden md:block"><PdfExportButton /></div>}
            <Link href="/?attention=all" aria-label="الإجراءات التي تحتاج اهتمامك" className="relative grid size-9 place-items-center rounded-lg border border-slate-200/80 bg-white text-slate-600 shadow-xs transition hover:bg-slate-50 hover:text-slate-900"><Bell className="size-4" /><span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-amber-500 ring-2 ring-white" /></Link>
            <div data-export-user className="hidden text-left sm:block"><p className="text-xs font-bold text-slate-900">{user.name}</p><p className="text-[10px] text-slate-500">{user.roleName}</p></div>
            <AccountMenu name={user.name ?? "مستخدم النظام"} email={user.email ?? ""} hasAvatar={user.hasAvatar} />
          </div>
        </div>
      </header>
      {open && <button className="fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-[1px] lg:hidden" aria-label="إغلاق القائمة" onClick={() => setOpen(false)} />}
      <aside className={`fixed inset-y-0 right-0 z-50 flex w-[270px] flex-col border-l border-slate-200/80 bg-white text-slate-900 shadow-xl transition-transform duration-300 ease-out lg:translate-x-0 lg:shadow-none ${open ? "translate-x-0" : "translate-x-full"}`}>
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200/80 px-4">
          <Link href="/" className="flex items-center gap-2.5" onClick={() => setOpen(false)}>
            <span className="grid size-8 place-items-center overflow-hidden rounded-lg border border-slate-200/70 bg-slate-50 p-1 shadow-xs"><Image src={companyBrand.logoPath} alt="ASGC" width={32} height={32} className="size-full object-contain" priority /></span>
            <div><p className="text-[13px] font-extrabold tracking-wide text-slate-900">{companyBrand.arabicName}</p><p className="text-[10px] font-semibold text-slate-400">ASGC ERP</p></div>
          </Link>
          <button type="button" onClick={() => setOpen(false)} className="grid size-8 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 lg:hidden" aria-label="إغلاق القائمة"><X className="size-4" /></button>
        </div>
        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-3">
          <p className="mb-1.5 px-3 text-[10px] font-bold tracking-wide text-slate-400">التنقل الرئيسي</p>
          {canAccessNav(homeNavItem) && <Link href="/" onClick={() => setOpen(false)} className={`flex h-9 items-center gap-3 rounded-lg border-r-2 px-3 text-[13px] font-medium transition ${pathname === "/" ? "border-blue-600 bg-blue-50/80 text-blue-700 font-bold" : "border-transparent text-slate-600 hover:bg-slate-100/70 hover:text-slate-900"}`}><LayoutDashboard className="size-4" /><span className="flex-1">الرئيسية</span></Link>}
          {navGroups.map((group) => {
            const items = group.items.filter(canAccessNav);
            if (!items.length) return null;
            const hasActiveItem = items.some((item) => pathname.startsWith(item.href));
            const collapsed = collapsedGroups[group.title] ?? !hasActiveItem;
            return <section key={group.title} className="space-y-0.5 pb-1.5 last:pb-0">
              <button type="button" onClick={() => setCollapsedGroups((current) => ({ ...current, [group.title]: !collapsed }))} className="flex h-7 w-full items-center justify-between rounded-lg px-3 text-[10px] font-bold tracking-wide text-slate-400 transition hover:bg-slate-100/60 hover:text-slate-700" aria-expanded={!collapsed}><span>{group.title}</span><ChevronDown className={`size-3.5 transition-transform ${collapsed ? "-rotate-90" : ""}`} /></button>
              {!collapsed && items.map((item) => {
                const Icon = item.icon;
                const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                return <Link key={item.label} href={item.href} onClick={() => setOpen(false)} className={`flex h-9 items-center gap-3 rounded-lg border-r-2 px-3 text-[13px] font-medium transition ${active ? "border-blue-600 bg-blue-50/80 text-blue-700 font-bold" : "border-transparent text-slate-600 hover:bg-slate-100/70 hover:text-slate-900"}`}><Icon className="size-4" /><span className="flex-1">{item.label}</span></Link>;
              })}
            </section>;
          })}
        </nav>
        <div className="shrink-0 border-t border-slate-200/80 p-3">
          <div className="flex items-center gap-2.5 px-2 py-1.5 mb-1.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-blue-600 text-xs font-black text-white">{initial}</span>
            <div className="min-w-0 flex-1"><b className="block truncate text-xs font-bold text-slate-900">{user.name || "مستخدم النظام"}</b><small className="block truncate text-[10px] text-slate-400">{user.roleName}</small></div>
          </div>
          <LogoutButton />
        </div>
      </aside>
      <main className="min-h-screen pt-16 lg:pr-[270px]"><div className="mx-auto max-w-[1500px] p-4 sm:p-6 lg:p-8">{children}</div></main>
    </div>
  );
}
