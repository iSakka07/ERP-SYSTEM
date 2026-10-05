import { centsNumber, type CentsValue } from "./money.ts";

export const PETTY_TYPES = ["OPENING_BALANCE", "FUNDING", "DIRECT_EXPENSE", "CUSTODY_ISSUE", "CUSTODY_EXPENSE", "CUSTODY_RETURN"] as const;
export type PettyType = (typeof PETTY_TYPES)[number];
export const expenseTypes = new Set<string>(["DIRECT_EXPENSE", "CUSTODY_EXPENSE"]);
export const pettyLabels: Record<string, string> = { OPENING_BALANCE: "رصيد افتتاحي", FUNDING: "تمويل من المدير التنفيذي", DIRECT_EXPENSE: "مصروف مباشر", CUSTODY_ISSUE: "تسليم عهدة", CUSTODY_EXPENSE: "مصروف عهدة", CUSTODY_RETURN: "رد عهدة", EMPLOYEE_ADVANCE_PAYMENT: "صرف سلفة موظف", PURCHASE_PAYMENT: "سداد فاتورة مشتريات", SETTLEMENT_PAYMENT: "سداد وتسوية مالية", ADJUSTMENT_IN: "تسوية زيادة الجرد", ADJUSTMENT_OUT: "تسوية عجز الجرد" };

export type PettyCashClassificationInput = {
  type: string;
  category?: { name: string } | null;
  linkedEntityType?: string | null;
  documentNumber?: string | null;
  description?: string | null;
};

const sourceLabels: Record<string, string> = {
  SUBCONTRACT_PAYMENT: "مستحقات مقاول باطن",
  PURCHASE_PAYMENT: "مشتريات",
  PURCHASE_EMPLOYEE_CUSTODY: "مشتريات",
  PAYROLL_PAYMENT: "رواتب",
  EMPLOYEE_ADVANCE: "سلف موظفين",
};

/** A business-source label for every ledger row, including legacy rows that
 * predate the specific linkedEntityType values. */
export function pettyCashClassification(input: PettyCashClassificationInput) {
  if (input.category?.name) return input.category.name;
  if (input.linkedEntityType && sourceLabels[input.linkedEntityType])
    return sourceLabels[input.linkedEntityType];

  const documentNumber = input.documentNumber || "";
  const description = input.description || "";
  if (documentNumber.startsWith("SUB-") || description.includes("مقاول باطن"))
    return sourceLabels.SUBCONTRACT_PAYMENT;
  if (
    documentNumber.startsWith("PAYROLL-") ||
    description.includes("كشف رواتب")
  )
    return sourceLabels.PAYROLL_PAYMENT;
  if (
    documentNumber.startsWith("PAY-") ||
    description.includes("فاتورة مشتريات") ||
    description.includes("دفعة مورد")
  )
    return sourceLabels.PURCHASE_PAYMENT;
  if (
    input.type === "EMPLOYEE_ADVANCE_PAYMENT" ||
    documentNumber.startsWith("SALADV-")
  )
    return sourceLabels.EMPLOYEE_ADVANCE;

  return pettyLabels[input.type] || "حركة صندوق";
}
export function cents(value: unknown, allowZero = false) {
  const raw = String(value ?? "").replace(/,/g, "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) throw new Error("أدخل مبلغًا صحيحًا بحد أقصى منزلتين عشريتين.");
  const result = Math.round(Number(raw) * 100);
  if (!Number.isSafeInteger(result) || result < (allowZero ? 0 : 1) || result > 1e12) throw new Error("راجع القيمة المالية.");
  return result;
}
export type CashMovement = { status: string; amountCents: CentsValue; sourceAccountId: string | null; destinationAccountId: string | null };
export function balanceForAccount(transactions: CashMovement[], accountId: string) {
  return transactions.filter(t => t.status === "POSTED").reduce((sum,t) => sum + (t.destinationAccountId === accountId ? centsNumber(t.amountCents) : 0) - (t.sourceAccountId === accountId ? centsNumber(t.amountCents) : 0), 0);
}
export function assertBalances(transactions: CashMovement[]) {
  const ids = new Set(transactions.flatMap(t => [t.sourceAccountId, t.destinationAccountId]).filter((id): id is string => !!id));
  for (const id of ids) if (balanceForAccount(transactions, id) < 0) throw new Error("الحركة تؤدي إلى رصيد سالب في الخزنة أو العهدة.");
}
export function assertAffectedBalances(transactions: CashMovement[], changedMovements: CashMovement | CashMovement[]) {
  const changed = Array.isArray(changedMovements) ? changedMovements : [changedMovements];
  const ids = new Set(changed.flatMap(t => [t.sourceAccountId, t.destinationAccountId]).filter((id): id is string => !!id));
  for (const id of ids) if (balanceForAccount(transactions, id) < 0) throw new Error("الحركة تؤدي إلى رصيد سالب في الخزنة أو العهدة.");
}
export function isProjectCost(type: string) { return expenseTypes.has(type); }
export function validatePettyInput(input: { type: string; amount: unknown; projectId?: string | null; allocation?: string; sourceAccountId?: string | null; description?: string; hasAttachment?: boolean; requiresAttachment?: boolean }) {
  if (!PETTY_TYPES.includes(input.type as PettyType)) throw new Error("نوع الحركة غير صحيح.");
  const amount = cents(input.amount);
  if (!input.description?.trim()) throw new Error("البيان مطلوب.");
  if (expenseTypes.has(input.type) && !input.projectId && input.allocation !== "GENERAL") throw new Error("اختر مشروعًا أو عام الشركة.");
  if ((input.requiresAttachment ?? true) && !input.hasAttachment) throw new Error("المرفق مطلوب.");
  return amount;
}
