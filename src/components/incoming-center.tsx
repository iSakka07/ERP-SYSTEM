"use client";
import { ERPSelect } from "@/components/erp-select";
import { CurrencyInput } from "@/components/currency-input";
import { DocumentLayout, type Movement } from "@/components/document-layout";
import { UploadBox } from "@/components/upload-box";
import { filteredIncomingReport, singleIncomingReport } from "@/components/incoming-pdf-report";
import { createPdfReportUrl } from "@/components/pdf-report-document";

import { Fragment, FormEvent, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { confirmSimilarFinancialOperation, financialHeaders, financialResult } from "@/lib/financial-submit";
import {
  ArrowRight,
  Banknote,
  ClipboardList,
  FileDown,
  FilePenLine,
  Landmark,
  ListChecks,
  PackageOpen,
  Paperclip,
  Pencil,
  Percent,
  Plus,
  RefreshCcw,
  Scale,
  Trash2,
} from "lucide-react";
import { IconAction, KpiCard, MoneyValue } from "@/components/erp-ui";
import {
  financials,
  grossNotice,
  incomingStages,
  money,
  statementLabel,
} from "@/lib/incoming";

export type Project = {
  id: string;
  name: string;
  company: { id: string; name: string };
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
export type Contract = {
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
export type Attachment = {
  id: string;
  entityId: string;
  entityType: string;
  name: string;
  size: number;
};
export type Editor = {
  action: "contract" | "statement" | "material" | "stage";
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
  initialOwnerId = "",
  initialStage = "",
  initialQuery = "",
  movements = [],
}: {
  contracts: Contract[];
  projects: Project[];
  attachments: Attachment[];
  canManage: boolean;
  isAdmin: boolean;
  initialProjectId?: string;
  initialOwnerId?: string;
  initialStage?: string;
  initialQuery?: string;
  movements?: (Movement & { entityId: string })[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [project, setProject] = useState(initialProjectId);
  const [owner, setOwner] = useState(initialOwnerId);
  const [stage, setStage] = useState(initialStage);
  const [expanded, setExpanded] = useState("");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [pdfChoiceOpen, setPdfChoiceOpen] = useState(false);
  const [pdfWorking, setPdfWorking] = useState(false);
  useEffect(() => {
    const showChoice = () => setPdfChoiceOpen(true);
    window.addEventListener("incoming-pdf-request", showChoice);
    return () => window.removeEventListener("incoming-pdf-request", showChoice);
  }, []);
  const filtered = contracts.filter(
    (c) =>
      (!query || `${c.name} ${c.number} ${c.project.name}`.includes(query)) &&
      (!project || c.projectId === project) &&
      (!owner || c.project.company.id === owner) &&
      (!stage || c.statements.some((s) => s.stage === stage)),
  );
  const totals = filtered.reduce(
    (n, c) => {
      const f = financials(c);
      return {
        value: n.value + f.value,
        entitlement: n.entitlement + f.gross,
        materials: n.materials + f.materials,
        net: n.net + f.net,
        remaining: n.remaining + f.remaining,
      };
    },
    { value: 0, entitlement: 0, materials: 0, net: 0, remaining: 0 },
  );
  const unique = (items: { id: string; name: string }[]) => [
    ...new Map(items.map((i) => [i.id, i])).values(),
  ];
  async function exportIncomingPdf(single: boolean) {
    const selected = filtered.find((contract) => contract.id === expanded);
    if (single && !selected) return;
    const filterLabels = [
      query && `بحث: ${query}`,
      project && `المشروع: ${projects.find((item) => item.id === project)?.name || project}`,
      owner && `الجهة المالكة: ${projects.find((item) => item.company.id === owner)?.company.name || owner}`,
      stage && `المرحلة: ${incomingStages.find(([id]) => id === stage)?.[1] || stage}`,
    ].filter(Boolean).join(" · ");
    const report = single && selected ? singleIncomingReport(selected) : filteredIncomingReport(filtered, filterLabels || "كل العقود");
    const preview = window.open("", "_blank");
    if (!preview) { window.alert("اسمح بالنوافذ المنبثقة لفتح معاينة PDF."); return; }
    preview.opener = null;
    preview.document.write("<title>ASGC ERP · جاري تجهيز التقرير</title><body style='font-family:Arial,sans-serif;padding:32px;color:#10192d'>جاري تجهيز تقرير PDF…</body>");
    preview.document.close();
    setPdfChoiceOpen(false);
    setPdfWorking(true);
    try {
      const userName = document.querySelector("[data-export-user] p:first-child")?.textContent?.trim();
      const url = await createPdfReportUrl({ ...report, userName });
      preview.location.href = url;
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      console.error(error);
      preview.close();
      window.alert("تعذّر تجهيز ملف PDF. حاول مرة أخرى.");
    } finally { setPdfWorking(false); }
  }
  const open = (e: Editor) => {
    setMessage("");
    const returnParams = new URLSearchParams();
    if (project) returnParams.set("project", project);
    if (owner) returnParams.set("owner", owner);
    if (stage) returnParams.set("stage", stage);
    if (query) returnParams.set("q", query);
    const returnHref = `/incoming${returnParams.size ? `?${returnParams}` : ""}`;
    if (e.action === "contract" && !e.edit) {
      router.push(`/incoming/new?return=${encodeURIComponent(returnHref)}`);
      return;
    }
    if (e.action === "statement" && !e.edit && e.contract) {
      router.push(`/incoming/${e.contract.id}/statements/new?return=${encodeURIComponent(returnHref)}`);
      return;
    }
    setEditor(e);
  };
  async function removeContract(contract: Contract) {
    if (!window.confirm(`مسح «${contract.name}» من القوائم؟ سيظل تاريخه المالي محفوظًا.`)) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/incoming", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: contract.id }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "تعذر مسح العقد.");
      setExpanded(""); setMessage("تم مسح العقد من القوائم مع الاحتفاظ بتاريخه المالي."); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "تعذر مسح العقد."); }
    finally { setBusy(false); }
  }
  async function save(payload: object, files: File[], estimateFiles: File[] = [], memoFiles: File[] = []) {
    setBusy(true);
    setMessage("");
    try {
      const form = new FormData();
      form.set("payload", JSON.stringify(payload));
      files.forEach((f) => form.append("files", f));
      estimateFiles.forEach((f) => form.append("estimateFiles", f));
      memoFiles.forEach((f) => form.append("memoFiles", f));
      const action = "action" in payload ? String(payload.action) : "unknown", record = payload as { id?: string; contractId?: string; statementId?: string }, financial = ["statement", "material", "stage"].includes(action), scope = `incoming-${action}-${record.id || record.statementId || record.contractId || "new"}`;
      const send = async (): Promise<boolean> => { try { const response = await fetch("/api/incoming", { method: "POST", body: form, ...(financial ? { headers: financialHeaders(scope) } : {}) }); if (financial) return (await financialResult(response, scope)).replayed; const result = await response.json(); if (!response.ok) throw new Error(result.error || "تعذر الحفظ."); return false; } catch (reason) { const similar = (reason as { similarFinancialOperation?: { confirmationToken: string } }).similarFinancialOperation; if (similar && window.confirm("توجد عملية وارد مشابهة مسجلة من قبل. هل تريد إنشاءها كعملية مستقلة؟")) { confirmSimilarFinancialOperation(scope, similar.confirmationToken); return send(); } throw reason; } };
      const replayed = await send();
      setMessage(replayed ? "العملية مسجلة بالفعل ولم تتكرر." : "تم الحفظ بنجاح.");
      setEditor(null);
      router.refresh();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "تعذر الاتصال. حاول مرة أخرى.");
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
        "المستحق بعد الخامات",
        "الخامات المسجلة",
        "الوارد",
        "المتبقي",
        "نسبة الصرف",
      ],
      ...filtered.map((c) => {
        const f = financials(c);
        return [
          c.name,
          c.number,
          c.project.name,
          c.project.company.name,
          f.value / 100,
          f.entitlement / 100,
          f.materials / 100,
          f.net / 100,
          f.remaining / 100,
          f.value ? `${Math.min(100, Math.max(0, (f.gross / f.value) * 100)).toFixed(2)}%` : "0%",
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
    <Files compact files={attachments.filter((f) => f.entityId === entityId)} />
  );
  return (
    <div className="space-y-5">
      {pdfChoiceOpen && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPdfChoiceOpen(false); }}>
        <div role="dialog" aria-modal="true" aria-labelledby="incoming-pdf-title" className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 text-right shadow-2xl" dir="rtl">
          <h2 id="incoming-pdf-title" className="text-base font-extrabold text-slate-950">تصدير PDF للعقود والوارد</h2>
          <p className="mt-2 text-xs text-slate-500">اختر نطاق التقرير. سيحتوي على البيانات فقط دون المرفقات.</p>
          <div className="mt-5 grid gap-2">
            <button type="button" disabled={pdfWorking} onClick={() => exportIncomingPdf(false)} className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-right text-sm font-bold text-blue-800 hover:bg-blue-100">كل العقود المطابقة للفلاتر ({filtered.length})</button>
            {filtered.some((contract) => contract.id === expanded) && <button type="button" disabled={pdfWorking} onClick={() => exportIncomingPdf(true)} className="rounded-lg border border-slate-200 px-4 py-3 text-right text-sm font-bold text-slate-800 hover:bg-slate-50">العقد المفتوح: {filtered.find((contract) => contract.id === expanded)?.name}</button>}
          </div>
          <button type="button" onClick={() => setPdfChoiceOpen(false)} className="mt-4 text-xs font-semibold text-slate-500 hover:text-slate-800">إلغاء</button>
        </div>
      </div>}
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
          onOpen={setEditor}
          movements={movements}
        />
      ) : (
        <>
          <div className="incoming-kpi-grid grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <KpiCard label="القيمة التعاقدية" value={money(totals.value)} icon={Landmark} tone="blue" />
            <KpiCard label="تم الصرف" value={money(totals.entitlement)} icon={ClipboardList} tone="violet" />
            <KpiCard label="الخامات" value={money(totals.materials)} icon={PackageOpen} tone="amber" />
            <KpiCard label="الوارد" value={money(totals.net)} icon={Banknote} tone="emerald" />
            <KpiCard label="المتبقي من القيمة التعاقدية" value={money(totals.remaining)} icon={Scale} tone="rose" />
          </div>
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="grid gap-3 md:grid-cols-4">
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
              <table className="erp-data-table erp-responsive-table min-w-[1180px]">
                <thead>
                  <tr>
                    {[
                      "اسم العقد",
                      "رقم العقد",
                      "المشروع",
                      "الجهة المالكة",
                      "قيمة العقد",
                      "موقف المستخلصات",
                      "إجمالي الوارد",
                      "الخامات",
                      "المتبقي",
                      "نسبة الصرف",
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
                        colSpan={11}
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
                          <td data-label="اسم العقد" className="max-w-[220px]">
                            <button
                              onClick={() => setExpanded(show ? "" : c.id)}
                              aria-expanded={show}
                              className="text-right font-extrabold text-slate-950"
                            >
                              {c.name}
                            </button>
                          </td>
                          <td data-label="رقم العقد"><code dir="ltr" className="text-xs font-bold text-slate-600">{c.number}</code></td>
                          <td data-label="المشروع">{c.project.name}</td>
                          <td data-label="الجهة المالكة">
                            {c.project.company.name}
                          </td>
                          <td data-label="قيمة العقد" className="text-center">
                            <FloatingPanel width={360} trigger={<button type="button" className="inline-flex items-center gap-1 font-bold text-blue-700 underline decoration-solid underline-offset-4 focus:outline-none focus:ring-2 focus:ring-blue-300" aria-label="عرض تفاصيل قيمة العقد"><MoneyValue>{money(f.value)}</MoneyValue>{f.value !== c.originalCents && <span aria-label={f.value > c.originalCents ? "العقد زاد بمذكرة رفع" : "العقد انخفض بمذكرة خفض"} title={f.value > c.originalCents ? "مذكرة رفع" : "مذكرة خفض"} className={`text-[10px] ${f.value > c.originalCents ? "text-emerald-600" : "text-rose-600"}`}>{f.value > c.originalCents ? "▲" : "▼"}</span>}</button>}><ContractValueBreakdown contract={c} currentValue={f.value} /></FloatingPanel>
                          </td>
                          <td data-label="موقف المستخلصات">
                            {c.statements.at(-1) ? <button
                              className={`incoming-latest-statement ${stageClass(c.statements.at(-1)!.stage)}`}
                              onClick={() => setExpanded(show ? "" : c.id)}
                              aria-expanded={show}
                            >
                              <strong>{statementLabel(c.statements.at(-1)!)}</strong>
                              <MoneyValue>{money(c.statements.at(-1)!.grossCents)}</MoneyValue>
                              <span>{stageLabel(c.statements.at(-1)!.stage)}</span>
                            </button> : <span className="text-xs text-slate-400">لا يوجد جاري</span>}
                          </td>
                          <td data-label="إجمالي الوارد" className="text-center">
                            <MoneyValue>{money(f.net)}</MoneyValue>
                          </td>
                          <td data-label="الخامات" className="text-center">
                            <MoneyValue>{money(f.materials)}</MoneyValue>
                          </td>
                          <td data-label="المتبقي" className="text-center">
                            <MoneyValue>{money(f.remaining)}</MoneyValue>
                          </td>
                          <td data-label="نسبة الصرف" className="min-w-[150px] text-center">
                            <PaymentProgress paid={f.gross} total={f.value} />
                          </td>
                          <td data-label="الإجراءات">
                            <div className="flex items-center justify-center gap-1">
                              <IconAction label="فتح إدارة الجواري" icon={ListChecks} onClick={() => setExpanded(show ? "" : c.id)} />
                              {canManage && <IconAction label="تعديل العقد" icon={FilePenLine} onClick={() => open({ action: "contract", contract: c, edit: true })} />}
                              {fileLinks(c.id)}
                              {canManage && <IconAction label={`مسح ${c.name}`} icon={Trash2} tone="danger" disabled={busy} onClick={() => removeContract(c)} />}
                            </div>
                          </td>
                        </tr>
                        {show && (
                          <tr>
                            <td
                              colSpan={11}
                              data-label="تفاصيل العقد"
                              className="erp-table-details"
                            >
                              <div className="space-y-4">
                                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
                                  <p className="text-xs text-slate-500">المهندس المشرف: <b className="text-slate-800">{[...new Set(c.project.supervisors?.map((x) => x.employee.name))].join("، ") || "غير محدد"}</b></p>
                                </div>
                                <div className="flex items-start gap-3 overflow-x-auto pb-2">
                                  {c.statements.map((s) => (
                                    <StatementCard
                                      key={s.id}
                                      statement={s}
                                      locked={c.statements.some((x) => x.sequence >= s.sequence && x.stage === "PAID")}
                                      canManage={canManage}
                                      statementFiles={attachments.filter((f) => f.entityId === s.id && f.entityType === "statement")}
                                      paymentProofFiles={attachments.filter((f) => f.entityId === s.id && f.entityType === "payment-proof")}
                                      materialFiles={attachments}
                                      memoFiles={attachments.filter((file) => c.memos.some((memo) => memo.id === file.entityId))}
                                      memos={c.memos}
                                      originalCents={c.originalCents}
                                      onStage={() => open({ action: "stage", contract: c, statement: s })}
                                      onEdit={() => open({ action: "statement", contract: c, statement: s, edit: true })}
                                    />
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
                                        إضافة جاري {(c.statements.at(-1)?.sequence ?? 0) + 1}
                                      </button>
                                    )}
                                </div>
                                <div className="incoming-kpi-grid grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                                  <KpiCard label="صافي الوارد النقدي" value={money(f.net)} icon={Banknote} tone="emerald" />
                                  <KpiCard label="الخامات" value={money(f.materials)} icon={PackageOpen} tone="amber" />
                                  <KpiCard label="التحصيل الفعلي" value={money(f.pendingNet)} icon={ClipboardList} tone="violet" />
                                  <KpiCard label="نسبة الصرف من العقد" value={`${f.pct.toFixed(1)}%`} icon={Percent} tone="blue" />
                                  <KpiCard label="نسبة الخامات" value={`${(f.value ? (f.materials / f.value) * 100 : 0).toFixed(1)}%`} icon={Scale} tone="rose" />
                                </div>
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
                <tfoot>
                  <tr className="bg-blue-50/70 font-extrabold">
                    <td data-label="عدد العقود">{filtered.length} عقد</td>
                    <td colSpan={3}></td>
                    <td data-label="إجمالي قيمة العقود" className="text-center"><MoneyValue>{money(totals.value)}</MoneyValue></td>
                    <td></td>
                    <td data-label="إجمالي الوارد" className="text-center"><MoneyValue>{money(totals.net)}</MoneyValue></td>
                    <td data-label="إجمالي الخامات" className="text-center"><MoneyValue>{money(totals.materials)}</MoneyValue></td>
                    <td data-label="إجمالي المتبقي" className="text-center"><MoneyValue>{money(totals.remaining)}</MoneyValue></td>
                    <td data-label="إجمالي نسبة الصرف" className="text-center"><PaymentProgress paid={totals.entitlement} total={totals.value} /></td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
const stageStyles: Record<string, string> = {
  COMPANY: "border-slate-300 bg-slate-50 text-slate-700",
  BATTALION: "border-sky-200 bg-sky-50 text-sky-800",
  BRIGADE: "border-blue-200 bg-blue-50 text-blue-800",
  ADMINISTRATION: "border-indigo-200 bg-indigo-50 text-indigo-800",
  CONSULTANT: "border-violet-200 bg-violet-50 text-violet-800",
  SUPPLY: "border-cyan-200 bg-cyan-50 text-cyan-800",
  FINANCE: "border-amber-200 bg-amber-50 text-amber-800",
  CENTRAL: "border-orange-200 bg-orange-50 text-orange-800",
  PAID: "border-emerald-200 bg-emerald-50 text-emerald-800",
};
function stageClass(stage: string) { return stageStyles[stage] || stageStyles.COMPANY; }
function PaymentProgress({ paid, total }: { paid: number; total: number }) {
  const percent = total > 0 ? Math.min(100, Math.max(0, (paid / total) * 100)) : 0;
  const tone = percent >= 100 ? "bg-emerald-500" : percent >= 60 ? "bg-amber-400" : "bg-rose-400";
  return <div className="mx-auto w-full max-w-[150px] space-y-1" title={`تم صرف ${percent.toFixed(2)}% من قيمة العقد`}><div className="flex items-center justify-center gap-1.5"><strong className="text-xs text-slate-700">{percent.toFixed(2)}%</strong><span className="text-[10px] text-slate-400">من العقد</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><span className={`block h-full rounded-full transition-all ${tone}`} style={{ width: `${percent}%` }} /></div></div>;
}
function ContractValueBreakdown({ contract, currentValue }: { contract: Contract; currentValue: number }) {
  const estimate = contract.estimateCents ?? null;
  const original = contract.originalCents;
  const { increase, decrease, cancelled } = adjustmentTotals(contract.memos);
  const change = increase - decrease - cancelled;
  const estimatePercent = estimate && estimate > 0 ? ((original - estimate) / estimate) * 100 : null;
  const certificates = contract.statements.flatMap((statement) => statement.materials.map((certificate) => ({ ...certificate, statement })));
  const reportMoney = (cents: number) => `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(cents / 100)} ج`;
  return <div dir="rtl" className="text-[10px] text-slate-700">
    <header className="flex items-start gap-2 border-b border-slate-200 px-3 py-2"><ClipboardList className="mt-0.5 size-3.5 text-blue-700" /><div><h3 className="text-[11px] font-extrabold text-slate-950">تفاصيل قيمة العقد</h3><p dir="ltr" className="text-right font-bold text-slate-500">{contract.number}</p></div></header>
    <div className="space-y-2 p-2.5">
      <section className="rounded-lg border border-rose-200 border-r-[3px] border-r-rose-500 bg-rose-50/50 p-2"><div className="flex items-center justify-between gap-2"><span>قيمة المقايسة المرتبطة{contract.estimateReference ? ` · ${contract.estimateReference}` : ""}</span><strong dir="ltr" className="text-[11px] text-slate-900">{estimate == null ? "غير مسجلة" : reportMoney(estimate)}</strong></div><div className="mt-1 flex items-center justify-between gap-2 text-rose-700"><span>نسبة تجاوز العقد للمقايسة</span><strong dir="ltr">{estimatePercent == null ? "—" : `${estimatePercent.toFixed(1)}%`}</strong></div></section>
      <section className="rounded-lg border border-slate-200 bg-slate-50 p-2"><h4 className="mb-1.5 flex items-center gap-1 font-extrabold text-slate-900"><Scale className="size-3.5 text-blue-700" />مذكرات خفض/رفع</h4><div className="grid grid-cols-2 gap-1.5"><div className="rounded border border-slate-200 bg-white p-1.5"><p className="text-slate-500">قيمة العقد</p><strong dir="ltr" className="block text-right text-blue-700">{reportMoney(original)}</strong></div><div className="rounded border border-slate-200 bg-white p-1.5"><p className="text-slate-500">القيمة الحالية</p><strong dir="ltr" className="block text-right text-blue-700">{reportMoney(currentValue)}</strong></div></div><div className="mt-1.5 rounded border border-slate-200 bg-white p-1.5"><p className={`flex items-center justify-between font-bold ${change < 0 ? "text-rose-700" : "text-emerald-700"}`}><span>صافي {change < 0 ? "النقصان" : "الزيادة"}</span><span dir="ltr">{reportMoney(Math.abs(change))}</span></p><p className="mt-1 text-rose-700">خفض وإلغاء: {reportMoney(decrease + cancelled)}</p><p className="text-emerald-700">رفع: {reportMoney(increase)}</p></div></section>
      <section className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-2">
        <h4 className="mb-1.5 flex items-center gap-1 font-extrabold text-emerald-950"><PackageOpen className="size-3.5" />شهادات الخامات المرتبطة <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] text-emerald-800">{certificates.length} شهادة</span></h4>
        {certificates.length ? <div className="space-y-1.5">{certificates.map((certificate) => <div key={certificate.id} className="rounded border border-emerald-200 bg-white p-1.5">
          <div className="flex items-start justify-between gap-2 border-b border-emerald-100 pb-1">
            <div><strong className="block text-slate-900">شهادة {certificate.number}</strong><span className="text-slate-500">على {statementLabel(certificate.statement)}</span></div>
            <strong dir="ltr" className="shrink-0 text-emerald-700">{reportMoney(certificate.totalCents)}</strong>
          </div>
          <div className="mt-1 space-y-1">{certificate.items.map((item, index) => <div key={`${item.name}-${index}`} className="flex items-start justify-between gap-2"><span><strong className="text-slate-700">{item.name}</strong><span className="block text-slate-500">الكمية: {item.quantity} {item.unit}</span></span><span dir="ltr" className="shrink-0 text-emerald-700">{reportMoney(item.totalCents)}</span></div>)}</div>
        </div>)}</div> : <p className="text-slate-500">لا توجد شهادات خامات.</p>}
      </section>
    </div>
  </div>;
}
function stageLabel(stage: string) { return incomingStages.find(([id]) => id === stage)?.[1] || stage; }
function adjustmentTotals(memos: Contract["memos"]) {
  return memos.reduce((totals, memo) => {
    try {
      const parts = JSON.parse(memo.reason) as { type?: string; increase?: number; decrease?: number; cancelled?: number };
      if (parts.type === "FINAL_ADJUSTMENT") {
        totals.increase += parts.increase || 0;
        totals.decrease += parts.decrease || 0;
        totals.cancelled += parts.cancelled || 0;
        return totals;
      }
    } catch { /* Older memos store plain text. */ }
    totals[memo.kind === "INCREASE" ? "increase" : "decrease"] += memo.amountCents;
    return totals;
  }, { increase: 0, decrease: 0, cancelled: 0 });
}

function StatementCard({ statement, locked, canManage, statementFiles, paymentProofFiles, materialFiles, memoFiles, memos, originalCents, onStage, onEdit }: { statement: Statement; locked: boolean; canManage: boolean; statementFiles: Attachment[]; paymentProofFiles: Attachment[]; materialFiles: Attachment[]; memoFiles: Attachment[]; memos: Contract["memos"]; originalCents: number; onStage: () => void; onEdit: () => void }) {
  const [open, setOpen] = useState(false);
  const materialTotal = statement.materials.reduce((sum, material) => sum + material.totalCents, 0);
  const adjustment = adjustmentTotals(memos);
  const netAdjustment = adjustment.increase - adjustment.decrease - adjustment.cancelled;
  const adjustmentItems = [
    { label: "رفع", amount: adjustment.increase, tone: "border-emerald-200 bg-emerald-50 text-emerald-700" },
    { label: "خفض", amount: adjustment.decrease, tone: "border-rose-200 bg-rose-50 text-rose-700" },
    { label: "ملغى", amount: adjustment.cancelled, tone: "border-slate-200 bg-slate-100 text-slate-700" },
  ];
  return <article className={`relative min-w-[220px] max-w-[260px] rounded-xl border p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${stageClass(statement.stage)}`}>
    <button type="button" className="w-full text-right" aria-expanded={open} onClick={() => setOpen(value => !value)}>
      <div className="flex items-start justify-between gap-3"><strong className="text-sm text-slate-950">{statementLabel(statement)}</strong><span className={`rounded-full border px-2 py-1 text-[10px] font-bold ${stageClass(statement.stage)}`}>{stageLabel(statement.stage)}</span></div>
      <MoneyValue className="mt-3 w-full text-center text-base">{money(statement.grossCents)}</MoneyValue>
    </button>
    {open && <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 text-slate-700 shadow-lg">
      <div className="flex items-center justify-between gap-3"><span className="text-xs font-bold">الخامات</span><MoneyValue>{money(materialTotal)}</MoneyValue></div>
      {statement.materials.length ? <div className="mt-2 space-y-2">{statement.materials.map(material => <div key={material.id} className="rounded-lg bg-amber-50 p-2"><p className="text-[10px] font-bold text-amber-900">تفاصيل الشهادة</p>{material.items.map((item, index) => <p key={index} className="mt-1 text-[10px] text-slate-600">{item.name} · {item.quantity} {item.unit} × {money(item.unitPriceCents)} = {money(item.totalCents)}</p>)}<div className="mt-2"><AttachmentLinks label="مرفق شهادة الخامات" files={materialFiles.filter(file => file.entityId === material.id)} /></div></div>)}</div> : <p className="mt-2 text-[10px] text-slate-400">لا توجد شهادة خامات.</p>}
      {statement.kind === "FINAL" && memos.length > 0 && <section className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-2">
        <div className="flex items-center justify-between gap-2 text-xs font-bold text-slate-800"><span>مذكرة خفض/رفع</span><Scale className="size-3.5 text-blue-700" /></div>
        <div className="mt-2 grid grid-cols-3 gap-1">
          {adjustmentItems.map(item => <FloatingPanel key={item.label} fullWidth width={210} trigger={<button type="button" className={`w-full rounded-md border px-1 py-1.5 text-center text-[10px] font-bold ${item.tone}`} aria-label={`${item.label}: ${money(item.amount)}`}><span className="block">{item.label}</span><span dir="ltr" className="block">{originalCents > 0 ? (item.amount / originalCents * 100).toFixed(2) : "0.00"}%</span></button>}><div className="p-3 text-xs"><span className="font-bold">{item.label}</span><MoneyValue className="mt-1 block">{money(item.amount)}</MoneyValue></div></FloatingPanel>)}
        </div>
        <p className={`mt-2 text-[10px] font-bold ${netAdjustment >= 0 ? "text-emerald-700" : "text-rose-700"}`}>صافي {netAdjustment >= 0 ? "الزيادة" : "النقصان"}: {money(Math.abs(netAdjustment))}</p>
        <div className="mt-2"><AttachmentLinks label="مرفق المذكرة" files={memoFiles} /></div>
      </section>}
      {statement.paidAt && <div className="mt-3 border-t border-slate-200 pt-3 text-[10px]"><b>{statement.paymentMethod === "CHEQUE" ? "شيك" : "تحويل"}</b> · {statement.paidAt.slice(0, 10)}</div>}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-slate-100 pt-3">
        {canManage && <IconAction label="تغيير المرحلة" icon={RefreshCcw} onClick={onStage} />}
        {canManage && !locked && <IconAction label={`تعديل ${statementLabel(statement)}`} icon={Pencil} onClick={onEdit} />}
        <AttachmentLinks label="مرفق المستخلص" files={statementFiles} />
        <AttachmentLinks label="إثبات الصرف" files={paymentProofFiles} />
      </div>
    </div>}
  </article>;
}

export function IncomingEditor({
  editor: e,
  projects,
  attachments,
  busy,
  isAdmin,
  onCancel,
  onSave,
  onOpen,
  movements,
}: {
  editor: Editor;
  projects: Project[];
  attachments: Attachment[];
  busy: boolean;
  isAdmin: boolean;
  onCancel: () => void;
  onSave: (payload: object, files: File[], estimateFiles?: File[], memoFiles?: File[]) => Promise<void>;
  onOpen?: (editor: Editor) => void;
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
  const [statementKind, setStatementKind] = useState(s?.kind || "CURRENT");
  const [hasFinalAdjustment, setHasFinalAdjustment] = useState(false);
  const [adjustmentIncrease, setAdjustmentIncrease] = useState("");
  const [adjustmentDecrease, setAdjustmentDecrease] = useState("");
  const [adjustmentCancelled, setAdjustmentCancelled] = useState("");
  const [hasMaterials, setHasMaterials] = useState(false);
  const [materialNumber, setMaterialNumber] = useState("");
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
  const [memoFiles, setMemoFiles] = useState<File[]>([]);
  const [estimateValue, setEstimateValue] = useState(c?.estimateCents == null ? "" : String(c.estimateCents / 100));
  const selectedProject =
    projects.find((p) => p.id === projectId) || c?.project;
  const title = (() => {
    switch (e.action) {
      case "contract":
        return e.edit ? "تعديل العقد" : "إضافة عقد وارد";
      case "statement":
        return e.edit && s
          ? `تعديل ${statementLabel(s)}`
          : `إضافة ${statementKind === "FINAL" ? "ختامي" : "جاري"} ${(c?.statements.at(-1)?.sequence ?? 0) + 1}`;
      case "material":
        return e.edit ? "تعديل شهادة الخامات" : "شهادة خامات جديدة";
      case "stage":
        return `تغيير مرحلة ${s ? statementLabel(s) : ""}`;
    }
  })();
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
  const finalValueCents = (beforePaid?.value ?? 0) + (hasFinalAdjustment
    ? Math.round(Number(adjustmentIncrease || 0) * 100) - Math.round(Number(adjustmentDecrease || 0) * 100) - Math.round(Number(adjustmentCancelled || 0) * 100)
    : 0);
  const statementValue = statementKind === "FINAL" ? String(finalValueCents / 100) : value;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const finalAdjustment = e.action === "statement" && statementKind === "FINAL" && hasFinalAdjustment
      ? { increase: adjustmentIncrease, decrease: adjustmentDecrease, cancelled: adjustmentCancelled }
      : undefined;
    const statementMaterials = e.action === "statement" && hasMaterials ? items.filter(item => item.name && item.quantity && item.price).map(item => ({ name: item.name, unit: item.unit, quantity: item.quantity, price: item.price })) : undefined;
    const payload = {
      ...data,
      action: e.action,
      ...(e.action === "statement" ? { value: statementValue } : {}),
      ...(e.edit ? { id: m?.id || s?.id || c?.id } : {}),
      ...(e.action === "stage" ? { id: s?.id, stage } : {}),
      ...(c ? { contractId: c.id } : {}),
      ...(e.action === "material" ? { statementId: s?.id, items } : {}),
      ...(finalAdjustment ? { finalAdjustment } : {}),
      ...(statementMaterials?.length ? { materialNumber, materials: statementMaterials } : {}),
    };
    await onSave(payload, files, estimateFiles, memoFiles);
  }
  const patchItem = (index: number, patch: Partial<Item>) =>
    setItems((rows) =>
      rows.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    );
  return (
    <DocumentLayout movementPosition="bottom" movements={movements.filter(x => x.entityId === (m?.id || s?.id || (e.edit ? c?.id : undefined)))}>
    <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="mb-5 flex items-center gap-3">
        <button disabled={busy} onClick={onCancel} className="erp-back-tab">
          <ArrowRight className="size-4" />
          رجوع
        </button>
        <h2 className="text-lg font-extrabold">{title}</h2>
      </div>
      <form onSubmit={submit} className="space-y-5">
        {((e.action === "statement" && statementKind !== "FINAL") || e.action === "material") && (
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
              الجهة المالكة: {selectedProject?.company.name || "—"}
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
                  value={statementKind}
                  onValueChange={setStatementKind}
                  className={inputClass}
                >
                  <option value="CURRENT">جاري</option>
                  <option value="FINAL">ختامي</option>
                </ERPSelect>
              </label>
              {statementKind === "FINAL" ? <label>
                <Label>إجمالي الختامي — قيمة العقد النهائية (ج.م)</Label>
                <div className="flex h-10 items-center rounded-lg border border-blue-200 bg-blue-50 px-3"><MoneyValue>{money(finalValueCents)}</MoneyValue></div>
                <input type="hidden" name="value" value={statementValue} />
              </label> : <Field
                label="إجمالي المستخلص التراكمي قبل خصم الخامات (ج.م)"
                name="value"
                type="number"
                value={value}
                onChange={setValue}
              />}
            </div>
            {statementKind === "FINAL" && <section className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-extrabold text-slate-900">مذكرة خفض/رفع</h3><p className="mt-1 text-xs text-slate-500">هل يوجد مذكرة خفض/رفع؟</p></div><div className="flex gap-2"><button type="button" onClick={() => setHasFinalAdjustment(true)} className={`rounded-lg border px-3 py-2 text-xs font-bold ${hasFinalAdjustment ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white text-slate-700"}`}>نعم</button><button type="button" onClick={() => setHasFinalAdjustment(false)} className={`rounded-lg border px-3 py-2 text-xs font-bold ${!hasFinalAdjustment ? "border-slate-500 bg-slate-200 text-slate-800" : "border-slate-300 bg-white text-slate-700"}`}>لا</button></div></div>
              {hasFinalAdjustment && <><div className="grid gap-3 md:grid-cols-3"><Field label="بنود رفع (زيادة العقد)" name="adjustmentIncrease" type="number" value={adjustmentIncrease} onChange={setAdjustmentIncrease} required={false} /><Field label="بنود خفض" name="adjustmentDecrease" type="number" value={adjustmentDecrease} onChange={setAdjustmentDecrease} required={false} /><Field label="بنود ملغاة" name="adjustmentCancelled" type="number" value={adjustmentCancelled} onChange={setAdjustmentCancelled} required={false} /></div><UploadBox label="مرفق المذكرة" required onFilesChange={setMemoFiles} hint="PDF / Excel / صورة · حتى 5 ملفات بإجمالي 10 ميجابايت" /></>}
            </section>}
            {statementKind === "FINAL" && <p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs font-semibold text-blue-900">الختامي يقفل قيمة العقد تلقائيًا بعد احتساب مذكرة الخفض/الرفع.</p>}
            <div className="grid gap-3 rounded-lg bg-blue-50 p-4 text-xs md:grid-cols-3">
              <p>
                التراكمي السابق: <b>{money(previous?.grossCents ?? 0)}</b>
              </p>
              <p>
                أعمال الفترة:{" "}
                <b>
                  {money(
                    Math.round(Number(statementValue || 0) * 100) -
                      (previous?.grossCents ?? 0),
                  )}
                </b>
              </p>
              <p>
                آخر إجمالي مصروف: <b>{money(beforePaid?.gross ?? 0)}</b>
              </p>
            </div>
            <section className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-extrabold text-slate-900">هل يوجد على المستخلص خامات؟</h3><p className="mt-1 text-xs text-slate-500">تُخصم تلقائيًا من صافي المستخلص وتظهر في إجماليات العقد.</p></div><div className="flex gap-2"><button type="button" onClick={() => setHasMaterials(true)} className={`rounded-lg border px-3 py-2 text-xs font-bold ${hasMaterials ? "border-amber-600 bg-amber-600 text-white" : "border-slate-300 bg-white text-slate-700"}`}>نعم</button><button type="button" onClick={() => setHasMaterials(false)} className={`rounded-lg border px-3 py-2 text-xs font-bold ${!hasMaterials ? "border-slate-500 bg-slate-200 text-slate-800" : "border-slate-300 bg-white text-slate-700"}`}>لا</button></div></div>
              {hasMaterials && <div className="space-y-3 rounded-lg border border-amber-200 bg-white p-3"><Field label="رقم شهادة الخامات" name="materialNumber" value={materialNumber} onChange={setMaterialNumber} /><div className="grid gap-2"><div className="grid grid-cols-[1.5fr_.7fr_.8fr_.8fr] gap-2 text-[10px] font-bold text-slate-500"><span>البند</span><span>الوحدة</span><span>الكمية</span><span>السعر</span></div>{items.map((item, index) => <div key={index} className="grid grid-cols-[1.5fr_.7fr_.8fr_.8fr] gap-2"><input value={item.name} onChange={ev => patchItem(index, { name: ev.target.value })} placeholder="اسم البند" /><input value={item.unit} onChange={ev => patchItem(index, { unit: ev.target.value })} placeholder="طن" /><input value={item.quantity} onChange={ev => patchItem(index, { quantity: ev.target.value })} type="number" min="0" step="any" /><input value={item.price} onChange={ev => patchItem(index, { price: ev.target.value })} type="number" min="0" step="any" /></div>)}</div><button type="button" className={secondary} onClick={() => setItems(rows => [...rows, { name: "", unit: "طن", quantity: "", price: "" }])}><Plus className="size-3" />إضافة بند خامات</button><UploadBox label="مرفق شهادة الخامات" required name="materialFiles" hint="PDF / Excel / صورة · حتى 5 ملفات" onFilesChange={setFiles} /></div>}
            </section>
            {e.edit && s && onOpen && <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-extrabold text-slate-900">شهادات الخامات</h3><p className="mt-1 text-xs text-slate-500">تظهر هنا الشهادات المرتبطة بهذا المستخلص.</p></div></div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">{s.materials.length ? s.materials.map(material => <div key={material.id} className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-white p-3"><div><p className="text-xs font-bold text-slate-800">شهادة خامات</p><MoneyValue className="mt-1">{money(material.totalCents)}</MoneyValue></div><IconAction label="تعديل شهادة الخامات" icon={Pencil} onClick={() => onOpen({ action: "material", contract: c, statement: s, material, edit: true })} /></div>) : <p className="text-xs text-slate-500">لم تُضف شهادة خامات لهذا المستخلص.</p>}</div>
            </section>}
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
        {e.action !== "stage" && (
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
        {!(e.action === "statement" && hasMaterials) && <UploadBox
          label={e.action === "stage" && stage === "PAID" ? "إثبات الصرف" : e.action === "contract" ? "مرفق العقد" : e.action === "statement" ? "مرفق المستخلص" : e.action === "material" ? "مرفق شهادة الخامات" : "مرفق المذكرة"}
          hint={e.action === "statement" ? "A3 · PDF / Excel / صورة · حتى 5 ملفات بإجمالي 10 ميجابايت" : undefined}
          required={needsFile}
          onFilesChange={setFiles}
        />}
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
function FloatingPanel({ trigger, children, width = 280, clickOnly = false, fullWidth = false }: { trigger: ReactNode; children: ReactNode; width?: number; clickOnly?: boolean; fullWidth?: boolean }) {
  const anchor = useRef<HTMLSpanElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const clearClose = () => { if (closeTimer.current) clearTimeout(closeTimer.current); };
  const scheduleClose = () => { clearClose(); closeTimer.current = setTimeout(() => setOpen(false), 120); };
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const rect = anchor.current?.getBoundingClientRect();
      if (!rect) return;
      const panelWidth = Math.min(width, window.innerWidth - 16);
      const panelHeight = panel.current?.offsetHeight ?? 0;
      const left = Math.max(8, Math.min(rect.left + rect.width / 2 - panelWidth / 2, window.innerWidth - panelWidth - 8));
      const below = rect.bottom + 6;
      const top = below + panelHeight > window.innerHeight - 8 && rect.top > panelHeight + 6
        ? rect.top - panelHeight - 6
        : Math.max(8, Math.min(below, window.innerHeight - panelHeight - 8));
      setPosition(previous => previous.left === left && previous.top === top ? previous : { left, top });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => { window.removeEventListener("scroll", update, true); window.removeEventListener("resize", update); };
  }, [open, width]);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!anchor.current?.contains(target) && !panel.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);
  useEffect(() => () => clearClose(), []);
  return <span ref={anchor} className={fullWidth ? "inline-flex w-full align-middle" : "inline-flex align-middle"} onMouseEnter={() => { if (!clickOnly) { clearClose(); setOpen(true); } }} onMouseLeave={() => { if (!clickOnly) scheduleClose(); }} onFocus={() => { if (!clickOnly) setOpen(true); }} onBlur={(event) => { if (!clickOnly && !event.currentTarget.contains(event.relatedTarget)) scheduleClose(); }} onClick={() => { if (clickOnly) setOpen(value => !value); }}>
    {trigger}
    {open && createPortal(<div ref={panel} className="fixed z-[100] max-h-[calc(100vh-16px)] overflow-y-auto rounded-xl border border-slate-200 bg-white text-right shadow-xl" style={{ width: `min(${width}px, calc(100vw - 16px))`, left: position.left, top: position.top }} onMouseEnter={clearClose} onMouseLeave={() => { if (!clickOnly) scheduleClose(); }} dir="rtl">{children}</div>, document.body)}
  </span>;
}

function Files({ files, compact = false }: { files: Attachment[]; compact?: boolean }) {
  if (!files.length) return compact ? <span className="inline-grid size-[34px] place-items-center text-slate-300" aria-label="لا توجد مرفقات"><Paperclip className="size-4" /></span> : null;
  if (compact) return <FloatingPanel clickOnly trigger={<button type="button" className="erp-icon-action relative" aria-label={`عرض ${files.length} مرفق`} title={`عرض ${files.length} مرفق`}><Paperclip className="size-4" />{files.length > 1 && <span className="absolute -left-1 -top-1 grid size-4 place-items-center rounded-full bg-blue-700 text-[9px] font-bold text-white">{files.length}</span>}</button>}><div className="p-2">{files.map(file => <a key={file.id} className="block rounded-md px-2 py-2 text-xs text-blue-700 hover:bg-blue-50" href={`/api/incoming/attachments/${file.id}`}>{file.name}</a>)}</div></FloatingPanel>;
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

function AttachmentLinks({ label, files }: { label: string; files: Attachment[] }) {
  if (!files.length) return null;
  return <span className="inline-flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
    {files.map((file) => <a key={file.id} className="text-blue-700 underline decoration-blue-200 underline-offset-2 hover:text-blue-900" href={`/api/incoming/attachments/${file.id}`} title={file.name}>{label}</a>)}
  </span>;
}
