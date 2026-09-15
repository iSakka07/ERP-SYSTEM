import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { financials, incomingStages } from "@/lib/incoming";
import { incomingUser, readIncomingFiles } from "@/lib/incoming-server";

const text = z.string().trim().min(1).max(300);
const amount = z.coerce
  .number()
  .finite()
  .positive()
  .max(10_000_000_000)
  .transform((v) => Math.round(v * 100));
const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("contract"),
    id: z.string().optional(),
    number: text,
    name: text,
    projectId: text,
    value: amount,
    estimateReference: z.string().trim().max(300).optional(),
    notes: z.string().max(2000).optional(),
  }),
  z.object({
    action: z.literal("statement"),
    id: z.string().optional(),
    contractId: text,
    kind: z.enum(["CURRENT", "FINAL"]),
    value: amount,
    notes: z.string().max(2000).optional(),
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
    action: z.literal("memo"),
    contractId: text,
    kind: z.enum(["INCREASE", "DECREASE"]),
    value: amount,
    reason: text,
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
  memos: true,
  statements: {
    orderBy: { sequence: "asc" as const },
    include: { materials: true },
  },
};

export async function POST(request: Request) {
  const user = await incomingUser("incoming.manage");
  if (!user)
    return NextResponse.json(
      { error: "غير مسموح بإدارة الوارد." },
      { status: 403 },
    );
  try {
    const origin = request.headers.get("origin");
    const configuredHost = process.env.AUTH_URL ? new URL(process.env.AUTH_URL).host : null;
    if (origin && new URL(origin).host !== request.headers.get("host") && new URL(origin).host !== configuredHost)
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
    const files = await readIncomingFiles(form);
    const result = await prisma.$transaction(async (tx) => {
      let target = "";
      let entityType = d.action;
      let before: unknown = null;
      const requireFiles = () => {
        if (!files.length) throw new Error("المرفق إلزامي قبل الحفظ.");
      };
      async function contract(id: string) {
        const c = await tx.incomingContract.findUnique({
          where: { id },
          include,
        });
        if (!c) throw new Error("العقد غير موجود.");
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
        const data = {
          number: d.number,
          name: d.name,
          projectId: d.projectId,
          originalCents: d.value,
          estimateReference: d.estimateReference || null,
          notes: d.notes || null,
        };
        if (d.id) {
          const c = await contract(d.id);
          before = c;
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
          target = (await tx.incomingContract.create({ data })).id;
        }
      }
      if (d.action === "statement") {
        const c = await contract(d.contractId);
        const f = financials(c);
        const existing = d.id ? c.statements.find((s) => s.id === d.id) : null;
        if (d.id && !existing) throw new Error("المستخلص غير تابع للعقد.");
        if (existing && locked(c, existing.sequence))
          throw new Error(
            "المستخلص مقفل ماليًا. يجب الرجوع الموثق قبل التعديل.",
          );
        if (!existing && c.statements.some((s) => s.kind === "FINAL"))
          throw new Error("لا يضاف جاري بعد الختامي.");
        const sequence =
          existing?.sequence ?? (c.statements.at(-1)?.sequence ?? 0) + 1;
        const previous = c.statements
          .filter((s) => s.sequence < sequence)
          .at(-1);
        const next = c.statements.find((s) => s.sequence > sequence);
        if (
          d.value > f.value ||
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
          target = (
            await tx.incomingStatement.create({
              data: { ...data, contractId: c.id, sequence },
            })
          ).id;
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
          target = (
            await tx.materialCertificate.create({
              data: { ...data, statementId: s.id, items: { create: items } },
            })
          ).id;
        }
      }
      if (d.action === "memo") {
        requireFiles();
        const c = await contract(d.contractId);
        const current =
          financials(c).value + (d.kind === "INCREASE" ? d.value : -d.value);
        if (current <= 0 || c.statements.some((s) => s.grossCents > current))
          throw new Error(
            "قيمة العقد بعد المذكرة يجب ألا تقل عن أي مستخلص مسجل.",
          );
        target = (
          await tx.incomingMemo.create({
            data: {
              contractId: c.id,
              kind: d.kind,
              amountCents: d.value,
              reason: d.reason,
            },
          })
        ).id;
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
        if (d.stage === "PAID") {
          requireFiles();
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
        await tx.incomingStatement.update({
          where: { id: s.id },
          data: {
            stage: d.stage,
            paidAt: d.stage === "PAID" ? new Date(d.paidAt!) : null,
            paymentMethod: d.stage === "PAID" ? d.paymentMethod : null,
            paymentReference: d.stage === "PAID" ? d.paymentReference : null,
          },
        });
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
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: `incoming.${d.action}`,
          target,
          details: JSON.stringify({
            before,
            input: d,
            attachmentCount: files.length,
          }),
        },
      });
      return { id: target };
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message =
      e instanceof Prisma.PrismaClientKnownRequestError
        ? "الرقم مكرر أو الربط غير صالح. راجع البيانات."
        : e instanceof Error
          ? e.message
          : "تعذر الحفظ.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
