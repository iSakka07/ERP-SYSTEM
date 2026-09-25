import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { accessProfile } from "@/lib/access-control";
import { getAttentionAlerts } from "@/lib/attention-alerts";
import { prisma } from "@/lib/prisma";

const auditLinks: Record<string, { href: string; label: string }> = {
  incoming: { href: "/incoming", label: "العقود والوارد" }, expenses: { href: "/expenses", label: "مستخلصات المقاولين" }, purchases: { href: "/purchases", label: "المشتريات" }, warehouse: { href: "/warehouse", label: "المخزن" }, inventory: { href: "/warehouse?tab=items", label: "الأصناف والمخزن" }, pettycash: { href: "/petty-cash", label: "الخزنة" }, salary: { href: "/salaries", label: "المرتبات" }, bank: { href: "/bank", label: "البنك" }, masterdata: { href: "/management", label: "الإدارة والمشروعات" }, account: { href: "/management", label: "إدارة الحسابات" }, role: { href: "/management", label: "الصلاحيات" }, profile: { href: "/profile", label: "الملف الشخصي" }, accounting: { href: "/accounting", label: "المحاسبة" }, financial: { href: "/accounting", label: "العمليات المالية" },
};
const auditLink = (action: string) => auditLinks[action.split(".")[0]] || { href: "/attention", label: "سجل الإجراءات" };
function auditSummary(details: string | null) {
  if (!details) return "لا توجد تفاصيل إضافية مسجلة لهذا الإجراء.";
  try {
    const parsed = JSON.parse(details) as Record<string, unknown>;
    const input = parsed.input && typeof parsed.input === "object" && !Array.isArray(parsed.input) ? parsed.input as Record<string, unknown> : {};
    const values = { ...parsed, ...input };
    const labels: Record<string, string> = { name: "الاسم", number: "الرقم", stage: "المرحلة", status: "الحالة", type: "النوع", reason: "السبب", reference: "المرجع", paymentSource: "مصدر السداد", attachmentCount: "مرفقات", changedName: "تم تعديل الاسم", changedAvatar: "تم تعديل الصورة", safeDelete: "حذف آمن", active: "الحالة", incomingVisible: "إتاحة الوارد", financialVisible: "إتاحة الماليات" };
    const pieces = Object.entries(labels).flatMap(([key, label]) => {
      const value = values[key];
      if (value === undefined || value === null || value === "") return [];
      if (typeof value === "boolean") return value ? [`${label}: نعم`] : [];
      return typeof value === "string" || typeof value === "number" ? [`${label}: ${String(value).slice(0, 90)}`] : [];
    });
    const money = (value: unknown) => typeof value === "number" ? `${(value / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م` : null;
    const amount = money(values.amountCents) || money(values.totalCents);
    if (amount) pieces.push(`القيمة: ${amount}`);
    return pieces.slice(0, 3).join(" · ") || "تم تسجيل التغيير على السجل المرتبط بهذا الإجراء.";
  } catch { return "تم تسجيل التغيير على السجل المرتبط بهذا الإجراء."; }
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const profile = await accessProfile(session.user.id);
  if (!profile || !profile.permissions.includes("dashboard.view")) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  try {
    const requestedProject = new URL(request.url).searchParams.get("project");
    const requestedAuditPage = Number(new URL(request.url).searchParams.get("auditPage") || "1");
    const selectedProject = requestedProject ? await prisma.project.findFirst({ where: { id: requestedProject, active: true, ...(profile.isProjectScoped ? { id: { in: profile.projectIds } } : {}) }, select: { id: true } }) : null;
    const projectId = selectedProject?.id;
    const alerts = await getAttentionAlerts(profile, projectId);
    if (profile.user.role?.key !== "admin") return NextResponse.json({ alerts, count: alerts.length }, { headers: { "Cache-Control": "private, no-store" } });
    const page = Number.isSafeInteger(requestedAuditPage) && requestedAuditPage > 0 ? requestedAuditPage : 1;
    const pageSize = 10;
    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, select: { id: true, actorId: true, action: true, target: true, details: true, createdAt: true } }),
      prisma.auditLog.count(),
    ]);
    const actorIds = [...new Set(logs.map((log) => log.actorId))];
    const actors = actorIds.length ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } }) : [];
    const names = new Map(actors.map((actor) => [actor.id, actor.name]));
    const pages = Math.max(1, Math.ceil(total / pageSize));
    return NextResponse.json({ alerts, count: alerts.length, activities: logs.map((log) => { const destination = auditLink(log.action); return { id: log.id, actor: names.get(log.actorId) || "حساب غير متاح", action: log.action, target: log.target, summary: auditSummary(log.details), href: destination.href, hrefLabel: `فتح ${destination.label}`, createdAt: log.createdAt.toISOString() }; }), activityPagination: { page: Math.min(page, pages), total } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Unable to load attention alerts", error);
    return NextResponse.json({ error: "ATTENTION_UNAVAILABLE" }, { status: 503 });
  }
}
