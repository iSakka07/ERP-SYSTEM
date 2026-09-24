"use client";

import { FormEvent, useEffect, useState } from "react";
import { Building2, Factory, LoaderCircle, Pencil, Plus, Trash2, Users, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { ERPSelect } from "@/components/erp-select";
import { DataTable, IconAction } from "@/components/erp-ui";
import { employeeJobPrefixes } from "@/lib/employee-codes";
import { pdfColumns, previewDataPdf, usePdfDataExport } from "@/components/pdf-data-export";

type Company = { id: string; name: string; type: string; phone: string | null };
type Engineer = { id: string; employeeCode: string; name: string; jobTitle: string; phone: string | null; supervisors: { project: { id: string; name: string } }[] };
type Project = { id: string; code: string; name: string; company: Company; supervisors: { employee: { id: string; name: string } }[] };
type Tab = "companies" | "projects" | "engineers";
const companyTypes: Record<string, string> = { OWNER: "جهة مالكة", SUBCONTRACTOR: "مقاول باطن", SUPPLIER: "مورد" };
const companyTypeStyles: Record<string, string> = {
  OWNER: "border border-blue-200 bg-blue-50 text-blue-700",
  SUBCONTRACTOR: "border border-amber-200 bg-amber-50 text-amber-700",
  SUPPLIER: "border border-emerald-200 bg-emerald-50 text-emerald-700",
};

export function ManagementCenter({ companies, projects, engineers, canManage }: { companies: Company[]; projects: Project[]; engineers: Engineer[]; canManage: boolean }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("companies");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [companyType, setCompanyType] = useState("OWNER");
  const [companyModalOpen, setCompanyModalOpen] = useState(false);
  const [editingEngineer, setEditingEngineer] = useState<Engineer | null>(null);
  const [engineerProjectId, setEngineerProjectId] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [employeeCodePreview, setEmployeeCodePreview] = useState("");
  useEffect(() => {
    if (editingEngineer) return;
    if (!jobTitle) return;
    const controller = new AbortController();
    fetch(`/api/management?jobTitle=${encodeURIComponent(jobTitle)}`, { signal: controller.signal })
      .then(response => response.ok ? response.json() : Promise.reject())
      .then(result => setEmployeeCodePreview(result.employeeCode))
      .catch(() => { if (!controller.signal.aborted) setEmployeeCodePreview(""); });
    return () => controller.abort();
  }, [jobTitle, editingEngineer, engineers]);
  const tabs = [
    { key: "companies" as const, label: "الشركات والجهات", icon: Factory, count: companies.length },
    { key: "projects" as const, label: "المشروعات", icon: Building2, count: projects.length },
    { key: "engineers" as const, label: "الموظفون", icon: Users, count: engineers.length },
  ];
  usePdfDataExport(() => {
    const report = tab === "companies" ? { title: "الشركات والجهات", tables: [{ columns: pdfColumns(["نوع الجهة", 2], ["الاسم", 3], ["الهاتف", 2]), rows: companies.map((item) => [companyTypes[item.type] || item.type, item.name, ["SUBCONTRACTOR", "SUPPLIER"].includes(item.type) ? item.phone || "—" : "—"]) }] }
      : tab === "projects" ? { title: "المشروعات", tables: [{ columns: pdfColumns(["كود المشروع", 2], ["اسم المشروع", 3], ["الجهة المالكة", 2], ["المهندس المشرف", 3]), rows: projects.map((item) => [item.code, item.name, item.company.name, [...new Set(item.supervisors.map(({ employee }) => employee.name))].join("، ") || "غير محدد"]) }] }
      : { title: "الموظفون", tables: [{ columns: pdfColumns(["الكود", 2], ["اسم الموظف", 3], ["المسمى الوظيفي", 2], ["الهاتف", 2], ["التسكين", 2], ["المشروع", 3]), rows: engineers.map((item) => [item.employeeCode, item.name, item.jobTitle, item.phone || "—", item.supervisors[0] ? "مشروع" : "عام الشركة", item.supervisors[0]?.project.name || "—"]) }] };
    void previewDataPdf(report);
  });

  async function request(method: "POST" | "PATCH" | "DELETE", body: object, key: string) {
    setBusy(key); setMessage("");
    const response = await fetch("/api/management", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json(); setBusy("");
    if (!response.ok) {
      const labels: Record<string, string> = { INVALID_OWNER: "اختر جهة مالكة صحيحة.", INVALID_PROJECT: "اختر مشروعًا صحيحًا.", DUPLICATE_OR_INVALID: "البيانات مكررة أو غير صحيحة." };
      setMessage(labels[result.error] || "تعذر حفظ العملية. راجع البيانات وحاول مرة أخرى."); return false;
    }
    setMessage(method === "DELETE" ? "تم المسح من القوائم مع الاحتفاظ بالتاريخ السابق." : "تم حفظ البيانات بنجاح."); router.refresh(); return true;
  }
  async function submit(event: FormEvent<HTMLFormElement>, type: "company" | "project" | "engineer") {
    event.preventDefault(); const form = event.currentTarget;
    if (await request("POST", { type, ...Object.fromEntries(new FormData(form)) }, `create-${type}`)) { form.reset(); if (type === "company") { setCompanyType("OWNER"); setCompanyModalOpen(false); } }
  }
  async function remove(entity: "company" | "project" | "engineer", id: string, name: string) {
    if (!window.confirm(`مسح «${name}» من القوائم؟ سيظل تاريخه السابق محفوظًا.`)) return;
    await request("DELETE", { entity, id }, id);
  }
  async function submitEngineer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget;
    const payload = { ...Object.fromEntries(new FormData(form)), projectId: engineerProjectId };
    const method = editingEngineer ? "PATCH" : "POST";
    const body = editingEngineer ? { ...payload, id: editingEngineer.id } : { type: "engineer", ...payload };
    if (await request(method, body, editingEngineer ? `edit-${editingEngineer.id}` : "create-engineer")) {
      form.reset(); setEditingEngineer(null); setEngineerProjectId(""); setJobTitle(""); setEmployeeCodePreview("");
    }
  }
  function editEngineer(engineer: Engineer) {
    setEditingEngineer(engineer); setEngineerProjectId(engineer.supervisors[0]?.project.id || ""); setJobTitle(engineer.jobTitle); setEmployeeCodePreview(engineer.employeeCode); setMessage("");
  }
  const empty = (columns: number, label: string) => <tr><td colSpan={columns} className="py-12 text-center text-slate-400">{label}</td></tr>;

  return <div className="space-y-6">
    <section className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold text-blue-700">البيانات الأساسية</p><h1 className="mt-1 text-2xl font-black text-slate-950">إدارة الشركة والمشروعات</h1><p className="mt-2 text-sm text-slate-500">الجهات والمشروعات والموظفون في مكان واحد.</p></div>{canManage && tab === "companies" && <button type="button" className="erp-back-tab" onClick={() => { setCompanyModalOpen(true); setMessage(""); }}><Plus className="size-4" />إضافة شركة أو جهة</button>}</section>
    <div className="grid gap-3 sm:grid-cols-3">{tabs.map(({ key, label, icon: Icon, count }) => <button key={key} onClick={() => { setTab(key); setMessage(""); }} className={`flex min-h-20 items-center gap-3 rounded-xl border p-4 text-right transition ${tab === key ? "border-blue-300 bg-blue-50 text-blue-800 shadow-sm" : "border-slate-200 bg-white text-slate-700 hover:border-blue-200"}`}><span className={`grid size-10 place-items-center rounded-lg ${tab === key ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"}`}><Icon className="size-5" /></span><span><span className="block text-sm font-extrabold">{label}</span><span className="mt-1 block text-xs opacity-60">{count} سجل</span></span></button>)}</div>
    {message && <p role="status" className={`rounded-xl border px-4 py-3 text-sm font-bold ${message.includes("تعذر") || message.includes("اختر") || message.includes("مكررة") ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{message}</p>}

    {tab === "companies" && <Section title="الشركات والجهات" description="كل الجهات المسجلة في المنظومة.">
      <DataTable headers={["نوع الجهة", "الاسم", "الهاتف", "الإجراءات"]}>{companies.length ? companies.map(company => <tr key={company.id}><Cell label="نوع الجهة"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${companyTypeStyles[company.type] || "border border-slate-200 bg-slate-50 text-slate-700"}`}>{companyTypes[company.type]}</span></Cell><Cell label="الاسم" strong>{company.name}</Cell><Cell label="الهاتف">{["SUBCONTRACTOR", "SUPPLIER"].includes(company.type) ? company.phone || "—" : "—"}</Cell><Cell label="الإجراءات">{canManage && <IconAction label={`مسح ${company.name}`} icon={Trash2} tone="danger" disabled={busy === company.id} onClick={() => remove("company", company.id, company.name)} />}</Cell></tr>) : empty(4, "لا توجد شركات أو جهات مسجلة.")}</DataTable>
    </Section>}

    {companyModalOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/35 p-4" role="dialog" aria-modal="true" aria-labelledby="company-modal-title"><section className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-4"><div><h2 id="company-modal-title" className="text-lg font-black text-slate-950">إضافة شركة أو جهة</h2><p className="mt-1 text-xs text-slate-500">أضف جهة مالكة أو مقاول باطن أو موردًا.</p></div><button type="button" aria-label="إغلاق" className="erp-icon-action" onClick={() => setCompanyModalOpen(false)}><X className="size-4" /></button></div><form onSubmit={event => submit(event, "company")} className="mt-5 grid gap-3 sm:grid-cols-2"><label><Label>نوع الجهة</Label><ERPSelect name="companyType" value={companyType} onValueChange={setCompanyType} className="erp-control"><option value="OWNER">جهة مالكة</option><option value="SUBCONTRACTOR">مقاول باطن</option><option value="SUPPLIER">مورد</option></ERPSelect></label><Field label="اسم الشركة أو الجهة" name="name" placeholder="اكتب الاسم" />{["SUBCONTRACTOR", "SUPPLIER"].includes(companyType) && <Field label="رقم الهاتف" name="phone" required placeholder={companyType === "SUPPLIER" ? "رقم هاتف المورد" : "رقم هاتف المقاول"} />}<div className="flex gap-2 sm:col-span-2"><Submit busy={busy === "create-company"} /><button type="button" className="erp-back-tab" onClick={() => setCompanyModalOpen(false)}>إلغاء</button></div></form></section></div>}

    {tab === "projects" && <Section title="المشروعات" description="كل مشروع مرتبط مباشرة بالجهة المالكة.">
      <DataTable headers={["كود المشروع", "اسم المشروع", "الجهة المالكة", "المهندس المشرف", "الإجراءات"]}>{projects.length ? projects.map(project => <tr key={project.id}><Cell label="كود المشروع"><code dir="ltr" className="text-xs font-bold text-blue-700">{project.code}</code></Cell><Cell label="اسم المشروع" strong>{project.name}</Cell><Cell label="الجهة المالكة">{project.company.name}</Cell><Cell label="المهندس المشرف">{[...new Set(project.supervisors.map(({ employee }) => employee.name))].join("، ") || "غير محدد"}</Cell><Cell label="الإجراءات">{canManage && <IconAction label={`مسح ${project.name}`} icon={Trash2} tone="danger" disabled={busy === project.id} onClick={() => remove("project", project.id, project.name)} />}</Cell></tr>) : empty(5, "لا توجد مشروعات مسجلة.")}</DataTable>
      {canManage && <Form title="إضافة مشروع"><form onSubmit={event => submit(event, "project")} className="grid gap-3 md:grid-cols-3"><Field label="كود المشروع" name="code" placeholder="MAYAN-27" /><Field label="اسم المشروع" name="name" placeholder="عمارة 27 - كمبوند مايان" /><Select label="الجهة المالكة" name="companyId" options={companies.filter(item => item.type === "OWNER")} /><Submit busy={busy === "create-project"} /></form></Form>}
    </Section>}

    {tab === "engineers" && <Section title="الموظفون" description="بيانات الموظف وتسكينه الحالي في جدول واحد.">
      <DataTable headers={["الكود", "اسم الموظف", "المسمى الوظيفي", "الهاتف", "التسكين", "المشروع", "الإجراءات"]}>{engineers.length ? engineers.map(engineer => { const assignment = engineer.supervisors[0]; return <tr key={engineer.id}><Cell label="الكود"><code dir="ltr" className="text-xs font-bold text-blue-700">{engineer.employeeCode}</code></Cell><Cell label="اسم الموظف" strong>{engineer.name}</Cell><Cell label="المسمى الوظيفي">{engineer.jobTitle}</Cell><Cell label="الهاتف">{engineer.phone || "—"}</Cell><Cell label="التسكين"><span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">{assignment ? "مشروع" : "عام الشركة"}</span></Cell><Cell label="المشروع">{assignment?.project.name || "—"}</Cell><Cell label="الإجراءات"><div className="flex justify-center gap-1">{canManage && <><IconAction label={`تعديل أو نقل ${engineer.name}`} icon={Pencil} disabled={busy === `edit-${engineer.id}`} onClick={() => editEngineer(engineer)} /><IconAction label={`مسح ${engineer.name}`} icon={Trash2} tone="danger" disabled={busy === engineer.id} onClick={() => remove("engineer", engineer.id, engineer.name)} /></>}</div></Cell></tr>; }) : empty(7, "لا يوجد موظفون مسجلون.")}</DataTable>
      {canManage && <Form title={editingEngineer ? `تعديل وتسكين ${editingEngineer.name}` : "إضافة موظف وتسكينه"}><form key={editingEngineer?.id || "new"} onSubmit={submitEngineer} className="grid gap-3 md:grid-cols-2 xl:grid-cols-5"><label><Label>المسمى الوظيفي</Label><ERPSelect name="jobTitle" value={jobTitle} onValueChange={value => { setJobTitle(value); setEmployeeCodePreview(""); }} required className="erp-control"><option value="">اختر المسمى</option>{editingEngineer?.jobTitle && !(editingEngineer.jobTitle in employeeJobPrefixes) && <option value={editingEngineer.jobTitle}>{editingEngineer.jobTitle}</option>}{Object.keys(employeeJobPrefixes).map(title => <option key={title} value={title}>{title}</option>)}</ERPSelect></label><label><Label>كود الموظف — تلقائي</Label><input dir="ltr" readOnly value={editingEngineer ? editingEngineer.employeeCode : employeeCodePreview} placeholder="يظهر بعد اختيار المسمى" className="bg-slate-100 font-mono" /></label><Field label="اسم الموظف" name="name" defaultValue={editingEngineer?.name} /><Field label="رقم الهاتف" name="phone" required={false} defaultValue={editingEngineer?.phone || ""} /><Select label="التسكين" name="projectId" options={projects} optional value={engineerProjectId} onValueChange={setEngineerProjectId} /><Submit busy={busy === (editingEngineer ? `edit-${editingEngineer.id}` : "create-engineer")} label={editingEngineer ? "حفظ التعديل" : "إضافة"} />{editingEngineer && <button type="button" onClick={() => { setEditingEngineer(null); setEngineerProjectId(""); setJobTitle(""); setEmployeeCodePreview(""); }} className="flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50"><X className="size-4" />إلغاء</button>}</form></Form>}
    </Section>}
  </div>;
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) { return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><header className="border-b border-slate-100 px-5 py-4"><h2 className="font-extrabold text-slate-900">{title}</h2><p className="mt-1 text-xs text-slate-500">{description}</p></header>{children}</section>; }
function Form({ title, children }: { title: string; children: React.ReactNode }) { return <div className="border-t border-slate-200 bg-slate-50/70 p-5"><h3 className="mb-4 text-sm font-extrabold text-slate-900">{title}</h3>{children}</div>; }
function Cell({ label, children, strong = false }: { label: string; children: React.ReactNode; strong?: boolean }) { return <td data-label={label} className={strong ? "font-bold text-slate-900" : "text-slate-600"}>{children}</td>; }
function Label({ children }: { children: React.ReactNode }) { return <span className="mb-1.5 block text-xs font-bold text-slate-600">{children}</span>; }
function Submit({ busy, label = "إضافة" }: { busy: boolean; label?: string }) { return <button disabled={busy} className="mt-auto flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-700 px-5 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-60">{busy ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}{label}</button>; }
function Select({ label, name, options, optional = false, value, onValueChange }: { label: string; name: string; options: { id: string; name: string }[]; optional?: boolean; value?: string; onValueChange?: (value: string) => void }) { return <label><Label>{label}</Label><ERPSelect name={name} required={!optional} className="erp-control" value={value} onValueChange={onValueChange}>{optional && <option value="">عام الشركة</option>}{!optional && <option value="">اختر</option>}{options.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}</ERPSelect></label>; }
function Field({ label, name, placeholder, required = true, defaultValue }: { label: string; name: string; placeholder?: string; required?: boolean; defaultValue?: string }) { return <label><Label>{label}</Label><input name={name} required={required} placeholder={placeholder} defaultValue={defaultValue} /></label>; }
