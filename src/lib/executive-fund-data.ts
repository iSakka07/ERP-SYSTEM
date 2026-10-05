import "server-only";

import { prisma } from "@/lib/prisma";
import { balanceForAccount } from "@/lib/petty-cash";
import { centsNumber } from "@/lib/money";

export type ExecutiveFundData = Awaited<ReturnType<typeof getExecutiveFundData>>;

export async function getExecutiveFundData(canManage: boolean) {
  const [account, main, categories, transactions, projects] = await Promise.all([
    prisma.pettyCashAccount.findFirst({ where: { type: "EXECUTIVE", active: true } }),
    prisma.pettyCashAccount.findFirst({ where: { type: "MAIN", active: true } }),
    prisma.pettyCashCategory.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.pettyCashTransaction.findMany({
      where: {
        OR: [
          { sourceAccount: { type: "EXECUTIVE" } },
          { destinationAccount: { type: "EXECUTIVE" } },
        ],
      },
      include: {
        project: { select: { name: true } },
        category: { select: { name: true } },
        recordedBy: { select: { name: true } },
        attachments: { select: { id: true, name: true, label: true } },
      },
      orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }],
    }),
    prisma.project.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const allMovements = account
    ? await prisma.pettyCashTransaction.findMany({
        where: { OR: [{ sourceAccountId: account.id }, { destinationAccountId: account.id }] },
        select: { status: true, amountCents: true, sourceAccountId: true, destinationAccountId: true },
      })
    : [];
  const posted = transactions.filter((transaction) => transaction.status === "POSTED");

  return {
    account: account ? { id: account.id, name: account.name, balanceCents: balanceForAccount(allMovements, account.id) } : null,
    main: main ? { id: main.id, name: main.name } : null,
    totals: {
      receivedCents: posted.filter((item) => item.type === "EXECUTIVE_ISSUE").reduce((sum, item) => sum + centsNumber(item.amountCents), 0),
      expenseCents: posted.filter((item) => item.type === "EXECUTIVE_EXPENSE").reduce((sum, item) => sum + centsNumber(item.amountCents), 0),
      returnedCents: posted.filter((item) => item.type === "EXECUTIVE_RETURN").reduce((sum, item) => sum + centsNumber(item.amountCents), 0),
    },
    transactions: transactions.map((item) => ({
      id: item.id,
      number: item.number,
      type: item.type,
      status: item.status,
      amountCents: centsNumber(item.amountCents),
      transactionDate: item.transactionDate.toISOString(),
      description: item.description,
      documentNumber: item.documentNumber,
      projectId: item.projectId,
      sourceAccountId: item.sourceAccountId,
      destinationAccountId: item.destinationAccountId,
      project: item.project,
      category: item.category,
      recordedBy: item.recordedBy,
      attachments: item.attachments,
    })),
    categories: categories.map((item) => ({ id: item.id, name: item.name, requiresAttachment: item.requiresAttachment, requiresDocument: item.requiresDocument })),
    projects,
    canManage,
  };
}
