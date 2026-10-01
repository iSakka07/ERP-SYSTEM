"use client";
/* eslint-disable jsx-a11y/alt-text -- react-pdf Image does not expose alt text. */

import { Document, Font, Image, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import { PDFDocument } from "pdf-lib";
import { companyBrand } from "@/lib/company-brand";
import type { ExpenseAccount, ExpenseAttachmentInfo, ExpenseStatement } from "@/lib/expense-types";

type PaymentRecord = { statement: ExpenseStatement; payment: ExpenseStatement["payments"][number]; carriedFromPrevious: number; dueBeforePayment: number; dueAfterPayment: number; proofFiles: ExpenseAttachmentInfo[] };
let fontRegistered = false;
const money = (cents: number) => `${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;
const clean = (value: unknown) => String(value ?? "—").replace(/\s+/g, " ").trim() || "—";
const styles = StyleSheet.create({
  page: { fontFamily: "ASGCCairo", padding: 34, color: "#172033", fontSize: 9, direction: "rtl" },
  header: { flexDirection: "row-reverse", alignItems: "center", borderBottomWidth: 2, borderBottomColor: "#1d5fa7", paddingBottom: 12 },
  logo: { width: 44, height: 44, objectFit: "contain" },
  company: { flex: 1, marginRight: 10, fontSize: 14, fontWeight: 700, textAlign: "right" },
  title: { fontSize: 13, color: "#1d5fa7", fontWeight: 700, textAlign: "left" },
  intro: { marginTop: 15, padding: 10, backgroundColor: "#f5f8fc", borderRadius: 5, textAlign: "right", lineHeight: 1.6 },
  grid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8, marginTop: 14 },
  card: { width: "48%", borderWidth: .7, borderColor: "#d6dee8", borderRadius: 4, padding: 8 },
  label: { color: "#667085", fontSize: 7.5, marginBottom: 2 },
  value: { fontWeight: 700, fontSize: 10 },
  summary: { marginTop: 16, borderWidth: .8, borderColor: "#b9c9dd", borderRadius: 5, overflow: "hidden" },
  summaryHead: { backgroundColor: "#1d5fa7", color: "#fff", fontWeight: 700, padding: 7, textAlign: "right" },
  row: { flexDirection: "row-reverse", justifyContent: "space-between", paddingHorizontal: 9, paddingVertical: 7, borderBottomWidth: .5, borderBottomColor: "#e2e8f0" },
  emphasis: { backgroundColor: "#eef6ff", color: "#124b83", fontWeight: 700 },
  note: { marginTop: 14, color: "#667085", textAlign: "right", lineHeight: 1.6 },
  table: { marginTop: 14, borderWidth: .6, borderColor: "#cbd5e1" },
  tableHead: { flexDirection: "row-reverse", backgroundColor: "#eef4fa" },
  tableRow: { flexDirection: "row-reverse", borderTopWidth: .5, borderTopColor: "#d8e0ea" },
  cell: { padding: 5, fontSize: 7.2, textAlign: "center" },
  deductions: { marginTop: 10, borderWidth: .7, borderColor: "#f0c98a", borderRadius: 5, padding: 8, backgroundColor: "#fffaf0" },
  deductionsTitle: { fontWeight: 700, color: "#8a4b08", textAlign: "right", marginBottom: 4 },
  deductionItem: { color: "#5e4a32", textAlign: "right", fontSize: 8, lineHeight: 1.6 },
});

function VoucherPage({ account, record, includeDeductions }: { account: ExpenseAccount; record: PaymentRecord; includeDeductions: boolean }) {
  const { statement, payment, carriedFromPrevious, dueBeforePayment, dueAfterPayment, proofFiles } = record;
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const deduction = includeDeductions ? statement.deductionCents : 0;
  return <Page size="A4" orientation="portrait" style={styles.page}>
    <View style={styles.header}><Image src={`${origin}${companyBrand.logoPath}`} style={styles.logo}/><Text style={styles.company}>{companyBrand.arabicName}</Text><Text style={styles.title}>سجل دفعة للمقاولة</Text></View>
    <Text style={styles.intro}>المقاول: {clean(account.company.name)} · المقاولة: {clean(account.name)} · المشروع: {clean(account.project.name)}</Text>
    <View style={styles.grid}>
      <View style={styles.card}><Text style={styles.label}>تاريخ الصرف</Text><Text style={styles.value}>{payment.paymentDate.slice(0, 10)}</Text></View>
      <View style={styles.card}><Text style={styles.label}>وسيلة الصرف</Text><Text style={styles.value}>{payment.method === "CHEQUE" ? "شيك" : payment.method === "TRANSFER" ? "تحويل" : clean(payment.method)}</Text></View>
      <View style={styles.card}><Text style={styles.label}>مرجع الصرف</Text><Text style={styles.value}>{clean(payment.reference)}</Text></View>
    </View>
    <View style={styles.summary}><Text style={styles.summaryHead}>ملخص المستحق والصرف</Text>
      <View style={styles.row}><Text>إجمالي المستحق وقت الصرف</Text><Text>{money(statement.netCents)}</Text></View>
      {includeDeductions && <View style={styles.row}><Text>إجمالي الخصومات والاستقطاعات وقت الصرف</Text><Text>{money(deduction)}</Text></View>}
      <View style={styles.row}><Text>رصيد سابق مُرحّل</Text><Text>{money(carriedFromPrevious)}</Text></View>
      <View style={styles.row}><Text>المتبقي قبل هذه الدفعة</Text><Text>{money(dueBeforePayment)}</Text></View>
      <View style={[styles.row, styles.emphasis]}><Text>قيمة الدفعة المسجلة</Text><Text>{money(payment.amountCents)}</Text></View>
      <View style={[styles.row, styles.emphasis]}><Text>المتبقي على المقاولة بعد الدفعة</Text><Text>{money(dueAfterPayment)}</Text></View>
    </View>
    {includeDeductions && statement.deductions.length > 0 && <View style={styles.deductions}><Text style={styles.deductionsTitle}>تفاصيل الخصومات والاستقطاعات وقت تسجيل الدفعة</Text>{statement.deductions.map((item, index) => <Text key={`${item.name}-${index}`} style={styles.deductionItem}>• {clean(item.name)}: {money(item.amountCents)}</Text>)}</View>}
    <Text style={styles.note}>إثباتات الصرف المرفقة بهذه الدفعة: {proofFiles.length ? proofFiles.map((file) => clean(file.label)).join("، ") : "لا يوجد مرفق"}.</Text>
  </Page>;
}

function LedgerOverviewPage({ account, records, includeDeductions }: { account: ExpenseAccount; records: PaymentRecord[]; includeDeductions: boolean }) {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const widths = ["10%", "13%", "15%", "16%", "16%", "15%", "15%"];
  const header = ["الجاري", "تاريخ الصرف", "من أصل مستحق", "رصيد مرحّل", "قيمة الصرف", "المتبقي بعد الصرف", "حالة الإثبات"];
  return <Page size="A4" orientation="portrait" style={styles.page} wrap>
    <View style={styles.header}><Image src={`${origin}${companyBrand.logoPath}`} style={styles.logo}/><Text style={styles.company}>{companyBrand.arabicName}</Text><Text style={styles.title}>كشف حساب صرف المقاولة</Text></View>
    <Text style={styles.intro}>المقاول: {clean(account.company.name)} · المقاولة: {clean(account.name)} · المشروع: {clean(account.project.name)}{includeDeductions ? " · يشمل الخصومات والاستقطاعات" : ""}</Text>
    <View style={styles.table}><View style={styles.tableHead}>{header.map((label, index) => <Text key={label} style={[styles.cell, { width: widths[index], fontWeight: 700 }]}>{label}</Text>)}</View>{records.map((record) => <View key={record.payment.id} style={styles.tableRow} wrap={false}><Text style={[styles.cell, { width: widths[0] }]}>{record.statement.sequence}</Text><Text style={[styles.cell, { width: widths[1] }]}>{record.payment.paymentDate.slice(0, 10)}</Text><Text style={[styles.cell, { width: widths[2] }]}>{money(record.dueBeforePayment)}</Text><Text style={[styles.cell, { width: widths[3] }]}>{money(record.carriedFromPrevious)}</Text><Text style={[styles.cell, { width: widths[4] }]}>{money(record.payment.amountCents)}</Text><Text style={[styles.cell, { width: widths[5] }]}>{money(record.dueAfterPayment)}</Text><Text style={[styles.cell, { width: widths[6] }]}>{record.proofFiles.length ? `${record.proofFiles.length} إثبات مرفق` : "بدون مرفق"}</Text></View>)}</View>
    <Text style={styles.note}>بعد هذا الجدول، تأتي صفحة كل دفعة ثم صفحات إثبات الصرف الخاصة بها بالترتيب نفسه.</Text>
  </Page>;
}

export async function createContractorPaymentProofUrl(account: ExpenseAccount, attachments: ExpenseAttachmentInfo[], includeDeductions: boolean) {
  if (!fontRegistered) { const origin = window.location.origin; Font.register({ family: "ASGCCairo", fonts: [{ src: `${origin}/fonts/Cairo-Regular.ttf`, fontWeight: "normal" }, { src: `${origin}/fonts/Cairo-Bold.ttf`, fontWeight: "bold" }] }); fontRegistered = true; }
  const records: PaymentRecord[] = [];
  let totalPaidBefore = 0, previousNet = 0;
  for (const statement of [...account.statements].sort((a, b) => a.sequence - b.sequence)) {
    const carriedFromPrevious = Math.max(0, previousNet - totalPaidBefore);
    for (const payment of statement.payments.filter((item) => item.status !== "REVERSED").sort((a, b) => a.paymentDate.localeCompare(b.paymentDate))) {
      const dueBeforePayment = Math.max(0, statement.netCents - totalPaidBefore);
      totalPaidBefore += payment.amountCents;
      records.push({ statement, payment, carriedFromPrevious, dueBeforePayment, dueAfterPayment: Math.max(0, statement.netCents - totalPaidBefore), proofFiles: attachments.filter((file) => file.entityType === "payment" && file.entityId === payment.id) });
    }
    previousNet = statement.netCents;
  }
  const combined = await PDFDocument.create();
  const overview = await pdf(<Document title={`كشف حساب صرف - ${clean(account.company.name)}`}><LedgerOverviewPage account={account} records={records} includeDeductions={includeDeductions} /></Document>).toBlob();
  const overviewDocument = await PDFDocument.load(await overview.arrayBuffer());
  const overviewPages = await combined.copyPages(overviewDocument, overviewDocument.getPageIndices());
  overviewPages.forEach((page) => combined.addPage(page));
  for (const record of records) {
    const voucher = await pdf(<Document title={`إثبات صرف - جاري ${record.statement.sequence}`}><VoucherPage account={account} record={record} includeDeductions={includeDeductions} /></Document>).toBlob();
    const voucherDocument = await PDFDocument.load(await voucher.arrayBuffer());
    const voucherPages = await combined.copyPages(voucherDocument, voucherDocument.getPageIndices());
    voucherPages.forEach((page) => combined.addPage(page));
    for (const proof of record.proofFiles) {
      const response = await fetch(`/api/expenses/attachments/${proof.id}`);
      if (!response.ok) continue;
      const bytes = await response.arrayBuffer(); const mime = response.headers.get("content-type") || "";
      if (mime.includes("pdf")) { const source = await PDFDocument.load(bytes); const pages = await combined.copyPages(source, source.getPageIndices()); pages.forEach((page) => combined.addPage(page)); continue; }
      if (mime.includes("png") || mime.includes("jpeg") || mime.includes("jpg")) {
        const image = mime.includes("png") ? await combined.embedPng(bytes) : await combined.embedJpg(bytes);
        const page = combined.addPage([595.28, 841.89]); const scale = Math.min((page.getWidth() - 36) / image.width, (page.getHeight() - 36) / image.height);
        page.drawImage(image, { x: (page.getWidth() - image.width * scale) / 2, y: (page.getHeight() - image.height * scale) / 2, width: image.width * scale, height: image.height * scale });
      }
    }
  }
  const bytes = await combined.save();
  const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return URL.createObjectURL(new Blob([data], { type: "application/pdf" }));
}
