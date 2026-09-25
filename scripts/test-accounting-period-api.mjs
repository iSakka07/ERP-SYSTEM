import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const base = process.env.ERP_TEST_URL || "http://localhost:3090";
const month = "2026-09";
const cookies = new Map();
const headerCookie = () => [...cookies].map(([key, value]) => `${key}=${value}`).join("; ");
function take(response) { for (const row of response.headers.getSetCookie()) { const [key, ...value] = row.split(";")[0].split("="); cookies.set(key, value.join("=")); } }

async function login() {
  const csrf = await fetch(`${base}/api/auth/csrf`); take(csrf);
  const csrfToken = (await csrf.json()).csrfToken;
  const response = await fetch(`${base}/api/auth/callback/credentials`, { method: "POST", redirect: "manual", headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: headerCookie() }, body: new URLSearchParams({ csrfToken, email: "admin@erp.local", password: process.env.ERP_TEST_ADMIN_PASSWORD || "Admin@123456", callbackUrl: `${base}/accounting` }) });
  take(response);
  assert.ok((await (await fetch(`${base}/api/auth/session`, { headers: { Cookie: headerCookie() } })).json()).user, "admin login");
}

async function accounting(body) {
  const response = await fetch(`${base}/api/accounting`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: headerCookie(), Origin: base }, body: JSON.stringify(body) });
  return { status: response.status, ...(await response.json()) };
}

try {
  await login();
  const closed = await accounting({ action: "closePeriod", month });
  assert.equal(closed.status, 200, JSON.stringify(closed));
  assert.equal((await db.accountingPeriod.findUniqueOrThrow({ where: { month } })).status, "CLOSED");

  const form = new FormData();
  form.set("payload", JSON.stringify({ type: "OWNER_FUNDING", amount: 10, date: "2026-09-20", description: "اختبار فترة مقفلة", reference: `PERIOD-${randomUUID()}` }));
  const blocked = await fetch(`${base}/api/bank`, { method: "POST", headers: { Cookie: headerCookie(), Origin: base, "Idempotency-Key": randomUUID() }, body: form });
  const blockedBody = await blocked.json();
  assert.equal(blocked.status, 400, JSON.stringify(blockedBody));
  assert.match(blockedBody.error || "", /مقفلة/, "closed month blocks financial posting");

  const reopened = await accounting({ action: "reopenPeriod", month, reason: "اختبار قبول آلي لإقفال الدفتر" });
  assert.equal(reopened.status, 200, JSON.stringify(reopened));
  assert.equal((await db.accountingPeriod.findUniqueOrThrow({ where: { month } })).status, "OPEN");
  console.log("Accounting period API passed: close blocks posting and documented reopen restores access.");
} finally {
  await db.auditLog.deleteMany({ where: { action: { in: ["accounting.period.close", "accounting.period.reopen"] } } });
  await db.accountingPeriod.deleteMany({ where: { month } });
  await db.$disconnect();
}
