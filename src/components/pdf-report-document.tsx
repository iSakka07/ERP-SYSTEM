"use client";
/* eslint-disable jsx-a11y/alt-text -- @react-pdf/renderer Image does not expose an alt prop. */

import {
  Document,
  Font,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  pdf,
} from "@react-pdf/renderer";
import { companyBrand } from "@/lib/company-brand";

export type PdfColumn = { label: string; width: number };
export type PdfTable = {
  title?: string;
  columns: PdfColumn[];
  rows: string[][];
  footer?: string[];
};
export type PdfKpi = {
  label: string;
  value: string;
  tone?: "blue" | "emerald" | "amber" | "violet" | "rose";
};
export type PdfContractOverview = {
  name: string;
  number: string;
  project: string;
  owner: string;
  estimate?: string;
  estimateReference?: string;
  original: string;
  adjustment: string;
  current: string;
  latestGross: string;
  remaining: string;
  paidPercent: string;
};

const palette = {
  navy: "#10192d",
  blue: "#168dcc",
  ink: "#172033",
  muted: "#667085",
  border: "#cbd5e1",
  alternate: "#f6f9fc",
  total: "#eaf4ff",
};
const styles = StyleSheet.create({
  page: {
    fontFamily: "ASGCCairo",
    color: palette.ink,
    fontSize: 8.5,
    // The branded heading is repeated on every page. KPI cards are ordinary
    // flow content below, so they stay on the first page instead of being
    // repeated with the fixed heading.
    paddingTop: 106,
    paddingBottom: 54,
    paddingHorizontal: 26,
  },
  header: { position: "absolute", top: 18, left: 26, right: 26 },
  headerBox: {
    flexDirection: "row-reverse",
    alignItems: "center",
    backgroundColor: palette.navy,
    borderRadius: 5,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 3,
    borderBottomColor: palette.blue,
  },
  logo: {
    width: 42,
    height: 42,
    objectFit: "contain",
    backgroundColor: "#ffffff",
    borderRadius: 4,
  },
  headerTitles: { flex: 1, marginHorizontal: 10, textAlign: "right" },
  company: { color: "#ffffff", fontSize: 12, fontWeight: 700 },
  system: { color: "#bcd4e7", fontSize: 8, marginTop: 2 },
  headerMeta: {
    width: 150,
    color: "#dbeafe",
    fontSize: 7.5,
    textAlign: "left",
  },
  titleRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: 8,
  },
  title: { fontSize: 14, fontWeight: 700, color: palette.navy },
  subtitle: { color: palette.muted, fontSize: 8 },
  filter: {
    marginTop: 4,
    paddingTop: 4,
    borderTopWidth: 0.6,
    borderTopColor: palette.border,
    color: palette.muted,
    fontSize: 7.5,
    textAlign: "right",
  },
  kpiRow: { flexDirection: "row-reverse", gap: 5, marginTop: 7 },
  kpiSection: { marginTop: 12, marginBottom: 20 },
  kpi: {
    flexGrow: 1,
    flexBasis: 0,
    borderWidth: 0.8,
    borderRadius: 4,
    paddingVertical: 5,
    paddingHorizontal: 6,
    textAlign: "center",
  },
  kpiLabel: { color: palette.muted, fontSize: 7.2, textAlign: "center" },
  kpiValue: {
    marginTop: 2,
    color: palette.navy,
    fontSize: 9,
    fontWeight: 700,
    textAlign: "center",
  },
  kpiBlue: { borderColor: "#9fc8f3", backgroundColor: "#eef6ff" },
  kpiEmerald: { borderColor: "#9ee8cc", backgroundColor: "#eefff7" },
  kpiAmber: { borderColor: "#f3d190", backgroundColor: "#fff9e8" },
  kpiViolet: { borderColor: "#c7b6f3", backgroundColor: "#f6f2ff" },
  kpiRose: { borderColor: "#f0b9c5", backgroundColor: "#fff3f5" },
  table: {
    width: "100%",
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderColor: palette.border,
  },
  sectionTitle: {
    marginBottom: 5,
    color: palette.navy,
    fontSize: 10,
    fontWeight: 700,
    textAlign: "right",
  },
  headerRow: { flexDirection: "row-reverse", backgroundColor: palette.blue },
  row: { flexDirection: "row-reverse" },
  alternate: { backgroundColor: palette.alternate },
  total: {
    backgroundColor: "#dbeafe",
    borderTopWidth: 1.4,
    borderTopColor: "#2563a8",
  },
  headerCell: {
    color: "#ffffff",
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#0b6fa6",
    paddingHorizontal: 4,
    paddingVertical: 5,
    fontSize: 8,
    fontWeight: 700,
    textAlign: "center",
  },
  cell: {
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: 4,
    paddingVertical: 4,
    lineHeight: 1.3,
    textAlign: "right",
  },
  totalCell: { fontWeight: 700, color: "#123e70" },
  totalLabel: {
    backgroundColor: "#1d5fa7",
    color: "#ffffff",
    textAlign: "center",
  },
  empty: { padding: 16, color: palette.muted, textAlign: "center" },
  footer: {
    position: "absolute",
    bottom: 10,
    left: 26,
    right: 26,
    borderTopWidth: 0.6,
    borderTopColor: palette.border,
    paddingTop: 4,
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "flex-end",
    color: palette.muted,
  },
  footerContact: {
    width: 360,
    textAlign: "right",
    fontSize: 5.8,
    lineHeight: 1.45,
  },
  footerPage: { flex: 1, textAlign: "left", fontSize: 6.5, paddingBottom: 1 },
});
function safe(value: unknown) {
  const text = String(value ?? "—")
    .replace(
      /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
  return text || "—";
}
function ReportTable({ table }: { table: PdfTable }) {
  const totalWeight =
    table.columns.reduce((sum, column) => sum + column.width, 0) || 1;
  const width = (index: number) =>
    `${(table.columns[index].width / totalWeight) * 100}%`;
  if (!table.rows.length)
    return (
      <>
        {table.title ? (
          <Text style={styles.sectionTitle}>{safe(table.title)}</Text>
        ) : null}
        <Text style={styles.empty}>لا توجد بيانات مطابقة للفلاتر الحالية</Text>
      </>
    );
  return (
    <>
      {table.title ? (
        <Text style={styles.sectionTitle}>{safe(table.title)}</Text>
      ) : null}
      <View style={styles.table}>
        <View fixed style={styles.headerRow}>
          {table.columns.map((column, index) => (
            <Text
              key={column.label + index}
              style={[styles.headerCell, { width: width(index) }]}
            >
              {safe(column.label)}
            </Text>
          ))}
        </View>
        {table.rows.map((row, rowIndex) => (
          <View
            key={rowIndex}
            wrap={false}
            style={[styles.row, rowIndex % 2 ? styles.alternate : {}]}
          >
            {table.columns.map((column, columnIndex) => (
              <Text
                key={column.label + columnIndex}
                style={[styles.cell, { width: width(columnIndex) }]}
              >
                {safe(row[columnIndex])}
              </Text>
            ))}
          </View>
        ))}
        {table.footer ? (
          <View wrap={false} style={[styles.row, styles.total]}>
            {table.columns.map((column, index) => (
              <Text
                key={column.label + index}
                style={[
                  styles.cell,
                  styles.totalCell,
                  index === 0 ? styles.totalLabel : {},
                  { width: width(index) },
                ]}
              >
                {safe(table.footer?.[index])}
              </Text>
            ))}
          </View>
        ) : null}
      </View>
    </>
  );
}
export function PdfReportDocument({
  title,
  filters,
  tables,
  kpis = [],
  userName,
}: {
  title: string;
  filters?: string;
  tables: PdfTable[];
  kpis?: PdfKpi[];
  userName?: string;
}) {
  const now = new Date();
  const exportDate = new Intl.DateTimeFormat("ar-EG", {
    dateStyle: "long",
  }).format(now);
  const exportTime = new Intl.DateTimeFormat("ar-EG", {
    timeStyle: "short",
  }).format(now);
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return (
    <Document title={safe(title)}>
      <Page size="A4" orientation="landscape" style={styles.page} wrap>
        <View fixed style={styles.header}>
          <View style={styles.headerBox}>
            <Image
              src={`${origin}${companyBrand.logoPath}`}
              style={styles.logo}
            />
            <View style={styles.headerTitles}>
              <Text style={styles.company}>{companyBrand.arabicName}</Text>
              <Text style={styles.system}>
                {companyBrand.englishName} · منظومة إدارة المقاولات والمشروعات
              </Text>
            </View>
            <View style={styles.headerMeta}>
              <Text>الوقت: {exportTime}</Text>
              <Text>تاريخ التصدير: {exportDate}</Text>
              <Text>المستخدم: {safe(userName)}</Text>
            </View>
          </View>
          <View style={styles.titleRow}>
            <Text style={styles.title}>{safe(title)}</Text>
            <Text style={styles.subtitle}>
              تقرير صادر من {companyBrand.systemName}
            </Text>
          </View>
          {filters ? (
            <Text style={styles.filter}>الفلاتر المطبقة: {safe(filters)}</Text>
          ) : null}
        </View>
        {kpis.length ? (
          <View wrap={false} style={styles.kpiSection}>
            <View style={styles.kpiRow}>
              {kpis.slice(0, 5).map((kpi, index) => (
                <View
                  key={`${kpi.label}-${index}`}
                  style={[
                    styles.kpi,
                    styles[
                      `kpi${(kpi.tone || "blue")[0].toUpperCase()}${(kpi.tone || "blue").slice(1)}` as "kpiBlue"
                    ],
                  ]}
                >
                  <Text style={styles.kpiLabel}>{safe(kpi.label)}</Text>
                  <Text style={styles.kpiValue}>{safe(kpi.value)}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
        {tables.map((table, index) => (
          <View key={index} style={{ marginTop: index ? 18 : 4 }}>
            <ReportTable table={table} />
          </View>
        ))}
        <View fixed style={styles.footer}>
          <View style={styles.footerContact}>
            <Text>العنوان: {companyBrand.address}</Text>
            <Text>الهاتف: {companyBrand.phone}</Text>
            <Text>الموقع الإلكتروني: {companyBrand.website}</Text>
          </View>
          <Text
            style={styles.footerPage}
            render={({ pageNumber, totalPages }) =>
              `صفحة ${pageNumber} من ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}
let registered = false;
const contractStyles = StyleSheet.create({
  page: {
    fontFamily: "ASGCCairo",
    color: palette.ink,
    fontSize: 8,
    paddingTop: 74,
    paddingBottom: 43,
    paddingHorizontal: 27,
  },
  header: {
    position: "absolute",
    top: 16,
    left: 27,
    right: 27,
    height: 43,
    flexDirection: "row-reverse",
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: palette.blue,
    backgroundColor: palette.navy,
    borderRadius: 5,
    paddingHorizontal: 10,
  },
  headerLogo: {
    width: 31,
    height: 31,
    backgroundColor: "#ffffff",
    objectFit: "contain",
    borderRadius: 3,
  },
  headerName: {
    flex: 1,
    color: "#ffffff",
    fontSize: 11,
    fontWeight: 700,
    textAlign: "right",
    marginRight: 9,
  },
  headerMeta: { color: "#bed7ec", fontSize: 7, textAlign: "left" },
  title: {
    color: palette.navy,
    fontSize: 14,
    fontWeight: 700,
    textAlign: "right",
  },
  subtitle: {
    marginTop: 2,
    color: palette.muted,
    fontSize: 7.5,
    textAlign: "right",
  },
  identity: { marginTop: 10, flexDirection: "row-reverse", gap: 6 },
  identityCell: {
    flex: 1,
    borderWidth: 0.7,
    borderColor: "#d7e1ed",
    borderRadius: 4,
    backgroundColor: "#f8fbff",
    paddingHorizontal: 7,
    paddingVertical: 4,
    textAlign: "right",
  },
  label: { color: palette.muted, fontSize: 7 },
  identityValue: {
    color: palette.navy,
    fontSize: 8,
    fontWeight: 700,
    marginTop: 1,
  },
  valueStrip: { marginTop: 7, flexDirection: "row-reverse", gap: 5 },
  valueCell: {
    flex: 1,
    borderWidth: 0.7,
    borderColor: "#d7e1ed",
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 5,
    textAlign: "right",
  },
  valueStrong: { color: "#135ba6", fontSize: 9, fontWeight: 700, marginTop: 2 },
  kpiRow: { flexDirection: "row-reverse", gap: 5, marginTop: 8 },
  kpi: {
    flex: 1,
    borderWidth: 0.7,
    borderColor: "#c7d8eb",
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 6,
    backgroundColor: "#f3f8ff",
    textAlign: "right",
  },
  kpiValue: {
    color: palette.navy,
    fontSize: 9.5,
    fontWeight: 700,
    marginTop: 2,
  },
  footer: {
    position: "absolute",
    bottom: 11,
    left: 27,
    right: 27,
    borderTopWidth: 0.6,
    borderTopColor: palette.border,
    paddingTop: 4,
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    color: palette.muted,
    fontSize: 6.5,
  },
});

function ContractPdfDocument({
  title,
  tables,
  kpis = [],
  userName,
  contractOverview: c,
}: React.ComponentProps<typeof PdfReportDocument> & {
  contractOverview: PdfContractOverview;
}) {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const now = new Date();
  const identity: [string, string][] = [
    ["رقم العقد", c.number],
    ["اسم العقد", c.name],
    ["المشروع", c.project],
    ["الجهة المالكة", c.owner],
  ];
  const values: [string, string][] = [
    ["القيمة الأصلية", c.original],
    ["صافي المذكرة", c.adjustment],
    ["آخر مستخلص تراكمي", c.latestGross],
    ...(c.estimate
      ? [
          [
            `المقايسة المرتبطة${c.estimateReference ? ` · ${c.estimateReference}` : ""}`,
            c.estimate,
          ] as [string, string],
        ]
      : []),
    ["نسبة الصرف", c.paidPercent],
  ];
  // Explicit pages keep the identity and KPIs on page one and avoid losing the
  // running header when a long table flows through an automatic page break.
  const pages: PdfTable[][] = [[]];
  let available = 6;
  for (const table of tables) {
    let cursor = 0;
    do {
      if (available < 3) {
        pages.push([]);
        available = 12;
      }
      const remaining = table.rows.length - cursor;
      const count = Math.min(
        Math.max(1, available - 2),
        Math.max(1, remaining),
      );
      const last = cursor + count >= table.rows.length;
      pages
        .at(-1)!
        .push({
          ...table,
          title: cursor ? `${table.title || "التفاصيل"} (تابع)` : table.title,
          rows: table.rows.slice(cursor, cursor + count),
          footer: last ? table.footer : undefined,
        });
      available -= count + 2 + (last && table.footer ? 1 : 0);
      cursor += count;
    } while (cursor < table.rows.length);
  }
  return (
    <Document title={safe(title)}>
      {pages.map((sections, pageIndex) => (
        <Page
          key={pageIndex}
          size="A4"
          orientation="landscape"
          style={contractStyles.page}
          wrap={false}
        >
          <View style={contractStyles.header}>
            <Image
              src={`${origin}${companyBrand.logoPath}`}
              style={contractStyles.headerLogo}
            />
            <Text style={contractStyles.headerName}>
              {companyBrand.arabicName} · تقرير العقد
            </Text>
            <Text style={contractStyles.headerMeta}>
              {new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium" }).format(
                now,
              )}{" "}
              · {safe(userName)}
            </Text>
          </View>
          {pageIndex === 0 && (
            <View wrap={false}>
              <Text style={contractStyles.title}>تفاصيل العقد والوارد</Text>
              <Text style={contractStyles.subtitle}>
                ملخص مالي ومراحل المستخلصات وشهادات الخامات والمذكرات
              </Text>
              <View style={contractStyles.identity}>
                {identity.map(([label, value]) => (
                  <View key={label} style={contractStyles.identityCell}>
                    <Text style={contractStyles.label}>{label}</Text>
                    <Text style={contractStyles.identityValue}>
                      {safe(value)}
                    </Text>
                  </View>
                ))}
              </View>
              <View style={contractStyles.valueStrip}>
                {values.map(([label, value]) => (
                  <View key={label} style={contractStyles.valueCell}>
                    <Text style={contractStyles.label}>{label}</Text>
                    <Text style={contractStyles.valueStrong}>
                      {safe(value)}
                    </Text>
                  </View>
                ))}
              </View>
              <View style={contractStyles.kpiRow}>
                {kpis.slice(0, 5).map((kpi) => (
                  <View key={kpi.label} style={contractStyles.kpi}>
                    <Text style={contractStyles.label}>{safe(kpi.label)}</Text>
                    <Text style={contractStyles.kpiValue}>
                      {safe(kpi.value)}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}
          {sections.map((table, index) => (
            <View
              key={index}
              style={{ marginTop: index || pageIndex ? 11 : 15 }}
            >
              <ReportTable table={table} />
            </View>
          ))}
          <View style={contractStyles.footer}>
            <Text>
              {companyBrand.systemName} · {safe(c.number)}
            </Text>
            <Text>{`صفحة ${pageIndex + 1} من ${pages.length}`}</Text>
          </View>
        </Page>
      ))}
    </Document>
  );
}

export async function createPdfReportUrl(
  props: React.ComponentProps<typeof PdfReportDocument> & {
    contractOverview?: PdfContractOverview;
  },
) {
  if (!registered) {
    const origin = window.location.origin;
    Font.register({
      family: "ASGCCairo",
      fonts: [
        { src: `${origin}/fonts/Cairo-Regular.ttf`, fontWeight: "normal" },
        { src: `${origin}/fonts/Cairo-Bold.ttf`, fontWeight: "bold" },
      ],
    });
    registered = true;
  }
  const blob = await pdf(
    props.contractOverview ? (
      <ContractPdfDocument
        {...props}
        contractOverview={props.contractOverview}
      />
    ) : (
      <PdfReportDocument {...props} />
    ),
  ).toBlob();
  return URL.createObjectURL(blob);
}
