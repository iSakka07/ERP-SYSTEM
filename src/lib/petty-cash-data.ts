import "server-only";

import { prisma } from "@/lib/prisma";
import {
  balanceForAccount,
  employeeAdvanceDisplay,
  subcontractSettlementDisplay,
} from "@/lib/petty-cash";
import { centsNumber } from "@/lib/money";

export type PettyCashData = {
  accounts: { id: string; name: string; type: string; employeeId: string | null; balanceCents: number }[];
  categories: { id: string; name: string; active: boolean; requiresAttachment: boolean }[];
  transactions: {
    id: string; number: string; type: string; status: string; amountCents: number;
    projectId: string | null; sourceAccountId: string | null; destinationAccountId: string | null;
    transactionDate: string; createdAt: string; reversedAt: string | null;
    reversalReason: string | null; description: string; details: string | null; documentNumber: string | null;
    linkedEntityType: string | null; project: { name: string } | null;
    category: { name: string } | null; recordedBy: { name: string };
    attachments: { id: string; name: string; label: string }[];
  }[];
  projects: { id: string; name: string }[];
  employees: { id: string; name: string }[];
  canManage: boolean;
};

export async function getPettyCashData(canManage: boolean): Promise<PettyCashData> {
  const [accounts, categories, transactions, projects, employees] = await Promise.all([
    prisma.pettyCashAccount.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.pettyCashCategory.findMany({ orderBy: { name: "asc" } }),
    prisma.pettyCashTransaction.findMany({
      include: {
        project: { select: { name: true } },
        category: { select: { name: true } },
        recordedBy: { select: { name: true } },
        attachments: { select: { id: true, name: true, label: true } },
      },
      orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }],
    }),
    prisma.project.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.employee.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  // This lookup depends on transaction operation ids, so it correctly remains
  // after the independent queries instead of being forced into Promise.all.
  const subcontractOperationIds = transactions
    .filter((transaction) => transaction.documentNumber?.startsWith("SUB-") && transaction.operationId)
    .map((transaction) => transaction.operationId as string);
  const advanceOperationIds = transactions
    .filter((transaction) => transaction.documentNumber?.startsWith("SALADV-") && transaction.operationId)
    .map((transaction) => transaction.operationId as string);
  const [subcontractPayments, employeeAdvances] = await Promise.all([
    subcontractOperationIds.length
      ? prisma.subcontractPayment.findMany({
        where: { cashOperationId: { in: subcontractOperationIds } },
        include: {
          statement: {
            include: { account: { include: { company: { select: { name: true } } } } },
          },
        },
      })
      : [],
    advanceOperationIds.length
      ? prisma.employeeAdvance.findMany({
          where: { id: { in: advanceOperationIds } },
          include: { employee: { select: { name: true } } },
        })
      : [],
  ]);
  const paymentByOperation = new Map(
    subcontractPayments.map((payment) => [payment.cashOperationId, payment]),
  );
  const advanceByOperation = new Map(
    employeeAdvances.map((advance) => [advance.id, advance]),
  );

  return {
    accounts: accounts.map((account) => ({
      id: account.id,
      name: account.name,
      type: account.type,
      employeeId: account.employeeId,
      balanceCents: balanceForAccount(transactions, account.id),
    })),
    categories: categories.map((category) => ({
      id: category.id,
      name: category.name,
      active: category.active,
      requiresAttachment: category.requiresAttachment,
    })),
    transactions: transactions.map((transaction) => {
      const payment = transaction.operationId
        ? paymentByOperation.get(transaction.operationId)
        : undefined;
      const advance = transaction.operationId
        ? advanceByOperation.get(transaction.operationId)
        : undefined;
      const settlementDisplay = payment
        ? subcontractSettlementDisplay({
            sourceAccountId: transaction.sourceAccountId,
            contractorName: payment.statement.account.company.name,
            statementSequence: payment.statement.sequence,
          })
        : null;
      const advanceDisplay = advance
        ? employeeAdvanceDisplay({
            sourceAccountId: transaction.sourceAccountId,
            employeeName: advance.employee.name,
            advanceSource:
              advance.source === "PETTY_CASH"
                ? "PETTY_CASH"
                : "EXECUTIVE_DIRECTOR",
          })
        : null;
      const display = settlementDisplay ?? advanceDisplay;
      return {
        id: transaction.id,
        number: transaction.number,
        type: transaction.type,
        status: transaction.status,
        amountCents: centsNumber(transaction.amountCents),
        projectId: transaction.projectId,
        sourceAccountId: transaction.sourceAccountId,
        destinationAccountId: transaction.destinationAccountId,
        transactionDate: transaction.transactionDate.toISOString(),
        createdAt: transaction.createdAt.toISOString(),
        reversedAt: transaction.reversedAt?.toISOString() ?? null,
        reversalReason: transaction.reversalReason,
        description: display?.title ?? transaction.description,
        details: display?.details ?? null,
        documentNumber: transaction.documentNumber,
        linkedEntityType: transaction.linkedEntityType,
        project: transaction.project,
        category: transaction.category,
        recordedBy: transaction.recordedBy,
        attachments: transaction.attachments,
      };
    }),
    projects,
    employees,
    canManage,
  };
}
