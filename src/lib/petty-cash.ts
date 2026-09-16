export const PETTY_TYPES = ["OPENING_BALANCE", "FUNDING", "DIRECT_EXPENSE", "CUSTODY_ISSUE", "CUSTODY_EXPENSE", "CUSTODY_RETURN"] as const;
export type PettyType = (typeof PETTY_TYPES)[number];
export const expenseTypes = new Set<PettyType>(["DIRECT_EXPENSE", "CUSTODY_EXPENSE"]);

export function cents(value: unknown) {
  const n = typeof value === "number" ? value : Number(String(value ?? "").replace(/,/g, ""));
  if (!Number.isFinite(n) || n <= 0) throw new Error("القيمة يجب أن تكون أكبر من صفر.");
  return Math.round(n * 100) / 100;
}

export function balanceForAccount(transactions: Array<{ status: string; amountCents: number; sourceAccountId: string | null; destinationAccountId: string | null }>, accountId: string) {
  return transactions.filter((t) => t.status !== "REVERSED").reduce((sum, t) => sum + (t.destinationAccountId === accountId ? t.amountCents : 0) - (t.sourceAccountId === accountId ? t.amountCents : 0), 0);
}

export function validatePettyInput(input: { type: string; amount: unknown; projectId?: string | null; allocation?: string; sourceAccountId?: string | null; destinationAccountId?: string | null; description?: string; documentNumber?: string | null; hasAttachment?: boolean; requiresDocument?: boolean; requiresAttachment?: boolean }) {
  if (!PETTY_TYPES.includes(input.type as PettyType)) throw new Error("نوع الحركة غير صحيح.");
  const amount = cents(input.amount);
  if (!input.description?.trim()) throw new Error("البيان مطلوب.");
  const type = input.type as PettyType;
  if (expenseTypes.has(type) && !input.projectId && input.allocation !== "GENERAL") throw new Error("المصروف الفعلي يحتاج مشروعًا أو اختر عام الشركة.");
  if (type === "FUNDING" && input.sourceAccountId) throw new Error("تمويل الخزنة مصدره المدير التنفيذي وليس خزنة أخرى.");
  if (type === "CUSTODY_ISSUE" && !input.destinationAccountId) throw new Error("اختر عهدة الموظف.");
  if ((type === "CUSTODY_RETURN" || type === "CUSTODY_EXPENSE") && !input.sourceAccountId) throw new Error("اختر العهدة.");
  if (input.requiresDocument && !input.documentNumber?.trim()) throw new Error("رقم المستند مطلوب لهذا التصنيف.");
  if ((input.requiresAttachment ?? true) && !input.hasAttachment) throw new Error("المرفق/الإثبات مطلوب لكل حركة مالية.");
  return amount;
}

export function isProjectCost(type: string) { return type === "DIRECT_EXPENSE" || type === "CUSTODY_EXPENSE"; }
