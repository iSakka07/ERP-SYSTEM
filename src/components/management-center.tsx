"use client";

import { FormEvent, useState } from "react";
import { Building2, Factory, HardHat, LoaderCircle, Pencil, Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { ERPSelect } from "@/components/erp-select";
import { DataTable, IconAction } from "@/components/erp-ui";

type Company = { id: string; name: string; type: string; phone: string | null };
type Engineer = { id: string; employeeCode: string; name: string; jobTitle: string; phone: string | null; supervisors: { project: { id: string; name: string } }[] };
type Project = { id: string; code: string; name: string; company: Company; supervisors: { employee: { id: string; name: string } }[] };
type Tab = "companies" | "projects" | "engineers";
const companyTypes: Record<string, string> = { OWNER: "جهة مالكة", SUBCONTRACTOR: "مقاول باطن", SUPPLIER: "مورد" };

export function ManagementCenter({ companies, projects, engineers, canManage }: { companies: Company[]; projects: Project[]; engineers: Engineer[]; canManage: boolean }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("companies");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [companyType, setCompanyType] = useState("OWNER");
  const [editingEngineer, setEditingEngineer] = useState<Engineer | null>(null);
  const [engineerProjectId, setEngineerProjectId] = useState("");
  const tabs = [
    { key: "companies" as const, label: "الشركات والجهات", icon: Factory, count: companies.length },
    { key: "projects" as const, label: "المشروعات", icon: Building2, count: projects.length },
    { key: "engineers" as const, label: "المهندسون المشرفون", icon: HardHat, count: engineers.length },
  ];

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
    if (await request("POST", { type, ...Object.fromEntries(new FormData(form)) }, `create-${type}`)) { form.reset(); if (type === "company") setCompanyType("OWNER"); }
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
      form.reset(); setEditingEngineer(null); setEngineerProjectId("");
    }
  }
  function editEngineer(engineer: Engineer) {
    setEditingEngineer(engineer); setEngineerProjectId(engineer.supervisors[0]?.project.id || ""); setMessage("");
  }
  const empty = (columns: number, label: string) => <tr><td colSpan={columns} className="py-12 text-center text-slate-400">{label}</td></tr>;

  return <div className="space-y-6">
    <section><p className="text-xs font-bold text-blue-700">البيانات الأساسية</p><h1 className="mt-1 text-2xl font-black text-slate-950">إدارة الشركة والمشروعات</h1><p className="mt-2 text-sm text-slate-500">الجهات والمشروعات والمهندسون المشرفون في مكان واحد.</p></section>
    <div className="grid gap-3 sm:grid-cols-3">{tabs.map(({ key, label, icon: Icon, count }) => <button key={key} onClick={() => { setTab(key); setMessage(""); }} className={`flex min-h-20 items-center gap-3 rounded-xl border p-4 text-right transition ${tab === key ? "border-blue-300 bg-blue-50 text-blue-800 shadow-sm" : "border-slate-200 bg-white text-slate-700 hover:border-blue-200"}`}><span className={`grid size-10 place-items-center rounded-lg ${tab === key ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"}`}><Icon className="size-5" /></span><span><span className="block text-sm font-extrabold">{label}</span><span className="mt-1 block text-xs opacity-60">{count} سجل</span></span></button>)}</div>
    {message && <p role="status" className={`rounded-xl border px-4 py-3 text-sm font-bold ${message.includes("تعذر") || message.includes("اختر") || message.includes("مكررة") ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{message}</p>}

    {tab === "companies" && <Section title="الشركات والجهات" description="الجدول أولًا، ثم إضافة جهة جديدة أسفله.">
      <DataTable headers={["نوع الجهة", "الاسم", "هاتف مقاول الباطن", "الإجراءات"]}>{companies.length ? companies.map(company => <tr key={company.id}><Cell label="نوع الجهة"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">{companyTypes[company.type]}</span></Cell><Cell label="الاسم" strong>{company.name}</Cell><Cell label="هاتف مقاول الباطن">{company.type === "SUBCONTRACTOR" ? company.phone || "—" : "—"}</Cell><Cell label="الإجراءات">{canManage && <IconAction label={`مسح ${company.name}`} icon={Trash2} tone="danger" disabled={busy === company.id} onClick={() => remove("company", company.id, company.name)} />}</Cell></tr>) : empty(4, "لا توجد شركات أو جهات مسجلة.")}</DataTable>
      {canManage && <Form title="إضافة شركة أو جهة"><form onSubmit={event => submit(event, "company")} className="grid gap-3 md:grid-cols-2"><label><Label>نوع الجهة</Label><ERPSelect name="companyType" value={companyType} onValueChange={setCompanyType} className="erp-control"><option value="OWNER">جهة مالكة</option><option value="SUBCONTRACTOR">مقاول باطن</option><option value="SUPPLIER">مورد</option></ERPSelect></label><Field label="اسم الشركة أو الجهة" name="name" placeholder="اكتب الاسم" />{companyType === "SUBCONTRACTOR" && <Field label="رقم الهاتف" name="phone" required={false} placeholder="رقم هاتف المقاول" />}<Submit busy={busy === "create-company"} /></form></Form>}
    </Section>}

    {tab === "projects" && <Section title="المشروعات" description="كل مشروع مرتبط مباشرة بالجهة المالكة.">
      <DataTable headers={["كود المشروع", "اسم المشروع", "الجهة المالكة", "المهندس المشرف", "الإجراءات"]}>{projects.length ? projects.map(project => <tr key={project.id}><Cell label="كود المشروع"><code dir="ltr" className="text-xs font-bold text-blue-700">{project.code}</code></Cell><Cell label="اسم المشروع" strong>{project.name}</Cell><Cell label="الجهة المالكة">{project.company.name}</Cell><Cell label="المهندس المشرف">{[...new Set(project.supervisors.map(({ employee }) => employee.name))].join("، ") || "غير محدد"}</Cell><Cell label="الإجراءات">{canManage && <IconAction label={`مسح ${project.name}`} icon={Trash2} tone="danger" disabled={busy === project.id} onClick={() => remove("project", project.id, project.name)} />}</Cell></tr>) : empty(5, "لا توجد مشروعات مسجلة.")}</DataTable>
      {canManage && <Form title="إضافة مشروع"><form onSubmit={event => submit(event, "project")} className="grid gap-3 md:grid-cols-3"><Field label="كود المشروع" name="code" placeholder="MAYAN-27" /><Field label="اسم المشروع" name="name" placeholder="عمارة 27 - كمبوند مايان" /><Select label="الجهة المالكة" name="companyId" options={companies.filter(item => item.type === "OWNER")} /><Submit busy={busy === "create-project"} /></form></Form>}
    </Section>}

    {tab === "engineers" && <Section title="المهندسون المشرفون" description="بيانات المهندس وتسكينه الحالي في جدول واحد.">
      <DataTable headers={["الكود", "اسم المهندس", "المسمى الوظيفي", "الهاتف", "التسكين", "المشروع", "الإجراءات"]}>{engineers.length ? engineers.map(engineer => { const assignment = engineer.supervisors[0]; return <tr key={engineer.id}><Cell label="الكود"><code dir="ltr" className="text-xs font-bold text-blue-700">{engineer.employeeCode}</code></Cell><Cell label="اسم المهندس" strong>{engineer.name}</Cell><Cell label="المسمى الوظيفي">{engineer.jobTitle}</Cell><Cell label="الهاتف">{engineer.phone || "—"}</Cell><Cell label="التسكين"><span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">{assignment ? "مشروع" : "عام الشركة"}</span></Cell><Cell label="المشروع">{assignment?.project.name || "—"}</Cell><Cell label="الإجراءات"><div className="flex justify-center gap-1">{canManage && <><IconAction label={`تعديل أو نقل ${engineer.name}`} icon={Pencil} disabled={busy === `edit-${engineer.id}`} onClick={() => editEngineer(engineer)} /><IconAction label={`مسح ${engineer.name}`} icon={Trash2} tone="danger" disabled={busy === engineer.id} onClick={() => remove("engineer", engineer.id, engineer.name)} /></>}</div></Cell></tr>; }) : empty(7, "لا يوجد مهندسون مشرفون.")}</DataTable>
      {canManage && <Form title={editingEngineer ? `تعديل وتسكين ${editingEngineer.name}` : "إضافة مهندس وتسكينه"}><form key={editingEngineer?.id || "new"} onSubmit={submitEngineer} className="grid gap-3 md:grid-cols-2 xl:grid-cols-5"><Field label="كود الموظف" name="employeeCode" placeholder="ENG-002" defaultValue={editingEngineer?.employeeCode} /><Field label="اسم المهندس" name="name" defaultValue={editingEngineer?.name} /><Field label="المسمى الوظيفي" name="jobTitle" placeholder="مهندس موقع" defaultValue={editingEngineer?.jobTitle} /><Field label="رقم الهاتف" name="phone" required={false} defaultValue={editingEngineer?.phone || ""} /><Select label="التسكين" name="projectId" options={projects} optional value={engineerProjectId} onValueChange={setEngineerProjectId} /><Submit busy={busy === (editingEngineer ? `edit-${editingEngineer.id}` : "create-engineer")} label={editingEngineer ? "حفظ التعديل" : "إضافة"} />{editingEngineer && <button type="button" onClick={() => { setEditingEngineer(null); setEngineerProjectId(""); }} className="flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50"><X className="size-4" />إلغاء</button>}</form></Form>}
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
