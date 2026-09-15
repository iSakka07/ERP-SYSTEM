import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { incomingUser, readIncomingFiles } from "@/lib/incoming-server";
import {
  approvalPermissions,
  calculateExpense,
  expenseStages,
  expenseSummary,
  safeCents,
} from "@/lib/expenses";

const text = z.string().trim().min(1).max(300);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !Number.isNaN(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
  );
const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("account"),
    name: text,
    companyId: text,
    projectId: text,
    scope: text,
    notes: z.string().max(2000).optional(),
  }),
  z.object({
    action: z.literal("statement"),
    id: text.optional(),
    revision: z.number().int().positive().optional(),
    accountId: text,
    kind: z.enum(["CURRENT", "FINAL"]),
    statementDate: date,
    notes: z.string().max(2000).optional(),
    items: z
      .array(
        z.object({
          itemKey: text,
          name: text,
          unit: text,
          currentQuantity: z.number().finite().nonnegative().max(1e9),
          price: z.number().finite().positive().max(1e10),
          entitlementPercent: z.number().finite().min(0).max(100),
          sourceItemKey: text.nullish(),
          priceChangeReason: z.string().trim().max(1000).nullish(),
        }),
      )
      .min(1)
      .max(200),
    deductions: z
      .array(
        z.object({
          name: text,
          kind: z.enum(["PERCENT", "FIXED"]),
          value: z.number().finite().nonnegative().max(1e10),
        }),
      )
      .max(30),
  }),
  z.object({
    action: z.literal("stage"),
    id: text,
    revision: z.number().int().positive(),
    stage: z.enum(["DRAFT", "TECHNICAL", "SITE", "EXECUTIVE", "ACCOUNTING"]),
    reason: z.string().trim().max(1000).optional(),
  }),
  z.object({
    action: z.literal("payment"),
    statementId: text,
    revision: z.number().int().positive(),
    amount: z.number().finite().positive().max(1e10),
    paymentDate: date,
    method: z.enum(["CHEQUE", "TRANSFER", "CASH"]),
    reference: text,
    notes: z.string().trim().max(2000).optional(),
    confirmAdvance: z.boolean().optional(),
  }),
]);
const relations = {
  items: { orderBy: { position: "asc" as const } },
  deductions: { orderBy: { position: "asc" as const } },
  payments: true,
  approvals: true,
};

export async function POST(request: Request) {
  try {
    if (!(await incomingUser("expenses.view")))
      return NextResponse.json({ error: "غير مسموح." }, { status: 403 });
    const origin = request.headers.get("origin");
    const configuredHost = process.env.AUTH_URL
      ? new URL(process.env.AUTH_URL).host
      : null;
    if (
      origin &&
      new URL(origin).host !== request.headers.get("host") &&
      new URL(origin).host !== configuredHost
    )
      return NextResponse.json({ error: "طلب غير مسموح." }, { status: 403 });
    if (Number(request.headers.get("content-length") || 0) > 11 * 1024 * 1024)
      return NextResponse.json(
        { error: "الطلب أكبر من الحد المسموح." },
        { status: 413 },
      );
    const form = await request.formData();
    const parsed = schema.safeParse(JSON.parse(String(form.get("payload"))));
    if (!parsed.success)
      return NextResponse.json(
        { error: "راجع الحقول المطلوبة والقيم والتاريخ." },
        { status: 400 },
      );
    const data = parsed.data;
    const permission =
      data.action === "stage"
        ? data.stage === "DRAFT"
          ? "expenses.return"
          : approvalPermissions[data.stage]
        : data.action === "payment"
          ? "expenses.pay"
          : "expenses.manage";
    const user = await incomingUser(permission);
    if (!user)
      return NextResponse.json(
        { error: "ليس لديك صلاحية لهذه العملية." },
        { status: 403 },
      );
    const files = await readIncomingFiles(form);
    const result = await prisma.$transaction(
      async (tx) => {
        let id: string, entityType: string;
        if (data.action === "account") {
          const [company, project] = await Promise.all([
            tx.company.findUnique({ where: { id: data.companyId } }),
            tx.project.findUnique({ where: { id: data.projectId } }),
          ]);
          if (
            !company?.active ||
            company.type !== "SUBCONTRACTOR" ||
            !project?.active
          )
            throw new Error("اختر مقاول باطن ومشروعًا نشطين.");
          if (!files.length)
            throw new Error("أعمال المقاول تحتاج مرفق إسناد أو حصر.");
          const account = await tx.subcontractAccount.create({
            data: {
              name: data.name,
              companyId: data.companyId,
              projectId: data.projectId,
              scope: data.scope,
              notes: data.notes,
            },
          });
          id = account.id;
          entityType = "account";
        } else if (data.action === "statement") {
          const account = await tx.subcontractAccount.findUnique({
            where: { id: data.accountId },
            include: {
              project: true,
              company: true,
              statements: { orderBy: { sequence: "asc" }, include: relations },
            },
          });
          if (!account || !account.company.active || !account.project.active)
            throw new Error("أعمال المقاول أو المشروع غير نشط.");
          const current = data.id
            ? account.statements.find((s) => s.id === data.id)
            : undefined;
          if (
            data.id &&
            (!current ||
              current.stage !== "DRAFT" ||
              current.revision !== data.revision)
          )
            throw new Error("المستخلص تغير أو ليس مسودة. حدث الصفحة.");
          const latest = account.statements.at(-1);
          if (
            !current &&
            latest &&
            (!["EXECUTIVE", "ACCOUNTING"].includes(latest.stage) ||
              latest.kind === "FINAL")
          )
            throw new Error(
              "اعتمد الجاري السابق تنفيذيًا أولًا؛ لا جاري بعد الختامي.",
            );
          if (current && latest?.id !== current.id)
            throw new Error("لا يمكن تعديل جاري له مستخلص لاحق.");
          const previous = account.statements
            .filter(
              (s) =>
                s.sequence < (current?.sequence ?? Infinity) &&
                ["EXECUTIVE", "ACCOUNTING"].includes(s.stage),
            )
            .at(-1);
          const calc = calculateExpense(
            data.items,
            data.deductions,
            previous?.items ?? [],
          );
          const priceVersions = calc.items.filter(
            (i) =>
              i.sourceItemKey &&
              !previous?.items.some((p) => p.itemKey === i.itemKey),
          );
          if (
            !files.length &&
            priceVersions.some(
              (v) =>
                !current?.items.some(
                  (c) =>
                    c.itemKey === v.itemKey &&
                    c.sourceItemKey === v.sourceItemKey &&
                    c.unitPriceCents === v.unitPriceCents &&
                    c.priceChangeReason === v.priceChangeReason,
                ),
            )
          )
            throw new Error(
              "تغيير السعر يحتاج إثباتًا جديدًا مرفقًا بالمستخلص.",
            );
          if (
            !files.length &&
            (!current ||
              !(await tx.expenseAttachment.count({
                where: { entityType: "statement", entityId: current.id },
              })))
          )
            throw new Error("أرفق الحصر أو إثبات المستخلص.");
          const values = {
            kind: data.kind,
            statementDate: new Date(data.statementDate),
            notes: data.notes,
            grossCents: calc.grossCents,
            deductionCents: calc.deductionCents,
            netCents: calc.netCents,
            previousGrossCents: calc.previousGrossCents,
          };
          if (current) {
            const updated = await tx.subcontractStatement.updateMany({
              where: {
                id: current.id,
                revision: data.revision,
                stage: "DRAFT",
              },
              data: { ...values, revision: { increment: 1 } },
            });
            if (updated.count !== 1)
              throw new Error("تعارض تعديل، حدث الصفحة.");
            await tx.subcontractItem.deleteMany({
              where: { statementId: current.id },
            });
            await tx.subcontractDeduction.deleteMany({
              where: { statementId: current.id },
            });
            id = current.id;
          } else {
            const st = await tx.subcontractStatement.create({
              data: {
                ...values,
                accountId: account.id,
                sequence: (latest?.sequence ?? 0) + 1,
              },
            });
            id = st.id;
          }
          await tx.subcontractItem.createMany({
            data: calc.items.map((item) => ({
              statementId: id,
              itemKey: item.itemKey,
              name: item.name,
              unit: item.unit,
              currentQuantity: item.currentQuantity,
              previousQuantity: item.previousQuantity,
              unitPriceCents: item.unitPriceCents,
              entitlementPercent: item.entitlementPercent,
              previousValueCents: item.previousValueCents,
              totalCents: item.totalCents,
              sourceItemKey: item.sourceItemKey,
              priceChangeReason: item.priceChangeReason,
              position: item.position,
            })),
          });
          await tx.subcontractDeduction.createMany({
            data: calc.deductions.map((d) => ({ ...d, statementId: id })),
          });
          entityType = "statement";
          await tx.auditLog.create({
            data: {
              actorId: user.id,
              action: "expenses.snapshot",
              target: id,
              details: JSON.stringify({
                previousRevision: current?.revision,
                before: current,
                after: {
                  ...values,
                  items: calc.items,
                  deductions: calc.deductions,
                },
              }),
            },
          });
        } else {
          const statementId =
            data.action === "stage" ? data.id : data.statementId;
          const st = await tx.subcontractStatement.findUnique({
            where: { id: statementId },
            include: {
              ...relations,
              account: {
                include: { statements: { include: { payments: true } } },
              },
            },
          });
          if (!st || st.revision !== data.revision)
            throw new Error("المستخلص تغير. حدث الصفحة قبل الاستمرار.");
          if (data.action === "stage") {
            const index = expenseStages.findIndex((s) => s[0] === st.stage);
            if (data.stage === "DRAFT") {
              if (
                st.stage === "DRAFT" ||
                !data.reason ||
                st.payments.length ||
                st.account.statements.some((s) => s.sequence > st.sequence)
              )
                throw new Error(
                  "الرد يحتاج سببًا، ويمنع عند وجود دفعات أو جاري لاحق.",
                );
            } else if (expenseStages[index + 1]?.[0] !== data.stage)
              throw new Error("الاعتماد يتم بالترتيب دون تجاوز مرحلة.");
            if (
              data.stage === "TECHNICAL" &&
              !(await tx.expenseAttachment.count({
                where: { entityType: "statement", entityId: st.id },
              }))
            )
              throw new Error("الحصر يحتاج إثباتًا.");
            const updated = await tx.subcontractStatement.updateMany({
              where: { id: st.id, revision: data.revision, stage: st.stage },
              data: {
                stage: data.stage,
                revision: { increment: 1 },
                executiveApprovedAt:
                  data.stage === "EXECUTIVE"
                    ? new Date()
                    : data.stage === "DRAFT"
                      ? null
                      : st.executiveApprovedAt,
              },
            });
            if (updated.count !== 1)
              throw new Error("تعارض اعتماد. حدث الصفحة.");
            const actor = await tx.user.findUniqueOrThrow({
              where: { id: user.id },
            });
            await tx.subcontractApproval.create({
              data: {
                statementId: st.id,
                fromStage: st.stage,
                toStage: data.stage,
                reason: data.reason,
                actorId: user.id,
                actorName: actor.name,
                revision: st.revision,
              },
            });
            id = st.id;
            entityType = "statement";
          } else {
            if (st.stage !== "ACCOUNTING")
              throw new Error("الصرف متاح بعد وصول المستخلص للحسابات فقط.");
            if (!files.length)
              throw new Error("كل دفعة تحتاج فاتورة أو إثبات صرف.");
            const summary = expenseSummary(st.account.statements);
            if (summary.latest?.id !== st.id)
              throw new Error(
                "سجل الدفعة على آخر مستخلص معتمد لأعمال المقاول.",
              );
            const amountCents = safeCents(Math.round(data.amount * 100));
            if (!amountCents) throw new Error("قيمة الدفعة أصغر من قرش.");
            if (
              amountCents + summary.paidCents > summary.netCents &&
              (!data.confirmAdvance || !data.notes)
            )
              throw new Error(
                "الدفعة تتجاوز المستحق؛ أكد أنها رصيد مقدم مع كتابة السبب.",
              );
            const updated = await tx.subcontractStatement.updateMany({
              where: {
                id: st.id,
                revision: data.revision,
                stage: "ACCOUNTING",
              },
              data: { revision: { increment: 1 } },
            });
            if (updated.count !== 1) throw new Error("تعارض صرف. حدث الصفحة.");
            const payment = await tx.subcontractPayment.create({
              data: {
                statementId: st.id,
                amountCents,
                paymentDate: new Date(data.paymentDate),
                method: data.method,
                reference: data.reference,
                notes: data.notes,
                actorId: user.id,
              },
            });
            id = payment.id;
            entityType = "payment";
          }
        }
        if (files.length)
          await tx.expenseAttachment.createMany({
            data: files.map((f) => ({
              ...f,
              entityType,
              entityId: id,
              actorId: user.id,
            })),
          });
        await tx.auditLog.create({
          data: {
            actorId: user.id,
            action: `expenses.${data.action}`,
            target: id,
            details: JSON.stringify(data),
          },
        });
        return { id };
      },
      { timeout: 20000 },
    );
    return NextResponse.json(result);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      ["P2002", "P2034", "P2028"].includes(error.code)
    )
      return NextResponse.json(
        { error: "تعارض مع عملية أخرى. حدث الصفحة وأعد المحاولة." },
        { status: 409 },
      );
    return NextResponse.json(
      {
        error:
          error instanceof Error &&
          !(error instanceof Prisma.PrismaClientKnownRequestError)
            ? error.message
            : "تعذر حفظ العملية.",
      },
      { status: 400 },
    );
  }
}
