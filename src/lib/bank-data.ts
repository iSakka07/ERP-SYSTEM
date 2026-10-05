import "server-only";

import { prisma } from "@/lib/prisma";
import { bankBalance } from "@/lib/bank";
import { centsNumber } from "@/lib/money";

export type BankData = {
  account: { name: string } | null;
  balanceCents: number;
  canManage: boolean;
  projects: { id: string; name: string }[];
  transactions: {
    id: string; type: string; amountCents: number; transactionDate: string;
    project: { name: string } | null; categoryKey: string | null;
    description: string; reference: string | null; status: string;
    sourceType: string | null; reversalReason: string | null;
    actor: { name: string };
    attachments: { id: string; name: string; label: string }[];
  }[];
};

export async function getBankData(canManage: boolean): Promise<BankData> {
  const [account, transactions, projects] = await Promise.all([
    prisma.bankAccount.findFirst({
      where: { active: true },
      select: { name: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.bankTransaction.findMany({
      include: {
        project: { select: { name: true } },
        actor: { select: { name: true } },
        attachments: { select: { id: true, name: true, label: true } },
      },
      orderBy: [{ transactionDate: "asc" }, { createdAt: "asc" }],
    }),
    prisma.project.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return {
    account,
    balanceCents: bankBalance(transactions),
    canManage,
    projects,
    transactions: transactions.map((transaction) => ({
      id: transaction.id,
      type: transaction.type,
      amountCents: centsNumber(transaction.amountCents),
      transactionDate: transaction.transactionDate.toISOString(),
      project: transaction.project,
      categoryKey: transaction.categoryKey,
      description: transaction.description,
      reference: transaction.reference,
      status: transaction.status,
      sourceType: transaction.sourceType,
      reversalReason: transaction.reversalReason,
      actor: transaction.actor,
      attachments: transaction.attachments,
    })),
  };
}
