import type { PreviousItem, DeductionInput } from "./expenses";
import type { WorkWithdrawal } from "./work-withdrawals";
export type ExpenseStatement = {
  id: string;
  accountId: string;
  sequence: number;
  kind: string;
  stage: string;
  revision: number;
  statementDate: string;
  notes: string | null;
  grossCents: number;
  deductionCents: number;
  netCents: number;
  previousGrossCents: number;
  correctionDebtCents: number;
  items: PreviousItem[];
  deductions: (DeductionInput & { amountCents: number })[];
  payments: {
    id: string;
    amountCents: number;
    paymentDate: string;
    method: string;
    reference: string;
    notes: string | null;
  }[];
  approvals: {
    id: string;
    fromStage: string;
    toStage: string;
    actorName: string;
    createdAt: string;
    reason: string | null;
  }[];
};
export type ExpenseAccount = {
  id: string;
  name: string;
  companyId: string;
  projectId: string;
  scope: string;
  notes: string | null;
  company: { name: string };
  project: { name: string; sector: { name: string } | null };
  statements: ExpenseStatement[];
  withdrawals: WorkWithdrawal[];
  assignments: WorkWithdrawal[];
};
export type ExpenseAttachmentInfo = {
  id: string;
  entityType: string;
  entityId: string;
  name: string;
};
