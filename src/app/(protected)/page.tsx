import { ArrowLeft, ArrowUpRight, BanknoteArrowDown, BanknoteArrowUp, Building2, CircleCheckBig, Clock3, FileSpreadsheet, Landmark, Paperclip, ReceiptText, ShoppingCart, Sparkles, UsersRound, Vault } from "lucide-react";
import { auth } from "@/auth";
import { can } from "@/lib/permissions";

const modules = [
  { name: "الوارد", code: "Incoming", description: "عقود الجهة المالكة والمستخلصات والتحصيلات الفعلية.", icon: BanknoteArrowUp, color: "bg-blue-50 text-blue-700 ring-blue-100" },
  { name: "مستخلصات المقاولين", code: "Expenses", description: "حصر الأعمال والجوارى وتأمين الأعمال ومدفوعات المقاولين.", icon: FileSpreadsheet, color: "bg-indigo-50 text-indigo-700 ring-indigo-100" },
  { name: "المشتريات", code: "Purchases", description: "بنود وفواتير مشتريات المشروع والمدفوعات المرتبطة بها.", icon: ShoppingCart, color: "bg-amber-50 text-amber-700 ring-amber-100" },
  { name: "النثريات", code: "Prose", description: "مصروفات المشروعات والمصروفات العامة بمرفقاتها.", icon: ReceiptText, color: "bg-rose-50 text-rose-700 ring-rose-100" },
  { name: "المرتبات", code: "Salaries", description: "مرتبات ومكافآت وخصومات وسلف وتسكين الموظفين.", icon: UsersRound, color: "bg-violet-50 text-violet-700 ring-violet-100" },
  { name: "الخزنة", code: "Treasur", description: "حركة الخزائن والعهد والإضافات والمصروفات الفعلية.", icon: Vault, color: "bg-emerald-50 text-emerald-700 ring-emerald-100" },
];

const metrics = [
  { label: "المشروعات", icon: Building2, hint: "بعد إعداد البيانات الأساسية" },
  { label: "إجمالي الوارد", icon: BanknoteArrowUp, hint: "من مستخلصات المالك" },
  { label: "إجمالي المنصرف", icon: BanknoteArrowDown, hint: "من جميع مصادر التكلفة" },
  { label: "الرصيد النقدي", icon: Landmark, hint: "من الخزائن والبنوك" },
];

export default async function Home() {
  const session = await auth();
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
        {metrics.map(({ label, icon: Icon, hint }) => <article key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,.03)]"><div className="flex items-start justify-between"><div><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-2 text-2xl font-extrabold text-slate-900">—</p></div><span className="grid size-9 place-items-center rounded-lg bg-blue-50 text-blue-700"><Icon className="size-4.5" /></span></div><p className="mt-3 text-[11px] text-slate-400">{hint}</p></article>)}
      </section>

      <section id="modules" className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-5 lg:p-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div><p className="text-xs font-bold text-blue-700">خريطة النظام</p><h2 className="mt-1 text-xl font-extrabold text-slate-950">الموديولات الرئيسية</h2><p className="mt-1 text-sm text-slate-500">روابط مؤقتة حتى نبدأ موديولات البيانات بعد اعتماد كل مرحلة.</p></div>
          <div className="inline-flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500 ring-1 ring-slate-200"><Clock3 className="size-3.5" />التنفيذ يتم مرحلة بمرحلة</div>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {modules.map((module) => {
            const Icon = module.icon;
            return <article key={module.code} className="group rounded-xl border border-slate-200 p-4 transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_8px_24px_rgba(15,23,42,.06)]"><div className="flex items-start gap-3"><span className={`grid size-10 shrink-0 place-items-center rounded-lg ring-1 ${module.color}`}><Icon className="size-5" /></span><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><div><h3 className="font-bold text-slate-900">{module.name}</h3><p className="mt-0.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">{module.code} Module</p></div><ArrowUpRight className="size-4 text-slate-300 transition group-hover:text-blue-700" /></div><p className="mt-3 text-sm leading-6 text-slate-500">{module.description}</p><div className="mt-3 flex items-center gap-1.5 text-[11px] font-semibold text-slate-400"><Paperclip className="size-3" />المرفقات جزء أساسي من كل معاملة</div></div></div></article>;
          })}
        </div>
      </section>
    </div>
  );
}
