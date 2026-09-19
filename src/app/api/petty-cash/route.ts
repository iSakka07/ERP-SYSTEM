import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { incomingUser, readIncomingFiles } from "@/lib/incoming-server";
import { assertBalances, balanceForAccount, cents, isProjectCost, validatePettyInput } from "@/lib/petty-cash";
import { postPettyCashJournal, reversePostedJournal } from "@/lib/accounting-posting";
import { completeFinancialOperation, guardFinancialOperation, replayAfterConflict, type FinancialOperationContext } from "@/lib/financial-idempotency";
import { isTrustedMutationOrigin } from "@/lib/request-security";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status });
export async function GET() {
  if (!(await incomingUser("pettycash.view"))) return json({ error: "غير مصرح" }, 403);
  const [accounts, categories, transactions, counts, projects, employees, audit] = await Promise.all([
    prisma.pettyCashAccount.findMany({ include: { employee: { select: { name: true } } }, orderBy: { createdAt: "asc" } }),
    prisma.pettyCashCategory.findMany({ orderBy: { name: "asc" } }),
    prisma.pettyCashTransaction.findMany({ include: { project: { select: { name: true } }, category: { select: { name: true } }, recordedBy: { select: { name: true } }, attachments: { select: { id: true, name: true } } }, orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }] }),
    prisma.pettyCashCount.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.project.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.employee.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.auditLog.findMany({ where: { action: { startsWith: "pettycash." } }, orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  return json({ accounts: accounts.map(a => ({ ...a, balanceCents: balanceForAccount(transactions, a.id) })), categories, transactions, counts, projects, employees, audit, canManage: !!(await incomingUser("pettycash.manage")) });
}
export async function POST(req: Request) {
  const user = await incomingUser("pettycash.manage");
  if (!user) return json({ error: "غير مصرح" }, 403);
  if (!isTrustedMutationOrigin(req)) return json({ error: "مصدر الطلب غير موثوق." }, 403);
  if (Number(req.headers.get("content-length") || 0) > 11 * 1024 * 1024) return json({ error: "حجم الطلب كبير" }, 413);
  let operationContext: FinancialOperationContext | null = null;
  try {
    const form = await req.formData();
    const str = (key: string) => String(form.get(key) ?? "").trim();
    const action = str("action");
    const files = await readIncomingFiles(form);
    if (action !== "category") {
      const requestData = Object.fromEntries([...form.entries()].filter(([, value]) => typeof value === "string"));
      const guarded = await guardFinancialOperation(req, { actorId: user.id, operation: `pettycash.${action || "transaction"}`, requestData, businessData: requestData });
      if ("response" in guarded) return guarded.response;
      operationContext = guarded.context;
    }
    const date = () => { const raw = str("date"); if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(new Date(raw).getTime()) || new Date(raw).toISOString().slice(0,10) !== raw) throw new Error("التاريخ غير صحيح."); return new Date(raw); };
    const result = await prisma.$transaction(async tx => {
      // Acquire the SQLite write lock before reading balances (also serializes retries).
      await tx.systemMetadata.upsert({ where: { key: "pettycash-write-lock" }, create: { key: "pettycash-write-lock", value: randomUUID() }, update: { value: randomUUID() } });
      const audit = async (verb: string, target: string, details: unknown) => tx.auditLog.create({ data: { actorId: user.id, action: "pettycash." + verb, target, details: JSON.stringify(details) } });
      const finish = async (body: { id: string }, entityType: string, summary: Record<string, unknown>) => { if (operationContext) await completeFinancialOperation(tx, operationContext, { body: { ok: true, ...body }, entityType, entityId: body.id, summary }); return body; };
      if (action === "category") {
        const name = str("name"); if (!name || name.length > 150) throw new Error("اسم التصنيف مطلوب وبحد أقصى 150 حرفًا.");
        const data = { name, active: str("active") === "true", requiresDocument: str("requiresDocument") === "true", requiresAttachment: str("requiresAttachment") === "true" };
        const id = str("id");
        const category = id ? await tx.pettyCashCategory.update({ where: { id }, data }) : await tx.pettyCashCategory.create({ data: { ...data, key: randomUUID() } });
        await audit("category", category.id, data); return { id: category.id };
      }
      const movements = await tx.pettyCashTransaction.findMany();
      const accounts = await tx.pettyCashAccount.findMany();
      const main = accounts.find(a => a.type === "MAIN" && a.active);
      if (!main) throw new Error("لم يتم إعداد الصندوق.");
      if (action === "cash-count") {
        const accountId = str("accountId"); if (!accounts.some(a => a.id === accountId && a.active)) throw new Error("اختر صندوقًا أو عهدة صحيحة.");
        const expectedCents = balanceForAccount(movements, accountId), actualCents = cents(str("actual"), true);
        const count = await tx.pettyCashCount.create({ data: { accountId, expectedCents, actualCents, differenceCents: actualCents - expectedCents, countedAt: date(), notes: str("notes"), actorId: user.id } });
        await audit("cash_count", count.id, { expectedCents, actualCents }); return finish({ id: count.id }, "pettyCashCount", { expectedCents, actualCents, date: str("date") });
      }
      if (action === "reverse") {
        const id = str("id"), reason = str("reason");
        if (!reason || !files.length) throw new Error("سبب الإلغاء ومرفقه مطلوبان.");
        const original = movements.find(t => t.id === id && t.status === "POSTED"); if (!original) throw new Error("الحركة ملغاة بالفعل أو غير موجودة.");
        assertBalances(movements.filter(t => t.id !== id));
        // إلغاء حركة الصندوق لا يقتصر على إخفائها من الرصيد: يعكس القيد الأصلي
        // في نفس المعاملة حتى لا تبقى التكلفة أو التمويل ظاهرة في المحاسبة.
        await reversePostedJournal(tx, "PETTY_CASH", original.id, new Date(), user.id, reason);
        await tx.pettyCashTransaction.update({ where: { id }, data: { status: "REVERSED", reversedAt: new Date(), reversalReason: reason, attachments: { create: files.map(f => ({ ...f, name: "إثبات الإلغاء - " + f.name, actorId: user.id })) } } });
        await audit("reverse", id, { reason, original }); return finish({ id }, "pettyCashTransaction", { action: "reverse", originalId: id, amountCents: original.amountCents });
      }
      let type = str("type"), amountCents = 0, sourceAccountId: string | null = null, destinationAccountId: string | null = null;
      let projectId: string | null = null, categoryId: string | null = null, documentNumber = str("documentNumber") || null;
      const description = str("description"); if (!description || description.length > 2000) throw new Error("البيان مطلوب وبحد أقصى 2000 حرف.");
      if (action === "adjust") {
        if (!files.length) throw new Error("إثبات التسوية مطلوب.");
        const count = await tx.pettyCashCount.findUnique({ where: { id: str("countId") } });
        if (!count || count.differenceCents === 0) throw new Error("اختر جردًا له فرق.");
        documentNumber = "COUNT:" + count.id;
        if (movements.some(t => t.documentNumber === documentNumber && t.status === "POSTED")) throw new Error("تمت تسوية هذا الجرد.");
        if (balanceForAccount(movements, count.accountId) !== count.expectedCents) throw new Error("الرصيد تغير؛ سجل جردًا جديدًا قبل التسوية.");
        type = count.differenceCents > 0 ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT";
        amountCents = Math.abs(count.differenceCents);
        if (count.differenceCents > 0) destinationAccountId = count.accountId; else sourceAccountId = count.accountId;
      } else {
        if (action && action !== "transaction") throw new Error("إجراء غير معروف.");
        const expense = isProjectCost(type);
        const category = expense ? await tx.pettyCashCategory.findUnique({ where: { id: str("categoryId") } }) : null;
        if (expense && !category?.active) throw new Error("اختر تصنيفًا نشطًا.");
        if (expense) {
          const allocation = str("allocation");
          if (!["PROJECT", "GENERAL"].includes(allocation)) throw new Error("حدد جهة التحميل.");
          if (allocation === "PROJECT") {
            const project = await tx.project.findFirst({ where: { id: str("projectId"), active: true } });
            if (!project) throw new Error("اختر مشروعًا صحيحًا."); projectId = project.id;
          } else if (str("projectId")) throw new Error("المصروف العام لا يرتبط بمشروع.");
          categoryId = category!.id;
        } else if (str("projectId") || str("categoryId")) throw new Error("التحميل والتصنيف للمصروف الفعلي فقط.");
        amountCents = validatePettyInput({ type, amount: str("amount"), projectId, allocation: str("allocation"), description, documentNumber, hasAttachment: files.length > 0, requiresAttachment: category?.requiresAttachment ?? true, requiresDocument: category?.requiresDocument });
        if (type === "OPENING_BALANCE" && movements.some(t => t.status === "POSTED" && (t.sourceAccountId === main.id || t.destinationAccountId === main.id))) throw new Error("الرصيد الافتتاحي يسبق جميع حركات الصندوق.");
        if (type === "FUNDING" || type === "OPENING_BALANCE") destinationAccountId = main.id;
        if (type === "DIRECT_EXPENSE" || type === "CUSTODY_ISSUE") sourceAccountId = main.id;
        if (type === "CUSTODY_EXPENSE" || type === "CUSTODY_RETURN") {
          const custody = accounts.find(a => a.id === str("sourceAccountId") && a.type === "CUSTODY" && a.active);
          if (!custody) throw new Error("اختر عهدة صحيحة."); sourceAccountId = custody.id;
          if (type === "CUSTODY_RETURN") destinationAccountId = main.id;
        }
        if (type === "CUSTODY_ISSUE") {
          const employee = await tx.employee.findFirst({ where: { id: str("employeeId"), active: true } });
          if (!employee) throw new Error("اختر موظفًا نشطًا.");
          const custody = await tx.pettyCashAccount.create({ data: { name: str("custodyName") || "عهدة " + employee.name + " — " + str("date"), type: "CUSTODY", employeeId: employee.id } });
          destinationAccountId = custody.id;
        }
      }
      const transactionDate = date();
      const id = randomUUID();
      const movement = { id, number: "PC-" + id, type, amountCents, transactionDate, sourceAccountId, destinationAccountId, projectId, categoryId, description, documentNumber, fundingSource: type === "FUNDING" ? "EXECUTIVE_DIRECTOR" : null, recordedById: user.id, status: "POSTED" };
      assertBalances([...movements, movement]);
      await tx.pettyCashTransaction.create({ data: { ...movement, attachments: { create: files.map(f => ({ ...f, actorId: user.id })) } } });
      await postPettyCashJournal(tx, movement);
      await audit(action === "adjust" ? "adjust" : type.toLowerCase(), id, movement);
      return finish({ id }, "pettyCashTransaction", { number: movement.number, type, amountCents, date: str("date"), documentNumber });
    }, { maxWait: 10000, timeout: 20000 });
    return json({ ok: true, ...result });
  } catch (e) { const replay = await replayAfterConflict(e, operationContext); if (replay) return replay; return json({ error: e instanceof Error ? e.message : "تعذر حفظ الحركة." }, 400); }
}
