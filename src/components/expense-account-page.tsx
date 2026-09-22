"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DocumentLayout } from "@/components/document-layout";
import { ERPSelect } from "@/components/erp-select";
import { ExpenseFileInput, expenseButton, expenseInput, sendExpense } from "@/components/expense-sheet";
import { ArrowRight, Save } from "lucide-react";

export function ExpenseAccountPage({ projects, companies, returnHref }: {
  projects: { id: string; name: string }[];
  companies: { id: string; name: string }[];
  returnHref: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(form: HTMLFormElement) {
    const data = new FormData(form);
    setBusy(true);
    setError("");
    try {
      const result = await sendExpense({
        action: "account",
        name: data.get("name"),
        companyId: data.get("companyId"),
        projectId: data.get("projectId"),
        scope: data.get("scope"),
        notes: data.get("notes"),
      }, form);
      const separator = returnHref.includes("?") ? "&" : "?";
      router.push(`${returnHref}${separator}account=${encodeURIComponent(result.id)}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر الحفظ.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-4">
      <button type="button" className="erp-back-tab" onClick={() => router.push(returnHref)}><ArrowRight className="size-4" />رجوع</button>
      <DocumentLayout>
        <form className="space-y-4 rounded-xl border border-slate-200 bg-white p-5" onSubmit={(event) => { event.preventDefault(); void submit(event.currentTarget); }}>
          <div><p className="text-xs font-bold text-blue-700">أعمال المقاولين</p><h1 className="mt-1 text-xl font-extrabold">إضافة مقاولة جديدة</h1><p className="mt-2 text-xs leading-6 text-slate-500">حدد المقاول والمشروع ونطاق الأعمال، وبعد الحفظ سيفتح شيت جاري 1 مباشرة.</p></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold">اسم المقاولة / الأعمال<input name="name" required maxLength={300} placeholder="أعمال نقاشة عمارة 27" className={`${expenseInput} mt-2`} /></label>
            <label className="text-xs font-bold">المقاول<ERPSelect name="companyId" required className={`${expenseInput} mt-2`} defaultValue=""><option value="" disabled>اختر مقاول باطن</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</ERPSelect></label>
            <label className="text-xs font-bold">المشروع<ERPSelect name="projectId" required className={`${expenseInput} mt-2`} defaultValue=""><option value="" disabled>اختر المشروع</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</ERPSelect></label>
            <label className="text-xs font-bold">وحدة التنفيذ / نطاق العمل<input name="scope" required maxLength={300} placeholder="عمارة 27 — نقاشة الدور الأرضي" className={`${expenseInput} mt-2`} /></label>
          </div>
          <label className="block text-xs font-bold">ملاحظات<textarea name="notes" maxLength={2000} className={`${expenseInput} mt-2`} /></label>
          <ExpenseFileInput />
          {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <div className="flex gap-2"><button disabled={busy || !companies.length || !projects.length} className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-5 py-3 text-sm font-bold text-white disabled:opacity-50"><Save className="size-4" />{busy ? "جارٍ الحفظ…" : "حفظ وفتح جاري 1"}</button><button type="button" className={expenseButton} onClick={() => router.push(returnHref)}>إلغاء</button></div>
        </form>
      </DocumentLayout>
    </div>
  );
}
