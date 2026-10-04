import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

assert.equal(process.env.ERP_ISOLATED_TEST, "true");
const db = new PrismaClient();
const base = process.env.ERP_TEST_URL;
const password = process.env.ERP_TEST_ADMIN_PASSWORD;

async function login() {
  const cookies = new Map();
  const save = (response) => response.headers.getSetCookie().forEach((cookie) => {
    const [key, ...value] = cookie.split(";")[0].split("=");
    cookies.set(key, value.join("="));
  });
  const header = () => [...cookies].map(([key, value]) => `${key}=${value}`).join("; ");
  const csrf = await fetch(`${base}/api/auth/csrf`); save(csrf);
  const { csrfToken } = await csrf.json();
  const response = await fetch(`${base}/api/auth/callback/credentials`, {
    method: "POST", redirect: "manual", headers: { Cookie: header(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrfToken, email: "admin@erp.local", password, callbackUrl: base }),
  });
  save(response);
  return header();
}

async function salaryRequest(cookie, action, payload, withFile = false) {
  const body = new FormData();
  body.set("action", action);
  body.set("payload", JSON.stringify(payload));
  if (withFile) {
    body.append("files", new File(["%PDF-1.4\npayroll test"], "payroll-test.pdf", { type: "application/pdf" }));
    body.append("filesLabels", "مرفق اختبار المرتبات");
  }
  const response = await fetch(`${base}/api/salaries`, {
    method: "POST",
    headers: { Cookie: cookie, Origin: base, "Idempotency-Key": randomUUID() },
    body,
  });
  return { status: response.status, body: await response.json() };
}

try {
  const cookie = await login();
  const tag = randomUUID().slice(0, 8);
  const employee = await db.employee.create({ data: { employeeCode: `SAL-${tag}`, name: `موظف رواتب ${tag}`, jobTitle: "accountant", monthlySalaryCents: 100_000 } });
  const currentMonth = new Date().toISOString().slice(0, 7);

  const tooLargeAdvance = await salaryRequest(cookie, "advance", { employeeId: employee.id, amount: 1000.01, issuedAt: `${currentMonth}-01`, repaymentMode: "NEXT_PAYROLL", source: "EXECUTIVE_DIRECTOR" }, true);
  assert.equal(tooLargeAdvance.status, 400);
  assert.match(tooLargeAdvance.body.error, /إجمالي السلف/);

  const advance = await salaryRequest(cookie, "advance", { employeeId: employee.id, amount: 200, issuedAt: `${currentMonth}-01`, repaymentMode: "NEXT_PAYROLL", source: "EXECUTIVE_DIRECTOR" }, true);
  assert.equal(advance.status, 201, JSON.stringify(advance.body));

  const tooLargeDeduction = await salaryRequest(cookie, "deduction", { employeeId: employee.id, month: currentMonth, amount: 1000.01, name: "خصم اختبار", reason: "اختبار الحد الأقصى" });
  assert.equal(tooLargeDeduction.status, 400);
  assert.match(tooLargeDeduction.body.error, /إجمالي خصومات/);

  const payroll = await salaryRequest(cookie, "create-payroll", { month: currentMonth }, true);
  assert.equal(payroll.status, 201, JSON.stringify(payroll.body));
  const duplicate = await salaryRequest(cookie, "create-payroll", { month: currentMonth }, true);
  assert.equal(duplicate.status, 400);
  assert.match(duplicate.body.error, /معتمد بالفعل/);

  const afterApproval = await db.employeeAdvance.findUniqueOrThrow({ where: { id: advance.body.id } });
  assert.equal(afterApproval.remainingCents, 0);
  assert.equal(afterApproval.status, "SETTLED");

  const reverted = await salaryRequest(cookie, "payroll-revert", { id: payroll.body.id, reason: "اختبار إرجاع الكشف" });
  assert.equal(reverted.status, 201, JSON.stringify(reverted.body));
  assert.equal(await db.payrollRun.count({ where: { id: payroll.body.id } }), 0);
  assert.equal(await db.advanceInstallment.count({ where: { advanceId: advance.body.id } }), 0);
  const restoredAdvance = await db.employeeAdvance.findUniqueOrThrow({ where: { id: advance.body.id } });
  assert.equal(restoredAdvance.remainingCents, 20_000);
  assert.equal(restoredAdvance.status, "OPEN");
  assert.equal(await db.journalEntry.count({ where: { sourceType: "PAYROLL_APPROVAL_REVERSAL" } }), 1);

  console.log("PASS: salary API limits, duplicate-month guard, and payroll reversal.");
} finally {
  await db.$disconnect();
}
