import { z } from "zod";
const text = z.string().trim().min(1).max(1000);
export const withdrawalSchema = z.object({
  action: z.literal("withdrawal"),
  sourceAccountId: text,
  sourceStatementId: text,
  itemKey: text,
  kind: z.enum(["FULL", "PARTIAL"]),
  quantity: z.number().finite().positive().max(1e9).optional(),
  withdrawnScope: text,
  retainedScope: text.optional(),
  reason: text,
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  destinationCompanyId: text.optional(),
});
export const withdrawalStageSchema = z.object({
  action: z.literal("withdrawalStage"),
  id: text,
  revision: z.number().int().positive(),
  stage: z.enum(["TECHNICAL", "SITE", "EXECUTIVE", "CANCELLED"]),
  reason: text.optional(),
});
export const withdrawalAssignSchema = z.object({
  action: z.literal("withdrawalAssign"),
  id: text,
  revision: z.number().int().positive(),
  companyId: text,
  reason: text,
});
export type WorkWithdrawal = {
  id: string;
  sourceAccountId: string;
  sourceStatementId: string;
  destinationAccountId: string | null;
  destinationCompanyId: string | null;
  itemKey: string;
  itemName: string;
  unit: string;
  itemKeysJson: string;
  kind: string;
  quantity: number | null;
  withdrawnScope: string;
  retainedScope: string | null;
  retainedItemKey: string | null;
  effectiveDate: string;
  reason: string;
  stage: string;
  revision: number;
};
export function withdrawnKeys(changes: WorkWithdrawal[]) {
  return new Set<string>(
    changes
      .filter((c) => c.stage === "EXECUTIVE")
      .flatMap((c) => JSON.parse(c.itemKeysJson) as string[]),
  );
}
