"use client";

import { useState } from "react";
import { FileDown, LoaderCircle } from "lucide-react";
import { createPdfReportUrl, type PdfKpi, type PdfTable } from "@/components/pdf-report-document";

const excluded = /^(الإجراءات|مرفق|المرفقات|الملف|ملف)$/;
const cellText = (cell: HTMLTableCellElement) => (cell.innerText || cell.textContent || "").replace(/\s+/g, " ").trim();

type TotalMode = "sum" | "last";
type ReportDefinition = { path: string; title: string; columns: string[]; countLabel: string; totalColumns?: Record<string, TotalMode>; kpiLabels?: string[] };

const reportDefinitions: ReportDefinition[] = [
  { path: "/incoming", title: "تقرير العقود والوارد", columns: ["اسم العقد", "رقم العقد", "المشروع", "الجهة المالكة", "قيمة العقد", "موقف المستخلصات", "إجمالي الوارد", "الخامات", "المتبقي"], countLabel: "عدد العقود", totalColumns: { "قيمة العقد": "sum", "إجمالي الوارد": "sum", "الخامات": "sum", "المتبقي": "sum" }, kpiLabels: ["القيمة التعاقدية", "الخامات", "الوارد", "المتبقي من القيمة التعاقدية"] },
  { path: "/expenses", title: "تقرير أعمال ومستخلصات مقاولي الباطن", columns: ["المقاولة / النطاق", "المقاول", "المشروع", "تكلفة الأعمال", "صافي المستحق", "المدفوع", "المتبقي / المديونية / المقدم", "الجوارى"], countLabel: "عدد المقاولات", totalColumns: { "تكلفة الأعمال": "sum", "صافي المستحق": "sum", "المدفوع": "sum", "المتبقي / المديونية / المقدم": "sum" }, kpiLabels: ["تكلفة الأعمال المعتمدة", "صافي مستحق المقاولين", "المدفوع فعليًا", "المتبقي للمقاولين"] },
  { path: "/purchases", title: "تقرير مشتريات المشروعات", columns: ["اسم الفاتورة", "المشروع", "المورد", "التاريخ", "عدد البنود", "الإجمالي"], countLabel: "عدد الفواتير", totalColumns: { "الإجمالي": "sum" }, kpiLabels: ["قيمة فواتير المشتريات", "عدد الفواتير", "أعلى تكلفة مشتريات"] },
  { path: "/petty-cash", title: "دفتر النثريات والصندوق", columns: ["التاريخ", "رقم المستند", "البيان", "المشروع / العام", "التصنيف", "وارد", "منصرف", "الرصيد بعد الحركة"], countLabel: "عدد الحركات", totalColumns: { "وارد": "sum", "منصرف": "sum", "الرصيد بعد الحركة": "last" }, kpiLabels: ["رصيد الحساب المختار", "وارد الشهر", "منصرف الشهر", "العهد القائمة"] },
  { path: "/bank", title: "دفتر البنك والسيولة", columns: ["التاريخ", "النوع", "البيان", "المشروع / العام", "وارد", "منصرف"], countLabel: "عدد الحركات", totalColumns: { "وارد": "sum", "منصرف": "sum" }, kpiLabels: ["رصيد البنك الحالي", "إجمالي الوارد", "إجمالي المنصرف"] },
  { path: "/project-cost-control", title: "تقرير موقف تكلفة المشروع", columns: ["مصدر التكلفة", "القيمة", "النسبة من إجمالي التكلفة"], countLabel: "عدد مصادر التكلفة", totalColumns: { "القيمة": "sum" }, kpiLabels: ["قيمة العقود", "الإيراد المعتمد", "المحصل فعليًا", "متبقي التحصيل", "إجمالي التكلفة"] },
  { path: "/accounting", title: "تقرير المحاسبة والقيود", columns: ["التاريخ", "الحساب", "البيان", "المصدر", "المشروع", "مدين", "دائن", "الكود", "النوع"], countLabel: "عدد القيود", totalColumns: { "مدين": "sum", "دائن": "sum" }, kpiLabels: ["حسابات الدليل", "قيود مرحّلة", "إجمالي المدين", "إجمالي الدائن"] },
  { path: "/salaries", title: "تقرير المرتبات وتكلفة الموظفين", columns: ["الموظف", "التسكين", "الراتب الشهري", "المشروع", "السلف", "المكافآت", "الخصومات", "الحالة", "الشهر", "إجمالي الكشف", "مصدر الصرف"], countLabel: "عدد السجلات", totalColumns: { "الراتب الشهري": "sum", "السلف": "sum", "المكافآت": "sum", "الخصومات": "sum", "إجمالي الكشف": "sum" }, kpiLabels: ["الكشوف المعتمدة", "الكشوف المصروفة", "إجمالي آخر كشف"] },
];

function definitionForPath(pathname: string) { return reportDefinitions.find((definition) => pathname === definition.path || pathname.startsWith(`${definition.path}/`)); }

function numericValue(text: string) {
  const western = text.replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit))).replace(/[٬،]/g, ",");
  const match = western.replace(/[^0-9,.-]/g, "").match(/-?[\d,]+(?:\.\d+)?/);
  return match ? Number(match[0].replace(/,/g, "")) : Number.NaN;
}
function money(value: number) { return `${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`; }
function footerFromDom(table: HTMLTableElement, included: { label: string; index: number }[]) {
  const values: Record<number, string> = {};
  let position = 0;
  const cells = Array.from(table.querySelectorAll("tfoot tr:last-child > td")) as HTMLTableCellElement[];
  for (const cell of cells) { values[position] = cellText(cell); position += cell.colSpan || 1; }
  return cells.length ? included.map(({ index }) => values[index] || "") : undefined;
}
function calculatedFooter(rows: string[][], columns: string[], definition?: ReportDefinition) {
  if (!definition || !rows.length) return undefined;
  const footer = columns.map(() => "");
  footer[0] = `إجمالي — ${definition.countLabel}: ${rows.length.toLocaleString("en-US")}`;
  Object.entries(definition.totalColumns || {}).forEach(([label, mode]) => {
    const index = columns.indexOf(label);
    if (index < 0) return;
    const values = rows.map((row) => numericValue(row[index] || "")).filter((value) => Number.isFinite(value));
    if (!values.length) return;
    footer[index] = money(mode === "last" ? values.at(-1)! : values.reduce((sum, value) => sum + value, 0));
  });
  return footer.some(Boolean) ? footer : undefined;
}
function tableForPdf(table: HTMLTableElement, preferredColumns?: string[], definition?: ReportDefinition): PdfTable | null {
  const headerCells = Array.from(table.querySelectorAll("thead tr:last-child th")) as HTMLTableCellElement[];
  if (!headerCells.length) return null;
  const available = headerCells.map((cell, index) => ({ label: cellText(cell), index })).filter(({ label, index }) => {
    if (!label || excluded.test(label)) return false;
    const firstBodyCell = table.querySelector(`tbody tr td:nth-child(${index + 1})`) as HTMLTableCellElement | null;
    return !(firstBodyCell?.querySelector("button, a") && !cellText(firstBodyCell));
  });
  const included = preferredColumns ? preferredColumns.flatMap((label) => available.filter((column) => column.label === label)) : available;
  if (!included.length) return null;
  const rows = Array.from(table.querySelectorAll("tbody tr")).map((row) => {
    const cells = Array.from(row.querySelectorAll(":scope > td")) as HTMLTableCellElement[];
    return included.map(({ index }) => cellText(cells[index] ?? document.createElement("td")));
  }).filter((row) => row.some(Boolean));
  const sourceFooter = footerFromDom(table, included);
  const calculated = calculatedFooter(rows, included.map((column) => column.label), definition);
  const footer = calculated || sourceFooter;
  return { columns: included.map(({ label }, index) => ({ label, width: Math.max(1, Math.min(4, Math.ceil(Math.max(label.length, ...rows.map((row) => row[index]?.length ?? 0)) / 7))) })), rows, footer };
}

function pageKpis(definition: ReportDefinition | undefined, tables: PdfTable[]): PdfKpi[] {
  const visible = Array.from(document.querySelectorAll("main .erp-kpi-card")).map((card) => ({ label: card.querySelector(".erp-kpi-label")?.textContent?.trim() || "", value: card.querySelector(".erp-kpi-value")?.textContent?.trim() || "" })).filter((kpi) => kpi.label && kpi.value);
  const desired = (definition?.kpiLabels || []).flatMap((label) => visible.filter((kpi) => kpi.label === label));
  const rowCount = tables.reduce((total, table) => total + table.rows.length, 0);
  return [{ label: definition?.countLabel || "عدد السجلات", value: rowCount.toLocaleString("en-US"), tone: "blue" as const }, ...desired.map((kpi, index): PdfKpi => ({ ...kpi, tone: (["violet", "emerald", "amber", "rose"] as const)[index % 4] }))].slice(0, 5);
}

export function PdfExportButton() {
  const [working, setWorking] = useState(false);
  async function exportReport() {
    const definition = definitionForPath(window.location.pathname);
    const printable = Array.from(document.querySelectorAll("main table.erp-data-table")) as HTMLTableElement[];
    const tables = printable.filter((table) => !table.closest("td.erp-table-details")).map((table) => tableForPdf(table, definition?.columns, definition)).filter((table): table is PdfTable => Boolean(table));
    if (!tables.length) return window.alert("لا توجد بيانات جدولية قابلة للتصدير في هذه الصفحة.");
    const title = definition?.title || document.querySelector("main h1")?.textContent?.trim() || "تقرير";
    const filters = Array.from(document.querySelectorAll("main select, main input")).map((field) => (field as HTMLInputElement).value).filter(Boolean).join(" · ");
    const preview = window.open("", "_blank");
    if (!preview) return window.alert("اسمح بالنوافذ المنبثقة لفتح معاينة PDF.");
    preview.opener = null;
    preview.document.write("<title>ASGC ERP · جاري تجهيز التقرير</title><body style='font-family:Arial,sans-serif;padding:32px;color:#10192d'>جاري تجهيز تقرير PDF…</body>");
    preview.document.close();
    setWorking(true);
    try {
      const userName = document.querySelector("[data-export-user] p:first-child")?.textContent?.trim();
      const url = await createPdfReportUrl({ title, filters, tables, kpis: pageKpis(definition, tables), userName });
      preview.location.href = url;
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      console.error(error);
      preview.close();
      window.alert("تعذّر تجهيز ملف PDF. حاول مرة أخرى.");
    } finally { setWorking(false); }
  }
  return <button type="button" onClick={exportReport} disabled={working} className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 text-xs font-bold text-white transition hover:bg-white/20 disabled:cursor-wait disabled:opacity-60" title="إنشاء تقرير PDF من بيانات الجدول">{working ? <LoaderCircle className="size-4 animate-spin" /> : <FileDown className="size-4" />}{working ? "جاري تجهيز التقرير" : "تصدير PDF"}</button>;
}
