"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { BanknoteArrowUp, BookOpenCheck, Boxes, Building2, ChartNoAxesCombined, ChevronDown, ChevronLeft, FileSpreadsheet, Landmark, LayoutDashboard, Menu, Paperclip, Settings2, ShoppingCart, UserRound, UsersRound, Vault, X } from "lucide-react";
import { LogoutButton } from "@/components/logout-button";
import { can } from "@/lib/permissions";
import { companyBrand } from "@/lib/company-brand";
import { PdfExportButton } from "@/components/pdf-export-button";
import { AccountMenu } from "@/components/account-menu";
import { AttentionBell } from "@/components/attention-bell";

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
  const [expanded, setExpanded] = useState(false);
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
  const currentGroup = navGroups.find((group) => group.items.some((item) => pathname === item.href || pathname.startsWith(`${item.href}/`)));
  const currentItem = navGroups.flatMap((group) => group.items).find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
  const breadcrumb = pathname === "/" ? "لوحة المتابعة التشغيلية" : currentItem?.label || ({ "/notifications": "الإشعارات", "/attention": "إجراءات تحتاج اهتمامك" } as Record<string, string>)[pathname] || "الصفحة الحالية";
  const isExpanded = open || expanded;
  const displayName = user.name?.trim() || "مستخدم النظام";
  const roleCaption = user.roleName === displayName ? "الحساب الشخصي" : user.roleName;
  const avatar = <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full border border-white/15 bg-blue-500/20 text-blue-100">{user.hasAvatar ? <Image src="/api/profile" alt={`صورة ${displayName}`} width={36} height={36} unoptimized className="size-full object-cover" /> : <UserRound className="size-4" aria-hidden="true" />}</span>;
  return (
    <div className="min-h-screen">
      <header className="fixed inset-x-0 top-0 z-40 h-16 border-b border-slate-200 bg-white text-slate-900 shadow-sm">
        <div className="flex h-full items-center justify-between gap-3 px-4 lg:pr-20 lg:pl-6">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={() => setOpen(true)} className="grid size-10 shrink-0 place-items-center rounded-lg text-slate-600 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-300 lg:hidden" aria-label="فتح القائمة"><Menu className="size-5" /></button>
            <nav aria-label="مسار التنقل" className="flex min-w-0 items-center gap-1.5 text-xs sm:text-sm">
              {pathname !== "/" && <><Link href="/" className="shrink-0 text-slate-500 transition hover:text-blue-700">الرئيسية</Link><ChevronLeft className="size-3.5 shrink-0 text-slate-400" />{currentGroup && <><span className="hidden shrink-0 text-slate-500 sm:inline">{currentGroup.title}</span><ChevronLeft className="hidden size-3.5 shrink-0 text-slate-400 sm:inline" /></>}</>}
              <span className="truncate font-bold text-slate-900" aria-current="page">{breadcrumb}</span>
            </nav>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {pathname !== "/" && <div className="hidden md:block"><PdfExportButton /></div>}
            <AttentionBell />
            <div data-export-user className="hidden text-left sm:block"><p className="text-xs font-bold">{user.name}</p><p className="text-[10px] text-slate-500">{user.roleName}</p></div>
            <AccountMenu name={user.name ?? "مستخدم النظام"} email={user.email ?? ""} hasAvatar={user.hasAvatar} />
          </div>
        </div>
      </header>
      {open && <button className="fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-[1px] lg:hidden" aria-label="إغلاق القائمة" onClick={() => setOpen(false)} />}
      <aside onMouseEnter={() => setExpanded(true)} onMouseLeave={() => setExpanded(false)} onFocusCapture={() => setExpanded(true)} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setExpanded(false); }} className={`fixed inset-y-0 right-0 z-50 flex flex-col overflow-hidden border-l border-white/10 bg-[#10192d] text-white shadow-2xl transition-[width,transform] duration-300 ease-out lg:translate-x-0 ${isExpanded ? "w-[270px]" : "w-[270px] lg:w-16"} ${open ? "translate-x-0" : "translate-x-full"}`}>
        <div className={`flex h-16 shrink-0 items-center border-b border-white/10 ${isExpanded ? "justify-between px-4" : "justify-center px-2"}`}>
          <Link href="/" aria-label="العودة للرئيسية" className="flex items-center gap-3 whitespace-nowrap" onClick={() => setOpen(false)}>
            <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-white/10 p-1.5"><Image src={companyBrand.logoPath} alt="شعار السلامة جروب" width={40} height={40} className="size-full object-contain" priority /></span>
            {isExpanded && <div><p className="text-[13px] font-extrabold tracking-wide">{companyBrand.arabicName}</p><p className="text-[10px] font-medium text-slate-400">ERP</p></div>}
          </Link>
          <button type="button" onClick={() => setOpen(false)} className="grid size-8 place-items-center rounded-md text-slate-400 hover:bg-white/10 lg:hidden" aria-label="إغلاق القائمة"><X className="size-4" /></button>
        </div>
        <nav aria-label="التنقل الرئيسي" className={`min-h-0 flex-1 space-y-1 overflow-y-auto py-3 ${isExpanded ? "px-3" : "px-2"}`}>
          {isExpanded && <p className="mb-1.5 px-3 text-[10px] font-bold tracking-wide text-slate-500">التنقل الرئيسي</p>}
          {canAccessNav(homeNavItem) && <Link href="/" title="الرئيسية" aria-label="الرئيسية" onClick={() => setOpen(false)} className={`flex h-9 items-center gap-3 rounded-lg border-r-2 text-[13px] font-semibold transition ${isExpanded ? "px-3" : "justify-center px-0"} ${pathname === "/" ? "border-blue-400 bg-blue-500/15 text-blue-100" : "border-transparent text-slate-300 hover:bg-white/7 hover:text-white"}`}><LayoutDashboard className="size-4 shrink-0" />{isExpanded && <span className="flex-1">الرئيسية</span>}</Link>}
          {navGroups.map((group) => {
            const items = group.items.filter(canAccessNav);
            if (!items.length) return null;
            const collapsed = collapsedGroups[group.title] ?? false;
            return <section key={group.title} className="space-y-0.5 pb-1.5 last:pb-0">
              {isExpanded ? <button type="button" onClick={() => setCollapsedGroups((current) => ({ ...current, [group.title]: !collapsed }))} className="flex h-7 w-full items-center justify-between rounded-lg px-3 text-[10px] font-bold tracking-wide text-slate-500 transition hover:bg-white/5 hover:text-slate-200" aria-expanded={!collapsed}><span>{group.title}</span><ChevronDown className={`size-3.5 transition-transform ${collapsed ? "-rotate-90" : ""}`} /></button> : <div className="mx-auto my-2 h-px w-6 bg-white/15" aria-hidden="true" />}
              {(!isExpanded || !collapsed) && items.map((item) => {
                const Icon = item.icon;
                const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                return <Link key={item.label} href={item.href} title={item.label} aria-label={item.label} onClick={() => setOpen(false)} className={`flex h-9 items-center gap-3 rounded-lg border-r-2 text-[13px] font-medium transition ${isExpanded ? "px-3" : "justify-center px-0"} ${active ? "border-blue-400 bg-blue-500/15 text-blue-100" : "border-transparent text-slate-300 hover:bg-white/7 hover:text-white"}`}><Icon className="size-4 shrink-0" />{isExpanded && <span className="flex-1">{item.label}</span>}</Link>;
              })}
            </section>;
          })}
        </nav>
        <div className={`mb-3 shrink-0 ${isExpanded ? "mx-3" : "mx-2"}`}>
          {isExpanded ? <><Link href="/profile" onClick={() => setOpen(false)} className="mb-2 flex items-center gap-2.5 px-2.5 py-2 transition hover:rounded-xl hover:bg-white/[0.06]" aria-label="فتح تعديل الملف الشخصي">{avatar}<div className="min-w-0 flex-1"><p className="truncate text-xs font-bold text-white">{displayName}</p><p className="mt-0.5 truncate text-[10px] text-slate-400">{roleCaption}</p></div><ChevronLeft className="size-3.5 shrink-0 text-slate-500" /></Link><div className="border-t border-white/10 pt-2"><LogoutButton /></div></> : <button type="button" aria-label="توسيع القائمة" title="توسيع القائمة" onClick={() => setExpanded(true)} className="grid h-10 w-full place-items-center rounded-lg hover:bg-white/10">{avatar}</button>}
        </div>
      </aside>
      <main className="min-h-screen pt-16 lg:pr-16"><div className="mx-auto max-w-[1500px] p-4 sm:p-6 lg:p-8">{children}</div></main>
    </div>
  );
}
