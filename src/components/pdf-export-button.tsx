"use client";

import { FileDown } from "lucide-react";
import { companyBrand } from "@/lib/company-brand";

const escape = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] || char));

export function PdfExportButton() {
  function printReport() {
    const tables = [...document.querySelectorAll("main table")].map((table) => table.outerHTML).join("");
    if (!tables) return window.alert("لا توجد بيانات جدولية لتصديرها في هذه الصفحة.");
    const title = document.querySelector("main h1")?.textContent?.trim() || "تقرير";
    const filters = [...document.querySelectorAll("main select, main input")].map((field) => (field as HTMLInputElement).value).filter(Boolean).join(" · ");
    const page = window.open("", "_blank");
    if (!page) return window.alert("اسمح بالنوافذ المنبثقة لتجهيز ملف PDF.");
    page.opener = null;
    const origin = window.location.origin;
    page.document.write(`<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>${escape(title)} - ${companyBrand.shortName}</title><style>@page{size:A4 landscape;margin:18mm 11mm 20mm}*{box-sizing:border-box}body{font-family:Arial,'Cairo',sans-serif;color:#10213f;font-size:11px;margin:0}.head{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #168dcc;padding-bottom:10px;margin-bottom:14px}.brand{display:flex;gap:10px;align-items:center}.brand img{width:68px;height:auto}.brand b{font-size:16px}.brand span,.meta{color:#56708f;font-size:10px}.report-title{text-align:left}.report-title h1{font-size:17px;margin:0 0 5px}.filters{margin:6px 0 12px;color:#56708f}.erp-table-shell{margin:0 0 16px}.erp-table-scroll{overflow:visible}table{width:100%;border-collapse:collapse;page-break-inside:auto}tr{page-break-inside:avoid;page-break-after:auto}th{background:#10213f;color:#fff;font-weight:bold;padding:8px 6px;text-align:right}td{border:1px solid #d9e1ea;padding:7px 6px;vertical-align:top}tbody tr:nth-child(even){background:#f7fafc}.erp-money-value{font-weight:bold;color:#075bb7;white-space:nowrap}.footer{position:fixed;bottom:-13mm;left:0;right:0;display:flex;align-items:center;justify-content:space-between;border-top:1px solid #cbd8e6;padding-top:5px;color:#56708f;font-size:9px}.footer img{width:28px;height:28px}.footer .contacts{display:flex;gap:9px;align-items:center}@media print{button{display:none}}</style></head><body><header class="head"><div class="brand"><img src="${origin}${companyBrand.logoPath}" alt="ASGC"><div><b>${escape(companyBrand.arabicName)}</b><br><span>${escape(companyBrand.englishName)} · ${companyBrand.shortName}</span></div></div><div class="report-title"><h1>${escape(title)}</h1><div class="meta">تاريخ التصدير: ${new Date().toLocaleDateString("en-GB")}</div></div></header>${filters ? `<p class="filters">الفلاتر: ${escape(filters)}</p>` : ""}${tables}<footer class="footer"><div class="contacts"><span>${escape(companyBrand.address)}</span><span>${escape(companyBrand.phone)}</span><span>${escape(companyBrand.website)}</span></div><img src="${origin}/brand/asgc-qr.png" alt="QR"></footer><script>window.onload=()=>window.print()</script></body></html>`);
    page.document.close();
  }
  return <button type="button" onClick={printReport} className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 text-xs font-bold text-white transition hover:bg-white/20" title="تجهيز تقرير PDF من الجداول الظاهرة"><FileDown className="size-4" />تصدير PDF</button>;
}
