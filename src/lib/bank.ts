import { centsNumber, type CentsValue } from "./money.ts";

const selectableBankTypes = {
  OWNER_FUNDING: "تمويل من المالك",
  MANUAL_DEPOSIT: "إيداع / تسوية يدوية",
  MANUAL_EXPENSE: "مصروف بنكي",
  INCOMING_COLLECTION: "تحصيل وارد",
  OPENING_BALANCE: "رصيد افتتاحي",
} as const;

export const bankTypes = Object.defineProperty(selectableBankTypes, "INCOMING_COLLECTION_REVERSAL", {
  value: "عكس تحصيل وارد",
  enumerable: false,
}) as typeof selectableBankTypes & { INCOMING_COLLECTION_REVERSAL: "عكس تحصيل وارد" };

export const bankCategories = {
  diesel: "سولار",
  workers_daily: "يوميات عمال",
  transport: "انتقالات",
  maintenance: "صيانة",
  hospitality: "ضيافة",
  tools: "أدوات ومهمات",
  project_admin: "إداريات مشروع",
  general: "مصروفات عمومية",
  other: "أخرى",
} as const;

export function bankBalance(movements: { type: string; amountCents: CentsValue; status?: string }[]) {
  return movements.filter((movement) => movement.status !== "REVERSED").reduce((balance, movement) => { const amount = centsNumber(movement.amountCents); return balance + (["OWNER_FUNDING", "MANUAL_DEPOSIT", "INCOMING_COLLECTION", "OPENING_BALANCE"].includes(movement.type) ? amount : -amount); }, 0);
}
