import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { financials, incomingStages } from "@/lib/incoming";
import { incomingUser, readIncomingFiles } from "@/lib/incoming-server";
import { incomingCollectionCashCents, postIncomingAccrual, postIncomingCollection, postOwnerMaterialCertificate, reversePostedJournal } from "@/lib/accounting-posting";
import { completeFinancialOperation, guardFinancialOperation, replayAfterConflict, type FinancialOperationContext } from "@/lib/financial-idempotency";

const text = z.string().trim().min(1).max(300);
const amount = z.coerce
  .number()
  .finite()
  .positive()
  .max(10_000_000_000)
  .transform((v) => Math.round(v * 100));
const adjustmentAmount = z.preprocess((v) => v === "" || v == null ? 0 : v, z.coerce.number().finite().nonnegative().max(10_000_000_000).transform((v) => Math.round(v * 100)));
const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("contract"),
    id: z.string().optional(),
    number: text,
    name: text,
    projectId: text,
    value: amount,
    estimateReference: z.string().trim().max(300).optional(),
    estimateValue: z.preprocess(v => v === "" || v === null ? null : v, amount.nullable()).optional(),
    notes: z.string().max(2000).optional(),
  }),
  z.object({
    action: z.literal("statement"),
    id: z.string().optional(),
    contractId: text,
    kind: z.enum(["CURRENT", "FINAL"]),
    value: amount,
    notes: z.string().max(2000).optional(),
    finalAdjustment: z.object({ increase: adjustmentAmount, decrease: adjustmentAmount, cancelled: adjustmentAmount }).optional(),
    materialNumber: text.optional(),
    materials: z.array(z.object({ name: text, unit: text, quantity: z.coerce.number().finite().positive(), price: amount })).max(100).optional(),
  }),
  z.object({
    action: z.literal("material"),
    id: z.string().optional(),
    statementId: text,
    number: text,
    notes: z.string().max(2000).optional(),
    items: z
      .array(
        z.object({
          name: text,
          unit: text,
          quantity: z.coerce.number().finite().positive().max(1e9),
          price: amount,
        }),
      )
      .min(1)
      .max(100),
  }),
  z.object({
    action: z.literal("stage"),
    id: text,
    stage: z.enum(incomingStages.map((s) => s[0])),
    reason: z.string().trim().max(1000).optional(),
    paidAt: z.string().optional(),
    paymentMethod: z.enum(["CHEQUE", "TRANSFER"]).optional(),
    paymentReference: z.string().trim().max(300).optional(),
  }),
]);
const include = {
  project: { select: { id: true, companyId: true } },
  memos: true,
  statements: {
    orderBy: { sequence: "asc" as const },
    include: { materials: true },
  },
};
const deleteSchema = z.object({ id: z.string().min(1) });

function validOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const source = new URL(origin).host;
    const configuredHost = process.env.AUTH_URL ? new URL(process.env.AUTH_URL).host : null;
    return source === request.headers.get("host") || source === configuredHost;
  } catch { return false; }
}

export async function POST(request: Request) {
  const user = await incomingUser("incoming.manage");
  if (!user)
    return NextResponse.json(
      { error: "غير مسموح بإدارة الوارد." },
      { status: 403 },
    );
  let operationContext: FinancialOperationContext | null = null;
  try {
    if (!validOrigin(request))
      return NextResponse.json({ error: "طلب غير مسموح." }, { status: 403 });
    if (Number(request.headers.get("content-length") || 0) > 11 * 1024 * 1024)
      return NextResponse.json(
        { error: "حجم الطلب أكبر من الحد المسموح." },
        { status: 413 },
      );
    const form = await request.formData();
    const parsed = schema.safeParse(JSON.parse(String(form.get("payload"))));
    if (!parsed.success)
      return NextResponse.json(
        { error: "راجع الحقول المطلوبة والقيم الموجبة." },
        { status: 400 },
      );
    const d = parsed.data;
    const canUseProject = (projectId: string) => !user.isProjectScoped || user.projectIds.includes(projectId);
    const files = await readIncomingFiles(form);
    const estimateFiles = await readIncomingFiles(form, "estimateFiles");
    const allFiles = [...files, ...estimateFiles];
    if (allFiles.length > 5 || allFiles.reduce((n, f) => n + f.size, 0) > 10 * 1024 * 1024)
      throw new Error("الحد الأقصى 5 مرفقات بإجمالي 10 ميجابايت لكل المستند.");
    if (estimateFiles.length && d.action !== "contract") throw new Error("مرفق المقايسة خاص بالعقد فقط.");
    if (["statement", "material", "stage"].includes(d.action)) {
      const guarded = await guardFinancialOperation(request, { actorId: user.id, operation: `incoming.${d.action}`, requestData: d, businessData: d });
      if ("response" in guarded) return guarded.response;
      operationContext = guarded.context;
    }
    const result = await prisma.$transaction(async (tx) => {
      let target = "";
      let entityType: string = d.action;
      let before: unknown = null;
      const requireFiles = () => {
        if (!files.length) throw new Error("المرفق إلزامي قبل الحفظ.");
      };
      async function contract(id: string) {
        const c = await tx.incomingContract.findFirst({
          where: { id, active: true },
          include,
        });
        if (!c) throw new Error("العقد غير موجود.");
        if (!canUseProject(c.projectId)) throw new Error("غير مصرح لهذا المشروع.");
        return c;
      }
      const locked = (
        c: Awaited<ReturnType<typeof contract>>,
        sequence: number,
      ) =>
        c.statements.some((s) => s.stage === "PAID" && s.sequence >= sequence);
      if (d.action === "contract") {
        const project = await tx.project.findUnique({
          where: { id: d.projectId },
          include: { company: true },
        });
        if (
          !project?.active ||
          !project.company.active ||
          project.company.type !== "OWNER"
        )
          throw new Error("اختر مشروعًا نشطًا مرتبطًا بجهة مالكة.");
        if (!canUseProject(project.id)) throw new Error("غير مصرح لهذا المشروع.");
        const data = {
          number: d.number,
          name: d.name,
          projectId: d.projectId,
          originalCents: d.value,
          ...(d.estimateReference !== undefined ? { estimateReference: d.estimateReference || null } : {}),
          ...(d.estimateValue !== undefined ? { estimateCents: d.estimateValue } : {}),
          notes: d.notes || null,
        };
        if (d.id) {
          const c = await contract(d.id);
          before = c;
          if (d.estimateValue != null && d.estimateValue !== c.estimateCents && !estimateFiles.length)
            throw new Error("أرفق المقايسة عند تسجيل قيمتها أو تغييرها للمراجعة.");
          if (
            c.statements.length &&
            (c.projectId !== d.projectId || c.originalCents !== d.value)
          )
            throw new Error(
              "بعد إضافة مستخلص لا يتغير المشروع أو أصل قيمة العقد. استخدم مذكرة رفع/خفض.",
            );
          target = (
            await tx.incomingContract.update({ where: { id: d.id }, data })
          ).id;
        } else {
          requireFiles();
          if (d.estimateValue != null && !estimateFiles.length) throw new Error("أرفق المقايسة للمراجعة عند إدخال قيمتها.");
          target = (await tx.incomingContract.create({ data })).id;
        }
      }
      if (d.action === "statement") {
        const c = await contract(d.contractId);
        const f = financials(c);
        const adjustment = d.finalAdjustment;
        if (d.kind !== "FINAL" && adjustment)
          throw new Error("مذكرة الختامي لا تُضاف إلى مستخلص جاري.");
        const adjustmentNet = adjustment ? adjustment.increase - adjustment.decrease - adjustment.cancelled : 0;
        const adjustedContractValue = f.value + adjustmentNet;
        const existing = d.id ? c.statements.find((s) => s.id === d.id) : null;
        if (d.id && !existing) throw new Error("المستخلص غير تابع للعقد.");
        if (existing?.kind === "FINAL" && d.kind !== "FINAL")
          throw new Error("الختامي المحفوظ يقفل العقد ولا يمكن تحويله إلى جاري.");
        if (existing && locked(c, existing.sequence))
          throw new Error(
            "المستخلص مقفل ماليًا. يجب الرجوع الموثق قبل التعديل.",
          );
        if (existing && await tx.journalEntry.findFirst({ where: { sourceType: "INCOMING_ACCRUAL", sourceId: existing.id } }))
          throw new Error("الجاري مرحّل محاسبيًا؛ صححه بعكس موثق ثم أضف جاريًا بديلًا.");
        if (!existing && c.statements.some((s) => s.kind === "FINAL"))
          throw new Error("لا يضاف جاري بعد الختامي.");
        const sequence =
          existing?.sequence ?? (c.statements.at(-1)?.sequence ?? 0) + 1;
        const previous = c.statements
          .filter((s) => s.sequence < sequence)
          .at(-1);
        const next = c.statements.find((s) => s.sequence > sequence);
        if (d.kind === "FINAL" && d.value !== adjustedContractValue)
          throw new Error("قيمة الختامي يجب أن تساوي قيمة العقد النهائية بعد مذكرة الخفض/الرفع.");
        if (
          d.value > adjustedContractValue ||
          d.value < (previous?.grossCents ?? 0) ||
          (next && d.value > next.grossCents)
        )
          throw new Error(
            "القيمة التراكمية يجب أن تكون بين السابق واللاحق ولا تتجاوز العقد.",
          );
        const materialTotal = c.statements
          .filter((s) => s.sequence <= sequence)
          .reduce(
            (n, s) => n + s.materials.reduce((a, m) => a + m.totalCents, 0),
            0,
          );
        if (materialTotal > d.value)
          throw new Error("الخامات التراكمية تتجاوز قيمة المستخلص.");
        if (d.kind === "FINAL" && next)
          throw new Error("الختامي يجب أن يكون آخر مستخلص.");
        const data = {
          kind: d.kind,
          grossCents: d.value,
          notes: d.notes || null,
        };
        before = existing;
        if (existing)
          target = (
            await tx.incomingStatement.update({
              where: { id: existing.id },
              data,
            })
          ).id;
        else {
          requireFiles();
          const created = await tx.incomingStatement.create({
              data: { ...data, contractId: c.id, sequence },
            });
          await postIncomingAccrual(tx, { ...created, contract: { projectId: c.projectId } }, previous?.grossCents ?? 0, c.project.companyId, user.id);
          target = created.id;
        }
        if (d.kind === "FINAL" && adjustment && (adjustment.increase > 0 || adjustment.decrease > 0 || adjustment.cancelled > 0)) {
          await tx.incomingMemo.create({ data: {
            contractId: c.id,
            kind: adjustmentNet > 0 ? "INCREASE" : "DECREASE",
            amountCents: Math.abs(adjustmentNet),
            reason: JSON.stringify({ type: "FINAL_ADJUSTMENT", increase: adjustment.increase, decrease: adjustment.decrease, cancelled: adjustment.cancelled }),
          } });
        }
        if (d.materials?.length) {
          if (!d.materialNumber) throw new Error("أدخل رقم شهادة الخامات.");
          const totalCents = d.materials.reduce((sum, item) => sum + Math.round(item.quantity * item.price), 0);
          await tx.materialCertificate.create({ data: {
            number: d.materialNumber,
            statementId: target,
            totalCents,
            items: { create: d.materials.map(item => ({ name: item.name, unit: item.unit, quantity: item.quantity, unitPriceCents: item.price, totalCents: Math.round(item.quantity * item.price) })) },
          } });
        }
      }
      if (d.action === "material") {
        const s = await tx.incomingStatement.findUnique({
          where: { id: d.statementId },
        });
        if (!s) throw new Error("اختر المستخلص المرتبط بشهادة الخامات.");
        const c = await contract(s.contractId);
        if (locked(c, s.sequence))
          throw new Error(
            "خامات هذا المستخلص مقفلة ماليًا حتى يتم الرجوع الموثق.",
          );
        const old = d.id
          ? await tx.materialCertificate.findUnique({
              where: { id: d.id },
              include: { items: true },
            })
          : null;
        if (d.id && (!old || old.statementId !== s.id))
          throw new Error("لا يسمح بنقل شهادة بين المستخلصات.");
        if (old && await tx.journalEntry.findFirst({ where: { sourceId: old.id, sourceType: { in: ["OWNER_MATERIAL_RECEIPT", "OWNER_MATERIAL_COST"] } } }))
          throw new Error("شهادة الخامات مرحّلة محاسبيًا؛ صححها بعكس موثق ثم أضف شهادة بديلة.");
        const items = d.items.map((i) => ({
          name: i.name,
          unit: i.unit,
          quantity: i.quantity,
          unitPriceCents: i.price,
          totalCents: Math.round(i.quantity * i.price),
        }));
        const totalCents = items.reduce((n, i) => n + i.totalCents, 0);
        if (!Number.isSafeInteger(totalCents) || totalCents > 1e12)
          throw new Error("قيمة الخامات أكبر من الحد المسموح.");
        for (const later of c.statements.filter(
          (x) => x.sequence >= s.sequence,
        )) {
          const cumulative =
            c.statements
              .filter((x) => x.sequence <= later.sequence)
              .reduce(
                (n, x) =>
                  n +
                  x.materials
                    .filter((m) => m.id !== old?.id)
                    .reduce((a, m) => a + m.totalCents, 0),
                0,
              ) + totalCents;
          if (cumulative > later.grossCents)
            throw new Error(
              "إجمالي الخامات التراكمية يتجاوز المستخلص الحالي أو أحد المستخلصات اللاحقة.",
            );
        }
        before = old;
        const data = { number: d.number, notes: d.notes || null, totalCents };
        if (old) {
          await tx.materialCertificateItem.deleteMany({
            where: { certificateId: old.id },
          });
          target = (
            await tx.materialCertificate.update({
              where: { id: old.id },
              data: { ...data, items: { create: items } },
            })
          ).id;
        } else {
          requireFiles();
          const created = await tx.materialCertificate.create({
            data: { ...data, statementId: s.id, items: { create: items } },
          });
          await postOwnerMaterialCertificate(tx, { ...created, statement: { contract: { projectId: c.projectId } } }, c.project.companyId, user.id);
          target = created.id;
        }
      }
      if (d.action === "stage") {
        const s = await tx.incomingStatement.findUnique({
          where: { id: d.id },
        });
        if (!s) throw new Error("المستخلص غير موجود.");
        if (s.stage === d.stage)
          throw new Error("المستخلص بالفعل في هذه المرحلة.");
        const c = await contract(s.contractId);
        before = s;
        entityType = "statement";
        target = s.id;
        const from = incomingStages.findIndex((x) => x[0] === s.stage);
        const to = incomingStages.findIndex((x) => x[0] === d.stage);
        if (locked(c, s.sequence) && s.stage !== "PAID")
          throw new Error("مستخلص سابق مقفل بمستخلص لاحق مصروف.");
        if (to < from && (!d.reason || (s.stage === "PAID" && !user.admin)))
          throw new Error(
            "الرجوع يحتاج سببًا؛ الرجوع من تم الصرف لمدير النظام فقط.",
          );
        if (
          s.stage === "PAID" &&
          c.statements.some(
            (x) => x.sequence > s.sequence && x.stage === "PAID",
          )
        )
          throw new Error("ارجع آخر مستخلص مصروف أولًا.");
        if (to > from && to !== from + 1)
          throw new Error("انتقل للمرحلة التالية بالترتيب.");
        if (s.stage === "PAID" && d.stage !== "PAID") {
          const reversedAt = new Date();
          await reversePostedJournal(tx, "INCOMING_COLLECTION", s.id, reversedAt, user.id, d.reason || "رجوع موثق من تم الصرف");
          const collected = await tx.bankTransaction.findFirst({
            where: { sourceType: "INCOMING_STATEMENT", sourceId: { startsWith: s.id }, type: "INCOMING_COLLECTION" },
            orderBy: { createdAt: "desc" },
          });
          if (collected) {
            await tx.bankTransaction.create({
              data: {
                number: `BNK-REV-${randomUUID().slice(0, 8).toUpperCase()}`,
                accountId: collected.accountId,
                type: "INCOMING_COLLECTION_REVERSAL",
                amountCents: collected.amountCents,
                transactionDate: reversedAt,
                projectId: collected.projectId,
                description: `عكس تحصيل مستخلص: ${d.reason}`,
                reference: collected.reference,
                sourceType: "INCOMING_STATEMENT_REVERSAL",
                sourceId: collected.id,
                actorId: user.id,
              },
            });
          }
        }
        if (d.stage === "PAID") {
          if (s.kind === "FINAL" && s.grossCents !== financials(c).value)
            throw new Error("لا يمكن صرف الختامي قبل إقفال قيمته على كامل قيمة العقد النهائية.");
          requireFiles();
          entityType = "payment-proof";
          if (
            !d.paidAt ||
            !d.paymentMethod ||
            !d.paymentReference ||
            !Number.isFinite(Date.parse(d.paidAt))
          )
            throw new Error(
              "تاريخ الصرف ووسيلته ورقم الشيك/التحويل وإثبات الصرف إلزامية.",
            );
          if (
            c.statements.some(
              (x) => x.sequence < s.sequence && x.stage !== "PAID",
            )
          )
            throw new Error("يجب صرف المستخلصات السابقة أولًا.");
        }
        const paidAt = d.stage === "PAID" ? new Date(d.paidAt!) : null;
        await tx.incomingStatement.update({
          where: { id: s.id },
          data: {
            stage: d.stage,
            paidAt,
            paymentMethod: d.stage === "PAID" ? d.paymentMethod : null,
            paymentReference: d.stage === "PAID" ? d.paymentReference : null,
          },
        });
        if (d.stage === "PAID") {
          const current = c.statements.find((statement) => statement.id === s.id)!;
          const previousPaid = c.statements.filter((statement) => statement.sequence < s.sequence).at(-1);
          const collectionEventId = `${s.id}:${randomUUID()}`;
          await postIncomingCollection(tx, { ...s, paidAt, contract: { projectId: c.projectId }, materials: current.materials }, previousPaid?.grossCents ?? 0, c.project.companyId, user.id, collectionEventId);
          const cashCents = incomingCollectionCashCents(s.grossCents, previousPaid?.grossCents ?? 0, current.materials);
          if (cashCents > 0) {
            const bank = await tx.bankAccount.upsert({ where: { name: "الحساب البنكي الرئيسي" }, update: { active: true }, create: { name: "الحساب البنكي الرئيسي" } });
            await tx.bankTransaction.create({ data: { number: `BNK-IN-${randomUUID().slice(0, 8).toUpperCase()}`, accountId: bank.id, type: "INCOMING_COLLECTION", amountCents: cashCents, transactionDate: paidAt!, projectId: c.projectId, description: "تحصيل مستخلص من جهة مالكة", reference: d.paymentReference || null, sourceType: "INCOMING_STATEMENT", sourceId: collectionEventId, actorId: user.id } });
          }
        }
      }
      if (files.length)
        await tx.incomingAttachment.createMany({
          data: files.map((f) => ({
            ...f,
            entityType,
            entityId: target,
            actorId: user.id,
          })),
        });
      if (estimateFiles.length)
        await tx.incomingAttachment.createMany({ data: estimateFiles.map(f => ({ ...f, entityType: "estimate", entityId: target, actorId: user.id })) });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: `incoming.${d.action}`,
          target,
          details: JSON.stringify({
            before,
            input: d,
            attachmentCount: files.length,
            estimateAttachmentCount: estimateFiles.length,
          }),
        },
      });
      if (operationContext) await completeFinancialOperation(tx, operationContext, { body: { ok: true, id: target }, entityType, entityId: target, summary: { action: d.action, amountCents: "value" in d ? d.value : null, date: d.action === "stage" ? d.paidAt || null : null } });
      return { id: target };
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const replay = await replayAfterConflict(e, operationContext); if (replay) return replay;
    const message =
      e instanceof Prisma.PrismaClientKnownRequestError
        ? "الرقم مكرر أو الربط غير صالح. راجع البيانات."
        : e instanceof Error
          ? e.message
          : "تعذر الحفظ.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const user = await incomingUser("incoming.manage");
  if (!user) return NextResponse.json({ error: "غير مسموح بإدارة الوارد." }, { status: 403 });
  if (!validOrigin(request)) return NextResponse.json({ error: "طلب غير مسموح." }, { status: 403 });
  const parsed = deleteSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "العقد غير صالح." }, { status: 400 });
  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.incomingContract.updateMany({ where: { id: parsed.data.id, active: true }, data: { active: false } });
    if (!updated.count) throw new Error("العقد غير موجود أو ممسوح بالفعل.");
    await tx.auditLog.create({ data: { actorId: user.id, action: "incoming.contract.delete", target: parsed.data.id, details: JSON.stringify({ safeDelete: true }) } });
    return updated.count;
  }).catch((error: unknown) => error instanceof Error ? error : new Error("تعذر مسح العقد."));
  if (result instanceof Error) return NextResponse.json({ error: result.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
