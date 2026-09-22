"use client";

import { useEffect } from "react";
import { createPdfReportUrl, type PdfKpi, type PdfTable } from "@/components/pdf-report-document";

export type DataPdfReport = { title: string; filters?: string; tables: PdfTable[]; kpis?: PdfKpi[] };
let active: { path: string; callback: () => void } | null = null;

export function usePdfDataExport(callback: () => void) {
  useEffect(() => {
    const entry = { path: window.location.pathname, callback };
    active = entry;
    return () => { if (active === entry) active = null; };
  });
}

export function requestPdfDataExport() {
  if (active?.path !== window.location.pathname) return false;
  active.callback();
  return true;
}

export async function previewDataPdf(report: DataPdfReport) {
  const preview = window.open("", "_blank");
  if (!preview) { window.alert("اسمح بالنوافذ المنبثقة لفتح معاينة PDF."); return; }
  preview.opener = null;
  preview.document.write("<title>ASGC ERP · جاري تجهيز التقرير</title><body style='font-family:Arial,sans-serif;padding:32px;color:#10192d'>جاري تجهيز تقرير PDF…</body>");
  preview.document.close();
  try {
    const userName = document.querySelector("[data-export-user] p:first-child")?.textContent?.trim();
    const url = await createPdfReportUrl({ ...report, userName });
    preview.location.href = url;
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (error) {
    console.error(error);
    preview.close();
    window.alert("تعذّر تجهيز ملف PDF. حاول مرة أخرى.");
  }
}

export const pdfColumns = (...entries: [string, number][]) => entries.map(([label, width]) => ({ label, width }));
export const pdfMoney = (cents: number) => `${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;
