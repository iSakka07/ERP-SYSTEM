"use client";

import { useState } from "react";
import { FileDown, LoaderCircle } from "lucide-react";
import { createPdfReportUrl, type PdfTable } from "@/components/pdf-report-document";

const excluded = /^(الإجراءات|مرفق|المرفقات|الملف|ملف)$/;
const cellText = (cell: HTMLTableCellElement) => (cell.innerText || cell.textContent || "").replace(/\s+/g, " ").trim();

function tableForPdf(table: HTMLTableElement): PdfTable | null {
  const headerCells = Array.from(table.querySelectorAll("thead tr:last-child th")) as HTMLTableCellElement[];
  if (!headerCells.length) return null;
  const included = headerCells.map((cell, index) => ({ label: cellText(cell), index })).filter(({ label, index }) => {
    if (!label || excluded.test(label)) return false;
    const firstBodyCell = table.querySelector(`tbody tr td:nth-child(${index + 1})`) as HTMLTableCellElement | null;
    return !(firstBodyCell?.querySelector("button, a") && !cellText(firstBodyCell));
  });
  if (!included.length) return null;
  const rows = Array.from(table.querySelectorAll("tbody tr")).map((row) => {
    const cells = Array.from(row.querySelectorAll(":scope > td")) as HTMLTableCellElement[];
    return included.map(({ index }) => cellText(cells[index] ?? document.createElement("td")));
  }).filter((row) => row.some(Boolean));
  const footerCells = Array.from(table.querySelectorAll("tfoot tr:last-child td")) as HTMLTableCellElement[];
  return { columns: included.map(({ label }) => ({ label, width: Math.max(1, Math.min(4, Math.ceil(label.length / 6))) })), rows, footer: footerCells.length ? included.map(({ index }) => cellText(footerCells[index] ?? document.createElement("td"))) : undefined };
}

export function PdfExportButton() {
  const [working, setWorking] = useState(false);
  async function exportReport() {
    const tables = (Array.from(document.querySelectorAll("main table")) as HTMLTableElement[]).map(tableForPdf).filter((table): table is PdfTable => Boolean(table));
    if (!tables.length) return window.alert("لا توجد بيانات جدولية قابلة للتصدير في هذه الصفحة.");
    const title = document.querySelector("main h1")?.textContent?.trim() || "تقرير";
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
