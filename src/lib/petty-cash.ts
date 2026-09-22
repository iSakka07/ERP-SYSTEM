export const PETTY_TYPES = ["OPENING_BALANCE", "FUNDING", "DIRECT_EXPENSE", "CUSTODY_ISSUE", "CUSTODY_EXPENSE", "CUSTODY_RETURN"] as const;
export type PettyType = (typeof PETTY_TYPES)[number];
export const expenseTypes = new Set<string>(["DIRECT_EXPENSE", "CUSTODY_EXPENSE"]);
export const pettyLabels: Record<string, string> = { OPENING_BALANCE: "رصيد افتتاحي", FUNDING: "تمويل من المدير التنفيذي", DIRECT_EXPENSE: "مصروف مباشر", CUSTODY_ISSUE: "تسليم عهدة", CUSTODY_EXPENSE: "مصروف عهدة", CUSTODY_RETURN: "رد عهدة", PURCHASE_PAYMENT: "سداد فاتورة مشتريات", ADJUSTMENT_IN: "تسوية زيادة الجرد", ADJUSTMENT_OUT: "تسوية عجز الجرد" };
export function cents(value: unknown, allowZero = false) {
  const raw = String(value ?? "").replace(/,/g, "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) throw new Error("أدخل مبلغًا صحيحًا بحد أقصى منزلتين عشريتين.");
  const result = Math.round(Number(raw) * 100);
  if (!Number.isSafeInteger(result) || result < (allowZero ? 0 : 1) || result > 1e12) throw new Error("راجع القيمة المالية.");
  return result;
}
export type CashMovement = { status: string; amountCents: number; sourceAccountId: string | null; destinationAccountId: string | null };
export function balanceForAccount(transactions: CashMovement[], accountId: string) {
  return transactions.filter(t => t.status === "POSTED").reduce((sum,t) => sum + (t.destinationAccountId === accountId ? t.amountCents : 0) - (t.sourceAccountId === accountId ? t.amountCents : 0), 0);
}
export function assertBalances(transactions: CashMovement[]) {
  const ids = new Set(transactions.flatMap(t => [t.sourceAccountId, t.destinationAccountId]).filter((id): id is string => !!id));
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
