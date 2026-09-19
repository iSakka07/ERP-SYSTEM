"use client";

import { useState } from "react";
import { FileDown, LoaderCircle } from "lucide-react";
import { createPdfReportUrl, type PdfTable } from "@/components/pdf-report-document";

const excluded = /^(الإجراءات|مرفق|المرفقات|الملف|ملف)$/;
const cellText = (cell: HTMLTableCellElement) => (cell.innerText || cell.textContent || "").replace(/\s+/g, " ").trim();

const reportDefinitions: { path: string; title: string; columns: string[] }[] = [
  { path: "/incoming", title: "تقرير العقود والوارد", columns: ["اسم العقد", "رقم العقد", "المشروع", "الجهة المالكة", "قيمة العقد", "موقف المستخلصات", "إجمالي الوارد", "الخامات", "المتبقي"] },
  { path: "/expenses", title: "تقرير أعمال ومستخلصات مقاولي الباطن", columns: ["المقاولة / النطاق", "المقاول", "المشروع", "تكلفة الأعمال", "صافي المستحق", "المدفوع", "المتبقي / المديونية / المقدم", "الجوارى"] },
  { path: "/purchases", title: "تقرير مشتريات المشروعات", columns: ["اسم الفاتورة", "المشروع", "المورد", "التاريخ", "عدد البنود", "الإجمالي"] },
  { path: "/petty-cash", title: "دفتر النثريات والصندوق", columns: ["التاريخ", "رقم المستند", "البيان", "المشروع / العام", "التصنيف", "وارد", "منصرف", "الرصيد بعد الحركة"] },
  { path: "/bank", title: "دفتر البنك والسيولة", columns: ["التاريخ", "النوع", "البيان", "المشروع / العام", "وارد", "منصرف"] },
  { path: "/project-cost-control", title: "تقرير موقف تكلفة المشروع", columns: ["مصدر التكلفة", "القيمة", "النسبة من إجمالي التكلفة"] },
  { path: "/accounting", title: "تقرير المحاسبة والقيود", columns: ["التاريخ", "الحساب", "البيان", "المصدر", "المشروع", "مدين", "دائن", "الكود", "النوع"] },
  { path: "/salaries", title: "تقرير المرتبات وتكلفة الموظفين", columns: ["الموظف", "التسكين", "الراتب الشهري", "المشروع", "السلف", "المكافآت", "الخصومات", "الحالة", "الشهر", "إجمالي الكشف", "مصدر الصرف"] },
];

function definitionForPath(pathname: string) { return reportDefinitions.find((definition) => pathname === definition.path || pathname.startsWith(`${definition.path}/`)); }

function tableForPdf(table: HTMLTableElement, preferredColumns?: string[]): PdfTable | null {
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
  const footerCells = Array.from(table.querySelectorAll("tfoot tr:last-child td")) as HTMLTableCellElement[];
  return { columns: included.map(({ label }, index) => ({ label, width: Math.max(1, Math.min(4, Math.ceil(Math.max(label.length, ...rows.map((row) => row[index]?.length ?? 0)) / 7))) })), rows, footer: footerCells.length ? included.map(({ index }) => cellText(footerCells[index] ?? document.createElement("td"))) : undefined };
}

export function PdfExportButton() {
  const [working, setWorking] = useState(false);
  async function exportReport() {
    const definition = definitionForPath(window.location.pathname);
    const printable = Array.from(document.querySelectorAll("main table.erp-data-table")) as HTMLTableElement[];
    const tables = printable.filter((table) => !table.closest("td.erp-table-details")).map((table) => tableForPdf(table, definition?.columns)).filter((table): table is PdfTable => Boolean(table));
    if (!tables.length) return window.alert("لا توجد بيانات جدولية قابلة للتصدير في هذه الصفحة.");
    const title = definition?.title || document.querySelector("main h1")?.textContent?.trim() || "تقرير";
    const filters = Array.from(document.querySelectorAll("main select, main input")).map((field) => (field as HTMLInputElement).value).filter(Boolean).join(" · ");
    setWorking(true);
    try {
      const url = await createPdfReportUrl({ title, filters, tables });
      const preview = window.open(url, "_blank", "noopener,noreferrer");
      if (!preview) window.alert("اسمح بالنوافذ المنبثقة لفتح معاينة PDF.");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      console.error(error);
      window.alert("تعذّر تجهيز ملف PDF. حاول مرة أخرى.");
    } finally { setWorking(false); }
  }
  return <button type="button" onClick={exportReport} disabled={working} className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 text-xs font-bold text-white transition hover:bg-white/20 disabled:cursor-wait disabled:opacity-60" title="إنشاء تقرير PDF من بيانات الجدول">{working ? <LoaderCircle className="size-4 animate-spin" /> : <FileDown className="size-4" />}{working ? "جاري تجهيز التقرير" : "تصدير PDF"}</button>;
}
