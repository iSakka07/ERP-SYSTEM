import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { resolve, relative, isAbsolute } from "node:path";
import { PrismaClient } from "@prisma/client";

// This suite deliberately changes demo data and must only run in disposable SQLite.
assert.equal(process.env.ERP_ISOLATED_TEST, "true");
const databaseUrl = process.env.DATABASE_URL || "";
assert.ok(databaseUrl.startsWith("file:"));
const databasePath = resolve(databaseUrl.slice(5));
const withinTmp = relative(resolve("tmp"), databasePath);
assert.ok(!isAbsolute(withinTmp) && !withinTmp.startsWith(".."));
assert.match(withinTmp.replaceAll("\\", "/"), /^isolated-test-[^/]+\/test\.db$/);
const base = process.env.ERP_TEST_URL || "";
assert.match(base, /^http:\/\/127\.0\.0\.1:\d+$/);
const password = process.env.ERP_TEST_ADMIN_PASSWORD;
assert.ok(password);
const db = new PrismaClient();
const cookieHeader = (jar) => [...jar].map(([key, value]) => `${key}=${value}`).join("; ");
function saveCookies(response, jar) {
  for (const cookie of response.headers.getSetCookie()) {
    const [key, ...parts] = cookie.split(";")[0].split("=");
    if (/max-age=0(?:;|$)/i.test(cookie)) jar.delete(key);
    else jar.set(key, parts.join("="));
  }
}
async function request(path, jar = new Map(), options = {}) {
  const response = await fetch(base + path, {
    ...options, redirect: "manual",
    headers: { Cookie: cookieHeader(jar), ...options.headers },
  });
  saveCookies(response, jar);
  return response;
}
async function login(email) {
  const jar = new Map();
  const { csrfToken } = await (await request("/api/auth/csrf", jar)).json();
  const response = await request("/api/auth/callback/credentials", jar, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrfToken, email, password, callbackUrl: base }),
  });
  assert.equal(response.status, 302);
  const session = await (await request("/api/auth/session", jar)).json();
  assert.equal(session?.user?.email, email);
  return jar;
}
async function rejectedLogin(email, rejectedPassword) {
  const jar = new Map();
  const { csrfToken } = await (await request("/api/auth/csrf", jar)).json();
  await request("/api/auth/callback/credentials", jar, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrfToken, email, password: rejectedPassword, callbackUrl: base }),
  });
  assert.ok(!(await (await request("/api/auth/session", jar)).json())?.user);
}
const pdf = "%PDF-1.4\nRuntime smoke attachment";
async function bank(jar, payload, key = randomUUID(), origin = base, attachment = false) {
  const body = new FormData();
  body.set("payload", JSON.stringify(payload));
  if (attachment) {
    body.append("files", new Blob([pdf], { type: "application/pdf" }), "runtime-smoke.pdf");
    body.append("filesLabels", "إثبات اختبار التحديث");
  }
  const response = await request("/api/bank", jar, {
    method: "POST", body, headers: { Origin: origin, "Idempotency-Key": key },
  });
  return { status: response.status, body: await response.json() };
}

try {
  const loginPage = await request("/login");
  assert.equal(loginPage.status, 200);
  assert.match(loginPage.headers.get("content-security-policy") || "", /frame-ancestors 'none'/);
  assert.match(loginPage.headers.get("strict-transport-security") || "", /max-age=31536000/);
  assert.equal(loginPage.headers.get("x-frame-options"), "DENY");
  assert.equal(loginPage.headers.get("x-content-type-options"), "nosniff");
  const protectedPage = await request("/purchases");
  assert.ok([302, 303, 307, 308].includes(protectedPage.status));
  assert.equal(new URL(protectedPage.headers.get("location"), base).pathname, "/login");
  assert.equal((await request("/api/bank")).status, 401);
  assert.equal((await request("/brand/asgc-logo.png")).status, 200);
  assert.equal((await request("/fonts/Cairo-Regular.ttf")).status, 200);
  const correlationId = randomUUID();
  const health = await request("/api/health", new Map(), { headers: { "x-request-id": correlationId } });
  assert.equal((await health.json()).status, "ok");
  assert.equal(health.headers.get("x-request-id"), correlationId);
  console.log("PASS public assets, correlated health request, anonymous page and API protection");

  await rejectedLogin("admin@erp.local", process.env.ERP_TEST_BOOTSTRAP_PASSWORD || "");
  const existingAdmin = await db.user.findUniqueOrThrow({ where: { email: "admin@erp.local" } });
  assert.equal(existingAdmin.active, true);
  console.log("PASS security headers and bootstrap password cannot reset an existing administrator");

  const admin = await login("admin@erp.local");
  const sales = await login("sales@erp.local");
  assert.equal((await request("/api/bank", sales)).status, 403);
  const deniedBankPage = await request("/bank", sales);
  if ([302, 303, 307, 308].includes(deniedBankPage.status)) {
    assert.equal(new URL(deniedBankPage.headers.get("location"), base).pathname, "/");
  } else {
    // Next.js may encode a redirect in a streamed Server Component response
    // after the HTTP status has already been committed as 200.
    assert.equal(deniedBankPage.status, 200);
    assert.match(await deniedBankPage.text(), /NEXT_REDIRECT;replace;\/;30[378];/);
  }
  for (const path of ["/", "/incoming", "/expenses", "/purchases", "/warehouse", "/bank", "/accounting", "/salaries", "/petty-cash", "/attachments", "/admin/accounts", "/incoming/new", "/expenses/new", "/purchases/new"]) {
    const response = await request(path, admin);
    assert.equal(response.status, 200, `admin render ${path}`);
    const html = await response.text();
    assert.match(html, /<html/);
    assert.ok(!/"digest":"[^"]+"/.test(html), `no streamed server error: ${path}`);
  }
  console.log("PASS login, denied role and 14 authenticated page renders");

  const reference = `RUNTIME-${randomUUID()}`;
  const payload = { type: "OWNER_FUNDING", amount: 123.45, date: new Date().toISOString().slice(0, 10), description: reference, reference };
  assert.equal((await bank(sales, payload)).status, 403);
  assert.equal((await bank(admin, payload, randomUUID(), "https://attacker.invalid")).status, 403);
  const key = randomUUID();
  const created = await bank(admin, payload, key, base, true);
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const replay = await bank(admin, payload, key, base, true);
  assert.equal(replay.status, 201);
  assert.equal(replay.body.id, created.body.id);
  assert.equal(replay.body.replayed, true);
  assert.equal((await bank(admin, { ...payload, amount: 124 }, key)).status, 409);
  assert.equal(await db.bankTransaction.count({ where: { reference } }), 1);
  const journal = await db.journalEntry.findFirstOrThrow({ where: { sourceType: "BANK_MOVEMENT", sourceId: created.body.id } });
  const file = await db.bankAttachment.findFirstOrThrow({ where: { transactionId: created.body.id } });
  assert.equal((await request(`/api/bank/attachments/${file.id}`, sales)).status, 403);
  const download = await request(`/api/bank/attachments/${file.id}`, admin);
  assert.equal(download.status, 200);
  assert.equal(download.headers.get("content-type"), "application/octet-stream");
  assert.equal(await download.text(), pdf);
  const reversed = await bank(admin, { action: "reverse", id: created.body.id, reason: "عكس اختبار تحديث Next.js" }, randomUUID(), base, true);
  assert.equal(reversed.status, 200, JSON.stringify(reversed.body));
  assert.equal((await db.bankTransaction.findUniqueOrThrow({ where: { id: created.body.id } })).status, "REVERSED");
  assert.equal(await db.journalEntry.count({ where: { reversalOfId: journal.id } }), 1);
  console.log("PASS financial authorization, Origin rejection, upload/download, idempotency and reversal journal");

  const { csrfToken } = await (await request("/api/auth/csrf", sales)).json();
  const logout = await request("/api/auth/signout", sales, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrfToken, callbackUrl: `${base}/login` }),
  });
  assert.equal(logout.status, 302);
  assert.ok(!(await (await request("/api/auth/session", sales)).json())?.user);
  await db.user.update({ where: { email: "admin@erp.local" }, data: { sessionVersion: { increment: 1 } } });
  assert.equal((await request("/api/bank", admin)).status, 401);
  console.log("PASS logout and session revocation; runtime upgrade smoke suite passed");
} finally {
  await db.$disconnect();
}
