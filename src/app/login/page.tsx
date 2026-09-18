import Image from "next/image";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import { LoginForm } from "@/components/login-form";
import { companyBrand } from "@/lib/company-brand";

export default function LoginPage() {
  return (
    <main className="grid min-h-screen bg-slate-100 lg:grid-cols-[1.05fr_0.95fr]" dir="rtl">
      <section className="relative hidden overflow-hidden bg-[#10192d] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -left-24 -top-24 size-96 rounded-full bg-blue-600/20 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-2xl bg-white p-1.5 shadow-xl shadow-blue-950/40"><Image src={companyBrand.logoPath} alt="ASGC" width={48} height={40} className="h-auto w-full" /></span>
          <div><p className="text-lg font-extrabold tracking-wide">{companyBrand.arabicName}</p><p className="text-xs text-slate-400">{companyBrand.englishName} · {companyBrand.systemName}</p></div>
        </div>
        <div className="relative max-w-xl">
          <p className="text-sm font-bold text-blue-400">منظومة واحدة · رؤية أوضح</p>
          <h1 className="mt-4 text-4xl font-black leading-[1.45]">إدارة المشروعات والمصروفات تبدأ من بيانات موثوقة.</h1>
          <div className="mt-8 space-y-4 text-sm text-slate-300">
            <p className="flex items-center gap-3"><CheckCircle2 className="size-5 text-emerald-400" />كل مستخدم يدخل بحسابه الخاص.</p>
            <p className="flex items-center gap-3"><CheckCircle2 className="size-5 text-emerald-400" />الصفحات الداخلية محمية بالكامل.</p>
          </div>
        </div>
        <p className="relative text-xs text-slate-500">منظومة إدارة المشروعات والمقاولات</p>
      </section>
      <section className="flex items-center justify-center p-5 sm:p-10">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-300/30 sm:p-9">
          <div className="mb-7 flex items-center gap-3 lg:hidden"><span className="grid size-11 place-items-center rounded-xl bg-blue-50 p-1"><Image src={companyBrand.logoPath} alt="ASGC" width={44} height={36} className="h-auto w-full" /></span><div><p className="font-extrabold text-slate-900">{companyBrand.arabicName}</p><p className="text-[11px] text-slate-500">{companyBrand.systemName}</p></div></div>
          <span className="grid size-11 place-items-center rounded-xl bg-blue-50 text-blue-600"><ShieldCheck className="size-5" /></span>
          <h2 className="mt-5 text-2xl font-black text-slate-900">مرحبًا بعودتك</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">سجّل الدخول للوصول إلى لوحة إدارة الشركة.</p>
          <LoginForm />
          <p className="mt-6 text-center text-[11px] text-slate-400">للاستخدام المصرّح به فقط</p>
        </div>
      </section>
    </main>
  );
}
