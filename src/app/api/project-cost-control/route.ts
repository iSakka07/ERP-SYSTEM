import { NextResponse } from "next/server";
import { incomingUser } from "@/lib/incoming-server";
import { getProjectCostControl } from "@/lib/project-cost-control";

export async function GET(request: Request) {
  if (!(await incomingUser("project_cost_control.view"))) return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  const projectId = new URL(request.url).searchParams.get("projectId") || "";
  if (!projectId) return NextResponse.json({ error: "اختر مشروعًا." }, { status: 400 });
  const data = await getProjectCostControl(projectId);
  return data ? NextResponse.json(data) : NextResponse.json({ error: "المشروع غير موجود أو غير نشط." }, { status: 404 });
}
