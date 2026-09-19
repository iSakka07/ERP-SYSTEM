import { NextResponse } from "next/server";
import { incomingUser } from "@/lib/incoming-server";
import { getProjectCostControl } from "@/lib/project-cost-control";

export async function GET(request: Request) {
  const user = await incomingUser("project_cost_control.view");
  if (!user) return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  const projectId = new URL(request.url).searchParams.get("projectId") || "";
  if (!projectId) return NextResponse.json({ error: "اختر مشروعًا." }, { status: 400 });
  if (user.isProjectScoped && !user.projectIds.includes(projectId)) return NextResponse.json({ error: "غير مصرح لهذا المشروع." }, { status: 403 });
  const data = await getProjectCostControl(projectId);
  return data ? NextResponse.json(data) : NextResponse.json({ error: "المشروع غير موجود أو غير نشط." }, { status: 404 });
}
