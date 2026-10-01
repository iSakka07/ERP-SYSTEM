import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const base = process.env.ERP_TEST_URL || "http://localhost:3090";
const tag = `scope-${randomUUID()}`;
const cleanup = { userId: "", limitedUserId: "", employeeId: "", projectIds: [], companyId: "" };

const headers = (jar) => ({ Cookie: [...jar].map(([key, value]) => `${key}=${value}`).join("; ") });
function takeCookies(response, jar) {
  for (const cookie of response.headers.getSetCookie()) {
    const [key, ...value] = cookie.split(";")[0].split("=");
    jar.set(key, value.join("="));
  }
}
async function login(email) {
  const jar = new Map();
  const csrf = await fetch(`${base}/api/auth/csrf`);
  takeCookies(csrf, jar);
  const { csrfToken } = await csrf.json();
  const response = await fetch(`${base}/api/auth/callback/credentials`, { method: "POST", redirect: "manual", headers: { ...headers(jar), "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ csrfToken, email, password: process.env.ERP_TEST_ADMIN_PASSWORD || "Admin@123456", callbackUrl: `${base}/project-cost-control` }) });
  takeCookies(response, jar);
  assert.ok((await (await fetch(`${base}/api/auth/session`, { headers: headers(jar) })).json()).user, `login ${email}`);
  return jar;
}

try {
  const limitedRole = await db.role.findUniqueOrThrow({ where: { key: "sales" } });
  const password = process.env.ERP_TEST_ADMIN_PASSWORD || "Admin@123456";
  const limited = await db.user.create({ data: { name: tag, email: `${tag}-limited@test.invalid`, passwordHash: await hash(password, 10), roleId: limitedRole.id } });
  cleanup.limitedUserId = limited.id;
  const [admin, sales, project] = await Promise.all([
    login("admin@erp.local"),
    login(limited.email),
    db.project.findFirstOrThrow({ where: { active: true }, select: { id: true } }),
  ]);
  assert.equal((await fetch(`${base}/api/project-cost-control`, { headers: headers(admin) })).status, 400);
  assert.equal((await fetch(`${base}/api/project-cost-control?projectId=missing`, { headers: headers(admin) })).status, 404);
  assert.equal((await fetch(`${base}/api/project-cost-control?projectId=${project.id}`, { headers: headers(sales) })).status, 403);
  const response = await fetch(`${base}/api/project-cost-control?projectId=${project.id}`, { headers: headers(admin) });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.project.id, project.id);
  assert.equal(typeof data.cost.totalCostCents, "number");
  assert.equal(typeof data.revenue.contractsCount, "number");
  assert.equal(typeof data.revenue.materialsCents, "number");
  assert.equal(typeof data.cash.subcontractPaymentsCount, "number");
  assert.equal(data.cash.supplierPaymentsIncluded, true);
  assert.equal(data.planning.budget, null);
  assert.equal(data.planning.forecast.finalCents, null);
  const planResponse = await fetch(`${base}/api/project-cost-control/planning`, { method: "POST", headers: { ...headers(admin), Origin: base, "Content-Type": "application/json" }, body: JSON.stringify({ action: "plan", projectId: project.id, revision: 0, budget: { SUBCONTRACTORS: 50_000_000, MATERIALS: 25_000_000, SALARIES: 15_000_000, OTHER: 10_000_000 }, progressPercent: 40, progressDate: new Date().toISOString().slice(0, 10) }) });
  assert.equal(planResponse.status, 200, await planResponse.text());
  const planned = await (await fetch(`${base}/api/project-cost-control?projectId=${project.id}`, { headers: headers(admin) })).json();
  assert.equal(planned.planning.forecast.finalCents, Math.round(Object.values(planned.planning.actualByCategory).reduce((a, b) => a + b, 0) / 0.4));
  assert.equal((await fetch(`${base}/api/project-cost-control/planning`, { method: "POST", headers: { ...headers(sales), Origin: base, "Content-Type": "application/json" }, body: JSON.stringify({ action: "plan", projectId: project.id, revision: 1, budget: null, progressPercent: null, progressDate: null }) })).status, 403);
  const role = await db.role.findUniqueOrThrow({ where: { key: "site_supervisor_engineer" } });
  const company = await db.company.create({ data: { name: tag, type: "OWNER" } });
  cleanup.companyId = company.id;
  const [allowedProject, forbiddenProject] = await Promise.all([
    db.project.create({ data: { name: `${tag}-allowed`, code: `${tag}-a`, companyId: company.id } }),
    db.project.create({ data: { name: `${tag}-forbidden`, code: `${tag}-b`, companyId: company.id } }),
  ]);
  cleanup.projectIds.push(allowedProject.id, forbiddenProject.id);
  const employee = await db.employee.create({ data: { name: tag, employeeCode: tag, jobTitle: "مهندس مشرف" } });
  cleanup.employeeId = employee.id;
  await db.projectEngineerAssignment.create({ data: { employeeId: employee.id, projectId: allowedProject.id } });
  const user = await db.user.create({ data: { name: tag, email: `${tag}@test.invalid`, passwordHash: await hash(password, 10), roleId: role.id, employeeId: employee.id } });
  cleanup.userId = user.id;
  const engineer = await login(user.email);
  const engineerHome = await (await fetch(`${base}/`, { headers: headers(engineer) })).text();
  assert.equal(engineerHome.includes(allowedProject.name), true, "engineer receives assigned project");
  assert.equal(engineerHome.includes(forbiddenProject.name), false, "engineer never receives another project markup");
  assert.equal((await fetch(`${base}/api/project-cost-control?projectId=${forbiddenProject.id}`, { headers: headers(engineer) })).status, 403, "engineer API scope blocks another project");
  console.log("Project Cost Control API passed: validation, API RBAC, dashboard data isolation and data contract.");
} finally {
  if (cleanup.userId) await db.user.delete({ where: { id: cleanup.userId } });
  if (cleanup.limitedUserId) await db.user.delete({ where: { id: cleanup.limitedUserId } });
  if (cleanup.employeeId) await db.employee.delete({ where: { id: cleanup.employeeId } });
  if (cleanup.projectIds.length) await db.project.deleteMany({ where: { id: { in: cleanup.projectIds } } });
  if (cleanup.companyId) await db.company.delete({ where: { id: cleanup.companyId } });
  await db.$disconnect();
}
