"use client";
/* eslint-disable jsx-a11y/alt-text -- react-pdf Image does not expose alt text. */

import { Document, Font, Image, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import { companyBrand } from "@/lib/company-brand";
import type { ExpenseAccount, ExpenseStatement } from "@/lib/expense-types";
import { expenseCumulativeQuantity } from "@/lib/expenses";

let registered = false;
const money = (cents: number) => `${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;
const safe = (value: unknown) => String(value ?? "—").replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, "").replace(/\s+/g, " ").trim() || "—";

const s = StyleSheet.create({
  page: { fontFamily: "ASGCCairo", padding: 30, color: "#172033", fontSize: 8.5, direction: "rtl" },
  header: { flexDirection: "row-reverse", alignItems: "flex-start", borderBottomWidth: 2, borderBottomColor: "#1d5fa7", paddingBottom: 13 },
  logo: { width: 52, height: 52, objectFit: "contain" },
  headerText: { flex: 1, marginRight: 10, textAlign: "right" },
  company: { fontSize: 16, fontWeight: 700, color: "#10192d" },
  label: { color: "#667085", fontSize: 7.5, marginTop: 2 },
  invoiceTitle: { fontSize: 15, fontWeight: 700, color: "#1d5fa7", textAlign: "left" },
  invoiceNo: { color: "#667085", fontSize: 8, textAlign: "left", marginTop: 4 },
  infoGrid: { flexDirection: "row-reverse", gap: 10, marginTop: 15 },
  infoBox: { flex: 1, borderWidth: 0.7, borderColor: "#d6dee8", borderRadius: 4, padding: 8, backgroundColor: "#fbfcfe" },
  infoTitle: { fontSize: 7, color: "#667085", marginBottom: 3 },
  infoValue: { fontSize: 9, fontWeight: 700, color: "#172033" },
  sectionTitle: { color: "#1d5fa7", fontSize: 10, fontWeight: 700, marginTop: 16, marginBottom: 6, textAlign: "right" },
  table: { borderWidth: 0.6, borderColor: "#cbd5e1" },
  row: { flexDirection: "row-reverse", borderBottomWidth: 0.6, borderBottomColor: "#d8e0ea", minHeight: 25, alignItems: "center" },
  head: { backgroundColor: "#eef4fa", minHeight: 27 },
  alt: { backgroundColor: "#fafcff" },
  cell: { paddingHorizontal: 4, paddingVertical: 5, textAlign: "center", fontSize: 7.2 },
  right: { textAlign: "right" },
  headText: { fontWeight: 700, color: "#22304a" },
  totals: { flexDirection: "row-reverse", justifyContent: "space-between", gap: 14, marginTop: 16 },
  summary: { width: "48%", borderWidth: 0.8, borderColor: "#b9c9dd", borderRadius: 5, overflow: "hidden" },
  summaryHead: { backgroundColor: "#1d5fa7", color: "#fff", fontWeight: 700, padding: 7, textAlign: "right" },
  summaryRow: { flexDirection: "row-reverse", justifyContent: "space-between", paddingHorizontal: 8, paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: "#e2e8f0" },
  summaryStrong: { backgroundColor: "#eef6ff", paddingHorizontal: 8, paddingVertical: 8, flexDirection: "row-reverse", justifyContent: "space-between", color: "#124b83", fontSize: 10, fontWeight: 700 },
  notes: { flex: 1, borderWidth: 0.7, borderColor: "#d6dee8", borderRadius: 5, padding: 10, backgroundColor: "#fbfcfe" },
  noteText: { color: "#475467", lineHeight: 1.65, textAlign: "right" },
  small: { color: "#667085", fontSize: 7.5 },
});

function Cell({ children, width, right = false, head = false }: { children: string; width: string; right?: boolean; head?: boolean }) {
  return <Text style={[s.cell, { width }, right ? s.right : {}, head ? s.headText : {}]}>{safe(children)}</Text>;
}

function Invoice({ account, statement, visibleDeductionIndexes }: { account: ExpenseAccount; statement: ExpenseStatement; visibleDeductionIndexes: number[] }) {
  const selected = statement.deductions.filter((_, index) => visibleDeductionIndexes.includes(index));
  const selectedTotal = selected.reduce((sum, item) => sum + item.amountCents, 0);
  const current = statement.grossCents - statement.previousGrossCents;
  const paid = statement.payments.filter((payment) => payment.status !== "REVERSED").reduce((sum, payment) => sum + payment.amountCents, 0);
  const hasNotes = Boolean(statement.notes?.trim());
  const hasDetails = selected.length > 0 || hasNotes;
  const invoiceNo = `SC-${statement.sequence}-${statement.id.slice(-6).toUpperCase()}`;
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return <Document title={`مستخلص مقاول - ${safe(account.company.name)}`}>
    <Page size="A4" orientation="portrait" style={s.page}>
      <View style={s.header}>
        <Image src={`${origin}${companyBrand.logoPath}`} style={s.logo} />
        <View style={s.headerText}><Text style={s.company}>{companyBrand.arabicName}</Text><Text style={s.label}>مستخلص أعمال مقاول</Text></View>
        <View><Text style={s.invoiceTitle}>مستخلص مقاول</Text><Text style={s.invoiceNo}>رقم المستخلص: {invoiceNo}</Text><Text style={s.invoiceNo}>التاريخ: {safe(statement.statementDate.slice(0, 10))}</Text></View>
      </View>

      <View style={s.infoGrid}>
        <View style={s.infoBox}><Text style={s.infoTitle}>المقاول</Text><Text style={s.infoValue}>{safe(account.company.name)}</Text><Text style={s.label}>المقاولة: {safe(account.name)}</Text></View>
        <View style={s.infoBox}><Text style={s.infoTitle}>المشروع</Text><Text style={s.infoValue}>{safe(account.project.name)}</Text><Text style={s.label}>رقم الجاري: {statement.sequence} · {statement.kind === "FINAL" ? "مستخلص ختامي" : "مستخلص جاري"}</Text></View>
      </View>

      <Text style={s.sectionTitle}>بيان الأعمال المعتمدة</Text>
      <View style={s.table}>
        <View style={[s.row, s.head]}><Cell head width="35%" right>بيان الأعمال</Cell><Cell head width="10%">الوحدة</Cell><Cell head width="11%">سابق</Cell><Cell head width="11%">جاري</Cell><Cell head width="11%">تراكمي</Cell><Cell head width="11%">سعر الوحدة</Cell><Cell head width="11%">قيمة الأعمال</Cell></View>
        {statement.items.map((item, index) => <View key={`${item.name}-${index}`} style={[s.row, index % 2 ? s.alt : {}]} wrap={false}><Cell width="35%" right>{item.name}</Cell><Cell width="10%">{item.unit}</Cell><Cell width="11%">{String(item.previousQuantity)}</Cell><Cell width="11%">{String(item.currentQuantity)}</Cell><Cell width="11%">{String(expenseCumulativeQuantity(item))}</Cell><Cell width="11%">{money(item.unitPriceCents)}</Cell><Cell width="11%">{money(item.totalCents)}</Cell></View>)}
      </View>

      <View style={s.totals}>
        <View style={[s.summary, !hasDetails ? { width: "100%" } : {}]}>
          <Text style={s.summaryHead}>ملخص المستحقات</Text>
          <View style={s.summaryRow}><Text>إجمالي الأعمال التراكمي</Text><Text>{money(statement.grossCents)}</Text></View>
          <View style={s.summaryRow}><Text>أعمال المستخلص الحالي</Text><Text>{money(current)}</Text></View>
          <View style={s.summaryRow}><Text>خصومات وتأمينات</Text><Text>{money(selectedTotal)}</Text></View>
          <View style={s.summaryStrong}><Text>صافي المستحق للمقاول</Text><Text>{money(statement.netCents)}</Text></View>
          <View style={s.summaryRow}><Text>المدفوع من هذا المستخلص</Text><Text>{money(paid)}</Text></View>
          <View style={s.summaryStrong}><Text>المتبقي للصرف</Text><Text>{money(Math.max(0, statement.netCents - paid))}</Text></View>
        </View>
        {hasDetails ? <View style={s.notes}>
          <Text style={s.sectionTitle}>الخصومات والملاحظات</Text>
          {selected.map((deduction, index) => <Text key={`${deduction.name}-${index}`} style={s.noteText}>• {safe(deduction.name)}: {money(deduction.amountCents)}{deduction.kind === "PERCENT" ? ` (${deduction.value}%)` : ""}</Text>)}
          {hasNotes ? <><Text style={[s.sectionTitle, { marginTop: selected.length ? 12 : 0 }]}>ملاحظات</Text><Text style={s.noteText}>{safe(statement.notes)}</Text></> : null}
          <Text style={[s.small, { marginTop: 14 }]}>هذا المستخلص يوضح قيمة الأعمال المعتمدة، والخصومات، وما تم صرفه والمتبقي للمقاول.</Text>
        </View> : null}
      </View>
    </Page>
  </Document>;
}

export async function createContractorStatementInvoiceUrl(account: ExpenseAccount, statement: ExpenseStatement, visibleDeductionIndexes: number[]) {
  if (!registered) {
    const origin = window.location.origin;
    Font.register({ family: "ASGCCairo", fonts: [{ src: `${origin}/fonts/Cairo-Regular.ttf`, fontWeight: "normal" }, { src: `${origin}/fonts/Cairo-Bold.ttf`, fontWeight: "bold" }] });
    registered = true;
  }
  return URL.createObjectURL(await pdf(<Invoice account={account} statement={statement} visibleDeductionIndexes={visibleDeductionIndexes} />).toBlob());
}
