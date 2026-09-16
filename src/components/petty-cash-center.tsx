"use client";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { CurrencyInput } from "@/components/currency-input";
import { ERPSelect } from "@/components/erp-select";
import { UploadBox } from "@/components/upload-box";
import { DocumentLayout } from "@/components/document-layout";
import { isProjectCost, pettyLabels } from "@/lib/petty-cash";

type Named = { id: string; name: string };
type Category = Named & { active: boolean; requiresDocument: boolean; requiresAttachment: boolean };
type Account = Named & { type: string; employeeId: string | null; balanceCents: number };
type Movement = { id: string; number: string; type: string; status: string; amountCents: number; projectId: string | null; sourceAccountId: string | null; destinationAccountId: string | null; transactionDate: string; description: string; documentNumber: string | null; reversalReason: string | null; project: { name: string } | null; category: { name: string } | null; recordedBy: { name: string }; attachments: Named[] };
type Count = { id: string; accountId: string; expectedCents: number; actualCents: number; differenceCents: number; countedAt: string; notes: string | null };
type Data = { accounts: Account[]; categories: Category[]; transactions: Movement[]; counts: Count[]; projects: Named[]; employees: Named[]; canManage: boolean; audit: { id: string; action: string; target: string; createdAt: string; details: string | null }[] };
const money = (cents: number) => (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = () => new Date().toISOString().slice(0,10);
const card = "rounded-xl border border-slate-200 bg-white p-5";
const button = "rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50";
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="grid gap-2 text-sm text-slate-700"><span>{label}</span>{children}</label>; }

export function PettyCashCenter() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("dashboard"), [panel, setPanel] = useState("");
  const [type, setType] = useState("FUNDING"), [allocation, setAllocation] = useState("GENERAL");
  const [categoryId, setCategoryId] = useState(""), [selected, setSelected] = useState("");
  const [project, setProject] = useState(""), [from, setFrom] = useState(""), [to, setTo] = useState(""), [custody, setCustody] = useState(""), [filterType, setFilterType] = useState("");
  useEffect(() => {
    let alive = true;
    fetch("/api/petty-cash").then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error); if (alive) { setData(d); setProject(new URLSearchParams(location.search).get("project") || ""); } }).catch(e => { if (alive) setError(String(e)); });
    return () => { alive = false; };
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    const body = new FormData(event.currentTarget);
    try {
      const r = await fetch("/api/petty-cash", { method: "POST", body }); const result = await r.json();
      if (!r.ok) throw new Error(result.error || "تعذر الحفظ");
      const refreshed = await fetch("/api/petty-cash"); if (!refreshed.ok) throw new Error("تم الحفظ؛ تعذر تحديث العرض. أعد تحميل الصفحة.");
      setData(await refreshed.json()); setPanel(""); setNotice("تم الحفظ بنجاح.");
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر الاتصال."); } finally { setBusy(false); }
  }
  if (!data) return <p role="status">{error || "جاري تحميل Petty Cash..."}</p>;
  const posted = data.transactions.filter(t => t.status === "POSTED");
  const main = data.accounts.find(a => a.type === "MAIN");
  const custodies = data.accounts.filter(a => a.type === "CUSTODY");
  const activeCategory = data.categories.find(c => c.id === categoryId);
  const expense = isProjectCost(type);
  const rows = data.transactions.filter(t => (!project || t.projectId === project) && (!from || t.transactionDate.slice(0,10) >= from) && (!to || t.transactionDate.slice(0,10) <= to) && (!filterType || t.type === filterType) && (!custody || t.sourceAccountId === custody || t.destinationAccountId === custody));
  const editedCategory = data.categories.find(c => c.id === selected);
  const original = data.transactions.find(t => t.id === selected);
  const count = data.counts.find(c => c.id === selected);
  const accountName = (id: string | null) => data.accounts.find(a => a.id === id)?.name || "—";
  const open = (next: string, id = "") => { setPanel(next); setSelected(id); setError(""); setNotice(""); };
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-extrabold">Petty Cash — النثريات والصندوق التشغيلي</h1><p className="mt-1 text-sm text-slate-500">مصروفات الشركة والمشروعات والعهد.</p></div>{data.canManage && !panel && <button className={button} onClick={() => open("transaction")}>إضافة حركة</button>}</div>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}{notice && <p role="status" className="rounded-lg bg-green-50 p-3 text-green-800">{notice}</p>}
    {panel && data.canManage ? <>
      <button onClick={() => setPanel("")} className="text-sm text-blue-700">← العودة للسجل</button>
      <DocumentLayout movements={data.audit.filter(a => !selected || a.target === selected).slice(0,12).map(a => ({ id: a.id, label: a.action === "pettycash.reverse" ? "عكس حركة" : a.action === "pettycash.cash_count" ? "جرد نقدية" : a.action === "pettycash.category" ? "تحديث تصنيف" : "تسجيل حركة", date: a.createdAt }))}>
        <form key={panel + selected} onSubmit={submit} className={card + " space-y-5"}>
          <h2 className="font-extrabold">{({transaction:"إضافة حركة",reverse:"عكس وتصحيح حركة",category:"إدارة تصنيف", "cash-count":"جرد النقدية",adjust:"تسوية فرق الجرد"} as Record<string,string>)[panel]}</h2>
          <input type="hidden" name="action" value={panel} />
          {panel === "transaction" && <div className="grid gap-4 md:grid-cols-2">
            <Field label="نوع الحركة"><ERPSelect name="type" value={type} onValueChange={setType}>{Object.entries(pettyLabels).filter(([k]) => !k.startsWith("ADJUSTMENT")).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</ERPSelect></Field>
            <Field label="القيمة"><CurrencyInput name="amount" required min={0.01} /></Field>
            <Field label="التاريخ"><input name="date" type="date" required defaultValue={today()} className="erp-control" /></Field>
            {type === "FUNDING" && <p className="self-center text-sm">مصدر التمويل: المدير التنفيذي · يؤكد المسجل استلام المبلغ بإثباته.</p>}
            {type === "CUSTODY_ISSUE" && <><Field label="الموظف"><ERPSelect name="employeeId" required><option value="">اختر الموظف</option>{data.employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</ERPSelect></Field><Field label="اسم العهدة"><input name="custodyName" className="erp-control" placeholder="اختياري" /></Field></>}
            {["CUSTODY_EXPENSE","CUSTODY_RETURN"].includes(type) && <Field label="العهدة"><ERPSelect name="sourceAccountId" required><option value="">اختر العهدة</option>{custodies.filter(a=>a.balanceCents>0).map(a => <option key={a.id} value={a.id}>{a.name} — {money(a.balanceCents)} ج.م</option>)}</ERPSelect></Field>}
            {expense && <><Field label="التحميل"><ERPSelect name="allocation" value={allocation} onValueChange={setAllocation}><option value="GENERAL">عام الشركة</option><option value="PROJECT">مشروع</option></ERPSelect></Field>{allocation === "PROJECT" && <Field label="المشروع"><ERPSelect name="projectId" required defaultValue={project}><option value="">اختر المشروع</option>{data.projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</ERPSelect></Field>}<Field label="التصنيف"><ERPSelect name="categoryId" value={categoryId} onValueChange={setCategoryId} required><option value="">اختر التصنيف</option>{data.categories.filter(c=>c.active).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</ERPSelect></Field></>}
            <Field label="رقم المستند"><input className="erp-control" name="documentNumber" required={expense && activeCategory?.requiresDocument} /></Field>
            <Field label="البيان"><input className="erp-control" name="description" required maxLength={2000} /></Field>
            <div className="md:col-span-2"><UploadBox name="files" label="إثبات الحركة" required={!expense || (activeCategory?.requiresAttachment ?? true)} /></div>
          </div>}
          {panel === "reverse" && original && <><input type="hidden" name="id" value={selected}/><p>{original.description} — {money(original.amountCents)} ج.م</p><p className="text-sm text-slate-500">تعكس الحركة مع الاحتفاظ بالأصل؛ سجل الحركة الصحيحة بعدها من «إضافة حركة».</p><Field label="سبب العكس"><input className="erp-control" name="reason" required /></Field><UploadBox name="files" label="إثبات العكس" required /></>}
          {panel === "category" && <><input type="hidden" name="id" value={selected}/><Field label="اسم التصنيف"><input name="name" className="erp-control" required defaultValue={editedCategory?.name} maxLength={150}/></Field>{[["active","نشط",editedCategory?.active ?? true],["requiresDocument","رقم المستند إلزامي",editedCategory?.requiresDocument ?? false],["requiresAttachment","المرفق إلزامي",editedCategory?.requiresAttachment ?? true]].map(([name,label,value])=><label key={String(name)} className="flex items-center gap-2 text-sm"><input type="checkbox" name={String(name)} value="true" defaultChecked={Boolean(value)}/>{label}</label>)}</>}
          {panel === "cash-count" && <><Field label="الصندوق / العهدة"><ERPSelect name="accountId">{data.accounts.map(a=><option key={a.id} value={a.id}>{a.name} — {money(a.balanceCents)} ج.م</option>)}</ERPSelect></Field><Field label="النقدية الفعلية"><CurrencyInput name="actual" required min={0}/></Field><Field label="التاريخ"><input className="erp-control" name="date" type="date" defaultValue={today()} required/></Field><Field label="ملاحظات"><input name="notes" className="erp-control"/></Field><p className="text-sm text-slate-500">تسجيل الجرد لا يغير الرصيد. الفرق يُعالج بتسوية مستقلة.</p></>}
          {panel === "adjust" && count && <><input type="hidden" name="countId" value={count.id}/><p>فرق الجرد: <b dir="ltr">{money(count.differenceCents)}</b> ج.م</p><Field label="سبب التسوية"><input name="description" required className="erp-control"/></Field><Field label="التاريخ"><input name="date" type="date" required defaultValue={today()} className="erp-control"/></Field><UploadBox name="files" label="إثبات التسوية" required/><p className="text-sm text-slate-500">التسوية تصحح النقدية فقط، ولا تُحمّل تلقائيًا على تكلفة مشروع.</p></>}
          <button disabled={busy} className={button}>{busy ? "جاري الحفظ..." : "تأكيد وحفظ"}</button>
        </form>
      </DocumentLayout>
    </> : <>
      <nav className="flex flex-wrap gap-2">{[["dashboard","الملخص"],["ledger","سجل الحركة"],["custodies","العهد"],["counts","جرد النقدية"],["categories","التصنيفات"]].map(([key,label])=><button key={key} onClick={()=>setTab(key)} className={"rounded-lg border px-4 py-2 text-sm " + (tab===key?"bg-slate-900 text-white":"bg-white")}>{label}</button>)}</nav>
{tab === "dashboard" && <div className="grid gap-3 md:grid-cols-4">{[["رصيد الصندوق",main?.balanceCents || 0],["العهد القائمة",custodies.reduce((s,a)=>s+a.balanceCents,0)],["إجمالي التمويل",posted.filter(t=>t.type==="FUNDING").reduce((s,t)=>s+t.amountCents,0)],["المصروف الفعلي",posted.filter(t=>isProjectCost(t.type)).reduce((s,t)=>s+t.amountCents,0)]] .map(([label,value])=><div key={String(label)} className={card}><p className="text-sm text-slate-500">{label}</p><b className="mt-3 block text-xl" dir="ltr">{money(Number(value))} ج.م</b></div>)}</div>}
      {(tab === "dashboard" || tab === "ledger") && <section className={card}>
        <div className="mb-4 grid gap-3 md:grid-cols-5"><ERPSelect value={project} onValueChange={setProject}><option value="">كل المشروعات والعام</option>{data.projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</ERPSelect><ERPSelect value={filterType} onValueChange={setFilterType}><option value="">كل الحركات</option>{Object.entries(pettyLabels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</ERPSelect><ERPSelect value={custody} onValueChange={setCustody}><option value="">كل العهد</option>{custodies.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</ERPSelect><input aria-label="من تاريخ" className="erp-control" type="date" value={from} onChange={e=>setFrom(e.target.value)}/><input aria-label="إلى تاريخ" className="erp-control" type="date" value={to} onChange={e=>setTo(e.target.value)}/></div>
        <p className="mb-4 text-sm text-slate-500">{rows.length} حركة · المصروف الفعلي حسب الفلاتر: {money(rows.filter(t=>t.status==="POSTED"&&isProjectCost(t.type)).reduce((s,t)=>s+t.amountCents,0))} ج.م {project && <Link href={"/?project="+project} className="text-blue-700">· الملف المالي للمشروع</Link>}</p>
        <div className="overflow-auto"><table className="w-full text-right text-sm"><thead className="bg-slate-100"><tr>{["التاريخ / المستند","الحركة / المصدر","البيان / التحميل","القيمة","المسجل / الحالة","المرفقات",""].map((x,i)=><th key={i} className="p-3">{x}</th>)}</tr></thead><tbody className="divide-y">{rows.map(t=><tr key={t.id}><td className="p-3">{t.transactionDate.slice(0,10)}<p className="text-xs text-slate-500">{t.documentNumber || "—"}</p></td><td className="p-3">{pettyLabels[t.type]}<p className="text-xs text-slate-500">{t.type==="FUNDING"?"المدير التنفيذي":accountName(t.sourceAccountId)} → {accountName(t.destinationAccountId)}</p></td><td className="p-3">{t.description}<p className="text-xs text-slate-500">{t.project?.name || (isProjectCost(t.type)?"عام الشركة":"—")} · {t.category?.name}</p>{t.reversalReason && <p className="text-xs text-red-700">سبب العكس: {t.reversalReason}</p>}</td><td className="p-3" dir="ltr">{money(t.amountCents)}</td><td className="p-3">{t.recordedBy.name}<p>{t.status==="POSTED"?"مسجلة":"معكوسة"}</p></td><td className="p-3">{t.attachments.map(a=><a key={a.id} className="block text-blue-700" href={"/api/petty-cash/attachments/"+a.id} target="_blank" rel="noreferrer">{a.name}</a>)}</td><td className="p-3">{data.canManage&&t.status==="POSTED"&&<button onClick={()=>open("reverse",t.id)} className="text-red-700">عكس / تصحيح</button>}</td></tr>)}{!rows.length&&<tr><td colSpan={7} className="p-6 text-center text-slate-500">لا توجد حركات مطابقة.</td></tr>}</tbody></table></div>
      </section>}
      {tab === "custodies" && <section className={card}><h2 className="mb-4 font-bold">العهد المستقلة · {custodies.filter(a=>a.balanceCents>0).length} مفتوحة</h2>{custodies.map(a=><div key={a.id} className="flex flex-wrap justify-between gap-3 border-b py-4"><div><strong>{a.name}</strong><p className="text-sm text-slate-500">{data.employees.find(e=>e.id===a.employeeId)?.name} · {a.balanceCents===0?"مسواة":"قائمة / تسوية جزئية"}</p></div><b dir="ltr">{money(a.balanceCents)} ج.م</b><button className="text-blue-700" onClick={()=>{setCustody(a.id);setProject("");setFilterType("");setFrom("");setTo("");setTab("ledger");}}>كشف العهدة</button></div>)}{!custodies.length&&<p>لا توجد عهد.</p>}</section>}
      {tab === "counts" && <section className={card}>{data.canManage&&<button className={button} onClick={()=>open("cash-count")}>تسجيل جرد</button>}<div className="overflow-auto"><table className="mt-4 w-full text-right text-sm"><thead><tr>{["التاريخ","الصندوق","الدفتري","الفعلي","الفرق","الملاحظات",""].map((x,i)=><th className="p-3" key={i}>{x}</th>)}</tr></thead><tbody>{data.counts.map(c=><tr key={c.id} className="border-t"><td className="p-3">{c.countedAt.slice(0,10)}</td><td>{accountName(c.accountId)}</td><td dir="ltr">{money(c.expectedCents)}</td><td dir="ltr">{money(c.actualCents)}</td><td dir="ltr">{money(c.differenceCents)}</td><td>{c.notes}</td><td>{posted.some(t=>t.documentNumber==="COUNT:"+c.id)?"تمت التسوية":c.differenceCents!==0&&data.canManage?<button className="text-blue-700" onClick={()=>open("adjust",c.id)}>تسوية الفرق</button>:"—"}</td></tr>)}</tbody></table></div></section>}
      {tab === "categories" && <section className={card}>{data.canManage&&<button className={button} onClick={()=>open("category")}>إضافة تصنيف</button>}<div className="mt-4 grid gap-3 md:grid-cols-2">{data.categories.map(c=><div key={c.id} className="rounded-lg border p-3"><strong>{c.name}</strong><p className="my-2 text-xs text-slate-500">{c.active?"نشط":"موقوف"} · المرفق {c.requiresAttachment?"إلزامي":"اختياري"} · رقم المستند {c.requiresDocument?"إلزامي":"اختياري"}</p>{data.canManage&&<button className="text-sm text-blue-700" onClick={()=>open("category",c.id)}>تعديل</button>}</div>)}</div></section>}
    </>}
  </div>;
}
