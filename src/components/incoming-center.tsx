"use client";
import { ERPSelect } from "@/components/erp-select";
import { CurrencyInput } from "@/components/currency-input";
import { DocumentLayout, type Movement } from "@/components/document-layout";
import { UploadBox } from "@/components/upload-box";

import { Fragment, FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ChevronDown,
  FileDown,
  Paperclip,
  Plus,
  Trash2,
} from "lucide-react";
import {
  financials,
  grossNotice,
  incomingStages,
  money,
  statementLabel,
} from "@/lib/incoming";

type Project = {
  id: string;
  name: string;
  company: { id: string; name: string };
  sector: { id: string; name: string } | null;
  supervisors?: { employee: { name: string } }[];
};
type Material = {
  id: string;
  number: string;
  totalCents: number;
  notes: string | null;
  items: {
    name: string;
    unit: string;
    quantity: number;
    unitPriceCents: number;
    totalCents: number;
  }[];
};
type Statement = {
  id: string;
  sequence: number;
  kind: string;
  grossCents: number;
  stage: string;
  notes: string | null;
  paidAt: string | null;
  paymentMethod: string | null;
  paymentReference: string | null;
  materials: Material[];
};
type Contract = {
  id: string;
  name: string;
  number: string;
  projectId: string;
  originalCents: number;
  estimateReference: string | null;
  estimateCents?: number | null;
  notes: string | null;
  project: Project;
  statements: Statement[];
  memos: { id: string; kind: string; amountCents: number; reason: string }[];
};
type Attachment = {
  id: string;
  entityId: string;
  entityType: string;
  name: string;
  size: number;
};
type Editor = {
  action: "contract" | "statement" | "material" | "memo" | "stage";
  contract?: Contract;
  statement?: Statement;
  material?: Material;
  edit?: boolean;
};
type Item = { name: string; unit: string; quantity: string; price: string };
const inputClass =
  "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
const primary =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-blue-800 disabled:opacity-50";
const secondary =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50";

export function IncomingCenter({
  contracts,
  projects,
  attachments,
  canManage,
  isAdmin,
  initialProjectId = "",
  movements = [],
}: {
  contracts: Contract[];
  projects: Project[];
  attachments: Attachment[];
  canManage: boolean;
  isAdmin: boolean;
  initialProjectId?: string;
  movements?: (Movement & { entityId: string })[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [project, setProject] = useState(initialProjectId);
  const [owner, setOwner] = useState("");
  const [sector, setSector] = useState("");
  const [stage, setStage] = useState("");
  const [expanded, setExpanded] = useState("");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const filtered = contracts.filter(
    (c) =>
      (!query || `${c.name} ${c.number} ${c.project.name}`.includes(query)) &&
      (!project || c.projectId === project) &&
      (!owner || c.project.company.id === owner) &&
      (!sector || c.project.sector?.id === sector) &&
      (!stage || c.statements.some((s) => s.stage === stage)),
  );
  const totals = filtered.reduce(
    (n, c) => {
      const f = financials(c);
      return {
        value: n.value + f.value,
        gross: n.gross + f.gross,
        net: n.net + f.net,
        remaining: n.remaining + f.remaining,
      };
    },
    { value: 0, gross: 0, net: 0, remaining: 0 },
  );
  const unique = (items: { id: string; name: string }[]) => [
    ...new Map(items.map((i) => [i.id, i])).values(),
  ];
  const open = (e: Editor) => {
    setMessage("");
    setEditor(e);
  };
  async function save(payload: object, files: File[], estimateFiles: File[] = []) {
    setBusy(true);
    setMessage("");
    try {
      const form = new FormData();
      form.set("payload", JSON.stringify(payload));
      files.forEach((f) => form.append("files", f));
      estimateFiles.forEach((f) => form.append("estimateFiles", f));
      const response = await fetch("/api/incoming", {
        method: "POST",
        body: form,
      });
      const result = await response.json();
      if (!response.ok) {
        setMessage(result.error || "تعذر الحفظ.");
        return;
      }
      setMessage("تم الحفظ بنجاح.");
      setEditor(null);
      router.refresh();
    } catch {
      setMessage("تعذر الاتصال. حاول مرة أخرى.");
    } finally {
      setBusy(false);
    }
  }
  function exportCsv() {
    const rows = [
      [
        "العقد",
        "رقم العقد",
        "المشروع",
        "الجهة المالكة",
        "قيمة العقد",
        "الوارد قبل الخامات",
        "الخامات المسجلة",
        "صافي الوارد",
        "المتبقي",
      ],
      ...filtered.map((c) => {
        const f = financials(c);
        return [
          c.name,
          c.number,
          c.project.name,
          c.project.company.name,
          f.value / 100,
          f.gross / 100,
          f.materials / 100,
          f.net / 100,
          f.remaining / 100,
        ];
      }),
    ];
    const csv = rows
      .map((row) =>
        row
          .map(
            (v) =>
              `"${String(v)
                .replace(/^[=+@-]/, "'$&")
                .replaceAll('"', '""')}"`,
          )
          .join(","),
      )
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "incoming-contracts.csv";
    a.click();
    URL.revokeObjectURL(url);
  }
  const fileLinks = (entityId: string) => (
    <Files files={attachments.filter((f) => f.entityId === entityId)} />
  );
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-blue-700">Incoming Module</p>
          <h1 className="mt-1 text-2xl font-black text-slate-950">
            العقود والوارد
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            عقود الجهات المالكة ومتابعة المستخلصات والخامات.
          </p>
        </div>
        {!editor && (
          <div className="flex gap-2">
            <button onClick={exportCsv} className={secondary}>
              <FileDown className="size-4" />
              تصدير Excel / CSV
            </button>
            {canManage && (
              <button
                onClick={() => open({ action: "contract" })}
                className={primary}
              >
                <Plus className="size-4" />
                إضافة عقد
              </button>
            )}
          </div>
        )}
      </div>
      {message && (
        <p
          role="status"
          className={`rounded-lg border px-4 py-3 text-sm ${message.includes("بنجاح") ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}
        >
          {message}
        </p>
      )}
      {editor ? (
        <IncomingEditor
          key={`${editor.action}-${editor.statement?.id}-${editor.material?.id}-${editor.edit}`}
          editor={editor}
          projects={projects}
          attachments={attachments}
          busy={busy}
          isAdmin={isAdmin}
          onCancel={() => {
            setEditor(null);
            setMessage("");
          }}
          onSave={save}
          movements={movements}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {[
              ["قيمة العقود", totals.value],
              ["الوارد قبل الخامات", totals.gross],
              ["صافي الوارد النقدي", totals.net],
              ["المتبقي من العقود", totals.remaining],
            ].map(([label, value]) => (
              <div
                key={String(label)}
                className="rounded-xl border border-slate-200 bg-white p-4"
              >
                <p className="text-xs text-slate-500">{label}</p>
                <p className="mt-2 text-lg font-extrabold tabular-nums text-slate-950">
                  {money(Number(value))}
                </p>
              </div>
            ))}
          </div>
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="grid gap-3 md:grid-cols-5">
              <label>
                <span className="sr-only">البحث</span>
                <input
                  className={inputClass}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="ابحث باسم أو رقم العقد…"
                />
              </label>
              <Filter
                label="كل المشروعات"
                value={project}
                onChange={setProject}
                options={projects}
              />
              <Filter
                label="كل الجهات المالكة"
                value={owner}
                onChange={setOwner}
                options={unique(projects.map((p) => p.company))}
              />
              <Filter
                label="كل القطاعات"
                value={sector}
                onChange={setSector}
                options={unique(
                  projects.flatMap((p) => (p.sector ? [p.sector] : [])),
                )}
              />
              <Filter
                label="كل مراحل المستخلصات"
                value={stage}
                onChange={setStage}
                options={incomingStages.map(([id, name]) => ({ id, name }))}
              />
            </div>
            <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-400">
              {filtered.length} عقد · الماليات تعتمد على آخر مستخلص «تم الصرف»
              فقط.
            </p>
          </section>
          <section className="erp-table-shell">
            <div className="erp-table-scroll">
              <table className="erp-data-table min-w-[1120px]">
                <thead>
                  <tr>
                    {[
                      "العقد",
                      "المشروع / القطاع",
                      "الجهة المالكة",
                      "قيمة العقد",
                      "موقف المستخلصات",
                      "إجمالي الوارد",
                      "الخامات",
                      "المتبقي",
                      "الإجراءات",
                    ].map((h) => (
                      <th key={h}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {!filtered.length && (
                    <tr>
                      <td
                        colSpan={9}
                        className="py-16 text-center text-slate-400"
                      >
                        لا توجد عقود. أضف أول عقد لبدء متابعة الوارد.
                      </td>
                    </tr>
                  )}
                  {filtered.map((c) => {
                    const f = financials(c);
                    const show = expanded === c.id;
                    return (
                      <Fragment key={c.id}>
                        <tr>
                          <td className="max-w-[220px]">
                            <button
                              onClick={() => setExpanded(show ? "" : c.id)}
                              aria-expanded={show}
                              className="text-right font-extrabold text-slate-950"
                            >
                              {c.name}
                            </button>
                            <p className="mt-1 text-[10px] text-slate-400">
                              {c.number}
                            </p>
                          </td>
                          <td>
                            {c.project.name}
                            <p className="mt-1 text-[10px] text-slate-400">
                              {c.project.sector?.name || "—"}
                            </p>
                          </td>
                          <td>
                            {c.project.company.name}
                          </td>
                          <td className="whitespace-nowrap font-bold text-blue-700">
                            {money(f.value)}
                          </td>
                          <td>
                            <button
                              className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-1.5 text-blue-800"
                              onClick={() => setExpanded(show ? "" : c.id)}
                              aria-expanded={show}
                            >
                              {c.statements.length} مستخلص
                              <ChevronDown
                                className={`size-3 ${show ? "rotate-180" : ""}`}
                              />
                            </button>
                          </td>
                          <td className="whitespace-nowrap font-bold">
                            {money(f.gross)}
                            <p className="mt-1 text-[9px] font-normal text-slate-400">
                              قبل خصم الخامات
                            </p>
                          </td>
                          <td className="whitespace-nowrap">
                            <span className="rounded bg-amber-50 px-2 py-1 text-amber-800">
                              {money(f.materials)}
                            </span>
                          </td>
                          <td className="whitespace-nowrap font-bold">
                            {money(f.remaining)}
                          </td>
                          <td>
                            <details>
                              <summary className="cursor-pointer text-blue-700">
                                إجراءات
                              </summary>
                              <div className="mt-2 flex flex-col items-start gap-2">
                                {canManage && (
                                  <>
                                    <button
                                      onClick={() =>
                                        open({
                                          action: "contract",
                                          contract: c,
                                          edit: true,
                                        })
                                      }
                                    >
                                      تعديل العقد
                                    </button>
                                    <button
                                      onClick={() =>
                                        open({
                                          action: "statement",
                                          contract: c,
                                        })
                                      }
                                    >
                                      إضافة مستخلص
                                    </button>
                                    <button
                                      onClick={() =>
                                        open({ action: "memo", contract: c })
                                      }
                                    >
                                      مذكرة رفع / خفض
                                    </button>
                                  </>
                                )}
                                {fileLinks(c.id)}
                              </div>
                            </details>
                          </td>
                        </tr>
                        {show && (
                          <tr>
                            <td
                              colSpan={9}
                              className="erp-table-details"
                            >
                              <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                                  {[
                                    ["صافي الوارد النقدي", money(f.net)],
                                    [
                                      "خامات محتسبة حتى آخر مصروف",
                                      money(f.effectiveMaterials),
                                    ],
                                    [
                                      "الجاري تحت التحصيل (قبل الخامات)",
                                      money(f.pending),
                                    ],
                                    [
                                      "نسبة الصرف من العقد",
                                      `${f.pct.toFixed(1)}%`,
                                    ],
                                    [
                                      "نسبة صافي النقدية",
                                      `${(f.value ? (f.net / f.value) * 100 : 0).toFixed(1)}%`,
                                    ],
                                    [
                                      "نسبة الخامات المحتسبة",
                                      `${(f.value ? (f.effectiveMaterials / f.value) * 100 : 0).toFixed(1)}%`,
                                    ],
                                    ["القيمة الأصلية", money(c.originalCents)],
                                  ].map(([label, value]) => (
                                    <div
                                      key={label}
                                      className="rounded-lg border border-slate-200 bg-white p-3"
                                    >
                                      <p className="text-[10px] text-slate-500">
                                        {label}
                                      </p>
                                      <p className="mt-2 font-bold">{value}</p>
                                    </div>
                                  ))}
                                </div>
                                <p className="text-[10px] text-slate-500">
                                  الخامات الظاهرة في الجدول تشمل جميع الشهادات؛
                                  صافي الوارد يحتسب فقط الخامات حتى آخر مستخلص
                                  مصروف. المهندس المشرف:{" "}
                                  {c.project.supervisors
                                    ?.map((x) => x.employee.name)
                                    .join("، ") || "غير محدد"}
                                  {c.estimateReference &&
                                    ` · مرجع المقايسة: ${c.estimateReference}`}
                                  {c.estimateCents != null && ` · قيمة المقايسة: ${money(c.estimateCents)} · الفرق عن أصل العقد: ${money(c.originalCents - c.estimateCents)}`}
                                </p>
                                <div className="flex gap-3 overflow-x-auto pb-2">
                                  {c.statements.map((s) => (
                                    <div
                                      key={s.id}
                                      className={`min-w-[230px] rounded-lg border p-3 ${s.stage === "PAID" ? "border-emerald-200 bg-emerald-50" : "border-blue-200 bg-white"}`}
                                    >
                                      <div className="flex justify-between gap-3">
                                        <strong>{statementLabel(s)}</strong>
                                        <span
                                          className={`rounded px-2 py-1 text-[10px] ${s.stage === "PAID" ? "bg-emerald-100 text-emerald-800" : "bg-blue-50 text-blue-700"}`}
                                        >
                                          {
                                            incomingStages.find(
                                              (x) => x[0] === s.stage,
                                            )?.[1]
                                          }
                                        </span>
                                      </div>
                                      <p className="my-3 text-sm font-extrabold">
                                        {money(s.grossCents)}
                                      </p>
                                      {s.paidAt && (
                                        <p className="mb-2 text-[10px] text-emerald-700">
                                          {s.paymentMethod === "CHEQUE"
                                            ? "شيك"
                                            : "تحويل"}{" "}
                                          {s.paymentReference} ·{" "}
                                          {s.paidAt.slice(0, 10)}
                                        </p>
                                      )}
                                      <div className="flex flex-wrap gap-2">
                                        {canManage && (
                                          <>
                                            <button
                                              className={secondary}
                                              onClick={() =>
                                                open({
                                                  action: "stage",
                                                  contract: c,
                                                  statement: s,
                                                })
                                              }
                                            >
                                              تغيير المرحلة
                                            </button>
                                            {!c.statements.some(
                                              (x) =>
                                                x.sequence >= s.sequence &&
                                                x.stage === "PAID",
                                            ) && (
                                              <>
                                                <button
                                                  className={secondary}
                                                  onClick={() =>
                                                    open({
                                                      action: "statement",
                                                      contract: c,
                                                      statement: s,
                                                      edit: true,
                                                    })
                                                  }
                                                >
                                                  تعديل
                                                </button>
                                                <button
                                                  className={secondary}
                                                  onClick={() =>
                                                    open({
                                                      action: "material",
                                                      contract: c,
                                                      statement: s,
                                                    })
                                                  }
                                                >
                                                  إضافة شهادة خامات
                                                </button>
                                              </>
                                            )}
                                          </>
                                        )}
                                        {fileLinks(s.id)}
                                      </div>
                                      <div className="mt-3 space-y-2">
                                        {s.materials.map((m) => (
                                          <div
                                            key={m.id}
                                            className="rounded border border-amber-200 bg-amber-50 p-2"
                                          >
                                            <p className="font-bold text-amber-900">
                                              خامات {m.number} ·{" "}
                                              {money(m.totalCents)}
                                            </p>
                                            <details className="mt-2">
                                              <summary className="cursor-pointer text-amber-800">
                                                الأصناف والمرفقات
                                              </summary>
                                              {m.items.map((i, index) => (
                                                <p
                                                  key={index}
                                                  className="mt-1 text-[10px]"
                                                >
                                                  {i.name} · {i.quantity}{" "}
                                                  {i.unit} ×{" "}
                                                  {money(i.unitPriceCents)} ={" "}
                                                  {money(i.totalCents)}
                                                </p>
                                              ))}
                                              {fileLinks(m.id)}
                                              {canManage &&
                                                !c.statements.some(
                                                  (x) =>
                                                    x.sequence >= s.sequence &&
                                                    x.stage === "PAID",
                                                ) && (
                                                  <button
                                                    className="mt-2 text-blue-700"
                                                    onClick={() =>
                                                      open({
                                                        action: "material",
                                                        contract: c,
                                                        statement: s,
                                                        material: m,
                                                        edit: true,
                                                      })
                                                    }
                                                  >
                                                    تعديل الشهادة
                                                  </button>
                                                )}
                                            </details>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  ))}
                                  {canManage &&
                                    !c.statements.some(
                                      (s) => s.kind === "FINAL",
                                    ) && (
                                      <button
                                        onClick={() =>
                                          open({
                                            action: "statement",
                                            contract: c,
                                          })
                                        }
                                        className="min-w-[180px] rounded-lg border-2 border-dashed border-slate-200 bg-white p-4 text-blue-700"
                                      >
                                        <Plus className="mx-auto mb-2 size-5" />
                                        إضافة الجاري التالي
                                      </button>
                                    )}
                                </div>
                                {c.memos.length > 0 && (
                                  <details>
                                    <summary className="cursor-pointer font-bold text-slate-600">
                                      مذكرات الرفع والخفض ({c.memos.length})
                                    </summary>
                                    <div className="mt-3 space-y-2">
                                      {c.memos.map((m) => (
                                        <p
                                          key={m.id}
                                          className="rounded border border-slate-200 bg-white p-3"
                                        >
                                          {m.kind === "INCREASE"
                                            ? "رفع"
                                            : "خفض"}{" "}
                                          · {money(m.amountCents)} · {m.reason}{" "}
                                          {fileLinks(m.id)}
                                        </p>
                                      ))}
                                    </div>
                                  </details>
                                )}
                                {c.notes && (
                                  <p className="text-slate-500">{c.notes}</p>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="erp-table-summary">
              <span>{filtered.length} عقد</span>
              <span>القيمة: {money(totals.value)}</span>
              <span>الوارد قبل الخامات: {money(totals.gross)}</span>
              <span>الصافي: {money(totals.net)}</span>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function IncomingEditor({
  editor: e,
  projects,
  attachments,
  busy,
  isAdmin,
  onCancel,
  onSave,
  movements,
}: {
  editor: Editor;
  projects: Project[];
  attachments: Attachment[];
  busy: boolean;
  isAdmin: boolean;
  onCancel: () => void;
  onSave: (payload: object, files: File[], estimateFiles?: File[]) => Promise<void>;
  movements: (Movement & { entityId: string })[];
}) {
  const c = e.contract;
  const m = e.material;
  const [selectedStatementId, setSelectedStatementId] = useState(
    e.statement?.id || "",
  );
  const s =
    e.action === "material"
      ? c?.statements.find((x) => x.id === selectedStatementId)
      : e.statement;
  const [projectId, setProjectId] = useState(
    c?.projectId || projects[0]?.id || "",
  );
  const [stage, setStage] = useState<string>(
    s
      ? incomingStages[
          Math.min(incomingStages.findIndex((x) => x[0] === s.stage) + 1, 8)
        ][0]
      : "COMPANY",
  );
  const [value, setValue] = useState(
    String(
      e.action === "contract"
        ? (c?.originalCents ?? 0) / 100
        : e.action === "statement"
          ? (s?.grossCents ?? c?.statements.at(-1)?.grossCents ?? 0) / 100
          : "",
    ),
  );
  const [items, setItems] = useState<Item[]>(
    m?.items.map((i) => ({
      name: i.name,
      unit: i.unit,
      quantity: String(i.quantity),
      price: String(i.unitPriceCents / 100),
    })) || [{ name: "", unit: "طن", quantity: "", price: "" }],
  );
  const [files, setFiles] = useState<File[]>([]);
  const [estimateFiles, setEstimateFiles] = useState<File[]>([]);
  const [estimateValue, setEstimateValue] = useState(c?.estimateCents == null ? "" : String(c.estimateCents / 100));
  const selectedProject =
    projects.find((p) => p.id === projectId) || c?.project;
  const title = {
    contract: e.edit ? "تعديل العقد" : "إضافة عقد وارد",
    statement: e.edit
      ? `تعديل ${statementLabel(s!)}`
      : `إضافة جاري ${(c?.statements.at(-1)?.sequence ?? 0) + 1}`,
    material: e.edit ? "تعديل شهادة الخامات" : "شهادة خامات جديدة",
    memo: "إضافة مذكرة رفع / خفض",
    stage: `تغيير مرحلة ${s ? statementLabel(s) : ""}`,
  }[e.action];
  const total = items.reduce(
    (n, i) =>
      n +
      Math.round(
        Number(i.quantity || 0) * Math.round(Number(i.price || 0) * 100),
      ),
    0,
  );
  const existingFiles = attachments.filter(
    (f) => f.entityId === (m?.id || s?.id || c?.id),
  );
  const needsFile =
    (!e.edit && e.action !== "stage") ||
    (e.action === "stage" && stage === "PAID");
  const previous = c?.statements
    .filter((x) => x.sequence < (s?.sequence ?? Infinity))
    .at(-1);
  const beforePaid = c ? financials(c) : null;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const payload = {
      ...data,
      action: e.action,
      ...(e.edit ? { id: m?.id || s?.id || c?.id } : {}),
      ...(e.action === "stage" ? { id: s?.id, stage } : {}),
      ...(c ? { contractId: c.id } : {}),
      ...(e.action === "material" ? { statementId: s?.id, items } : {}),
    };
    await onSave(payload, files, estimateFiles);
  }
  const patchItem = (index: number, patch: Partial<Item>) =>
    setItems((rows) =>
      rows.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    );
  return (
    <DocumentLayout movements={movements.filter(x => x.entityId === (m?.id || s?.id || (e.edit ? c?.id : undefined)))}>
    <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="mb-5 flex items-center gap-3">
        <button disabled={busy} onClick={onCancel} className={secondary}>
          <ArrowRight className="size-4" />
          رجوع
        </button>
        <h2 className="text-lg font-extrabold">{title}</h2>
      </div>
      <form onSubmit={submit} className="space-y-5">
        {(e.action === "statement" || e.action === "material") && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-semibold leading-7 text-amber-900">
            {grossNotice}
          </p>
        )}
        {c && e.action !== "contract" && (
          <div className="grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-4 text-xs md:grid-cols-3">
            <p>
              العقد:{" "}
              <b>
                {c.number} — {c.name}
              </b>
            </p>
            <p>
              المشروع: <b>{c.project.name}</b>
            </p>
            <p>
              الجهة المالكة: <b>{c.project.company.name}</b>
            </p>
            <p>
              قيمة العقد الحالية: <b>{money(financials(c).value)}</b>
            </p>
            {s && (
              <p>
                المستخلص:{" "}
                <b>
                  {statementLabel(s)} · {money(s.grossCents)}
                </b>
              </p>
            )}
          </div>
        )}
        {e.action === "contract" && (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="اسم العقد" name="name" defaultValue={c?.name} />
              <Field label="رقم العقد" name="number" defaultValue={c?.number} />
              <label>
                <Label>المشروع</Label>
                <ERPSelect
                  required
                  name="projectId"
                  value={projectId}
                  onValueChange={(ev) => setProjectId(ev)}
                  className={inputClass}
                >
                  {!projects.length && (
                    <option value="">أضف مشروعًا من صفحة الإدارة أولًا</option>
                  )}
                  {projects.map((p) => (
                    <option value={p.id} key={p.id}>
                      {p.name}
                    </option>
                  ))}
                </ERPSelect>
              </label>
              <Field
                label="القيمة الأصلية للعقد (ج.م)"
                name="value"
                type="number"
                value={value}
                onChange={setValue}
              />
            </div>
            <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <Field label="قيمة المقايسة — اختياري" name="estimateValue" type="number" value={estimateValue} onChange={setEstimateValue} required={false} />
              {estimateValue && <p className="text-xs text-blue-700">الفرق (العقد − المقايسة): <b dir="ltr">{money(Math.round((Number(value || 0) - Number(estimateValue)) * 100))}</b></p>}
              <UploadBox
                label="إرفاق المقايسة — أرشيف للمراجعة"
                required={Boolean(estimateValue) && Math.round(Number(estimateValue) * 100) !== c?.estimateCents}
                onFilesChange={setEstimateFiles}
              />
              <Files files={attachments.filter(f => f.entityId === c?.id && f.entityType === "estimate")} />
              {c?.estimateReference && <p className="text-xs text-slate-500">المرجع النصي السابق (محفوظ): {c.estimateReference}</p>}
            </div>
            <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
              الجهة المالكة: {selectedProject?.company.name || "—"} · القطاع:{" "}
              {selectedProject?.sector?.name || "—"}
            </div>
            {c?.statements.length ? (
              <p className="text-xs text-amber-700">
                أصل القيمة والمشروع مقفلان بعد إضافة المستخلصات؛ التعديل المالي
                بمذكرة رفع أو خفض.
              </p>
            ) : null}
          </>
        )}
        {e.action === "statement" && (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <label>
                <Label>نوع المستخلص</Label>
                <ERPSelect
                  name="kind"
                  defaultValue={s?.kind || "CURRENT"}
                  className={inputClass}
                >
                  <option value="CURRENT">جاري</option>
                  <option value="FINAL">ختامي</option>
                </ERPSelect>
              </label>
              <Field
                label="إجمالي المستخلص التراكمي قبل خصم الخامات (ج.م)"
                name="value"
                type="number"
                value={value}
                onChange={setValue}
              />
            </div>
            <div className="grid gap-3 rounded-lg bg-blue-50 p-4 text-xs md:grid-cols-3">
              <p>
                التراكمي السابق: <b>{money(previous?.grossCents ?? 0)}</b>
              </p>
              <p>
                أعمال الفترة:{" "}
                <b>
                  {money(
                    Math.round(Number(value || 0) * 100) -
                      (previous?.grossCents ?? 0),
                  )}
                </b>
              </p>
              <p>
                آخر إجمالي مصروف: <b>{money(beforePaid?.gross ?? 0)}</b>
              </p>
            </div>
            <div className="rounded-lg border-2 border-dashed border-slate-200 p-4 text-xs text-slate-500">
              الخامات تُضاف بشكل منفصل من «إضافة شهادة خامات» بعد حفظ المستخلص.
              لا تخصمها هنا.
            </div>
          </>
        )}
        {e.action === "material" && (
          <>
            <label>
              <Label>المستخلص المرتبط بالشهادة</Label>
              <ERPSelect
                required
                value={selectedStatementId}
                onValueChange={(ev) => setSelectedStatementId(ev)}
                disabled={e.edit}
                className={inputClass}
              >
                {c?.statements
                  .filter(
                    (x) =>
                      e.edit ||
                      !c.statements.some(
                        (p) => p.stage === "PAID" && p.sequence >= x.sequence,
                      ),
                  )
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {statementLabel(x)} — {money(x.grossCents)}
                    </option>
                  ))}
              </ERPSelect>
            </label>
            <Field
              label="رقم شهادة الخامات"
              name="number"
              defaultValue={m?.number}
            />
            <p className="text-xs text-slate-500">
              أضف خامات هذه الشهادة فقط. الشهادات السابقة محسوبة تلقائيًا ولا
              تكرر هنا.
            </p>
            <div className="flex items-center justify-between">
              <Label>الأصناف</Label>
              <button
                type="button"
                className={secondary}
                onClick={() =>
                  setItems((rows) => [
                    ...rows,
                    { name: "", unit: "طن", quantity: "", price: "" },
                  ])
                }
              >
                <Plus className="size-3" />
                إضافة صنف
              </button>
            </div>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full min-w-[700px] text-right text-xs">
                <thead className="bg-slate-100">
                  <tr>
                    {[
                      "الصنف",
                      "الوحدة",
                      "الكمية",
                      "سعر الوحدة",
                      "الإجمالي",
                      "إجراءات",
                    ].map((h) => (
                      <th key={h} className="p-3">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((i, index) => (
                    <tr key={index} className="border-t border-slate-200">
                      <td className="p-2">
                        <input
                          aria-label={`الصنف ${index + 1}`}
                          required
                          value={i.name}
                          onChange={(ev) =>
                            patchItem(index, { name: ev.target.value })
                          }
                          className={inputClass}
                          placeholder="حديد تسليح…"
                        />
                      </td>
                      <td className="p-2">
                        <ERPSelect
                          aria-label={`الوحدة ${index + 1}`}
                          value={i.unit}
                          onValueChange={(ev) =>
                            patchItem(index, { unit: ev })
                          }
                          className={inputClass}
                        >
                          {[
                            "طن",
                            "كجم",
                            "م3",
                            "م2",
                            "م.ط",
                            "عدد",
                            "لتر",
                            "مقطوعية",
                          ].map((u) => (
                            <option key={u}>{u}</option>
                          ))}
                        </ERPSelect>
                      </td>
                      <td className="p-2">
                        <input
                          aria-label={`الكمية ${index + 1}`}
                          required
                          type="number"
                          min="0.001"
                          step="any"
                          value={i.quantity}
                          onChange={(ev) =>
                            patchItem(index, { quantity: ev.target.value })
                          }
                          className={inputClass}
                        />
                      </td>
                      <td className="p-2">
                        <CurrencyInput
                          aria-label={`سعر الوحدة ${index + 1}`}
                          required
                          min="0.01"
                          step="0.01"
                          value={i.price}
                          onValueChange={(raw) =>
                            patchItem(index, { price: raw })
                          }
                          className={inputClass}
                        />
                      </td>
                      <td className="whitespace-nowrap p-2 font-bold">
                        {money(
                          Math.round(
                            Number(i.quantity || 0) *
                              Math.round(Number(i.price || 0) * 100),
                          ),
                        )}
                      </td>
                      <td className="p-2">
                        <button
                          type="button"
                          aria-label={`حذف الصنف ${index + 1}`}
                          disabled={items.length === 1}
                          onClick={() =>
                            setItems((rows) =>
                              rows.filter((_, n) => n !== index),
                            )
                          }
                          className={secondary}
                        >
                          <Trash2 className="size-3 text-red-600" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-blue-700 bg-blue-50">
                  <tr>
                    <td colSpan={4} className="p-3 font-bold">
                      إجمالي الشهادة
                    </td>
                    <td colSpan={2} className="p-3 font-extrabold">
                      {money(total)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
        {e.action === "memo" && (
          <div className="grid gap-4 md:grid-cols-2">
            <label>
              <Label>نوع المذكرة</Label>
              <ERPSelect name="kind" className={inputClass}>
                <option value="INCREASE">رفع</option>
                <option value="DECREASE">خفض</option>
              </ERPSelect>
            </label>
            <Field label="قيمة المذكرة (ج.م)" name="value" type="number" />
            <Field label="سبب المذكرة" name="reason" />
          </div>
        )}
        {e.action === "stage" && (
          <>
            <p className="text-sm">
              المرحلة الحالية:{" "}
              <b>{incomingStages.find((x) => x[0] === s?.stage)?.[1]}</b>
            </p>
            <label>
              <Label>المرحلة الجديدة</Label>
              <ERPSelect
                name="stage"
                value={stage}
                onValueChange={(ev) => setStage(ev)}
                className={inputClass}
              >
                {incomingStages.map(([key, label], index) => (
                  <option
                    key={key}
                    value={key}
                    disabled={
                      index >
                        incomingStages.findIndex((x) => x[0] === s?.stage) +
                          1 ||
                      (s?.stage === "PAID" && !isAdmin)
                    }
                  >
                    {label}
                  </option>
                ))}
              </ERPSelect>
            </label>
            <Field
              label="سبب الرجوع / ملاحظات الحركة"
              name="reason"
              required={
                incomingStages.findIndex((x) => x[0] === stage) <
                incomingStages.findIndex((x) => x[0] === s?.stage)
              }
            />
            {stage === "PAID" && (
              <div className="grid gap-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 md:grid-cols-3">
                <Field label="تاريخ الصرف" name="paidAt" type="date" />
                <label>
                  <Label>وسيلة التحصيل</Label>
                  <ERPSelect required name="paymentMethod" className={inputClass}>
                    <option value="CHEQUE">شيك</option>
                    <option value="TRANSFER">تحويل</option>
                  </ERPSelect>
                </label>
                <Field
                  label="رقم الشيك / مرجع التحويل"
                  name="paymentReference"
                />
              </div>
            )}
            <p className="rounded-lg bg-blue-50 p-3 text-xs text-blue-800">
              لا تدخل القيم في الوارد الفعلي إلا عند «تم الصرف». الانتقال للأمام
              يكون مرحلة واحدة في كل حركة.
            </p>
          </>
        )}
        {e.action !== "stage" && e.action !== "memo" && (
          <label>
            <Label>ملاحظات</Label>
            <textarea
              name="notes"
              defaultValue={
                (e.action === "material"
                  ? m?.notes
                  : e.action === "statement"
                    ? s?.notes
                    : c?.notes) || ""
              }
              rows={2}
              className="w-full rounded-lg border border-slate-200 p-3 text-sm"
            />
          </label>
        )}
        <UploadBox
          label={e.action === "stage" && stage === "PAID" ? "إثبات الصرف" : "المرفقات"}
          required={needsFile}
          onFilesChange={setFiles}
        />
        {e.edit && <Files files={existingFiles.filter(f => f.entityType !== "estimate")} />}
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className={secondary}
          >
            إلغاء
          </button>
          <button disabled={busy} className={primary}>
            {busy ? "جارٍ الحفظ…" : "حفظ"}
          </button>
        </div>
      </form>
    </section>
    </DocumentLayout>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-2 block text-xs font-bold text-slate-600">
      {children}
    </span>
  );
}
function Field({
  label,
  name,
  defaultValue,
  required = true,
  type = "text",
  value,
  onChange,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  required?: boolean;
  type?: string;
  value?: string;
  onChange?: (v: string) => void;
}) {
  return (
    <label>
      <Label>{label}</Label>
      {type === "number" ? <CurrencyInput name={name} required={required} value={value} defaultValue={defaultValue} min="0.01" onValueChange={onChange} /> : <input
        name={name}
        type={type}
        required={required}
        {...(value !== undefined
          ? {
              value,
              onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                onChange?.(e.target.value),
            }
          : { defaultValue })}
        min={type === "number" ? "0.01" : undefined}
        step={type === "number" ? "0.01" : undefined}
        className={inputClass}
      />}
    </label>
  );
}
function Filter({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { id: string; name: string }[];
}) {
  return (
    <label>
      <span className="sr-only">{label}</span>
      <ERPSelect
        aria-label={label}
        value={value}
        onValueChange={(e) => onChange(e)}
        className={inputClass}
      >
        <option value="">{label}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </ERPSelect>
    </label>
  );
}
function Files({ files }: { files: Attachment[] }) {
  return (
    <span className="inline-flex flex-wrap gap-2">
      {files.map((f) => (
        <a
          key={f.id}
          className="inline-flex items-center gap-1 text-[10px] font-normal text-blue-700 underline"
          href={`/api/incoming/attachments/${f.id}`}
        >
          <Paperclip className="size-3" />
          {f.name} ({Math.ceil(f.size / 1024)} KB)
        </a>
      ))}
    </span>
  );
}
