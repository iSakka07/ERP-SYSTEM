import "server-only";
import { prisma } from "@/lib/prisma";

export const money = (cents: number) => (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export async function accountingSnapshot() {
  const [accounts, entries, periods, goLive, projects] = await Promise.all([
    prisma.accountingAccount.findMany({ where: { active: true }, orderBy: { code: "asc" } }),
    prisma.journalEntry.findMany({ include: { lines: { include: { account: true } } }, orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }], take: 500 }),
    prisma.accountingPeriod.findMany({ orderBy: { month: "desc" }, take: 24 }),
    prisma.systemMetadata.findUnique({ where: { key: "accounting.goLiveDate" } }),
    prisma.project.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const balances = new Map(accounts.map((account) => [account.id, { debit: 0, credit: 0 }]));
  for (const entry of entries) for (const line of entry.lines) { const balance = balances.get(line.accountId); if (balance) { balance.debit += line.debitCents; balance.credit += line.creditCents; } }
  return { accounts, entries, periods, projects, goLiveDate: goLive?.value || null, trialBalance: accounts.map((account) => ({ account, ...(balances.get(account.id) || { debit: 0, credit: 0 }) })).filter((row) => row.debit || row.credit) };
}
