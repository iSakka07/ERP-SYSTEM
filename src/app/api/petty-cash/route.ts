import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { incomingUser, readIncomingFiles } from "@/lib/incoming-server";
import { validatePettyInput, cents } from "@/lib/petty-cash";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status });
async function mainAccount() { return prisma.pettyCashAccount.findFirst({ where: { type: "MAIN", active: true } }); }
export async function GET() {
  const user = await incomingUser("pettycash.view"); if (!user) return json({ error: "غير مصرح" }, 403);
  const [accounts, categories, transactions, counts, projects, employees] = await Promise.all([
    prisma.pettyCashAccount.findMany({ where: { active: true }, include: { employee: true }, orderBy: { createdAt: "asc" } }),
    prisma.pettyCashCategory.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.pettyCashTransaction.findMany({ where: { status: "POSTED" }, include: { sourceAccount: true, destinationAccount: true, project: true, category: true, recordedBy: true, attachments: { select: { id: true, name: true } } }, orderBy: { transactionDate: "desc" }, take: 200 }),
    prisma.pettyCashCount.findMany({ orderBy: { countedAt: "desc" }, take: 30 }),
    prisma.project.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.employee.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);
  return json({ accounts, categories, transactions, counts, projects, employees, canManage: !!(await incomingUser("pettycash.manage")) });
}
export async function POST(req: Request) {
  const user = await incomingUser("pettycash.manage"); if (!user) return json({ error: "غير مصرح" }, 403);
  try {
    const form = await req.formData(); const action = String(form.get("action") ?? ""); const type = String(form.get("type") ?? "");
    if (action === "cash-count") {
      const accountId = String(form.get("accountId") ?? ""); const actualCents = cents(form.get("actual"));
      const account = await prisma.pettyCashAccount.findUnique({ where: { id: accountId } }); if (!account) throw new Error("الخزنة غير موجودة.");
      const movements = await prisma.pettyCashTransaction.findMany({ where: { status: "POSTED" }, select: { status: true, amountCents: true, sourceAccountId: true, destinationAccountId: true } });
      const expectedCents = movements.reduce((s,t)=>s+(t.destinationAccountId===accountId?t.amountCents:0)-(t.sourceAccountId===accountId?t.amountCents:0),0);
      const count = await prisma.pettyCashCount.create({ data: { accountId, expectedCents, actualCents, differenceCents: actualCents - expectedCents, countedAt: new Date(), notes: String(form.get("notes") ?? "") || null, actorId: user.id } });
      await prisma.auditLog.create({ data: { actorId: user.id, action: "pettycash.cash_count", target: count.id, details: JSON.stringify({ expectedCents, actualCents }) } }); return json({ ok: true, id: count.id });
    }
    if (action === "category") {
      const name = String(form.get("name") ?? "").trim(); if (!name) throw new Error("اسم التصنيف مطلوب."); const key = name.toLowerCase().replace(/[^a-z0-9]+/g,"_") || `category_${Date.now()}`;
      const category = await prisma.pettyCashCategory.create({ data: { key: `${key}_${Date.now()}`, name, requiresAttachment: true } }); return json({ ok: true, id: category.id });
    }
    if (action === "reverse") {
      const id = String(form.get("id") ?? ""); const reason = String(form.get("reason") ?? "").trim(); if (!reason) throw new Error("سبب العكس مطلوب."); const files = await readIncomingFiles(form, "files"); if (!files.length) throw new Error("مرفق إثبات العكس مطلوب.");
      const original = await prisma.pettyCashTransaction.findUnique({ where: { id } }); if (!original || original.status !== "POSTED") throw new Error("الحركة غير قابلة للعكس.");
      const reversed = await prisma.pettyCashTransaction.update({ where: { id }, data: { status: "REVERSED", reversedAt: new Date(), reversalReason: reason } }); await prisma.auditLog.create({ data: { actorId: user.id, action: "pettycash.reverse", target: id, details: JSON.stringify({ reason }) } }); return json({ ok: true, id: reversed.id });
    }
    const amount = cents(form.get("amount")); const projectId = String(form.get("projectId") ?? "") || null;
    const categoryId = String(form.get("categoryId") ?? "") || null; const description = String(form.get("description") ?? "");
    const documentNumber = String(form.get("documentNumber") ?? "") || null; const sourceAccountId = String(form.get("sourceAccountId") ?? "") || null; const employeeId = String(form.get("employeeId") ?? "") || null;
    const destinationAccountId = String(form.get("destinationAccountId") ?? "") || null;
    const category = categoryId ? await prisma.pettyCashCategory.findUnique({ where: { id: categoryId } }) : null;
    const files = await readIncomingFiles(form, "files");
    validatePettyInput({ type, amount, projectId, allocation: String(form.get("allocation") ?? ""), sourceAccountId, destinationAccountId: destinationAccountId || employeeId, description, documentNumber, hasAttachment: files.length > 0, requiresDocument: !!category?.requiresDocument, requiresAttachment: category?.requiresAttachment ?? true });
    const main = await mainAccount(); if (!main) throw new Error("لم يتم إعداد الخزنة الرئيسية.");
    let from = sourceAccountId, to = destinationAccountId;
    if (type === "FUNDING" || type === "OPENING_BALANCE") { from = null; to = main.id; }
    if (type === "DIRECT_EXPENSE") { from = main.id; to = null; }
    if (type === "CUSTODY_RETURN") { to = main.id; }
    if (type === "CUSTODY_ISSUE") { from = main.id; if (!to) { if (!employeeId) throw new Error("اختر الموظف."); const employee = await prisma.employee.findUnique({ where: { id: employeeId } }); const custody = await prisma.pettyCashAccount.create({ data: { name: `عهدة ${employee?.name ?? "موظف"} — ${new Date().toLocaleDateString("ar-EG")}`, type: "CUSTODY", employeeId } }); to = custody.id; } }
    const existing = await prisma.pettyCashTransaction.findMany({ where: { status: "POSTED" }, select: { amountCents: true, sourceAccountId: true, destinationAccountId: true, status: true } });
    if (from && from === main.id && ["DIRECT_EXPENSE", "CUSTODY_ISSUE"].includes(type) && existing.reduce((s, t) => s + (t.destinationAccountId === main.id ? t.amountCents : 0) - (t.sourceAccountId === main.id ? t.amountCents : 0), 0) < amount) throw new Error("لا يمكن الصرف أكبر من رصيد الخزنة.");
    if (from && type === "CUSTODY_EXPENSE" && existing.reduce((s, t) => s + (t.destinationAccountId === from ? t.amountCents : 0) - (t.sourceAccountId === from ? t.amountCents : 0), 0) < amount) throw new Error("المصروف أكبر من رصيد العهدة.");
    const tx = await prisma.pettyCashTransaction.create({ data: { number: `PC-${Date.now()}`, type, amountCents: amount, transactionDate: new Date(String(form.get("date") ?? new Date().toISOString())), sourceAccountId: from, destinationAccountId: to, projectId, categoryId, description, documentNumber, fundingSource: ["FUNDING", "OPENING_BALANCE"].includes(type) ? "EXECUTIVE_DIRECTOR" : null, recordedById: user.id, attachments: { create: files.map((f) => ({ ...f, actorId: user.id })) } } });
    await prisma.auditLog.create({ data: { actorId: user.id, action: `pettycash.${type.toLowerCase()}`, target: tx.id, details: JSON.stringify({ amount, projectId }) } });
    return json({ ok: true, id: tx.id });
  } catch (e) { return json({ error: e instanceof Error ? e.message : "تعذر حفظ الحركة" }, 400); }
}
