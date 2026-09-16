"use client";
import { ERPSelect } from "@/components/erp-select";

import { FormEvent, useState } from "react";
import { Building2, CheckCircle2, Factory, HardHat, Layers3, LoaderCircle, Plus, Power } from "lucide-react";
import { useRouter } from "next/navigation";

type Company = { id: string; name: string; type: string; taxNumber: string | null; phone: string | null; active: boolean };
type Sector = { id: string; name: string; active: boolean; company: Company | null };
type Engineer = { id: string; employeeCode: string; name: string; jobTitle: string; phone: string | null; active: boolean };
type Project = { id: string; code: string; name: string; active: boolean; company: Company; sector: { id: string; name: string; active: boolean } | null; supervisors: { employee: Engineer }[] };
type Assignment = { id: string; active: boolean; project: { name: string }; employee: { name: string; jobTitle: string } };
type Tab = "companies" | "sectors" | "projects" | "engineers";

const companyTypes: Record<string, string> = { OWNER: "جهة مالكة", SUBCONTRACTOR: "مقاول باطن", SUPPLIER: "مورد" };

export function ManagementCenter({ companies, sectors, projects, engineers, assignments, canManage }: { companies: Company[]; sectors: Sector[]; projects: Project[]; engineers: Engineer[]; assignments: Assignment[]; canManage: boolean }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("companies");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const tabs = [
    { key: "companies" as const, label: "الشركات والجهات", icon: Factory, count: companies.length },
    { key: "sectors" as const, label: "القطاعات", icon: Layers3, count: sectors.length },
    { key: "projects" as const, label: "المشروعات", icon: Building2, count: projects.length },
    { key: "engineers" as const, label: "المهندسون المشرفون", icon: HardHat, count: engineers.length },
  ];

  async function request(method: "POST" | "PATCH", body: object, key: string) {
    setBusy(key); setMessage("");
    const response = await fetch("/api/management", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy("");
    if (!response.ok) { setMessage("تعذر الحفظ. راجع البيانات وتأكد أنها غير مكررة."); return false; }
    setMessage("تم حفظ البيانات بنجاح."); router.refresh(); return true;
  }

  async function submit(event: FormEvent<HTMLFormElement>, type: string) {
    event.preventDefault();
    const form = event.currentTarget;
    if (await request("POST", { type, ...Object.fromEntries(new FormData(form)) }, `create-${type}`)) form.reset();
  }

  function toggle(entity: string, id: string, active: boolean) { return canManage ? <button disabled={busy === id} onClick={() => request("PATCH", { entity, id, active: !active }, id)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"><Power className="size-3.5" />{active ? "إيقاف" : "تفعيل"}</button> : null; }

  return <div className="space-y-6">
    <section><p className="text-xs font-bold text-blue-700">البيانات الأساسية</p><h1 className="mt-1 text-2xl font-black text-slate-950">إدارة الشركة والمشروعات</h1><p className="mt-2 text-sm text-slate-500">مركز موحد للجهات والقطاعات والمشروعات والمهندسين المشرفين.</p></section>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{tabs.map(({ key, label, icon: Icon, count }) => <button key={key} onClick={() => { setTab(key); setMessage(""); }} className={`flex items-center gap-3 rounded-xl border p-4 text-right transition ${tab === key ? "border-blue-200 bg-blue-50 text-blue-800 shadow-sm" : "border-slate-200 bg-white text-slate-700 hover:border-blue-200"}`}><span className={`grid size-10 place-items-center rounded-lg ${tab === key ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"}`}><Icon className="size-5" /></span><span><span className="block text-sm font-extrabold">{label}</span><span className="mt-1 block text-xs opacity-60">{count} سجل</span></span></button>)}</div>
    {message && <p className={`rounded-xl border px-4 py-3 text-sm font-bold ${message.includes("بنجاح") ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}>{message}</p>}

    {tab === "companies" && <Section title="الشركات والجهات" description="الجهات المالكة ومقاولو الباطن والموردون.">
      {canManage && <form onSubmit={(event) => submit(event, "company")} className="grid gap-3 border-b border-slate-200 p-5 md:grid-cols-2 "><Field label="اسم الشركة أو الجهة" name="name" placeholder="مثال: إدارة الأشغال العسكرية" /><label><span className="mb-1.5 block text-xs font-bold text-slate-600">نوع الجهة</span><ERPSelect name="companyType" className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="OWNER">جهة مالكة</option><option value="SUBCONTRACTOR">مقاول باطن</option><option value="SUPPLIER">مورد</option></ERPSelect></label><Field label="الرقم الضريبي" name="taxNumber" required={false} /><Field label="رقم الهاتف" name="phone" required={false} /><Submit busy={busy === "create-company"} /></form>}
      <Table headers={["الاسم", "التصنيف", "الرقم الضريبي", "الحالة", "التحكم"]}>{companies.map((company) => <tr key={company.id}><Cell strong>{company.name}</Cell><Cell>{companyTypes[company.type]}</Cell><Cell>{company.taxNumber || "—"}</Cell><Cell><Status active={company.active} /></Cell><Cell>{toggle("company", company.id, company.active)}</Cell></tr>)}</Table>
    </Section>}

    {tab === "sectors" && <Section title="القطاعات" description="تقسيم المشروعات حسب القطاع والجهة التابعة له.">
      {canManage && <form onSubmit={(event) => submit(event, "sector")} className="grid gap-3 border-b border-slate-200 p-5 md:grid-cols-2"><Field label="اسم القطاع" name="name" placeholder="مثال: القيادة الاستراتيجية" /><Select label="الجهة المالكة" name="companyId" options={companies.filter((item) => item.type === "OWNER" && item.active)} optional /><Submit busy={busy === "create-sector"} /></form>}
      <Table headers={["اسم القطاع", "الجهة المالكة", "الحالة", "التحكم"]}>{sectors.map((sector) => <tr key={sector.id}><Cell strong>{sector.name}</Cell><Cell>{sector.company?.name || "عام"}</Cell><Cell><Status active={sector.active} /></Cell><Cell>{toggle("sector", sector.id, sector.active)}</Cell></tr>)}</Table>
    </Section>}

    {tab === "projects" && <Section title="المشروعات" description="ربط كل مشروع بالجهة المالكة والقطاع والمهندس المشرف.">
      {canManage && <form onSubmit={(event) => submit(event, "project")} className="grid gap-3 border-b border-slate-200 p-5 md:grid-cols-2 "><Field label="كود المشروع" name="code" placeholder="MAYAN-27" /><Field label="اسم المشروع" name="name" placeholder="عمارة 27 - كمبوند مايان" /><Select label="الجهة المالكة" name="companyId" options={companies.filter((item) => item.type === "OWNER" && item.active)} /><Select label="القطاع" name="sectorId" options={sectors.filter((item) => item.active)} optional /><Submit busy={busy === "create-project"} /></form>}
      <Table headers={["الكود", "المشروع", "الجهة المالكة", "القطاع", "المهندس المشرف", "الحالة", "التحكم"]}>{projects.map((project) => <tr key={project.id}><Cell><code dir="ltr" className="text-xs text-blue-700">{project.code}</code></Cell><Cell strong>{project.name}</Cell><Cell>{project.company.name}</Cell><Cell>{project.sector?.name || "—"}</Cell><Cell>{project.supervisors.map(({ employee }) => employee.name).join("، ") || "غير محدد"}</Cell><Cell><Status active={project.active} /></Cell><Cell>{toggle("project", project.id, project.active)}</Cell></tr>)}</Table>
    </Section>}

    {tab === "engineers" && <div className="space-y-5"><Section title="المهندسون المشرفون" description="ملفات موظفين جاهزة للربط بموديول المرتبات لاحقًا.">
      {canManage && <form onSubmit={(event) => submit(event, "engineer")} className="grid gap-3 border-b border-slate-200 p-5 md:grid-cols-2 "><Field label="كود الموظف" name="employeeCode" placeholder="ENG-002" /><Field label="اسم المهندس" name="name" /><Field label="المسمى الوظيفي" name="jobTitle" placeholder="مهندس موقع" /><Field label="رقم الهاتف" name="phone" required={false} /><Submit busy={busy === "create-engineer"} /></form>}
      <Table headers={["الكود", "اسم المهندس", "المسمى الوظيفي", "الهاتف", "الحالة", "التحكم"]}>{engineers.map((engineer) => <tr key={engineer.id}><Cell>{engineer.employeeCode}</Cell><Cell strong>{engineer.name}</Cell><Cell>{engineer.jobTitle}</Cell><Cell>{engineer.phone || "—"}</Cell><Cell><Status active={engineer.active} /></Cell><Cell>{toggle("engineer", engineer.id, engineer.active)}</Cell></tr>)}</Table>
    </Section><Section title="تكليفات الإشراف" description="يمكن تكليف المهندس بأكثر من مشروع مع الاحتفاظ بتاريخ التكليف.">
      {canManage && <form onSubmit={(event) => submit(event, "assignment")} className="grid gap-3 border-b border-slate-200 p-5 md:grid-cols-2"><Select label="المشروع" name="projectId" options={projects.filter((item) => item.active)} /><Select label="المهندس المشرف" name="employeeId" options={engineers.filter((item) => item.active)} /><Submit busy={busy === "create-assignment"} label="إضافة تكليف" /></form>}
      <Table headers={["المهندس", "المسمى", "المشروع", "الحالة", "التحكم"]}>{assignments.map((assignment) => <tr key={assignment.id}><Cell strong>{assignment.employee.name}</Cell><Cell>{assignment.employee.jobTitle}</Cell><Cell>{assignment.project.name}</Cell><Cell><Status active={assignment.active} /></Cell><Cell>{toggle("assignment", assignment.id, assignment.active)}</Cell></tr>)}</Table>
    </Section></div>}
  </div>;
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) { return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center justify-between px-5 py-4"><div><h2 className="font-extrabold text-slate-900">{title}</h2><p className="mt-1 text-xs text-slate-500">{description}</p></div><CheckCircle2 className="size-5 text-emerald-500" /></div>{children}</section>; }
function Table({ headers, children }: { headers: string[]; children: React.ReactNode }) { return <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-right text-sm"><thead className="border-y border-slate-200 bg-slate-50 text-xs text-slate-500"><tr>{headers.map((header) => <th key={header} className="px-5 py-3 font-bold">{header}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{children}</tbody></table></div>; }
function Cell({ children, strong = false }: { children: React.ReactNode; strong?: boolean }) { return <td className={`px-5 py-4 ${strong ? "font-bold text-slate-900" : "text-slate-600"}`}>{children}</td>; }
function Submit({ busy, label = "إضافة" }: { busy: boolean; label?: string }) { return <button disabled={busy} className="mt-auto flex h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60">{busy ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}{label}</button>; }
function Select({ label, name, options, optional = false }: { label: string; name: string; options: { id: string; name: string }[]; optional?: boolean }) { return <label><span className="mb-1.5 block text-xs font-bold text-slate-600">{label}</span><ERPSelect name={name} required={!optional} className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm">{optional && <option value="">عام / بدون تحديد</option>}{options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</ERPSelect></label>; }
function Field({ label, name, placeholder, required = true }: { label: string; name: string; placeholder?: string; required?: boolean }) { return <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">{label}</span><input name={name} required={required} className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-500" placeholder={placeholder} /></label>; }
function Status({ active }: { active: boolean }) { return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}><span className={`size-1.5 rounded-full ${active ? "bg-emerald-500" : "bg-slate-400"}`} />{active ? "نشط" : "موقوف"}</span>; }
