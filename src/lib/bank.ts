export const bankTypes = {
  OWNER_FUNDING: "تمويل من المالك",
  MANUAL_DEPOSIT: "إيداع / تسوية يدوية",
  MANUAL_EXPENSE: "مصروف بنكي",
  INCOMING_COLLECTION: "تحصيل وارد",
  OPENING_BALANCE: "رصيد افتتاحي",
} as const;

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

export function bankBalance(movements: { type: string; amountCents: number }[]) {
  return movements.reduce((balance, movement) => balance + (["OWNER_FUNDING", "MANUAL_DEPOSIT", "INCOMING_COLLECTION", "OPENING_BALANCE"].includes(movement.type) ? movement.amountCents : -movement.amountCents), 0);
}
