"use client";

import Image from "next/image";
import { companyBrand } from "@/lib/company-brand";

export function CompanyFooter() {
  return <footer className="mt-8 flex flex-wrap items-center justify-between gap-5 border-t border-slate-200 px-2 py-6 text-xs text-slate-500">
    <div className="flex items-center gap-3"><Image src={companyBrand.logoPath} alt={companyBrand.arabicName} width={48} height={48} className="rounded-lg bg-white p-1" /><div><p className="font-bold text-slate-700">{companyBrand.arabicName}</p><p className="mt-1">{companyBrand.systemName} · © {new Date().getFullYear()}</p></div></div>
    <address className="space-y-2 text-left not-italic" dir="ltr"><p>{companyBrand.address}</p><p className="flex flex-wrap gap-4"><a href="tel:+20222903711" className="hover:text-blue-700">{companyBrand.phone}</a><a href="http://www.alsalamagroupeg.com" target="_blank" rel="noopener noreferrer" className="hover:text-blue-700">{companyBrand.website}</a></p></address>
  </footer>;
}
