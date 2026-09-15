export const incomingStages = [
  ["COMPANY", "شركة"],
  ["BATTALION", "كتيبة"],
  ["BRIGADE", "لواء"],
  ["ADMINISTRATION", "إدارة"],
  ["CONSULTANT", "استشاري"],
  ["SUPPLY", "تموين"],
  ["FINANCE", "فرع مالي"],
  ["CENTRAL", "مركزية"],
  ["PAID", "تم الصرف"],
] as const;
export const grossNotice =
  "أدخل إجمالي المستخلص التراكمي قبل خصم الخامات. تُضاف الخامات في مربع منفصل، والنظام يحسب الصافي تلقائيًا. لا تخصم الخامات يدويًا من قيمة المستخلص.";
export const money = (cents: number) =>
  `${new Intl.NumberFormat("en-EG", { maximumFractionDigits: 2 }).format(cents / 100)} ج.م`;
export const statementLabel = (s: { kind: string; sequence: number }) =>
  s.kind === "FINAL" ? `ختامي (${s.sequence})` : `جاري ${s.sequence}`;
export function financials(c: {
  originalCents: number;
  memos: { kind: string; amountCents: number }[];
  statements: {
    sequence: number;
    grossCents: number;
    stage: string;
    materials: { totalCents: number }[];
  }[];
}) {
  const value =
    c.originalCents +
    c.memos.reduce(
      (sum, m) =>
        sum + (m.kind === "INCREASE" ? m.amountCents : -m.amountCents),
      0,
    );
  const ordered = [...c.statements].sort((a, b) => a.sequence - b.sequence);
  const lastPaid = ordered.filter((s) => s.stage === "PAID").at(-1);
  const gross = lastPaid?.grossCents ?? 0;
  const materials = ordered.reduce(
    (sum, s) => sum + s.materials.reduce((n, m) => n + m.totalCents, 0),
    0,
  );
  const effectiveMaterials = ordered
    .filter((s) => s.sequence <= (lastPaid?.sequence ?? 0))
    .reduce(
      (sum, s) => sum + s.materials.reduce((n, m) => n + m.totalCents, 0),
      0,
    );
  return {
    value,
    gross,
    materials,
    effectiveMaterials,
    net: gross - effectiveMaterials,
    remaining: value - gross,
    pct: value ? (gross / value) * 100 : 0,
    pending: Math.max(0, (ordered.at(-1)?.grossCents ?? 0) - gross),
  };
}
