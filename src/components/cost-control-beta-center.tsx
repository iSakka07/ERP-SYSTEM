"use client";
import { useState } from "react";
import { ERPSelect } from "@/components/erp-select";
import { ProjectPlanningPanel } from "@/components/project-planning-panel";
import type { ProjectCostControl } from "@/lib/project-cost-control";

type Project = { id: string; name: string; code: string };
export function CostControlBetaCenter({ projects, initial, canManage }: { projects: Project[]; initial: ProjectCostControl | null; canManage: boolean }) {
  const [data, setData] = useState(initial);
  const [selected, setSelected] = useState(initial?.project.id || projects[0]?.id || "");
  async function selectProject(projectId: string) { setSelected(projectId); const response = await fetch(`/api/project-cost-control?projectId=${encodeURIComponent(projectId)}`); if (response.ok) setData(await response.json()); }
  return <main className="mx-auto max-w-7xl space-y-4 p-4" dir="rtl"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold text-blue-700">Cost Control · Beta</p><h1 className="text-2xl font-black">الميزانية والالتزامات والتوقع</h1><p className="mt-1 text-sm text-slate-500">أدوات تجريبية لمتابعة تكلفة المشروع والتنبؤ بالتكلفة النهائية.</p></div><label className="grid gap-1 text-xs font-bold">المشروع<ERPSelect value={selected} onValueChange={selectProject}>{projects.map(project => <option key={project.id} value={project.id}>{project.name} · {project.code}</option>)}</ERPSelect></label></div>{data ? <ProjectPlanningPanel data={data} canManage={canManage} onChange={setData} /> : <p className="rounded-xl border bg-white p-6 text-center text-slate-500">لا توجد مشروعات متاحة.</p>}</main>;
}
