"use client";

import { FormEvent, useEffect, useState } from "react";
import { Building2, Factory, LoaderCircle, Pencil, Plus, Trash2, Users, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { ERPSelect } from "@/components/erp-select";
import { DataTable, IconAction } from "@/components/erp-ui";
import { employeeJobPrefixes } from "@/lib/employee-codes";
import { pdfColumns, previewDataPdf, usePdfDataExport } from "@/components/pdf-data-export";

type Company = { id: string; name: string; type: string; isEngineeringAuthority: boolean; workNature: string | null; phone: string | null };
type Engineer = { id: string; employeeCode: string; name: string; jobTitle: string; phone: string | null; supervisors: { project: { id: string; name: string } }[] };
type Project = { id: string; code: string; name: string; company: Company; supervisors: { employee: { id: string; name: string } }[] };
type Tab = "companies" | "projects" | "engineers";
type Modal = null | { type: "company"; item?: Company } | { type: "project"; item?: Project } | { type: "engineer"; item?: Engineer };

const companyTypes: Record<string, string> = { OWNER: "جهة مالكة", SUBCONTRACTOR: "مقاول باطن", SUPPLIER: "مورد" };
const companyTypeStyles: Record<string, string> = { OWNER: "border border-blue-200 bg-blue-50 text-blue-700", SUBCONTRACTOR: "border border-amber-200 bg-amber-50 text-amber-700", SUPPLIER: "border border-emerald-200 bg-emerald-50 text-emerald-700" };
const companyGroups = [
  { type: "OWNER", title: "الجهات المالكة", description: "الجهات المالكة للمشروعات والعقود." },
  { type: "SUBCONTRACTOR", title: "مقاولو الباطن", description: "مقاولو الباطن المنفذون للأعمال." },
  { type: "SUPPLIER", title: "الموردون", description: "موردو الخامات والخدمات." },
] as const;

export function ManagementCenter({ companies, projects, engineers, canManage }: { companies: Company[]; projects: Project[]; engineers: Engineer[]; canManage: boolean }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("companies");
  const [companySection, setCompanySection] = useState<(typeof companyGroups)[number]["type"]>("OWNER");
  const [modal, setModal] = useState<Modal>(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [companyType, setCompanyType] = useState("OWNER");
  const [engineerProjectId, setEngineerProjectId] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [employeeCodePreview, setEmployeeCodePreview] = useState("");
  const editingEngineer = modal?.type === "engineer" ? modal.item : undefined;

  useEffect(() => {
    if (!modal || modal.type !== "engineer" || editingEngineer || !jobTitle) return;
    const controller = new AbortController();
    fetch(`/api/management?jobTitle=${encodeURIComponent(jobTitle)}`, { signal: controller.signal })
      .then(response => response.ok ? response.json() : Promise.reject())
      .then(result => setEmployeeCodePreview(result.employeeCode))
      .catch(() => { if (!controller.signal.aborted) setEmployeeCodePreview(""); });
    return () => controller.abort();
  }, [jobTitle, modal, editingEngineer]);

  const tabs = [
    { key: "companies" as const, label: "الجهات ومقاولو الباطن", icon: Factory, count: companies.length },
    { key: "projects" as const, label: "المشروعات", icon: Building2, count: projects.length },
    { key: "engineers" as const, label: "الموظفون", icon: Users, count: engineers.length },
  ];
  const createLabels: Record<Tab, string> = { companies: "إضافة جهة أو مقاول باطن", projects: "إضافة مشروع", engineers: "إضافة موظف" };
  usePdfDataExport(() => {
    const selectedCompanyGroup = companyGroups.find(group => group.type === companySection)!;
    const companyItems = companies.filter(item => item.type === companySection);
    const report = tab === "companies" ? { title: `الجهات ومقاولو الباطن — ${selectedCompanyGroup.title}`, tables: [{ columns: companySection === "OWNER" ? pdfColumns(["الاسم", 3], ["الهاتف", 2]) : pdfColumns(["الاسم", 3], [companySection === "SUPPLIER" ? "طبيعة التوريد" : "طبيعة العمل", 3], ["الهاتف", 2]), rows: companyItems.map(item => companySection === "OWNER" ? [item.name, item.phone || "—"] : [item.name, item.workNature || "—", item.phone || "—"]) }] }
      : tab === "projects" ? { title: "المشروعات", tables: [{ columns: pdfColumns(["كود المشروع", 2], ["اسم المشروع", 3], ["الجهة المالكة", 2], ["المهندس المشرف", 3]), rows: projects.map(item => [item.code, item.name, item.company.name, [...new Set(item.supervisors.map(({ employee }) => employee.name))].join("، ") || "غير محدد"]) }] }
        : { title: "الموظفون", tables: [{ columns: pdfColumns(["الكود", 2], ["اسم الموظف", 3], ["المسمى الوظيفي", 2], ["الهاتف", 2], ["التسكين", 2], ["المشروع", 3]), rows: engineers.map(item => [item.employeeCode, item.name, item.jobTitle, item.phone || "—", item.supervisors[0] ? "مشروع" : "عام الشركة", item.supervisors[0]?.project.name || "—"]) }] };
    void previewDataPdf(report);
  });

  function closeModal() { setModal(null); setCompanyType("OWNER"); setEngineerProjectId(""); setJobTitle(""); setEmployeeCodePreview(""); }
  function openCreate(type: Tab) { setMessage(""); setModal({ type: type === "companies" ? "company" : type === "projects" ? "project" : "engineer" }); }
  function openEdit(type: "company" | "project" | "engineer", item: Company | Project | Engineer) {
    setMessage("");
    if (type === "company") { const company = item as Company; setCompanyType(company.type); setModal({ type, item: company }); }
    if (type === "project") setModal({ type, item: item as Project });
    if (type === "engineer") { const engineer = item as Engineer; setEngineerProjectId(engineer.supervisors[0]?.project.id || ""); setJobTitle(engineer.jobTitle); setEmployeeCodePreview(engineer.employeeCode); setModal({ type, item: engineer }); }
  }
  async function request(method: "POST" | "PATCH" | "DELETE", body: object, key: string) {
    setBusy(key); setMessage("");
    const response = await fetch("/api/management", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json(); setBusy("");
    if (!response.ok) {
      const errors: Record<string, string> = { INVALID_OWNER: "اختر جهة مالكة صحيحة.", INVALID_PROJECT: "اختر مشروعًا صحيحًا.", INVALID_COMPANY: "الشركة أو الجهة غير صحيحة.", INVALID_ENGINEER: "الموظف غير صحيح.", DUPLICATE_OR_INVALID: "البيانات مكررة أو غير صحيحة." };
      setMessage(errors[result.error] || "تعذر حفظ العملية. راجع البيانات وحاول مرة أخرى."); return false;
    }
    setMessage(method === "DELETE" ? "تم المسح من القوائم مع الاحتفاظ بالتاريخ السابق." : "تم حفظ البيانات بنجاح.");
    closeModal(); router.refresh(); return true;
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!modal) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const body = modal.item ? { type: modal.type, id: modal.item.id, ...values } : { type: modal.type, ...values };
    await request(modal.item ? "PATCH" : "POST", body, `${modal.item ? "edit" : "create"}-${modal.type}`);
  }
  async function remove(entity: "company" | "project" | "engineer", id: string, name: string) {
    if (!window.confirm(`مسح «${name}» من القوائم؟ سيظل تاريخه السابق محفوظًا.`)) return;
    await request("DELETE", { entity, id }, `delete-${id}`);
  }
  const empty = (columns: number, label: string) => <tr><td colSpan={columns} className="py-12 text-center text-slate-400">{label}</td></tr>;
  return <div className="space-y-6">
    <section className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold text-blue-700">البيانات الأساسية</p><h1 className="mt-1 text-2xl font-black text-slate-950">إدارة الشركة والمشروعات</h1><p className="mt-2 text-sm text-slate-500">الجهات والمشروعات والموظفون في مكان واحد.</p></div>{canManage && <button type="button" className="erp-back-tab" onClick={() => openCreate(tab)}><Plus className="size-4" />{createLabels[tab]}</button>}</section>
    <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2">{tabs.map(item => { const Icon = item.icon; return <button key={item.key} type="button" onClick={() => { setTab(item.key); setMessage(""); }} className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold ${tab === item.key ? "bg-blue-700 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"}`}><Icon className="size-4" />{item.label}<span className={`rounded-full px-2 py-0.5 text-xs ${tab === item.key ? "bg-white/20" : "bg-slate-100"}`}>{item.count}</span></button>; })}</div>
    {message && <p role="status" className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800">{message}</p>}
    {tab === "companies" && (() => { const group = companyGroups.find(item => item.type === companySection)!; const items = companies.filter(company => company.type === companySection); const hasWorkNature = companySection !== "OWNER"; const headers = hasWorkNature ? ["الاسم", companySection === "SUPPLIER" ? "طبيعة التوريد" : "طبيعة العمل", "الهاتف", "الإجراءات"] : ["الاسم", "الهاتف", "الإجراءات"]; return <div className="space-y-5"><nav aria-label="تصنيف الجهات" className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2">{companyGroups.map(item => <button key={item.type} type="button" onClick={() => setCompanySection(item.type)} className={`flex-1 rounded-xl px-4 py-3 text-sm font-bold ${companySection === item.type ? "bg-blue-700 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"}`}>{item.title}<span className={`mr-2 rounded-full px-2 py-0.5 text-xs ${companySection === item.type ? "bg-white/20" : "bg-slate-100"}`}>{companies.filter(company => company.type === item.type).length}</span></button>)}</nav><Section title={group.title} description={group.description}><DataTable headers={headers}>{items.length ? items.map(company => <tr key={company.id}><Cell label="الاسم" strong>{company.name}</Cell>{hasWorkNature && <Cell label={companySection === "SUPPLIER" ? "طبيعة التوريد" : "طبيعة العمل"}>{company.workNature || "—"}</Cell>}<Cell label="الهاتف">{company.phone || "—"}</Cell><Cell label="الإجراءات"><div className="flex justify-center gap-1">{canManage && <><IconAction label={`تعديل ${company.name}`} icon={Pencil} disabled={busy === "edit-company"} onClick={() => openEdit("company", company)} /><IconAction label={`مسح ${company.name}`} icon={Trash2} tone="danger" disabled={busy === `delete-${company.id}`} onClick={() => remove("company", company.id, company.name)} /></>}</div></Cell></tr>) : empty(headers.length, "لا توجد بيانات مسجلة.")}</DataTable></Section></div>; })()}
    {tab === "projects" && <Section title="المشروعات" description="كل مشروع مرتبط مباشرة بالجهة المالكة."><DataTable headers={["كود المشروع", "اسم المشروع", "الجهة المالكة", "المهندس المشرف", "الإجراءات"]}>{projects.length ? projects.map(project => <tr key={project.id}><Cell label="كود المشروع"><code dir="ltr" className="text-xs font-bold text-blue-700">{project.code}</code></Cell><Cell label="اسم المشروع" strong>{project.name}</Cell><Cell label="الجهة المالكة">{project.company.name}</Cell><Cell label="المهندس المشرف">{[...new Set(project.supervisors.map(({ employee }) => employee.name))].join("، ") || "غير محدد"}</Cell><Cell label="الإجراءات"><div className="flex justify-center gap-1">{canManage && <><IconAction label={`تعديل ${project.name}`} icon={Pencil} disabled={busy === "edit-project"} onClick={() => openEdit("project", project)} /><IconAction label={`مسح ${project.name}`} icon={Trash2} tone="danger" disabled={busy === `delete-${project.id}`} onClick={() => remove("project", project.id, project.name)} /></>}</div></Cell></tr>) : empty(5, "لا توجد مشروعات مسجلة.")}</DataTable></Section>}
    {tab === "engineers" && <Section title="الموظفون" description="بيانات الموظف وتسكينه الحالي في جدول واحد."><DataTable headers={["الكود", "اسم الموظف", "المسمى الوظيفي", "الهاتف", "التسكين", "المشروع", "الإجراءات"]}>{engineers.length ? engineers.map(engineer => { const assignment = engineer.supervisors[0]; return <tr key={engineer.id}><Cell label="الكود"><code dir="ltr" className="text-xs font-bold text-blue-700">{engineer.employeeCode}</code></Cell><Cell label="اسم الموظف" strong>{engineer.name}</Cell><Cell label="المسمى الوظيفي">{engineer.jobTitle}</Cell><Cell label="الهاتف">{engineer.phone || "—"}</Cell><Cell label="التسكين"><span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">{assignment ? "مشروع" : "عام الشركة"}</span></Cell><Cell label="المشروع">{assignment?.project.name || "—"}</Cell><Cell label="الإجراءات"><div className="flex justify-center gap-1">{canManage && <><IconAction label={`تعديل ${engineer.name}`} icon={Pencil} disabled={busy === "edit-engineer"} onClick={() => openEdit("engineer", engineer)} /><IconAction label={`مسح ${engineer.name}`} icon={Trash2} tone="danger" disabled={busy === `delete-${engineer.id}`} onClick={() => remove("engineer", engineer.id, engineer.name)} /></>}</div></Cell></tr>; }) : empty(7, "لا يوجد موظفون مسجلون.")}</DataTable></Section>}
    {modal && <ManagementModal modal={modal} busy={busy} companyType={companyType} setCompanyType={setCompanyType} projects={projects} companies={companies} engineerProjectId={engineerProjectId} setEngineerProjectId={setEngineerProjectId} jobTitle={jobTitle} setJobTitle={setJobTitle} employeeCodePreview={employeeCodePreview} setEmployeeCodePreview={setEmployeeCodePreview} onClose={closeModal} onSubmit={submit} />}
  </div>;
}

function ManagementModal({ modal, busy, companyType, setCompanyType, projects, companies, engineerProjectId, setEngineerProjectId, jobTitle, setJobTitle, employeeCodePreview, setEmployeeCodePreview, onClose, onSubmit }: { modal: Exclude<Modal, null>; busy: string; companyType: string; setCompanyType: (value: string) => void; projects: Project[]; companies: Company[]; engineerProjectId: string; setEngineerProjectId: (value: string) => void; jobTitle: string; setJobTitle: (value: string) => void; employeeCodePreview: string; setEmployeeCodePreview: (value: string) => void; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void> }) {
  const editing = !!modal.item;
  const title = modal.type === "company" ? `${editing ? "تعديل" : "إضافة"} شركة أو جهة` : modal.type === "project" ? `${editing ? "تعديل" : "إضافة"} مشروع` : `${editing ? "تعديل" : "إضافة"} موظف`;
  const company = modal.type === "company" ? modal.item : undefined;
  const project = modal.type === "project" ? modal.item : undefined;
  const engineer = modal.type === "engineer" ? modal.item : undefined;
  const workNatureLabel = companyType === "SUPPLIER" ? "طبيعة التوريد" : "طبيعة العمل";
  const workNaturePlaceholder = companyType === "SUPPLIER" ? "مثال: توريد خامات بلاستيك" : "مثال: أعمال خرسانية وتشطيبات";
  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/35 p-4" role="dialog" aria-modal="true" aria-labelledby="management-modal-title"><section className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-4"><div><h2 id="management-modal-title" className="text-lg font-black text-slate-950">{title}</h2><p className="mt-1 text-xs text-slate-500">{editing ? "عدّل البيانات ثم احفظ التغييرات." : "أدخل البيانات المطلوبة ثم احفظ."}</p></div><button type="button" aria-label="إغلاق" className="erp-icon-action" onClick={onClose}><X className="size-4" /></button></div><form key={`${modal.type}-${modal.item?.id || "new"}`} onSubmit={onSubmit} className="mt-5 grid gap-3 sm:grid-cols-2">{modal.type === "company" && <><label><Label>نوع الجهة</Label><ERPSelect name="companyType" value={companyType} onValueChange={setCompanyType} className="erp-control"><option value="OWNER">جهة مالكة</option><option value="SUBCONTRACTOR">مقاول باطن</option><option value="SUPPLIER">مورد</option></ERPSelect></label><Field label="اسم الشركة أو الجهة" name="name" defaultValue={company?.name} placeholder="اكتب الاسم" />{companyType === "OWNER" && <label className="sm:col-span-2 flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-3"><input type="checkbox" name="isEngineeringAuthority" value="true" defaultChecked={company?.isEngineeringAuthority || false} className="mt-0.5 size-4 accent-blue-700" /><span><b className="block text-sm text-slate-900">هل الجهة تخص الهيئة الهندسية؟</b><span className="mt-1 block text-xs text-slate-600">تُطبّق دورة المستخلص الكاملة: شركة ثم كتيبة ولواء وإدارة حتى تم الصرف.</span></span></label>}{companyType !== "OWNER" && <Field label={workNatureLabel} name="workNature" defaultValue={company?.workNature || ""} required={false} placeholder={workNaturePlaceholder} />}{["SUBCONTRACTOR", "SUPPLIER"].includes(companyType) && <Field label="رقم الهاتف" name="phone" defaultValue={company?.phone || ""} required={false} placeholder="رقم الهاتف" />}</>}{modal.type === "project" && <><Field label="كود المشروع" name="code" defaultValue={project?.code} placeholder="MAYAN-27" /><Field label="اسم المشروع" name="name" defaultValue={project?.name} placeholder="عمارة 27 - كمبوند مايان" /><Select label="الجهة المالكة" name="companyId" options={companies.filter(item => item.type === "OWNER")} defaultValue={project?.company.id} /></>}{modal.type === "engineer" && <><label><Label>المسمى الوظيفي</Label><ERPSelect name="jobTitle" value={jobTitle} onValueChange={value => { setJobTitle(value); setEmployeeCodePreview(""); }} required className="erp-control"><option value="">اختر المسمى</option>{engineer?.jobTitle && !(engineer.jobTitle in employeeJobPrefixes) && <option value={engineer.jobTitle}>{engineer.jobTitle}</option>}{Object.keys(employeeJobPrefixes).map(item => <option key={item} value={item}>{item}</option>)}</ERPSelect></label><label><Label>كود الموظف — تلقائي</Label><input dir="ltr" readOnly value={engineer ? engineer.employeeCode : employeeCodePreview} placeholder="يظهر بعد اختيار المسمى" className="bg-slate-100 font-mono" /></label><Field label="اسم الموظف" name="name" defaultValue={engineer?.name} placeholder="الاسم" /><Field label="رقم الهاتف" name="phone" defaultValue={engineer?.phone || ""} required={false} placeholder="رقم الهاتف" /><Select label="التسكين" name="projectId" options={projects} optional value={engineerProjectId} onValueChange={setEngineerProjectId} /></>}<div className="flex gap-2 sm:col-span-2"><Submit busy={busy === `${editing ? "edit" : "create"}-${modal.type}`} label={editing ? "حفظ التعديل" : "إضافة"} /><button type="button" className="erp-back-tab" onClick={onClose}>إلغاء</button></div></form></section></div>;
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) { return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><header className="border-b border-slate-100 px-5 py-4"><h2 className="font-extrabold text-slate-900">{title}</h2><p className="mt-1 text-xs text-slate-500">{description}</p></header>{children}</section>; }
function Cell({ label, children, strong = false }: { label: string; children: React.ReactNode; strong?: boolean }) { return <td data-label={label} className={strong ? "font-bold text-slate-900" : "text-slate-600"}>{children}</td>; }
function Label({ children }: { children: React.ReactNode }) { return <span className="mb-1.5 block text-xs font-bold text-slate-600">{children}</span>; }
function Submit({ busy, label = "إضافة" }: { busy: boolean; label?: string }) { return <button disabled={busy} className="mt-auto flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-700 px-5 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-60">{busy ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}{label}</button>; }
function Select({ label, name, options, optional = false, value, defaultValue, onValueChange }: { label: string; name: string; options: { id: string; name: string }[]; optional?: boolean; value?: string; defaultValue?: string; onValueChange?: (value: string) => void }) { return <label><Label>{label}</Label><ERPSelect name={name} required={!optional} className="erp-control" value={value} defaultValue={defaultValue} onValueChange={onValueChange}>{optional && <option value="">عام الشركة</option>}{!optional && <option value="">اختر</option>}{options.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}</ERPSelect></label>; }
function Field({ label, name, placeholder, required = true, defaultValue }: { label: string; name: string; placeholder?: string; required?: boolean; defaultValue?: string }) { return <label><Label>{label}</Label><input name={name} required={required} placeholder={placeholder} defaultValue={defaultValue} /></label>; }
