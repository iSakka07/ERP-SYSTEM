import { NextResponse } from "next/server";
import { z } from "zod";
import { incomingUser } from "@/lib/incoming-server";
import { prisma } from "@/lib/prisma";
import { isTrustedMutationOrigin } from "@/lib/request-security";
import { getProjectPlanning, planningSources } from "@/lib/project-planning";

const cents = z.number().int().min(0).max(1_000_000_000_000);
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("plan"), projectId: z.string().min(1), revision: z.number().int().min(0), budget: z.object({ SUBCONTRACTORS: cents, MATERIALS: cents, SALARIES: cents, OTHER: cents }).nullable(), progressPercent: z.number().min(0).max(100).nullable(), progressDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable() }),
  z.object({ action: z.literal("commitment"), projectId: z.string().min(1), id: z.string().optional(), revision: z.number().int().min(0).default(0), name: z.string().trim().min(2).max(200), category: z.enum(["SUBCONTRACTORS", "MATERIALS"]), partyType: z.enum(["SUBCONTRACT", "SUPPLIER"]), partyId: z.string().min(1), totalCents: cents, active: z.boolean(), sources: z.array(z.object({ sourceType: z.enum(["SUBCONTRACT", "PURCHASE"]), sourceId: z.string().min(1) })).max(2000) }),
]);
export async function GET(request: Request) {
  const user = await incomingUser("project_cost_control.view");
  if (!user) return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  const projectId = new URL(request.url).searchParams.get("projectId") || "";
  if (!user.canUseProject(projectId)) return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  if (!await prisma.project.findFirst({ where: { id: projectId, active: true } })) return NextResponse.json({ error: "المشروع غير موجود" }, { status: 404 });
  return NextResponse.json(await getProjectPlanning(projectId));
}
export async function POST(request: Request) {
  if (!isTrustedMutationOrigin(request)) return NextResponse.json({ error: "طلب غير موثوق" }, { status: 403 });
  const user = await incomingUser("project_cost_control.manage");
  if (!user || !["admin", "executive_director", "accountant"].includes(user.roleKey)) return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "راجع القيم والتاريخ المدخل." }, { status: 400 });
  const input = parsed.data;
  if (!user.canUseProject(input.projectId)) return NextResponse.json({ error: "غير مصرح لهذا المشروع." }, { status: 403 });
  try {
    await prisma.$transaction(async tx => {
      if (!await tx.project.findFirst({ where: { id: input.projectId, active: true } })) throw new Error("المشروع غير موجود");
      let before: unknown;
      let after: unknown;
      if (input.action === "plan") {
        if ((input.progressPercent === null) !== (input.progressDate === null)) throw new Error("سجل نسبة الإنجاز وتاريخها معًا");
        if (input.progressDate && (input.progressDate > new Date().toISOString().slice(0, 10) || new Date(input.progressDate).toISOString().slice(0, 10) !== input.progressDate)) throw new Error("تاريخ الإنجاز غير صحيح أو مستقبلي");
        const existing = await tx.projectPlan.findUnique({ where: { projectId: input.projectId } });
        before = existing;
        if ((existing?.revision ?? 0) !== input.revision) throw new Error("البيانات تغيرت؛ حدّث الصفحة قبل الحفظ");
        const data = { budgetJson: input.budget ? JSON.stringify(input.budget) : null, progressPercent: input.progressPercent, progressDate: input.progressDate, revision: input.revision + 1 };
        if (existing) {
          const updated = await tx.projectPlan.updateMany({ where: { projectId: input.projectId, revision: input.revision }, data });
          if (updated.count !== 1) throw new Error("البيانات تغيرت؛ حدّث الصفحة");
        } else await tx.projectPlan.create({ data: { projectId: input.projectId, ...data } });
        after = data;
      } else {
        const existing = input.id ? await tx.projectCommitment.findFirst({ where: { id: input.id, projectId: input.projectId }, include: { sources: true } }) : null;
        if (input.id && !existing) throw new Error("الالتزام غير موجود");
        if (existing && existing.revision !== input.revision) throw new Error("الالتزام تغير؛ حدّث الصفحة");
        before = existing;
        const sources = await planningSources(input.projectId, tx);
        if (input.partyType === "SUBCONTRACT") {
          if (input.category !== "SUBCONTRACTORS" || !sources.some(s => s.sourceType === "SUBCONTRACT" && s.sourceId === input.partyId)) throw new Error("اختر مقاولة من المشروع");
          if (input.sources.length !== 1 || input.sources[0].sourceType !== "SUBCONTRACT" || input.sources[0].sourceId !== input.partyId) throw new Error("اربط الالتزام بالمقاولة المحددة");
        } else if (input.category !== "MATERIALS" || !await tx.company.findFirst({ where: { id: input.partyId, type: "SUPPLIER" } })) throw new Error("اختر موردًا صحيحًا");
        for (const link of input.sources) {
          const source = sources.find(s => s.sourceType === link.sourceType && s.sourceId === link.sourceId);
          if (!source || source.partyType !== input.partyType || source.partyId !== input.partyId) throw new Error("مصدر التكلفة لا يخص هذا الطرف أو المشروع");
          const occupied = await tx.projectCommitmentSource.findUnique({ where: { sourceType_sourceId: link } });
          if (occupied && occupied.commitmentId !== existing?.id) throw new Error("مصدر التكلفة مرتبط بالتزام آخر");
        }
        const data = { name: input.name, category: input.category, partyType: input.partyType, partyId: input.partyId, totalCents: input.totalCents, active: input.active, revision: input.revision + 1 };
        let id = existing?.id;
        if (existing) {
          const updated = await tx.projectCommitment.updateMany({ where: { id: existing.id, revision: input.revision }, data });
          if (updated.count !== 1) throw new Error("الالتزام تغير؛ حدّث الصفحة");
          await tx.projectCommitmentSource.deleteMany({ where: { commitmentId: existing.id } });
        } else id = (await tx.projectCommitment.create({ data: { ...data, projectId: input.projectId } })).id;
        for (const link of input.sources) await tx.projectCommitmentSource.create({ data: { ...link, commitmentId: id! } });
        after = { id, ...data, sources: input.sources };
      }
      await tx.auditLog.create({ data: { actorId: user.id, action: "project.plan." + input.action, target: input.projectId, details: JSON.stringify({ before, after }) } });
    });
    return NextResponse.json(await getProjectPlanning(input.projectId));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error && !("code" in error) ? error.message : "تعارض في البيانات؛ حدّث الصفحة وحاول مجددًا." }, { status: 409 });
  }
}
