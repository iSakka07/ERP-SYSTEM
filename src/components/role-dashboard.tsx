"use client";

import Link from "next/link";
import { CompanyFooter } from "@/components/company-footer";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Bar, BarChart, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDownLeft, ArrowLeft, ArrowUpRight, BanknoteArrowDown, BanknoteArrowUp, BellRing, Building2, Boxes, CalendarDays, ChartNoAxesCombined, ChevronLeft, CircleAlert, FileSpreadsheet, Landmark, TrendingDown, TrendingUp, UserRound, Vault } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type Project = { id: string; name: string; owner: string; contractValue: string; incoming: string; cost: string; paid: string; margin: string; risk: string };
type Filter = { projectId: string; from: string; to: string; projects: { id: string; name: string }[] };
type Alert = { type: string; severity: string; title: string; detail: string; href: string };
type Insights = {
  months: { key: string; label: string; incoming: number; cost: number }[];
  costComposition: { name: string; value: number; color: string }[];
  projectCount: number;
  periodLabel: string;
  comparison: { incoming: [number, number]; cost: [number, number]; liquidity: [number, number] };
  alerts: Alert[];
  operations?: { stock: number; low: number; pending: number; purchases: number; count: number; canStock: boolean; canPurchases: boolean };
  petty: { balance: number; in: number; out: number; previousOut: number; composition: { name: string; value: number; color: string }[]; recent: { id: string; date: string; type: string; description: string; amount: number; incoming: boolean; project: string }[] };
};

const chartNumber = new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 0 });
const amount = (value: number) => `${new Intl.NumberFormat("en-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value / 100)} ج.م`;
const tooltipAmount = (value: unknown) => amount(Number(Array.isArray(value) ? value[0] : value ?? 0));

function DashboardFilters({ filter }: { filter: Filter }) {
  const router = useRouter(); const [project, setProject] = useState(filter.projectId); const [from, setFrom] = useState(filter.from); const [to, setTo] = useState(filter.to);
  function apply() { const params = new URLSearchParams(); if (project) params.set("project", project); if (from) params.set("from", from); if (to) params.set("to", to); router.push(`/?${params.toString()}`); }
  function setQuickRange(kind: "week" | "month" | "thirty") {
    const now = new Date(); const end = now.toISOString().slice(0, 10); const start = new Date(now);
    if (kind === "week") start.setDate(now.getDate() - 6);
    if (kind === "month") start.setDate(1);
    if (kind === "thirty") start.setDate(now.getDate() - 29);
    setFrom(start.toISOString().slice(0, 10)); setTo(end);
  }
  return <section className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <label className="grid min-w-48 flex-1 gap-1.5 text-xs font-bold text-slate-600"><span>المشروع</span><select value={project} onChange={(event) => setProject(event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"><option value="">كل المشروعات</option>{filter.projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <label className="grid gap-1.5 text-xs font-bold text-slate-600"><span>من تاريخ</span><input value={from} onChange={(event) => setFrom(event.target.value)} type="date" className="h-10 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label>
    <label className="grid gap-1.5 text-xs font-bold text-slate-600"><span>إلى تاريخ</span><input value={to} onChange={(event) => setTo(event.target.value)} type="date" className="h-10 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label>
    <div className="flex flex-wrap items-center gap-2"><button type="button" onClick={apply} className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-700 px-5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-300"><CalendarDays className="size-4" />تطبيق</button><span className="hidden h-7 w-px bg-slate-200 sm:block" />{([['week', 'هذا الأسبوع'], ['month', 'هذا الشهر'], ['thirty', 'آخر 30 يومًا']] as const).map(([kind, label]) => <button key={kind} type="button" onClick={() => setQuickRange(kind)} className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-bold text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700">{label}</button>)}</div>
  </section>;
}

function DashboardProjectPicker({ filter }: { filter: Filter }) {
  const router = useRouter(); const [project, setProject] = useState(filter.projectId);
  function apply(value: string) {
    setProject(value);
    const params = new URLSearchParams();
    if (value) params.set("project", value);
    if (filter.from) params.set("from", filter.from);
    if (filter.to) params.set("to", filter.to);
    router.push(`/?${params.toString()}`);
  }
  return <label className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 shadow-sm"><Building2 className="size-3.5 shrink-0 text-blue-700" /><span className="sr-only">المشروع</span><select value={project} onChange={(event) => apply(event.target.value)} className="cursor-pointer bg-transparent text-xs font-bold text-slate-700 outline-none"><option value="">كل المشروعات</option>{filter.projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>;
}

function Metric({ label, value, icon: Icon, tone }: { label: string; value: string; icon: LucideIcon; tone: "blue" | "emerald" | "amber" | "violet" }) {
  const palette = { blue: "border-blue-200 bg-blue-50 text-blue-700", emerald: "border-emerald-200 bg-emerald-50 text-emerald-700", amber: "border-amber-200 bg-amber-50 text-amber-700", violet: "border-violet-200 bg-violet-50 text-violet-700" }[tone];
  const valueTone = value.trim().startsWith("-") ? "text-rose-700" : tone === "emerald" ? "text-emerald-700" : tone === "amber" ? "text-amber-700" : tone === "violet" ? "text-violet-700" : "text-blue-700";
  return <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold text-slate-500">{label}</p><p className={`mt-3 text-xl font-black tabular-nums ${valueTone}`} dir="ltr">{value}</p></div><span className={`grid size-10 place-items-center rounded-xl border ${palette}`}><Icon className="size-5" /></span></div></article>;
}

function Change({ label, current, prior, inverse = false }: { label: string; current: number; prior: number; inverse?: boolean }) {
  const change = prior ? Math.round(((current - prior) / Math.abs(prior)) * 100) : current ? 100 : 0;
  const favorable = inverse ? change <= 0 : change >= 0;
  const Icon = change >= 0 ? TrendingUp : TrendingDown;
  return <article className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-bold text-slate-500">{label}</p><p className="mt-2 truncate text-base font-black text-slate-900" dir="ltr">{amount(current)}</p><p className={`mt-2 inline-flex items-center gap-1 text-xs font-black ${favorable ? "text-emerald-700" : "text-rose-700"}`}><Icon className="size-3.5" />{prior ? `${change >= 0 ? "+" : ""}${change}% مقارنة بالفترة السابقة` : "لا توجد قيمة سابقة للمقارنة"}</p></article>;
}

function AttentionPreview({ alerts }: { alerts: Alert[] }) {
  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5"><div><h2 className="flex items-center gap-2 font-black text-slate-900"><BellRing className="size-5 text-amber-600" />إجراءات تحتاج اهتمامك</h2><p className="mt-1 text-xs text-slate-500">أهم خمس إجراءات قائمة الآن، عبر أقسام المنظومة.</p></div><div className="flex items-center gap-3"><span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-700">{alerts.length} إجراء</span><Link href="/?attention=all" className="text-xs font-bold text-blue-700 underline">إظهار الكل</Link></div></div><div className="divide-y divide-slate-100">{alerts.slice(0, 5).map((alert, index) => <Link key={alert.title + index} href={alert.href} className={"flex items-center gap-3 p-4 transition hover:bg-slate-50"}><span className={"grid size-9 shrink-0 place-items-center rounded-full " + (alert.severity === "متأخر" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700")}><CircleAlert className="size-4" /></span><span className="min-w-0 flex-1"><b className="block text-sm text-slate-900">{alert.title}</b><small className="mt-1 block truncate text-xs text-slate-500">{alert.detail}</small></span><ChevronLeft className="size-4 text-slate-400" /></Link>)}{!alerts.length && <div className="p-8 text-center text-sm text-emerald-700">لا توجد إجراءات مفتوحة تحتاج متابعة.</div>}</div></section>;
}

function DecisionStrip({ insights }: { insights: Insights }) {
  const [incoming, cost] = [insights.comparison.incoming[0], insights.comparison.cost[0]];
  const gap = incoming - cost;
  const alerts = insights.alerts.length;
  const hasCashActivity = insights.petty.in > 0 || insights.petty.out > 0;
  return <section aria-label="قراءة المدير السريعة" className="overflow-hidden rounded-2xl border border-blue-100 bg-gradient-to-l from-blue-50 via-white to-white shadow-sm"><div className="grid divide-y divide-blue-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0" dir="rtl"><div className="flex items-center gap-3 p-4"><span className={`grid size-9 shrink-0 place-items-center rounded-xl ${alerts ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}><BellRing className="size-4" /></span><div><p className="text-xs font-bold text-slate-500">أولوية اليوم</p><b className="mt-1 block text-sm text-slate-900">{alerts ? `${alerts} بند يحتاج متابعة` : "لا توجد تنبيهات حرجة"}</b></div></div><div className="flex items-center gap-3 p-4"><span className={`grid size-9 shrink-0 place-items-center rounded-xl ${gap >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}><ChartNoAxesCombined className="size-4" /></span><div><p className="text-xs font-bold text-slate-500">قراءة الفترة</p><b className="mt-1 block text-sm text-slate-900">{gap >= 0 ? "التحصيل يغطي التكلفة" : "التكلفة أعلى من التحصيل"}</b></div></div><div className="flex items-center gap-3 p-4"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-blue-100 text-blue-700"><Vault className="size-4" /></span><div><p className="text-xs font-bold text-slate-500">حركة الخزنة</p><b className="mt-1 block text-sm text-slate-900">{hasCashActivity ? "حركات مسجلة في الفترة" : "لا حركة مسجلة في الفترة"}</b></div></div></div></section>;
}

function OperationsSummary({ operations, periodLabel }: { operations: NonNullable<Insights["operations"]>; periodLabel: string }) {
  if (!operations.canStock && !operations.canPurchases) return null;
  return <section aria-label="ملخص المخزن والمشتريات" className="grid gap-3 md:grid-cols-2">
    {operations.canStock && <Link href="/warehouse" className="group rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-200 hover:shadow-md">
      <div className="flex items-start justify-between gap-3"><div><h2 className="font-black text-slate-900">المخزن وحركة الخامات <span className="text-blue-700">←</span></h2><p className="mt-1 text-xs text-slate-500">قيمة الرصيد الحالي · لا تتغير حسب الفترة</p></div><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-700"><Boxes className="size-4" /></span></div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><p className="text-xl font-black text-slate-900" dir="ltr">{amount(operations.stock)}</p><div className="flex flex-wrap gap-2 text-[11px] font-bold"><span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-800">{operations.low} صنف يحتاج إعادة طلب</span><span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">{operations.pending} فاتورة لم يُسجل استلامها</span></div></div>
    </Link>}
    {operations.canPurchases && <Link href="/purchases" className="group rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-200 hover:shadow-md">
      <div className="flex items-start justify-between gap-3"><div><h2 className="font-black text-slate-900">المشتريات وفواتير الموردين <span className="text-blue-700">←</span></h2><p className="mt-1 text-xs text-slate-500">إجمالي الفواتير خلال {periodLabel}</p></div><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-700"><FileSpreadsheet className="size-4" /></span></div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><p className="text-xl font-black text-slate-900" dir="ltr">{amount(operations.purchases)}</p><div className="flex flex-wrap gap-2 text-[11px] font-bold"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">{operations.count} فاتورة</span>{operations.count > 0 && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">متوسط الفاتورة {amount(operations.purchases / operations.count)}</span>}</div></div>
      <p className="mt-2 text-[11px] text-slate-500">تسجيل الفاتورة تكلفة شراء، ولا يعني استهلاك الخامات من المخزن.</p>
    </Link>}
  </section>;
}

export function RoleDashboard({ roleKey, userName, canFinancial, filter, projects, totals, insights }: { roleKey: string; userName?: string | null; canFinancial: boolean; filter: Filter; projects: Project[]; totals: Record<string, string>; insights?: Insights }) {
  const engineer = roleKey === "technical_office_engineer" || roleKey === "site_supervisor_engineer";
  const accountName = roleKey === "admin" ? "مدير النظام" : roleKey === "executive_director" ? "المدير التنفيذي" : roleKey === "accountant" ? "المحاسب" : engineer ? "مهندس المشروع" : "مستخدم المنظومة";
  const metrics: [string, string, LucideIcon, "blue" | "emerald" | "amber" | "violet"][] = canFinancial ? [["قيمة العقود في الفترة", totals.contractValue, Building2, "blue"], ["الوارد المحصل", totals.incoming, BanknoteArrowUp, "emerald"], ["تكلفة الأعمال", totals.cost, BanknoteArrowDown, "amber"], ["صافي السيولة", totals.liquidity, Landmark, "violet"]] : [["المشروعات المكلف بها", String(projects.length), Building2, "blue"], ["مستخلصات تحت الإجراء", "—", FileSpreadsheet, "amber"], ["حالة المتابعة", "جاهز", ChartNoAxesCombined, "emerald"], ["الوارد والماليات", "غير مسموح", Landmark, "violet"]];
  const today = useSyncExternalStore(() => () => {}, () => new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "long", year: "numeric" }).format(new Date()), () => "");
  const pieData = insights?.costComposition.filter((item) => item.value > 0) ?? [];
  const cashPieData = insights?.petty.composition.filter((item) => item.value > 0) ?? [];
  return <div className="space-y-6">
    <section className="py-1">
      <h1 className="text-2xl font-black text-slate-950 sm:text-3xl">لوحة المتابعة التشغيلية</h1>
      <p className="mt-1 text-sm text-slate-500">نظرة شاملة على أداء المشاريع والعمليات</p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-bold text-slate-700 shadow-sm"><UserRound className="size-3.5 text-blue-700" />{userName || accountName}</span>
        <DashboardProjectPicker filter={filter} />
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-bold text-slate-700 shadow-sm"><CalendarDays className="size-3.5 text-blue-700" />{today}</span>
      </div>
    </section>
    <DashboardFilters filter={filter} />
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(([label, value, Icon, tone]) => <Metric key={label} label={label} value={value} icon={Icon} tone={tone} />)}</section>
    {canFinancial && insights && <DecisionStrip insights={insights} />}
    {insights && <AttentionPreview alerts={insights.alerts} />}
    {!canFinancial && insights?.operations && <OperationsSummary operations={insights.operations} periodLabel={insights.periodLabel} />}
    {canFinancial && insights && <>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-black text-slate-900">مقارنة سريعة</h2><p className="mt-1 text-xs text-slate-500">الفترة المختارة مقابل الفترة السابقة لها بنفس عدد الأيام.</p></div><span className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600">{insights.periodLabel}</span></div><div className="mt-5 grid gap-4 md:grid-cols-3"><Change label="الوارد المحصل" current={insights.comparison.incoming[0]} prior={insights.comparison.incoming[1]} /><Change label="تكلفة الأعمال" current={insights.comparison.cost[0]} prior={insights.comparison.cost[1]} inverse /><Change label="صافي السيولة" current={insights.comparison.liquidity[0]} prior={insights.comparison.liquidity[1]} /></div></section>
      {insights.operations && <OperationsSummary operations={insights.operations} periodLabel={insights.periodLabel} />}
      <section className="grid gap-5 xl:grid-cols-[1.1fr_1fr_1fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><p className="text-xs font-bold text-blue-700">الخزنة والنثريات</p><h2 className="mt-1 font-black text-slate-900">رصيد الخزنة</h2><p className="mt-1 text-xs text-slate-500">الرصيد الحالي للصندوق الرئيسي، لا يتأثر بفلتر التاريخ.</p></div><span className="grid size-11 place-items-center rounded-xl bg-blue-50 text-blue-700"><Vault className="size-5" /></span></div><p className="mt-5 text-3xl font-black text-blue-700" dir="ltr">{amount(insights.petty.balance)}</p><div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-xl bg-emerald-50 p-3"><p className="text-xs font-bold text-emerald-700">وارد الخزنة</p><b className="mt-1 block text-sm text-emerald-800" dir="ltr">{amount(insights.petty.in)}</b></div><div className="rounded-xl bg-amber-50 p-3"><p className="text-xs font-bold text-amber-700">منصرف الخزنة</p><b className="mt-1 block text-sm text-amber-800" dir="ltr">{amount(insights.petty.out)}</b></div></div><p className={`mt-4 inline-flex items-center gap-1 text-xs font-bold ${insights.petty.out <= insights.petty.previousOut ? "text-emerald-700" : "text-rose-700"}`}>{insights.petty.out <= insights.petty.previousOut ? <TrendingDown className="size-4" /> : <TrendingUp className="size-4" />} {insights.petty.previousOut ? `${Math.abs(Math.round(((insights.petty.out - insights.petty.previousOut) / insights.petty.previousOut) * 100))}% مقارنة بالفترة السابقة` : "لا توجد مقارنة سابقة"}</p><Link href="/petty-cash" className="mt-4 flex w-fit mr-auto items-center gap-2 text-xs font-black text-blue-700 hover:underline">فتح دفتر الحركة <ArrowLeft className="size-3.5" /></Link></article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between gap-2"><h2 className="font-black text-slate-900">صرف الخزنة يذهب إلى أين؟</h2><Link href="/petty-cash" className="text-xs font-bold text-blue-700 hover:underline">فتح الخزنة</Link></div><p className="mt-1 text-xs text-slate-500">توزيع المصروفات الفعلية في {insights.periodLabel}.</p>{cashPieData.length ? <div className="mt-2 h-48" dir="ltr"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={cashPieData} dataKey="value" nameKey="name" innerRadius={42} outerRadius={68} paddingAngle={3}>{cashPieData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}</Pie><Tooltip formatter={(value) => tooltipAmount(value)} contentStyle={{ borderRadius: 12, borderColor: "#e2e8f0", direction: "rtl" }} /></PieChart></ResponsiveContainer></div> : <div className="grid h-48 place-items-center text-center text-sm text-slate-400">لا توجد مصروفات خزنة فعلية في الفترة.</div>}<div className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px] font-bold text-slate-600">{cashPieData.map((item) => <span key={item.name} className="inline-flex items-center gap-1"><i className="size-2 rounded-full" style={{ backgroundColor: item.color }} />{item.name}</span>)}</div></article>
        <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-slate-100 p-5"><div><h2 className="font-black text-slate-900">آخر حركات الخزنة</h2><p className="mt-1 text-xs text-slate-500">إضافة أو صرف ضمن الفترة المختارة.</p></div><Link href="/petty-cash" className="text-xs font-bold text-blue-700 hover:underline">عرض كل الحركات</Link></div><div className="divide-y divide-slate-100">{insights.petty.recent.map((item) => <Link href="/petty-cash" key={item.id} className="flex items-center gap-3 p-3.5 transition hover:bg-slate-50"><span className={`grid size-8 place-items-center rounded-full ${item.incoming ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{item.incoming ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}</span><span className="min-w-0 flex-1"><b className="block truncate text-xs text-slate-900">{item.description}</b><small className="block text-[11px] text-slate-500">{item.date} · {item.project}</small></span><b className="text-xs text-blue-700" dir="ltr">{amount(item.amount)}</b></Link>)}{!insights.petty.recent.length && <div className="p-7 text-center"><p className="text-sm font-bold text-slate-500">لا توجد حركات في الفترة.</p><Link href="/petty-cash" className="mt-3 inline-flex rounded-lg border border-blue-200 px-3 py-2 text-xs font-black text-blue-700 transition hover:bg-blue-50">فتح دفتر الحركة</Link></div>}</div></article>
      </section>
      <section className="grid gap-5 xl:grid-cols-[1.65fr_1fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-4"><h2 className="font-black text-slate-900">تدفق الأموال</h2><p className="mt-1 text-xs text-slate-500">الوارد المحصل مقابل تكلفة الأعمال، آخر ستة أشهر حتى تاريخ نهاية الفلتر.</p></div><div className="h-64" dir="ltr"><ResponsiveContainer width="100%" height="100%"><BarChart data={insights.months} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}><XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} /><YAxis tickFormatter={(value) => `${chartNumber.format(value / 100)}`} tick={{ fontSize: 10, fill: "#94a3b8" }} width={52} axisLine={false} tickLine={false} /><Tooltip formatter={(value) => tooltipAmount(value)} labelStyle={{ color: "#0f172a", fontWeight: 700 }} contentStyle={{ borderRadius: 12, borderColor: "#e2e8f0", direction: "rtl" }} /><Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: 12, paddingBottom: 10 }} /><Bar name="الوارد" dataKey="incoming" fill="#10b981" radius={[5, 5, 0, 0]} /><Bar name="التكلفة" dataKey="cost" fill="#2563eb" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></div></article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-black text-slate-900">توزيع تكلفة الأعمال</h2><p className="mt-1 text-xs text-slate-500">عن الفترة المحددة: {insights.periodLabel}.</p>{pieData.length ? <div className="mt-2 h-64" dir="ltr"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={pieData} dataKey="value" nameKey="name" innerRadius={57} outerRadius={84} paddingAngle={3}>{pieData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}</Pie><Tooltip formatter={(value) => tooltipAmount(value)} contentStyle={{ borderRadius: 12, borderColor: "#e2e8f0", direction: "rtl" }} /></PieChart></ResponsiveContainer></div> : <div className="grid h-64 place-items-center text-center text-sm text-slate-400">لا توجد تكلفة معتمدة لعرض توزيعها بعد.</div>}<div className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs font-bold text-slate-600">{pieData.map((item) => <span key={item.name} className="inline-flex items-center gap-1.5"><i className="size-2 rounded-full" style={{ backgroundColor: item.color }} />{item.name} {chartNumber.format(item.value / 100)} ج.م</span>)}</div></article>
      </section>
    </>}
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-5"><div><h2 className="font-black text-slate-900">{engineer ? "المشروعات المسكن عليها" : "أداء المشروعات"}</h2><p className="mt-1 text-xs text-slate-500">قيم الفترة المختارة؛ كل صف يفتح ملف المشروع.</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{projects.length} مشروع</span></div><div className="overflow-x-auto"><table className="w-full min-w-[780px] text-right text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-5 py-3">المشروع</th>{canFinancial && <><th className="px-5 py-3 text-center">العقود</th><th className="px-5 py-3 text-center">الوارد</th><th className="px-5 py-3 text-center">التكلفة</th><th className="px-5 py-3 text-center">الفرق</th></>}<th className="px-5 py-3">الحالة</th></tr></thead><tbody className="divide-y divide-slate-100">{projects.map((project) => <tr key={project.id}><td className="px-5 py-4"><Link href={`/expenses?project=${project.id}`} className="font-bold text-slate-900 hover:text-blue-700">{project.name}</Link><p className="mt-1 text-xs text-slate-400">{project.owner}</p></td>{canFinancial && <><td className="px-5 py-4 text-center font-bold text-blue-700" dir="ltr">{project.contractValue}</td><td className="px-5 py-4 text-center font-bold text-emerald-700" dir="ltr">{project.incoming}</td><td className="px-5 py-4 text-center font-bold text-amber-700" dir="ltr">{project.cost}</td><td className="px-5 py-4 text-center font-bold text-slate-900" dir="ltr">{project.margin}</td></>}<td className="px-5 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${project.risk === "ضمن المتاح" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{project.risk}</span></td></tr>)}{!projects.length && <tr><td colSpan={canFinancial ? 6 : 2} className="p-10 text-center text-sm text-slate-400"><CircleAlert className="mx-auto mb-2 size-5" />لا توجد مشروعات مربوطة بالحساب حاليًا.</td></tr>}</tbody></table></div></section>
    <CompanyFooter />
  </div>;
}
