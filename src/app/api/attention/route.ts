import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { accessProfile } from "@/lib/access-control";
import { getAttentionAlerts } from "@/lib/attention-alerts";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const profile = await accessProfile(session.user.id);
  if (!profile || !profile.permissions.includes("dashboard.view")) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  try {
    const requestedProject = new URL(request.url).searchParams.get("project");
    const selectedProject = requestedProject ? await prisma.project.findFirst({ where: { id: requestedProject, active: true, ...(profile.isProjectScoped ? { id: { in: profile.projectIds } } : {}) }, select: { id: true } }) : null;
    const projectId = selectedProject?.id;
    const alerts = await getAttentionAlerts(profile, projectId);
    return NextResponse.json({ alerts, count: alerts.length }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Unable to load attention alerts", error);
    return NextResponse.json({ error: "ATTENTION_UNAVAILABLE" }, { status: 503 });
  }
}
