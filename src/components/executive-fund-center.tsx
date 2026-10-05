"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownToLine, ArrowUpFromLine, Ban, Banknote, ReceiptText, RotateCcw, WalletCards } from "lucide-react";
import { KpiCard, MoneyValue } from "@/components/erp-ui";
import { UploadBox } from "@/components/upload-box";
import { money } from "@/components/expense-sheet";
import { pettyLabels } from "@/lib/petty-cash";
import type { ExecutiveFundData } from "@/lib/executive-fund-data";
import { askToCreateSimilarFinancialOperation, confirmSimilarFinancialOperation, financialHeaders, financialResult } from "@/lib/financial-submit";

const today = () => new Date().toISOString().slice(0, 10);

export function ExecutiveFundCenter({ initialData }: { initialData: ExecutiveFundData }) {
  const router = useRouter();
  const [data, setData] = useState(initialData);
  const [action, setAction] = useState<"issue" | "expense" | "return">("issue");
  const [allocation, setAllocation] = useState("GENERAL");
  const [month, setMonth] = useState("");
  const [projectId, setProjectId] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const visible = useMemo(() => data.transactions.filter((item) =>
    (!month || item.transactionDate.startsWith(month)) && (!projectId || item.projectId === projectId),
  ), [data.transactions, month, projectId]);

  async function refresh() {
    const response = await fetch("/api/executive-fund");
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "تعذر تحديث الصندوق.");
    setData(body);
    router.refresh();
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const scope = `executive-fund-${action}`;
    setBusy(true); setError(""); setNotice("");
    const send = async () => financialResult(await fetch("/api/executive-fund", { method: "POST", body: new FormData(form), headers: financialHeaders(scope) }), scope);
    try {
      try { await send(); }
      catch (reason) {
        const similar = (reason as Error & { similarFinancialOperation?: { confirmationToken: string } }).similarFinancialOperation;
        if (!similar || !await askToCreateSimilarFinancialOperation(similar)) throw reason;
        confirmSimilarFinancialOperation(scope, similar.confirmationToken);
        await send();
      }
      form.reset();
      setNotice("تم حفظ الحركة وتحديث رصيد صندوق المدير التنفيذي.");
      await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "تعذر حفظ الحركة."); }
    finally { setBusy(false); }
  }

  async function reverse(id: string) {
    const reason = window.prompt("اكتب سبب إلغاء الحركة:")?.trim();
    if (!reason) return;
    const form = new FormData(); form.set("action", "reverse"); form.set("id", id); form.set("reason", reason);
    const scope = `executive-fund-reverse-${id}`;
    setBusy(true); setError("");
    try {
      await financialResult(await fetch("/api/executive-fund", { method: "POST", body: form, headers: financialHeaders(scope) }), scope);
      setNotice("تم إلغاء الحركة وعكس القيد المحاسبي."); await refresh();
    } catch (reasonValue) { setError(reasonValue instanceof Error ? reasonValue.message : "تعذر إلغاء الحركة."); }
    finally { setBusy(false); }
  }

  if (!data.account || !data.main) return <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-950"><h1 className="text-xl font-black">صندوق المدير التنفيذي غير مهيأ</h1><p className="mt-2 text-sm">شغّل ترحيلات قاعدة البيانات لإضافة حساب الصندوق والحساب المحاسبي.</p></section>;

  return <div className="space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div><p className="text-xs font-bold text-blue-700">المالية · حساب نقدي فرعي</p><h1 className="mt-1 text-2xl font-black text-slate-950">صندوق المدير التنفيذي</h1><p className="mt-1 text-sm text-slate-500">رصيد نقدي بين الخزنة والمدير، وليس مديونية أو عهدة واجبة الرد.</p></div>
    </header>
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard label="الرصيد مع المدير" value={money(data.account.balanceCents)} icon={WalletCards} tone="blue" hint="نقدية مملوكة للشركة" />
      <KpiCard label="المحول من الخزنة" value={money(data.totals.receivedCents)} icon={ArrowDownToLine} tone="emerald" />
      <KpiCard label="المصروف من الصندوق" value={money(data.totals.expenseCents)} icon={ReceiptText} tone="amber" />
      <KpiCard label="المحول إلى الخزنة" value={money(data.totals.returnedCents)} icon={ArrowUpFromLine} tone="violet" />
    </section>

    {data.canManage ? <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap gap-2">{([['issue', 'تحويل من الخزنة', ArrowDownToLine], ['expense', 'تسجيل مصروف', ReceiptText], ['return', 'تحويل إلى الخزنة', RotateCcw]] as const).map(([key, label, Icon]) => <button key={key} type="button" onClick={() => setAction(key)} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold ${action === key ? 'bg-blue-700 text-white' : 'border border-slate-200 text-slate-600'}`}><Icon className="size-4" />{label}</button>)}</div>
      <input type="hidden" name="action" value={action} />
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <label className="text-xs font-bold text-slate-700">المبلغ *<input name="amount" type="number" min="0.01" step="0.01" required className="erp-input mt-1" /></label>
        <label className="text-xs font-bold text-slate-700">التاريخ *<input name="date" type="date" defaultValue={today()} required className="erp-input mt-1" /></label>
        <label className="text-xs font-bold text-slate-700">رقم المستند<input name="documentNumber" maxLength={100} className="erp-input mt-1" /></label>
      </div>
      {action === "expense" ? <div className="mt-3 grid gap-3 md:grid-cols-3">
        <label className="text-xs font-bold text-slate-700">التصنيف *<select name="categoryId" required className="erp-input mt-1"><option value="">اختر التصنيف</option>{data.categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="text-xs font-bold text-slate-700">جهة التحميل *<select name="allocation" value={allocation} onChange={(event) => setAllocation(event.target.value)} className="erp-input mt-1"><option value="GENERAL">عام الشركة</option><option value="PROJECT">مشروع</option></select></label>
        {allocation === "PROJECT" ? <label className="text-xs font-bold text-slate-700">المشروع *<select name="projectId" required className="erp-input mt-1"><option value="">اختر المشروع</option>{data.projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label> : null}
      </div> : null}
      <label className="mt-3 block text-xs font-bold text-slate-700">البيان *<textarea name="description" required maxLength={2000} rows={2} className="erp-input mt-1" /></label>
      <div className="mt-3"><UploadBox name="files" label="إثبات الحركة" required /></div>
      <div className="mt-4 flex items-center gap-3"><button disabled={busy} className="rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">{busy ? "جارٍ الحفظ..." : "حفظ الحركة"}</button>{notice ? <p className="text-xs font-bold text-emerald-700">{notice}</p> : null}{error ? <p className="text-xs font-bold text-rose-700">{error}</p> : null}</div>
    </form> : null}

    <section className="erp-table-shell">
      <div className="grid gap-3 border-b bg-white p-4 sm:grid-cols-2"><label className="text-xs font-bold text-slate-700">الشهر<input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="erp-input mt-1" /></label><label className="text-xs font-bold text-slate-700">المشروع<select value={projectId} onChange={(event) => setProjectId(event.target.value)} className="erp-input mt-1"><option value="">كل المشروعات</option>{data.projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
      <div className="erp-table-scroll"><table className="erp-data-table erp-responsive-table min-w-[1050px]"><thead><tr>{["التاريخ", "رقم الحركة", "النوع", "البيان", "المشروع / التصنيف", "وارد", "منصرف", "المرفقات", "المسجل", "الإجراء"].map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{visible.map((item) => { const incoming = item.destinationAccountId === data.account!.id; return <tr key={item.id} className={item.status === "REVERSED" ? "opacity-50" : ""}><td data-label="التاريخ">{item.transactionDate.slice(0, 10)}</td><td data-label="رقم الحركة" className="font-mono text-[11px]">{item.number}</td><td data-label="النوع">{pettyLabels[item.type] || item.type}{item.status === "REVERSED" ? " — ملغاة" : ""}</td><td data-label="البيان">{item.description}</td><td data-label="المشروع / التصنيف">{item.project?.name || "عام الشركة"}{item.category ? ` · ${item.category.name}` : ""}</td><td data-label="وارد">{incoming ? <MoneyValue>{money(item.amountCents)}</MoneyValue> : "—"}</td><td data-label="منصرف">{!incoming ? <MoneyValue>{money(item.amountCents)}</MoneyValue> : "—"}</td><td data-label="المرفقات">{item.attachments.length ? item.attachments.map((file) => <a key={file.id} href={`/api/petty-cash/attachments/${file.id}`} className="block text-xs font-bold text-blue-700">{file.label}</a>) : "—"}</td><td data-label="المسجل">{item.recordedBy.name}</td><td data-label="الإجراء">{data.canManage && item.status === "POSTED" ? <button type="button" disabled={busy} onClick={() => reverse(item.id)} className="erp-icon-action erp-icon-action-danger" aria-label="إلغاء الحركة" title="إلغاء الحركة"><Ban className="size-4" /></button> : "—"}</td></tr>;})}{!visible.length ? <tr><td colSpan={10} className="py-12 text-center text-slate-400"><Banknote className="mx-auto mb-2 size-7" />لا توجد حركات مطابقة.</td></tr> : null}</tbody></table></div>
    </section>
  </div>;
}
