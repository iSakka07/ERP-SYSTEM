export const expenseStages = [
  ["DRAFT", "مسودة"],
  ["TECHNICAL", "اعتماد المكتب الفني"],
  ["SITE", "اعتماد مهندس الموقع"],
  ["EXECUTIVE", "اعتماد المدير التنفيذي"],
  ["ACCOUNTING", "الحسابات"],
] as const;
export const approvalPermissions: Record<string, string> = {
  TECHNICAL: "expenses.approve_technical",
  SITE: "expenses.approve_site",
  EXECUTIVE: "expenses.approve_executive",
  ACCOUNTING: "expenses.pay",
};
export function newExpenseStatementBlockReason(last?: {
  stage: string;
  kind: string;
}) {
  if (!last) return "";
  if (!["EXECUTIVE", "ACCOUNTING"].includes(last.stage))
    return "اعتمد الجاري السابق من المدير التنفيذي أولًا.";
  if (last.kind === "FINAL")
    return "المقاولة لها مستخلص ختامي؛ لا يمكن إضافة جاري جديد.";
  return "";
}
export type ExpenseItemInput = {
  itemKey: string;
  name: string;
  unit: string;
  currentQuantity: number;
  price: number;
  entitlementPercent: number;
  sourceItemKey?: string | null;
  priceChangeReason?: string | null;
  correctionQuantity?: number;
  correctionReason?: string | null;
};
export type ExpenseItem = ExpenseItemInput & {
  previousQuantity: number;
  unitPriceCents: number;
  previousValueCents: number;
  totalCents: number;
  sourceItemKey?: string | null;
  priceChangeReason?: string | null;
  position: number;
};
export type PreviousItem = {
  itemKey: string;
  name: string;
  unit: string;
  currentQuantity: number;
  previousQuantity: number;
  entitlementPercent: number;
  unitPriceCents: number;
  totalCents: number;
  sourceItemKey?: string | null;
  priceChangeReason?: string | null;
  correctionQuantity?: number;
  correctionReason?: string | null;
};
export function expenseCumulativeQuantity(item: {
  previousQuantity: number;
  currentQuantity: number;
  correctionQuantity?: number;
}) {
  return (
    Math.round(
      (item.previousQuantity +
        item.currentQuantity -
        (item.correctionQuantity ?? 0)) *
        1e6,
    ) / 1e6
  );
}
export type DeductionInput = {
  name: string;
  kind: "PERCENT" | "FIXED";
  value: number;
};
export function safeCents(value: number) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 1e12)
    throw new Error("القيمة المالية خارج النطاق المسموح.");
  return value;
}
export function calculateExpense(
  input: ExpenseItemInput[],
  deductions: DeductionInput[],
  previous: PreviousItem[] = [],
) {
  if (!input.length || input.length > 200 || deductions.length > 30)
    throw new Error("راجع عدد البنود والخصومات.");
  const keys = new Set(input.map((i) => i.itemKey));
  if (keys.size !== input.length)
    throw new Error("لا يمكن تكرار البند داخل المستخلص.");
  const carriedPrevious = previous
    .filter((item) => !keys.has(item.itemKey))
    .map((item) => ({
      itemKey: item.itemKey,
      name: item.name,
      unit: item.unit,
      currentQuantity: 0,
      price: item.unitPriceCents / 100,
      entitlementPercent: item.entitlementPercent,
      sourceItemKey: item.sourceItemKey ?? null,
      priceChangeReason: item.priceChangeReason ?? null,
      correctionQuantity: 0,
      correctionReason: null,
    }));
  const allInput = [...input, ...carriedPrevious];
  const allKeys = new Set(allInput.map((i) => i.itemKey));
  if (allKeys.size !== allInput.length)
    throw new Error("لا يمكن تكرار البند داخل المستخلص.");
  const items = allInput.map((i, position) => {
    if (
      !i.name.trim() ||
      !i.unit.trim() ||
      !i.itemKey ||
      !Number.isFinite(i.currentQuantity) ||
      i.currentQuantity < 0 ||
      i.currentQuantity > 1e9 ||
      !Number.isFinite(i.price) ||
      i.price <= 0 ||
      !Number.isFinite(i.entitlementPercent) ||
      i.entitlementPercent < 0 ||
      i.entitlementPercent > 100
    )
      throw new Error("راجع الاسم والوحدة والكمية والسعر ونسبة الاستحقاق.");
    const old = previous.find((p) => p.itemKey === i.itemKey);
    const correctionQuantity = i.correctionQuantity ?? 0;
    const previousQuantity = old ? expenseCumulativeQuantity(old) : 0;
    if (
      !Number.isFinite(correctionQuantity) ||
      correctionQuantity < 0 ||
      correctionQuantity > previousQuantity ||
      (correctionQuantity > 0 &&
        (!old ||
          !i.correctionReason?.trim() ||
          Math.round(correctionQuantity * 1e6) === 0)) ||
      (i.correctionReason?.length ?? 0) > 1000
    )
      throw new Error(
        "تصحيح الكمية يحتاج بندًا سابقًا وسببًا، ولا يتجاوز الكمية السابقة. الدقة حتى 6 منازل عشرية.",
      );
    if (
      old &&
      i.currentQuantity > 0 &&
      previous.some((p) => p.sourceItemKey === old.itemKey)
    )
      throw new Error(
        "الكميات الجديدة تسجل على آخر إصدار سعر فقط؛ إصدار السعر السابق محفوظ دون كميات جديدة.",
      );
    if (!old && i.sourceItemKey) {
      const source = previous.find((p) => p.itemKey === i.sourceItemKey);
      const sourceInput = allInput.find((p) => p.itemKey === i.sourceItemKey);
      if (previous.some((p) => p.sourceItemKey === i.sourceItemKey))
        throw new Error("اختر آخر إصدار سعر للبند، وليس إصدارًا أقدم.");
      if (
        !source ||
        !sourceInput ||
        sourceInput.currentQuantity !== 0 ||
        source.name !== i.name.trim() ||
        source.unit !== i.unit.trim() ||
        i.currentQuantity <= 0 ||
        source.unitPriceCents === Math.round(i.price * 100) ||
        !i.priceChangeReason?.trim()
      )
        throw new Error(
          "إصدار السعر الجديد يحتاج بندًا سابقًا ثابتًا، وكمية جديدة، وسعرًا مختلفًا وسببًا؛ كمية الحالي بسطر السعر القديم يجب أن تكون صفرًا.",
        );
      if (
        allInput.filter(
          (p) =>
            !previous.some((old) => old.itemKey === p.itemKey) &&
            p.sourceItemKey === i.sourceItemKey,
        ).length > 1
      )
        throw new Error("يسمح بإصدار سعر جديد واحد لكل بند في الجاري.");
    } else if (!old && i.priceChangeReason)
      throw new Error("سبب تغيير السعر يجب ربطه ببند سابق.");
    const unitPriceCents = safeCents(Math.round(i.price * 100));
    if (
      old &&
      (old.name !== i.name.trim() ||
        old.unit !== i.unit.trim() ||
        old.unitPriceCents !== unitPriceCents)
    )
      throw new Error(
        "اسم ووحدة وسعر البند السابق ثابتة؛ تعديلها له دورة مستقلة لاحقًا.",
      );
    const quantity = expenseCumulativeQuantity({
      previousQuantity,
      currentQuantity: i.currentQuantity,
      correctionQuantity,
    });
    const totalCents = safeCents(
      Math.round((quantity * unitPriceCents * i.entitlementPercent) / 100),
    );
    if (
      old &&
      (i.entitlementPercent < old.entitlementPercent ||
        (totalCents < old.totalCents && correctionQuantity === 0))
    )
      throw new Error(
        "نسبة الاستحقاق السابقة لا تخفض؛ تخفيض الكمية يتم بتصحيح موثق في خانته المنفصلة.",
      );
    return {
      ...i,
      correctionQuantity: Math.round(correctionQuantity * 1e6) / 1e6,
      correctionReason:
        correctionQuantity > 0 ? i.correctionReason!.trim() : null,
      sourceItemKey: old
        ? (old.sourceItemKey ?? null)
        : (i.sourceItemKey ?? null),
      priceChangeReason: old
        ? (old.priceChangeReason ?? null)
        : (i.priceChangeReason?.trim() ?? null),
      name: i.name.trim(),
      unit: i.unit.trim(),
      previousQuantity,
      unitPriceCents,
      previousValueCents: old?.totalCents ?? 0,
      totalCents,
      position,
    };
  });
  const grossCents = safeCents(items.reduce((s, i) => s + i.totalCents, 0));
  if (grossCents === 0 && !items.some((i) => (i.correctionQuantity ?? 0) > 0))
    throw new Error(
      "إجمالي الأعمال يجب أن يكون أكبر من صفر، إلا عند تصحيح الحصر السابق بالكامل.",
    );
  const calculatedDeductions = deductions.map((d, position) => {
    if (
      !d.name.trim() ||
      !Number.isFinite(d.value) ||
      d.value < 0 ||
      (d.kind === "PERCENT" && d.value > 100) ||
      !["PERCENT", "FIXED"].includes(d.kind)
    )
      throw new Error("راجع بيانات الخصومات.");
    return {
      ...d,
      name: d.name.trim(),
      position,
      amountCents: safeCents(
        Math.round(
          d.kind === "PERCENT" ? (grossCents * d.value) / 100 : d.value * 100,
        ),
      ),
    };
  });
  const deductionCents = safeCents(
    calculatedDeductions.reduce((s, d) => s + d.amountCents, 0),
  );
  if (deductionCents > grossCents)
    throw new Error("الخصومات لا تتجاوز إجمالي الأعمال.");
  return {
    items,
    deductions: calculatedDeductions,
    grossCents,
    deductionCents,
    netCents: grossCents - deductionCents,
    previousGrossCents: previous.reduce((s, i) => s + i.totalCents, 0),
  };
}
export type ExpenseSummaryStatement = {
  id?: string;
  sequence: number;
  stage: string;
  grossCents: number;
  netCents: number;
  correctionDebtCents?: number;
  payments: { amountCents: number }[];
};
export function expenseSummary(statements: ExpenseSummaryStatement[]) {
  const latest = statements
    .filter((s) => ["EXECUTIVE", "ACCOUNTING"].includes(s.stage))
    .sort((a, b) => b.sequence - a.sequence)[0];
  const paidCents = statements.reduce(
    (s, st) => s + st.payments.reduce((v, p) => v + p.amountCents, 0),
    0,
  );
  const grossCents = latest?.grossCents ?? 0,
    netCents = latest?.netCents ?? 0;
  const excess = Math.max(0, paidCents - netCents);
  const debtCents = Math.min(excess, latest?.correctionDebtCents ?? 0);
  return {
    grossCents,
    netCents,
    paidCents,
    remainingCents: Math.max(0, netCents - paidCents),
    advanceCents: excess - debtCents,
    debtCents,
    latest,
  };
}

export function expensePayableCents(
  statements: ExpenseSummaryStatement[],
  targetId: string,
) {
  const target = statements.find((statement) => statement.id === targetId);
  if (!target || target.stage !== "ACCOUNTING") return 0;
  const paidCents = statements.reduce(
    (sum, statement) =>
      sum + statement.payments.reduce((value, payment) => value + payment.amountCents, 0),
    0,
  );
  return Math.max(0, target.netCents - paidCents);
}
export function correctionDebtAfterApproval(
  previous: {
    netCents: number;
    paidCents: number;
    debtCents: number;
  },
  netCents: number,
  hasCorrection: boolean,
) {
  const oldExcess = Math.max(0, previous.paidCents - previous.netCents);
  const newExcess = Math.max(0, previous.paidCents - netCents);
  const settledDebt = Math.max(
    0,
    previous.debtCents - Math.max(0, netCents - previous.netCents),
  );
  return safeCents(
    Math.min(
      newExcess,
      settledDebt + (hasCorrection ? Math.max(0, newExcess - oldExcess) : 0),
    ),
  );
}
