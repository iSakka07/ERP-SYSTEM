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
export type ExpenseItemInput = {
  itemKey: string;
  name: string;
  unit: string;
  currentQuantity: number;
  price: number;
  entitlementPercent: number;
};
export type ExpenseItem = ExpenseItemInput & {
  previousQuantity: number;
  unitPriceCents: number;
  previousValueCents: number;
  totalCents: number;
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
};
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
  if (keys.size !== input.length || previous.some((i) => !keys.has(i.itemKey)))
    throw new Error("لا يمكن تكرار أو حذف بند سابق؛ اترك كمية الحالي صفرًا.");
  const items = input.map((i, position) => {
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
    const previousQuantity = old
      ? Math.round((old.previousQuantity + old.currentQuantity) * 1e6) / 1e6
      : 0;
    const quantity =
      Math.round((previousQuantity + i.currentQuantity) * 1e6) / 1e6;
    const totalCents = safeCents(
      Math.round((quantity * unitPriceCents * i.entitlementPercent) / 100),
    );
    if (
      old &&
      (i.entitlementPercent < old.entitlementPercent ||
        totalCents < old.totalCents)
    )
      throw new Error(
        "تخفيض الاستحقاق أو قيمة بند سابق يحتاج تصحيحًا موثقًا في المرحلة التالية.",
      );
    return {
      ...i,
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
  if (grossCents <= 0)
    throw new Error("إجمالي الأعمال يجب أن يكون أكبر من صفر.");
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
  return {
    grossCents,
    netCents,
    paidCents,
    remainingCents: Math.max(0, netCents - paidCents),
    advanceCents: Math.max(0, paidCents - netCents),
    latest,
  };
}
