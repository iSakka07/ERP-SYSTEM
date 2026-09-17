import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const base = process.env.ERP_TEST_URL || "http://localhost:3090";

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
  const response = await fetch(`${base}/api/auth/callback/credentials`, { method: "POST", redirect: "manual", headers: { ...headers(jar), "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ csrfToken, email, password: "Admin@123456", callbackUrl: `${base}/project-cost-control` }) });
  takeCookies(response, jar);
  assert.ok((await (await fetch(`${base}/api/auth/session`, { headers: headers(jar) })).json()).user, `login ${email}`);
  return jar;
}

try {
  const [admin, sales, project] = await Promise.all([
    login("admin@erp.local"),
    login("sales@erp.local"),
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
  assert.equal(data.cash.supplierPaymentsIncluded, false);
  console.log("Project Cost Control API passed: validation, RBAC and data contract.");
} finally {
  await db.$disconnect();
}
