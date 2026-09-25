"use client";

import { FileDown } from "lucide-react";
import { requestPdfDataExport } from "@/components/pdf-data-export";

export function PdfExportButton() {
  function exportReport() {
    if (requestPdfDataExport()) return;
    if (window.location.pathname === "/incoming") {
      window.dispatchEvent(new Event("incoming-pdf-request"));
      return;
    }
    window.alert("تصدير PDF غير متاح في هذه الصفحة. افتح صفحة التقرير الرئيسية ثم حاول مجددًا.");
  }

  return <button type="button" onClick={exportReport} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700" title="تصدير تقرير PDF من بيانات الصفحة"><FileDown className="size-4" />تصدير PDF</button>;
}
