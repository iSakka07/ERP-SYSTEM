import type { Contract } from "@/components/incoming-center";
import type { PdfContractOverview, PdfKpi, PdfTable } from "@/components/pdf-report-document";
import { financials, incomingStages, money, statementLabel } from "@/lib/incoming";

type Report = { title: string; filters?: string; tables: PdfTable[]; kpis: PdfKpi[]; contractOverview?: PdfContractOverview };
const columns = (...items: [string, number][]) => items.map(([label, width]) => ({ label, width }));
const stageName = (stage: string) => incomingStages.find(([key]) => key === stage)?.[1] || stage;
const percentage = (value: number, total: number) => `${total ? Math.min(100, Math.max(0, value / total * 100)).toFixed(2) : "0.00"}%`;

export function filteredIncomingReport(contracts: Contract[], filters: string): Report {
  const totals = contracts.reduce((sum, contract) => {
    const f = financials(contract);
    sum.value += f.value;
    sum.gross += f.gross;
    sum.materials += f.materials;
    sum.net += f.net;
    sum.remaining += f.remaining;
    return sum;
  }, { value: 0, gross: 0, materials: 0, net: 0, remaining: 0 });
  return {
    title: "تقرير العقود والوارد",
    filters,
    kpis: [
      { label: "القيمة التعاقدية", value: money(totals.value), tone: "blue" },
      { label: "تم الصرف", value: money(totals.gross), tone: "violet" },
      { label: "الخامات", value: money(totals.materials), tone: "amber" },
      { label: "الوارد", value: money(totals.net), tone: "emerald" },
      { label: "المتبقي من القيمة التعاقدية", value: money(totals.remaining), tone: "rose" },
    ],
    tables: [{
      columns: columns(["اسم العقد", 3], ["رقم العقد", 2], ["المشروع", 2], ["الجهة المالكة", 2], ["قيمة العقد", 2], ["موقف المستخلصات", 2], ["إجمالي الوارد", 2], ["الخامات", 2], ["المتبقي", 2], ["نسبة الصرف", 1]),
      rows: contracts.map((contract) => {
        const f = financials(contract);
        const latest = contract.statements.at(-1);
        return [contract.name, contract.number, contract.project.name, contract.project.company.name, money(f.value), latest ? `${statementLabel(latest)} · ${money(latest.grossCents)} · ${stageName(latest.stage)}` : "لا يوجد جاري", money(f.net), money(f.materials), money(f.remaining), percentage(f.gross, f.value)];
      }),
      footer: [`${contracts.length} عقد`, "", "", "", money(totals.value), "", money(totals.net), money(totals.materials), money(totals.remaining), ""],
    }],
  };
}

function memoDetails(memo: Contract["memos"][number]) {
  try {
    const parsed = JSON.parse(memo.reason) as { type?: string; increase?: number; decrease?: number; cancelled?: number };
    if (parsed.type === "FINAL_ADJUSTMENT") {
      return [
        ["رفع", parsed.increase || 0],
        ["خفض", parsed.decrease || 0],
        ["ملغى", parsed.cancelled || 0],
      ] as [string, number][];
    }
  } catch { /* Older memos contain plain descriptions. */ }
  return [[memo.kind === "INCREASE" ? "رفع" : "خفض", memo.amountCents]] as [string, number][];
}

export function singleIncomingReport(contract: Contract): Report {
  const f = financials(contract);
  const statements = [...contract.statements].sort((a, b) => a.sequence - b.sequence);
  const materialRows = statements.flatMap((statement) => statement.materials.flatMap((material) =>
    material.items.length
      ? material.items.map((item) => [statementLabel(statement), material.number || "—", item.name, `${item.quantity} ${item.unit}`, money(item.unitPriceCents), money(item.totalCents)])
      : [[statementLabel(statement), material.number || "—", "إجمالي الشهادة", "—", "—", money(material.totalCents)]]));
  const materialCertificates = statements.flatMap((statement) => statement.materials.map((material) => [statementLabel(statement), material.number || "—", String(material.items.length), money(material.totalCents)]));
  const memoRows = contract.memos.flatMap((memo, index) => memoDetails(memo).map(([kind, amount]) => [String(index + 1), kind, money(amount), memo.kind === "INCREASE" ? "زيادة" : "نقصان"]));
  return {
    title: `تفاصيل العقد: ${contract.name}`,
    contractOverview: {
      name: contract.name,
      number: contract.number,
      project: contract.project.name,
      owner: contract.project.company.name,
      estimate: contract.estimateCents == null ? undefined : money(contract.estimateCents),
      estimateReference: contract.estimateReference || undefined,
      original: money(contract.originalCents),
      adjustment: money(f.value - contract.originalCents),
      current: money(f.value),
      latestGross: money(f.latestGross),
      remaining: money(f.remaining),
      paidPercent: percentage(f.gross, f.value),
    },
    kpis: [
      { label: "قيمة العقد الحالية", value: money(f.value), tone: "blue" },
      { label: "تم الصرف", value: money(f.gross), tone: "violet" },
      { label: "الخامات", value: money(f.materials), tone: "amber" },
      { label: "الوارد", value: money(f.net), tone: "emerald" },
      { label: "المتبقي", value: money(f.remaining), tone: "rose" },
    ],
    tables: [
      { title: "المستخلصات ومراحل الصرف", columns: columns(["المستخلص", 2], ["النوع", 1], ["الإجمالي التراكمي", 2], ["المرحلة", 2], ["خامات المستخلص", 2], ["تاريخ الصرف", 2]), rows: statements.map((statement) => [statementLabel(statement), statement.kind === "FINAL" ? "ختامي" : "جاري", money(statement.grossCents), stageName(statement.stage), money(statement.materials.reduce((sum, material) => sum + material.totalCents, 0)), statement.paidAt?.slice(0, 10) || "—"]) },
      { title: "شهادات الخامات", columns: columns(["المستخلص", 2], ["رقم الشهادة", 2], ["عدد البنود", 1], ["قيمة الشهادة", 2]), rows: materialCertificates },
      { title: "شهادات الخامات وبنودها", columns: columns(["المستخلص", 2], ["رقم الشهادة", 2], ["البند", 3], ["الكمية", 2], ["سعر الوحدة", 2], ["الإجمالي", 2]), rows: materialRows },
      { title: "مذكرات الرفع والخفض وملخص الختامي", columns: columns(["المذكرة", 1], ["البند", 2], ["القيمة", 2], ["الأثر على العقد", 2]), rows: memoRows, footer: contract.memos.length ? ["صافي التعديل", "", money(f.value - contract.originalCents), ""] : undefined },
    ],
  };
}
