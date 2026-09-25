"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import {
  BanknoteArrowDown,
  BanknoteArrowUp,
  BriefcaseBusiness,
  CircleHelp,
  ReceiptText,
  WalletCards,
} from "lucide-react";
import { ERPSelect } from "@/components/erp-select";
import { KpiCard, MoneyValue } from "@/components/erp-ui";
import type { ProjectCostControl } from "@/lib/project-cost-control";
import {
  pdfColumns,
  pdfMoney,
  previewDataPdf,
  usePdfDataExport,
} from "@/components/pdf-data-export";

type Project = { id: string; name: string; code: string };
const money = (value: number) =>
  (value / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const percent = (value: number | null) =>
  value === null ? "—" : `${value.toFixed(1)}%`;
const unit = (count: number, singular: string, plural: string) =>
  `${count.toLocaleString("en-US")} ${count === 1 ? singular : plural}`;

function DetailList({ children }: { children: ReactNode }) {
  return (
    <>
      <p className="mb-1 font-black text-slate-800">تفاصيل الرقم</p>
      <ul className="space-y-0.5">{children}</ul>
      <p className="mt-2 border-t pt-2 text-[11px] text-slate-400">
        مرّر المؤشر أو ركّز بالكِيبورد لإظهار هذا الشرح.
      </p>
    </>
  );
}

export function ProjectCostControlCenter({
  projects,
  initial,
}: {
  projects: Project[];
  initial: ProjectCostControl | null;
}) {
  const [data, setData] = useState(initial);
  const [selected, setSelected] = useState(
    initial?.project.id || projects[0]?.id || "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  usePdfDataExport(() => {
    if (!data) return;
    const costs: [string, number][] = [
      ["مقاولو الباطن", data.cost.subcontractorsCents],
      ["المشتريات", data.cost.purchasesCents],
      ["الرواتب المعتمدة", data.cost.salariesCents],
      ["صندوق النثريات", data.cost.pettyCashCents],
    ];
    void previewDataPdf({
      title: `الموقف المالي للمشروع: ${data.project.name}`,
      filters: data.project.name,
      kpis: [
        {
          label: "قيمة العقود",
          value: pdfMoney(data.revenue.contractValueCents),
          tone: "blue",
        },
        {
          label: "الإيراد المعتمد",
          value: pdfMoney(data.revenue.certifiedRevenueCents),
          tone: "violet",
        },
        {
          label: "المحصل فعليًا",
          value: pdfMoney(data.revenue.collectedCents),
          tone: "emerald",
        },
        {
          label: "متبقي التحصيل",
          value: pdfMoney(data.revenue.outstandingCents),
          tone: "amber",
        },
        {
          label: "إجمالي التكلفة",
          value: pdfMoney(data.cost.totalCostCents),
          tone: "rose",
        },
      ],
      tables: [
        {
          title: "تفصيل تكلفة المشروع",
          columns: pdfColumns(
            ["مصدر التكلفة", 3],
            ["القيمة", 2],
            ["النسبة من إجمالي التكلفة", 2],
          ),
          rows: costs.map(([label, value]) => [
            label,
            pdfMoney(value),
            data.cost.totalCostCents
              ? `${((value / data.cost.totalCostCents) * 100).toFixed(1)}%`
              : "—",
          ]),
          footer: ["الإجمالي", pdfMoney(data.cost.totalCostCents), "100%"],
        },
        {
          title: "الأداء والسيولة",
          columns: pdfColumns(["البيان", 3], ["القيمة", 2]),
          rows: [
            [
              "تنفيذ العقد",
              data.revenue.executionPercent == null
                ? "—"
                : `${data.revenue.executionPercent.toFixed(1)}%`,
            ],
            [
              "نسبة التحصيل",
              data.revenue.collectionPercent == null
                ? "—"
                : `${data.revenue.collectionPercent.toFixed(1)}%`,
            ],
            ["الربح حتى تاريخه", pdfMoney(data.performance.profitToDateCents)],
            [
              "هامش الربح",
              data.performance.marginPercent == null
                ? "—"
                : `${data.performance.marginPercent.toFixed(1)}%`,
            ],
            ["Cash In", pdfMoney(data.cash.cashInCents)],
            ["Cash Out", pdfMoney(data.cash.cashOutCents)],
            ["صافي السيولة", pdfMoney(data.cash.netCashPositionCents)],
          ],
        },
      ],
    });
  });

  async function changeProject(projectId: string) {
    setSelected(projectId);
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/project-cost-control?projectId=${encodeURIComponent(projectId)}`,
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "تعذر تحميل موقف المشروع.");
      setData(body);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "تعذر تحميل موقف المشروع.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!projects.length)
    return (
      <section className="rounded-2xl border bg-white p-8 text-center text-slate-500">
        لا توجد مشروعات نشطة لعرض موقفها المالي.
      </section>
    );
  const costRows = data
    ? [
        ["مقاولو الباطن", data.cost.subcontractorsCents],
        ["المشتريات", data.cost.purchasesCents],
        ["الرواتب المعتمدة", data.cost.salariesCents],
        ["صندوق النثريات", data.cost.pettyCashCents],
      ]
    : [];

  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold text-blue-700">
            Project Cost Control
          </p>
          <h1 className="mt-1 text-2xl font-black text-slate-950">
            الموقف المالي للمشروعات
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            مرّر المؤشر فوق أي كارت لمعرفة مصدر الرقم بسرعة.
          </p>
        </div>
        <label className="w-full max-w-sm text-xs font-bold text-slate-700">
          المشروع
          <ERPSelect
            value={selected}
            onValueChange={changeProject}
            disabled={busy}
            className="mt-2 w-full"
          >
            <option value="">اختر المشروع</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name} · {project.code}
              </option>
            ))}
          </ERPSelect>
        </label>
      </section>
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700"
        >
          {error}
        </p>
      )}
      {busy && (
        <p role="status" className="text-sm text-slate-500">
          جارٍ تحديث موقف المشروع…
        </p>
      )}
      {data && (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <KpiCard
              label="قيمة العقود"
              value={`${money(data.revenue.contractValueCents)} ج.م`}
              icon={BriefcaseBusiness}
              tone="blue"
              details={
                <DetailList>
                  <li>
                    {unit(data.revenue.contractsCount, "عقد نشط", "عقود نشطة")}{" "}
                    بالقيم الأصلية.
                  </li>
                  <li>
                    {unit(
                      data.revenue.materialsCount,
                      "شهادة خامات",
                      "شهادات خامات",
                    )}{" "}
                    مرتبطة بالعقود: {money(data.revenue.materialsCents)} ج.م.
                  </li>
                </DetailList>
              }
            />
            <KpiCard
              label="الإيراد المعتمد"
              value={`${money(data.revenue.certifiedRevenueCents)} ج.م`}
              icon={ReceiptText}
              tone="violet"
              details={
                <DetailList>
                  <li>
                    {unit(data.revenue.statementsCount, "مستخلص", "مستخلصات")}.
                  </li>
                  <li>إجمالي المستخلصات، وتُحسب سواء تم الصرف أم لا.</li>
                </DetailList>
              }
            />
            <KpiCard
              label="المحصل فعليًا"
              value={`${money(data.revenue.collectedCents)} ج.م`}
              icon={BanknoteArrowUp}
              tone="emerald"
              details={
                <DetailList>
                  <li>
                    {unit(
                      data.revenue.paidStatementsCount,
                      "مستخلص",
                      "مستخلصات",
                    )}
                    .
                  </li>
                  <li>إجمالي المستخلصات المصروفة فعليًا.</li>
                </DetailList>
              }
            />
            <KpiCard
              label="متبقي التحصيل"
              value={`${money(data.revenue.outstandingCents)} ج.م`}
              icon={WalletCards}
              tone="amber"
              details={
                <DetailList>
                  <li>الإيراد المعتمد − المحصل فعليًا.</li>
                  <li>
                    {unit(data.revenue.pendingStatementsCount, "جاري", "جواري")}{" "}
                    لم يصل بعد إلى «تم الصرف».
                  </li>
                </DetailList>
              }
            />
            <KpiCard
              label="إجمالي التكلفة"
              value={`${money(data.cost.totalCostCents)} ج.م`}
              icon={BanknoteArrowDown}
              tone="rose"
              details={
                <DetailList>
                  <li>
                    مقاولو الباطن: {money(data.cost.subcontractorsCents)} ج.م من{" "}
                    {unit(
                      data.cost.subcontractStatementsCount,
                      "جاري",
                      "جواري",
                    )}
                    .
                  </li>
                  <li>
                    مشتريات: {money(data.cost.purchasesCents)} ج.م من{" "}
                    {unit(data.cost.purchaseInvoicesCount, "فاتورة", "فواتير")}.
                  </li>
                  <li>
                    رواتب معتمدة: {money(data.cost.salariesCents)} ج.م من{" "}
                    {unit(data.cost.payrollRunsCount, "كشف", "كشوف")}.
                  </li>
                  <li>
                    صندوق النثريات فعليًا: {money(data.cost.pettyCashCents)} ج.م من{" "}
                    {unit(data.cost.pettyExpensesCount, "مصروف", "مصروفات")}.
                  </li>
                </DetailList>
              }
            />
          </section>
          <section className="grid gap-5 lg:grid-cols-2">
            <article className="rounded-2xl border bg-white p-5 shadow-sm">
              <h2 className="font-black">الإيرادات والتحصيل</h2>
              <div className="mt-5 space-y-4">
                <Progress
                  label="تنفيذ العقد"
                  value={data.revenue.executionPercent}
                  details={
                    <DetailList>
                      <li>الإيراد المعتمد ÷ قيمة العقود الحالية × 100.</li>
                      <li>
                        يدخل فيه إجمالي المستخلصات المسجلة، حتى قبل الصرف.
                      </li>
                    </DetailList>
                  }
                />
                <Progress
                  label="نسبة التحصيل"
                  value={data.revenue.collectionPercent}
                  details={
                    <DetailList>
                      <li>المحصل فعليًا ÷ الإيراد المعتمد × 100.</li>
                      <li>لا يدخل إلا الجاري الذي وصل إلى «تم الصرف».</li>
                    </DetailList>
                  }
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Metric
                    label="الربح حتى تاريخه"
                    value={`${money(data.performance.profitToDateCents)} ج.م`}
                    details={
                      <DetailList>
                        <li>
                          الإيراد المعتمد:{" "}
                          {money(data.revenue.certifiedRevenueCents)} ج.م.
                        </li>
                        <li>
                          ناقص إجمالي التكلفة: {money(data.cost.totalCostCents)}{" "}
                          ج.م.
                        </li>
                      </DetailList>
                    }
                    emphasis={
                      data.performance.profitToDateCents < 0
                        ? "text-rose-700"
                        : "text-emerald-700"
                    }
                  />
                  <Metric
                    label="هامش الربح"
                    value={percent(data.performance.marginPercent)}
                    details={
                      <DetailList>
                        <li>الربح حتى تاريخه ÷ الإيراد المعتمد.</li>
                      </DetailList>
                    }
                  />
                </div>
              </div>
            </article>
            <article className="rounded-2xl border bg-white p-5 shadow-sm">
              <h2 className="font-black">السيولة النقدية</h2>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <Metric
                  label="Cash In"
                  value={`${money(data.cash.cashInCents)} ج.م`}
                  details={
                    <DetailList>
                      <li>
                        صافي{" "}
                        {unit(
                          data.revenue.paidStatementsCount,
                          "جاري وارد مصروف",
                          "جواري وارد مصروفة",
                        )}
                        .
                      </li>
                      <li>بعد خصم الخامات المعتمدة.</li>
                    </DetailList>
                  }
                />
                <Metric
                  label="Cash Out"
                  value={`${money(data.cash.cashOutCents)} ج.م`}
                  details={
                    <DetailList>
                      <li>
                        {unit(
                          data.cash.subcontractPaymentsCount,
                          "دفعة مقاول",
                          "دفعات مقاولين",
                        )}{" "}
                        مسجلة.
                      </li>
                      <li>
                        {unit(
                          data.cash.paidPayrollRunsCount,
                          "كشف راتب مصروف",
                          "كشوف رواتب مصروفة",
                        )}
                        .
                      </li>
                      <li>
                        {unit(
                          data.cash.pettyExpensesCount,
                          "مصروف صندوق النثريات",
                          "مصروفات صندوق النثريات",
                        )}{" "}
                        فعلية.
                      </li>
                      <li>لا تشمل فواتير الموردين قبل سدادها.</li>
                    </DetailList>
                  }
                />
                <Metric
                  label="صافي السيولة"
                  value={`${money(data.cash.netCashPositionCents)} ج.م`}
                  details={
                    <DetailList>
                      <li>Cash In − Cash Out.</li>
                      <li>
                        {data.cash.netCashPositionCents < 0
                          ? `عجز ممول من الشركة: ${money(data.cash.companyFinancingCents)} ج.م.`
                          : "لا يوجد عجز نقدي ممول من الشركة."}
                      </li>
                    </DetailList>
                  }
                  emphasis={
                    data.cash.netCashPositionCents < 0
                      ? "text-rose-700"
                      : "text-emerald-700"
                  }
                />
              </div>
              {data.cash.companyFinancingCents > 0 && (
                <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm font-bold text-amber-800">
                  تمويل الشركة للمشروع حتى تاريخه:{" "}
                  {money(data.cash.companyFinancingCents)} ج.م
                </p>
              )}
              <p className="mt-4 text-xs text-slate-500">
                فواتير الموردين تدخل التكلفة، ولا تدخل Cash Out حتى تتوفر
                مدفوعات موردين موثقة.
              </p>
            </article>
          </section>
          <section className="erp-table-shell">
            <div className="border-b bg-white p-4">
              <h2 className="font-black">تفصيل تكلفة المشروع</h2>
              <p className="mt-1 text-xs text-slate-500">
                لا تشمل القائمة أي «مصروفات أخرى» حتى يتوفر لها مصدر مستقل
                موثوق.
              </p>
            </div>
            <div className="erp-table-scroll">
              <table className="erp-data-table erp-responsive-table min-w-[620px]">
                <thead>
                  <tr>
                    <th>مصدر التكلفة</th>
                    <th>القيمة</th>
                    <th>النسبة من إجمالي التكلفة</th>
                  </tr>
                </thead>
                <tbody>
                  {costRows.map(([label, value]) => (
                    <tr key={String(label)}>
                      <td data-label="مصدر التكلفة">{label}</td>
                      <td data-label="القيمة" className="text-center">
                        <MoneyValue>{money(Number(value))} ج.م</MoneyValue>
                      </td>
                      <td
                        data-label="النسبة من إجمالي التكلفة"
                        className="text-center"
                      >
                        {percent(
                          data.cost.totalCostCents
                            ? (Number(value) / data.cost.totalCostCents) * 100
                            : null,
                        )}
                      </td>
                    </tr>
                  ))}
                  <tr className="font-black">
                    <td>الإجمالي</td>
                    <td className="text-center">
                      <MoneyValue>
                        {money(data.cost.totalCostCents)} ج.م
                      </MoneyValue>
                    </td>
                    <td className="text-center">100%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <Metric
              label="نسبة التكلفة للإيراد المعتمد"
              value={percent(data.performance.costRatioPercent)}
              details={
                <DetailList>
                  <li>إجمالي التكلفة ÷ الإيراد المعتمد.</li>
                </DetailList>
              }
            />
            <Metric
              label="صافي الربح حتى تاريخه"
              value={`${money(data.performance.profitToDateCents)} ج.م`}
              details={
                <DetailList>
                  <li>الإيراد المعتمد − إجمالي التكلفة.</li>
                </DetailList>
              }
              emphasis={
                data.performance.profitToDateCents < 0
                  ? "text-rose-700"
                  : "text-emerald-700"
              }
            />
            <Metric label="المشروع" value={data.project.name} />
          </section>
        </>
      )}
    </div>
  );
}

function Progress({
  label,
  value,
  details,
}: {
  label: string;
  value: number | null;
  details?: ReactNode;
}) {
  return (
    <div
      tabIndex={details ? 0 : undefined}
      className={`relative ${details ? "group cursor-help rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-blue-500" : ""}`}
    >
      <div className="mb-2 flex justify-between text-sm">
        <span className="inline-flex items-center gap-1">
          {label}
          {details && (
            <CircleHelp
              className="size-3.5 text-slate-400"
              aria-label="شرح البند"
            />
          )}
        </span>
        <b>{percent(value)}</b>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-blue-600"
          style={{ width: `${Math.min(100, Math.max(0, value ?? 0))}%` }}
        />
      </div>
      {details && (
        <div
          role="tooltip"
          className="pointer-events-none absolute inset-x-0 top-[calc(100%+0.4rem)] z-30 rounded-xl border border-slate-200 bg-white p-3 text-right text-xs leading-6 text-slate-600 opacity-0 shadow-xl transition duration-150 group-hover:opacity-100 group-focus:opacity-100"
        >
          {details}
        </div>
      )}
    </div>
  );
}
function Metric({
  label,
  value,
  emphasis = "text-blue-700",
  details,
}: {
  label: string;
  value: string;
  emphasis?: string;
  details?: ReactNode;
}) {
  return (
    <article
      tabIndex={details ? 0 : undefined}
      className={`relative rounded-xl border border-slate-100 p-4 ${details ? "group cursor-help outline-none focus-visible:ring-2 focus-visible:ring-blue-500" : ""}`}
    >
      <p className="inline-flex items-center gap-1 text-xs text-slate-500">
        {label}
        {details && (
          <CircleHelp
            className="size-3.5 text-slate-400"
            aria-label="شرح البند"
          />
        )}
      </p>
      <p className={`mt-2 text-lg font-black ${emphasis}`}>{value}</p>
      {details && (
        <div
          role="tooltip"
          className="pointer-events-none absolute inset-x-1 top-[calc(100%+0.4rem)] z-30 rounded-xl border border-slate-200 bg-white p-3 text-right text-xs leading-6 text-slate-600 opacity-0 shadow-xl transition duration-150 group-hover:opacity-100 group-focus:opacity-100"
        >
          {details}
        </div>
      )}
    </article>
  );
}
