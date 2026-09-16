import Link from "next/link";
import { ArrowLeft, ArrowUpRight, BanknoteArrowDown, BanknoteArrowUp, Building2, CircleCheckBig, FileSpreadsheet, Landmark, Paperclip, ReceiptText, ShoppingCart, Sparkles, UsersRound, Vault } from "lucide-react";
import { auth } from "@/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { financials, money } from "@/lib/incoming";
import { expenseSummary } from "@/lib/expenses";
import { isProjectCost } from "@/lib/petty-cash";

const modules = [
  { name: "الوارد", code: "Incoming", href: "/incoming", permission: "incoming.view", live: true, description: "عقود الجهة المالكة والمستخلصات والتحصيلات الفعلية.", icon: BanknoteArrowUp, color: "bg-blue-50 text-blue-700 ring-blue-100" },
  { name: "مستخلصات المقاولين", code: "Expenses", href: "/expenses", permission: "expenses.view", live: true, description: "حصر الأعمال والجوارى وتأمين الأعمال ومدفوعات المقاولين.", icon: FileSpreadsheet, color: "bg-indigo-50 text-indigo-700 ring-indigo-100" },
  { name: "المشتريات", code: "Purchases", href: "/purchases", permission: "purchases.view", live: true, description: "بنود وفواتير مشتريات المشروع المسجلة كتكلفة.", icon: ShoppingCart, color: "bg-amber-50 text-amber-700 ring-amber-100" },
  { name: "النثريات", code: "Prose", href: "/#modules", permission: "prose.view", live: false, description: "مصروفات المشروعات والمصروفات العامة بمرفقاتها.", icon: ReceiptText, color: "bg-rose-50 text-rose-700 ring-rose-100" },
  { name: "المرتبات", code: "Salaries", href: "/#modules", permission: "salaries.view", live: false, description: "مرتبات ومكافآت وخصومات وسلف وتسكين الموظفين.", icon: UsersRound, color: "bg-violet-50 text-violet-700 ring-violet-100" },
  { name: "الخزنة التشغيلية", code: "PettyCash", href: "/petty-cash", permission: "pettycash.view", live: true, description: "التمويل والمصروفات والعهد وكشف حركة الرصيد.", icon: Vault, color: "bg-emerald-50 text-emerald-700 ring-emerald-100" },
];

export default async function Home({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const session = await auth();
  const requestedProject = (await searchParams).project ?? "";
  const [projects, contracts, accounts, invoices, petty] = await Promise.all([
    prisma.project.findMany({ where: { active: true }, include: { company: true, sector: true }, orderBy: { name: "asc" } }),
    prisma.incomingContract.findMany({ include: { memos: true, statements: { orderBy: { sequence: "asc" }, include: { materials: true } } } }),
    prisma.subcontractAccount.findMany({ include: { statements: { include: { payments: true } } } }),
    prisma.purchaseInvoice.findMany(),
    prisma.pettyCashTransaction.findMany({ where: { status: "POSTED" }, select: { type: true, amountCents: true, projectId: true } }),
  ]);
  const projectId = projects.some((project) => project.id === requestedProject) ? requestedProject : "";
  const rows = projects.filter((project) => !projectId || project.id === projectId).map((project) => {
    const incoming = contracts.filter((contract) => contract.projectId === project.id).reduce((sum, contract) => sum + financials(contract).net, 0);
    const contractValue = contracts.filter((contract) => contract.projectId === project.id).reduce((sum, contract) => sum + financials(contract).value, 0);
    const subcontract = accounts.filter((account) => account.projectId === project.id).reduce((sum, account) => sum + expenseSummary(account.statements).netCents, 0);
    const subcontractPaid = accounts.filter((account) => account.projectId === project.id).reduce((sum, account) => sum + expenseSummary(account.statements).paidCents, 0);
    const purchases = invoices.filter((invoice) => invoice.projectId === project.id).reduce((sum, invoice) => sum + invoice.totalCents, 0);
    const pettyCost = petty.filter((t) => t.projectId === project.id && isProjectCost(t.type)).reduce((sum, t) => sum + t.amountCents, 0);
    return { project, incoming, contractValue, subcontract, subcontractPaid, purchases, pettyCost, cost: subcontract + purchases + pettyCost, pettyPaid: pettyCost };
  });
  const totals = rows.reduce((sum, row) => ({
    contracts: sum.contracts + row.contractValue,
    incoming: sum.incoming + row.incoming,
    cost: sum.cost + row.cost,
    paid: sum.paid + row.subcontractPaid + row.pettyPaid,
  }), { contracts: 0, incoming: 0, cost: 0, paid: 0 });
  const metrics = [
    { label: "قيمة العقود الواردة", value: money(totals.contracts), icon: Building2, hint: "القيمة الحالية للعقود بعد المذكرات" },
    { label: "الوارد المحصل", value: money(totals.incoming), icon: BanknoteArrowUp, hint: "آخر مستخلصات مالك وصلت إلى تم الصرف" },
    { label: "تكلفة المشروع المسجلة", value: money(totals.cost), icon: BanknoteArrowDown, hint: "مقاولون معتمدون + فواتير مشتريات" },
    { label: "المنصرف الفعلي الموثق", value: money(totals.paid), icon: Landmark, hint: "دفعات المقاولين؛ صرف المشتريات ينتظر الخزنة" },
  ];
  return (
    <div className="space-y-6">
      <section className="hero-card overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="relative z-10 grid gap-7 p-6 lg:grid-cols-[1.25fr_.75fr] lg:p-8">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 ring-1 ring-blue-100"><Sparkles className="size-3.5" />النسخة التجريبية الأولى</div>
            <h1 className="max-w-3xl text-3xl font-extrabold leading-[1.35] text-slate-950 lg:text-4xl">إدارة المشروع من أول وارد <span className="text-blue-700">لحد آخر جنيه اتصرف</span></h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600 lg:text-base">ERP-SYSTEM V1 يجمع مستخلصات المالك، مقاولي الباطن، المشتريات، النثريات، المرتبات والخزنة في ملف مالي واحد لكل مشروع.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a href="#modules" className="inline-flex h-11 items-center gap-2 rounded-lg bg-blue-700 px-5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">استعرض الموديولات<ArrowLeft className="size-4" /></a>
              {can(session?.user, "incoming.view") && <a href="/incoming" className="inline-flex h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-blue-700"><CircleCheckBig className="size-4 text-emerald-600" />جرّب العقود والوارد</a>}
              {can(session?.user, "expenses.view") && <a href="/expenses" className="inline-flex h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-blue-700"><FileSpreadsheet className="size-4" />جرّب مستخلصات المقاولين</a>}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
            <div className="mb-4 flex items-center justify-between">
              <div><p className="text-xs font-semibold text-slate-500">حالة التأسيس</p><p className="mt-1 font-bold text-slate-900">البنية الأساسية جاهزة</p></div>
              <span className="grid size-10 place-items-center rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"><CircleCheckBig className="size-5" /></span>
            </div>
            <div className="space-y-3">
              {[["تسجيل الدخول وحماية الصفحات", "مكتمل"], ["الحسابات والأدوار والصلاحيات", "مكتمل"], ["الشركات والقطاعات والمشروعات", "مكتمل"], ["المهندسون وتكليفات الإشراف", "مكتمل"]].map(([label, value]) => <div key={label} className="flex items-center justify-between gap-4 border-b border-slate-200 pb-3 last:border-0 last:pb-0"><span className="text-sm font-medium text-slate-700">{label}</span><span className="text-xs font-bold text-emerald-700">{value}</span></div>)}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {metrics.map(({ label, value, icon: Icon, hint }) => <article key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,.03)]"><div className="flex items-start justify-between"><div><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-2 text-xl font-extrabold text-slate-900" dir="ltr">{value}</p></div><span className="grid size-9 place-items-center rounded-lg bg-blue-50 text-blue-700"><Icon className="size-4.5" /></span></div><p className="mt-3 text-[11px] text-slate-400">{hint}</p></article>)}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-5">
          <div><h2 className="font-extrabold text-slate-950">الملف المالي للمشروعات</h2><p className="mt-1 text-xs text-slate-500">كل قيمة تفتح الموديول المرتبط بنفس المشروع.</p></div>
          <form><select name="project" defaultValue={projectId} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="">كل المشروعات</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select><button className="mr-2 h-10 rounded-lg bg-slate-900 px-4 text-xs font-bold text-white">تطبيق</button></form>
        </div>
        <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-right text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-3">المشروع</th><th className="p-3">قيمة العقود</th><th className="p-3">الوارد المحصل</th><th className="p-3">تكلفة المقاولين</th><th className="p-3">فواتير المشتريات</th><th className="p-3">المنصرف الفعلي</th><th className="p-3">الفرق</th></tr></thead><tbody className="divide-y">{rows.map((row) => <tr key={row.project.id}><td className="p-3"><strong>{row.project.name}</strong><p className="mt-1 text-[11px] text-slate-400">{row.project.company.name} · {row.project.sector?.name ?? "بدون قطاع"}</p></td><td className="p-3" dir="ltr">{money(row.contractValue)}</td><td className="p-3">{can(session?.user, "incoming.view") ? <Link className="font-bold text-blue-700" dir="ltr" href={`/incoming?project=${row.project.id}`}>{money(row.incoming)}</Link> : <span dir="ltr">{money(row.incoming)}</span>}</td><td className="p-3">{can(session?.user, "expenses.view") ? <Link className="font-bold text-indigo-700" dir="ltr" href={`/expenses?project=${row.project.id}`}>{money(row.subcontract)}</Link> : <span dir="ltr">{money(row.subcontract)}</span>}</td><td className="p-3">{can(session?.user, "purchases.view") ? <Link className="font-bold text-amber-700" dir="ltr" href={`/purchases?project=${row.project.id}`}>{money(row.purchases)}</Link> : <span dir="ltr">{money(row.purchases)}</span>}</td><td className="p-3 font-bold" dir="ltr">{money(row.subcontractPaid)}</td><td className={`p-3 font-extrabold ${row.incoming - row.cost < 0 ? "text-red-700" : "text-emerald-700"}`} dir="ltr">{money(row.incoming - row.cost)}</td></tr>)}{!rows.length && <tr><td colSpan={7} className="p-6 text-center text-slate-400">لا توجد مشروعات نشطة.</td></tr>}</tbody></table></div>
      </section>

      <section id="modules" className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-5 lg:p-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div><p className="text-xs font-bold text-blue-700">خريطة النظام</p><h2 className="mt-1 text-xl font-extrabold text-slate-950">الموديولات الرئيسية</h2><p className="mt-1 text-sm text-slate-500">الموديولات المنفذة تفتح مباشرة حسب صلاحيات الحساب.</p></div>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {modules.filter((module) => can(session?.user, module.permission)).map((module) => {
            const Icon = module.icon;
            return <Link href={module.href} key={module.code} className="group rounded-xl border border-slate-200 p-4 transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_8px_24px_rgba(15,23,42,.06)]"><div className="flex items-start gap-3"><span className={`grid size-10 shrink-0 place-items-center rounded-lg ring-1 ${module.color}`}><Icon className="size-5" /></span><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><div><h3 className="font-bold text-slate-900">{module.name}</h3><p className="mt-0.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">{module.live ? "متاح الآن" : "مرحلة لاحقة"}</p></div><ArrowUpRight className="size-4 text-slate-300 transition group-hover:text-blue-700" /></div><p className="mt-3 text-sm leading-6 text-slate-500">{module.description}</p><div className="mt-3 flex items-center gap-1.5 text-[11px] font-semibold text-slate-400"><Paperclip className="size-3" />المرفقات جزء أساسي من كل معاملة</div></div></div></Link>;
          })}
        </div>
      </section>
    </div>
  );
}
