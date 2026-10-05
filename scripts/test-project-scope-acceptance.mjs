import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { PrismaClient } from "@prisma/client";

assert.equal(process.env.ERP_ISOLATED_TEST, "true");
assert.match(process.env.DATABASE_URL || "", /[\\/]tmp[\\/]isolated-test-/);
const base = process.env.ERP_TEST_URL || "";
assert.match(base, /^http:\/\/127\.0\.0\.1:\d+$/);
const db = new PrismaClient();
const tag = randomUUID().slice(0, 8);
const password = `Scope-${randomUUID()}-Pass`;
const pdf = "%PDF-1.4\nProject scope acceptance";

const cookieHeader = (jar) => [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
function saveCookies(response, jar) {
  for (const cookie of response.headers.getSetCookie()) {
    const [name, ...value] = cookie.split(";")[0].split("=");
    jar.set(name, value.join("="));
  }
}
async function login(email) {
  const jar = new Map();
  const csrf = await fetch(`${base}/api/auth/csrf`); saveCookies(csrf, jar);
  const { csrfToken } = await csrf.json();
  const response = await fetch(`${base}/api/auth/callback/credentials`, {
    method: "POST", redirect: "manual",
    headers: { Cookie: cookieHeader(jar), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrfToken, email, password, callbackUrl: `${base}/incoming` }),
  });
  saveCookies(response, jar);
  assert.equal(response.status, 302);
  assert.equal((await (await fetch(`${base}/api/auth/session`, { headers: { Cookie: cookieHeader(jar) } })).json()).user.email, email);
  return jar;
}
async function page(path, jar) {
  return fetch(base + path, { redirect: "manual", headers: { Cookie: cookieHeader(jar) } });
}
async function post(path, jar, payload, { file = false } = {}) {
  const body = new FormData();
  body.set("payload", JSON.stringify(payload));
  if (file) {
    body.append("files", new Blob([pdf], { type: "application/pdf" }), "scope-proof.pdf");
    body.append("filesLabels", "إثبات اختبار نطاق المشروع");
  }
  const response = await fetch(base + path, {
    method: "POST",
    headers: { Cookie: cookieHeader(jar), Origin: base, "Idempotency-Key": randomUUID() },
    body,
  });
  return { status: response.status, body: await response.json() };
}

try {
  const owner = await db.company.create({ data: { name: `Scope owner ${tag}`, type: "OWNER" } });
  const supplier = await db.company.create({ data: { name: `Scope supplier ${tag}`, type: "SUPPLIER" } });
  const subcontractor = await db.company.create({ data: { name: `Scope subcontractor ${tag}`, type: "SUBCONTRACTOR" } });
  const own = await db.project.create({ data: { code: `SC-OWN-${tag}`, name: `SCOPE_OWN_${tag}`, companyId: owner.id } });
  const alien = await db.project.create({ data: { code: `SC-ALIEN-${tag}`, name: `SCOPE_ALIEN_${tag}`, companyId: owner.id } });
  const employee = await db.employee.create({ data: { employeeCode: `SC-EMP-${tag}`, name: `Scope engineer ${tag}`, jobTitle: "engineer" } });
  await db.projectEngineerAssignment.create({ data: { projectId: own.id, employeeId: employee.id } });
  const role = await db.role.findUniqueOrThrow({ where: { key: "technical_office_engineer" } });
  const user = await db.user.create({ data: { name: `Scope engineer ${tag}`, email: `scope-${tag}@test.invalid`, passwordHash: await hash(password, 10), roleId: role.id, employeeId: employee.id } });
  const unassignedEmployee = await db.employee.create({ data: { employeeCode: `SC-NONE-${tag}`, name: `Unassigned engineer ${tag}`, jobTitle: "engineer" } });
  const unassignedUser = await db.user.create({ data: { name: `Unassigned engineer ${tag}`, email: `scope-none-${tag}@test.invalid`, passwordHash: await hash(password, 10), roleId: role.id, employeeId: unassignedEmployee.id } });
  for (const key of ["incoming.manage", "expenses.manage", "purchases.manage", "incoming.view", "expenses.view", "purchases.view", "project_cost_control.view"]) {
    const permission = await db.permission.findUniqueOrThrow({ where: { key } });
    await db.userPermissionOverride.upsert({ where: { userId_permissionId: { userId: user.id, permissionId: permission.id } }, update: { enabled: true }, create: { userId: user.id, permissionId: permission.id, enabled: true } });
    await db.userPermissionOverride.upsert({ where: { userId_permissionId: { userId: unassignedUser.id, permissionId: permission.id } }, update: { enabled: true }, create: { userId: unassignedUser.id, permissionId: permission.id, enabled: true } });
  }
  const alienContract = await db.incomingContract.create({ data: { number: `SC-ALIEN-C-${tag}`, name: `SCOPE_ALIEN_CONTRACT_${tag}`, projectId: alien.id, originalCents: 1_000 } });
  const ownContract = await db.incomingContract.create({ data: { number: `SC-OWN-C-${tag}`, name: `SCOPE_OWN_CONTRACT_${tag}`, projectId: own.id, originalCents: 1_000 } });
  const jar = await login(user.email);

  for (const path of ["/incoming/new", "/expenses/new", "/purchases/new", `/incoming/${ownContract.id}/statements/new`]) {
    const response = await page(path, jar);
    assert.equal(response.status, 200, `${path} is available for the scoped user`);
    const html = await response.text();
    assert.ok(html.includes(own.name), `${path} includes the assigned project`);
    assert.ok(!html.includes(alien.name), `${path} excludes the unassigned project`);
    assert.ok(!html.includes(alienContract.name), `${path} excludes the unassigned contract`);
  }
  const deniedDetail = await page(`/incoming/${alienContract.id}/statements/new`, jar);
  const deniedDetailHtml = await deniedDetail.text();
  if ([302, 303, 307, 308].includes(deniedDetail.status)) {
    assert.equal(new URL(deniedDetail.headers.get("location"), base).pathname, "/incoming");
  } else {
    assert.equal(deniedDetail.status, 200);
    assert.ok(
      [307, 308].some((status) =>
        deniedDetailHtml.includes("NEXT_REDIRECT;replace;/incoming;" + status + ";"),
      ),
    );
  }
  assert.ok(!deniedDetailHtml.includes(alienContract.name));
  const ownCostControl = await page(`/project-cost-control?project=${own.id}`, jar);
  assert.equal(ownCostControl.status, 200);
  assert.ok((await ownCostControl.text()).includes(own.name));
  const alienCostControl = await page(`/project-cost-control?project=${alien.id}`, jar);
  assert.equal(alienCostControl.status, 200);
  const alienCostControlHtml = await alienCostControl.text();
  assert.ok(alienCostControlHtml.includes(own.name));
  assert.ok(!alienCostControlHtml.includes(alien.name));
  assert.equal((await page(`/api/project-cost-control?projectId=${alien.id}`, jar)).status, 403);
  assert.equal((await page(`/api/project-cost-control?projectId=${own.id}`, jar)).status, 200);
  console.log("PASS scoped creation pages and direct contract URL do not disclose another project");

  const unassignedJar = await login(unassignedUser.email);
  for (const [path, message] of [
    ["/incoming/new", "لا توجد مشروعات متاحة لحسابك لإنشاء هذا المستند."],
    ["/expenses/new", "لا توجد مشروعات متاحة لحسابك لإنشاء حساب مقاول."],
    ["/purchases/new", "لا توجد مشروعات متاحة لحسابك لإنشاء فاتورة مشتريات."],
  ]) {
    const response = await page(path, unassignedJar);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(html.includes(message), `${path} explains the missing assignment`);
    assert.ok(!html.includes(own.name) && !html.includes(alien.name), `${path} does not fall back to all projects`);
  }
  console.log("PASS unassigned users receive an empty, non-disclosing creation state");

  const blockedIncoming = await post("/api/incoming", jar, { action: "contract", number: `SC-BLOCK-I-${tag}`, name: "Blocked incoming", projectId: alien.id, value: 100 }, { file: true });
  assert.equal(blockedIncoming.status, 400);
  assert.equal(await db.incomingContract.count({ where: { number: `SC-BLOCK-I-${tag}` } }), 0);
  const allowedIncoming = await post("/api/incoming", jar, { action: "contract", number: `SC-ALLOW-I-${tag}`, name: "Allowed incoming", projectId: own.id, value: 100 }, { file: true });
  assert.equal(allowedIncoming.status, 200, JSON.stringify(allowedIncoming.body));

  const blockedExpense = await post("/api/expenses", jar, { action: "account", name: "Blocked expense", companyId: subcontractor.id, projectId: alien.id, scope: "scope test" });
  assert.equal(blockedExpense.status, 403);
  assert.equal(await db.subcontractAccount.count({ where: { name: "Blocked expense" } }), 0);
  const allowedExpense = await post("/api/expenses", jar, { action: "account", name: "Allowed expense", companyId: subcontractor.id, projectId: own.id, scope: "scope test" });
  assert.equal(allowedExpense.status, 200, JSON.stringify(allowedExpense.body));

  const purchasePayload = (projectId, name) => ({ action: "invoice", projectId, supplierId: supplier.id, invoiceDate: "2026-10-03", name, paymentSource: "EXECUTIVE_DIRECTOR", paidAmount: 0, stockMode: "LEGACY_DIRECT", items: [{ name: "Scope service", unit: "unit", quantity: 1, price: 100 }] });
  const blockedPurchase = await post("/api/purchases", jar, purchasePayload(alien.id, "Blocked purchase"), { file: true });
  assert.equal(blockedPurchase.status, 400);
  assert.equal(await db.purchaseInvoice.count({ where: { name: "Blocked purchase" } }), 0);
  const allowedPurchase = await post("/api/purchases", jar, purchasePayload(own.id, "Allowed purchase"), { file: true });
  assert.equal(allowedPurchase.status, 200, JSON.stringify(allowedPurchase.body));
  console.log("PASS incoming, expenses and purchases reject an unassigned project and create records only in the assigned project");
} finally {
  await db.$disconnect();
}
