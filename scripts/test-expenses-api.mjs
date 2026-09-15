import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { expenseSummary } from "../src/lib/expenses.ts";
const db = new PrismaClient();
const base = process.env.ERP_TEST_URL || "http://localhost:3090";
const stamp = Date.now();
const password = randomBytes(24).toString("base64url");
const users = [],
  roles = [];
let accountId;
let proof;
const headers = (jar) => ({
  Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
});
function take(r, jar) {
  for (const c of r.headers.getSetCookie()) {
    const [k, ...v] = c.split(";")[0].split("=");
    jar.set(k, v.join("="));
  }
}
async function login(email) {
  const jar = new Map();
  const c = await fetch(`${base}/api/auth/csrf`);
  take(c, jar);
  const { csrfToken } = await c.json();
  const r = await fetch(`${base}/api/auth/callback/credentials`, {
    method: "POST",
    redirect: "manual",
    headers: {
      ...headers(jar),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      csrfToken,
      email,
      password,
      callbackUrl: `${base}/expenses`,
    }),
  });
  take(r, jar);
  const s = await fetch(`${base}/api/auth/session`, { headers: headers(jar) });
  assert.ok((await s.json()).user, `temporary test login ${email}`);
  return jar;
}
async function post(payload, jar, files = true, origin = base) {
  const f = new FormData();
  f.set("payload", JSON.stringify(payload));
  if (files) f.append("files", new Blob([proof]), "AUTOMATED-TEST-ONLY.pdf");
  const r = await fetch(`${base}/api/expenses`, {
    method: "POST",
    headers: { ...headers(jar), Origin: origin },
    body: f,
  });
  return { status: r.status, ...(await r.json()) };
}
async function read(id) {
  return db.subcontractStatement.findUniqueOrThrow({
    where: { id },
    include: { items: true, deductions: true, payments: true },
  });
}
async function stage(id, key, jar, expected = 200) {
  const st = await read(id);
  const r = await post(
    { action: "stage", id, revision: st.revision, stage: key },
    jar,
    false,
  );
  assert.equal(r.status, expected, JSON.stringify(r));
}
try {
  proof = (
    await db.incomingAttachment.findFirstOrThrow({
      where: { name: "DEMO-ONLY.pdf" },
    })
  ).data;
  const grants = {
    manager: ["expenses.view", "expenses.manage", "expenses.return"],
    technical: ["expenses.view", "expenses.approve_technical"],
    site: ["expenses.view", "expenses.approve_site"],
    executive: ["expenses.view", "expenses.approve_executive"],
    accounting: ["expenses.view", "expenses.pay"],
    forbidden: ["dashboard.view"],
  };
  const jars = {};
  for (const [key, keys] of Object.entries(grants)) {
    const ps = await db.permission.findMany({ where: { key: { in: keys } } });
    assert.equal(ps.length, keys.length);
    const role = await db.role.create({
      data: {
        key: `TEST-EXP-${stamp}-${key}`,
        name: `اختبار ${key}`,
        permissions: { create: ps.map((p) => ({ permissionId: p.id })) },
      },
    });
    roles.push(role.id);
    const user = await db.user.create({
      data: {
        email: `test-exp-${stamp}-${key}@erp.local`,
        name: "اختبار آلي مؤقت",
        passwordHash: await hash(password, 10),
        roleId: role.id,
      },
    });
    users.push(user.id);
    jars[key] = await login(user.email);
  }
  assert.equal(
    (await fetch(`${base}/api/expenses`, { method: "POST" })).status,
    401,
  );
  assert.equal(
    (await post({ action: "account" }, jars.forbidden, false)).status,
    403,
  );
  const project = await db.project.findUniqueOrThrow({
    where: { code: "MAYAN-27" },
  });
  const company = await db.company.findUniqueOrThrow({
    where: { name: "شركة التمساح" },
  });
  const account = {
    action: "account",
    name: `TEST-EXP-${stamp}`,
    projectId: project.id,
    companyId: company.id,
    scope: "اختبار حصر آلي — بيانات مؤقتة فقط",
  };
  assert.equal((await post(account, jars.manager, false)).status, 400);
  assert.equal(
    (await post(account, jars.manager, true, "https://invalid.example")).status,
    403,
  );
  let r = await post(account, jars.manager);
  assert.equal(r.status, 200, JSON.stringify(r));
  accountId = r.id;
  const row = {
    itemKey: "paint",
    name: "نقاشة اختبار",
    unit: "م2",
    currentQuantity: 200,
    price: 400,
    entitlementPercent: 65,
  };
  const payload = {
    action: "statement",
    accountId,
    kind: "CURRENT",
    statementDate: "2026-09-15",
    items: [row],
    deductions: [{ name: "تأمين", kind: "PERCENT", value: 5 }],
  };
  assert.equal((await post(payload, jars.manager, false)).status, 400);
  r = await post(payload, jars.manager);
  assert.equal(r.status, 200, JSON.stringify(r));
  const firstId = r.id;
  let st = await read(firstId);
  assert.equal(st.grossCents, 5200000);
  assert.equal(st.netCents, 4940000);
  assert.equal(expenseSummary([st]).grossCents, 0);
  const attachment = await db.expenseAttachment.findFirstOrThrow({
    where: { entityId: firstId },
  });
  assert.equal(
    (
      await fetch(`${base}/api/expenses/attachments/${attachment.id}`, {
        headers: headers(jars.forbidden),
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(`${base}/api/expenses/attachments/${attachment.id}`, {
        headers: headers(jars.manager),
      })
    ).status,
    200,
  );
  assert.equal(
    (await post(payload, jars.manager)).status,
    400,
    "no parallel draft",
  );
  await stage(firstId, "TECHNICAL", jars.manager, 403);
  await stage(firstId, "SITE", jars.site, 400);
  r = await post(
    {
      ...payload,
      id: firstId,
      revision: st.revision,
      items: [{ ...row, currentQuantity: 200000, entitlementPercent: 100 }],
    },
    jars.manager,
    false,
  );
  assert.equal(r.status, 200, JSON.stringify(r));
  st = await read(firstId);
  assert.equal(
    st.grossCents,
    8000000000,
    "large amounts roundtrip through SQLite REAL",
  );
  r = await post(
    { ...payload, id: firstId, revision: st.revision },
    jars.manager,
    false,
  );
  assert.equal(r.status, 200, JSON.stringify(r));
  st = await read(firstId);
  await stage(firstId, "TECHNICAL", jars.technical);
  assert.equal(
    (
      await post(
        { ...payload, id: firstId, revision: st.revision },
        jars.manager,
      )
    ).status,
    400,
    "approved sheet immutable",
  );
  await stage(firstId, "SITE", jars.site);
  assert.equal(expenseSummary([await read(firstId)]).grossCents, 0);
  await stage(firstId, "EXECUTIVE", jars.executive);
  assert.equal(expenseSummary([await read(firstId)]).grossCents, 5200000);
  await stage(firstId, "ACCOUNTING", jars.accounting);
  st = await read(firstId);
  const payment = {
    action: "payment",
    statementId: firstId,
    revision: st.revision,
    amount: 30000,
    paymentDate: "2026-09-15",
    method: "CHEQUE",
    reference: "TEST-CHEQUE-1",
  };
  assert.equal((await post(payment, jars.manager)).status, 403);
  assert.equal((await post(payment, jars.accounting, false)).status, 400);
  r = await post(payment, jars.accounting);
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.equal(
    (await post(payment, jars.accounting)).status,
    400,
    "stale duplicate payment",
  );
  assert.equal(expenseSummary([await read(firstId)]).grossCents, 5200000);
  r = await post(
    {
      ...payload,
      items: [{ ...row, currentQuantity: 100, entitlementPercent: 100 }],
    },
    jars.manager,
  );
  assert.equal(r.status, 200, JSON.stringify(r));
  const secondId = r.id;
  st = await read(secondId);
  assert.equal(st.grossCents, 12000000);
  assert.equal(st.items[0].previousQuantity, 200);
  assert.equal(st.previousGrossCents, 5200000);
  const first = await read(firstId);
  assert.equal(
    (
      await post(
        {
          action: "stage",
          id: firstId,
          revision: first.revision,
          stage: "DRAFT",
          reason: "اختبار",
        },
        jars.manager,
        false,
      )
    ).status,
    400,
    "cannot return paid/preceding Jari",
  );
  assert.equal(
    (
      await post(
        { ...payload, id: secondId, revision: st.revision, items: [] },
        jars.manager,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await post(
        {
          ...payload,
          id: secondId,
          revision: st.revision,
          items: [
            {
              ...row,
              currentQuantity: 100,
              price: 401,
              entitlementPercent: 100,
            },
          ],
        },
        jars.manager,
      )
    ).status,
    400,
  );
  await stage(secondId, "TECHNICAL", jars.technical);
  st = await read(secondId);
  r = await post(
    {
      action: "stage",
      id: secondId,
      revision: st.revision,
      stage: "DRAFT",
      reason: "إعادة مراجعة حصر تجريبية",
    },
    jars.manager,
    false,
  );
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.equal((await read(secondId)).stage, "DRAFT");
  await stage(secondId, "TECHNICAL", jars.technical);
  await stage(secondId, "SITE", jars.site);
  await stage(secondId, "EXECUTIVE", jars.executive);
  let all = await db.subcontractStatement.findMany({
    where: { accountId },
    include: { payments: true },
  });
  assert.equal(expenseSummary(all).grossCents, 12000000);
  assert.equal(expenseSummary(all).remainingCents, 8400000);
  await stage(secondId, "ACCOUNTING", jars.accounting);
  st = await read(secondId);
  const over = {
    ...payment,
    statementId: secondId,
    revision: st.revision,
    amount: 90000,
    reference: "TEST-ADVANCE",
  };
  assert.equal((await post(over, jars.accounting)).status, 400);
  r = await post(
    { ...over, confirmAdvance: true, notes: "دفعة مقدمة تجريبية موثقة" },
    jars.accounting,
  );
  assert.equal(r.status, 200, JSON.stringify(r));
  all = await db.subcontractStatement.findMany({
    where: { accountId },
    include: { payments: true },
  });
  assert.equal(expenseSummary(all).advanceCents, 600000);
  const third = {
    ...payload,
    items: [{ ...row, currentQuantity: 0, entitlementPercent: 100 }],
  };
  r = await post(third, jars.manager);
  assert.equal(r.status, 200, JSON.stringify(r));
  const thirdId = r.id;
  st = await read(thirdId);
  const priced = {
    ...third,
    id: thirdId,
    revision: st.revision,
    items: [
      ...third.items,
      {
        ...row,
        itemKey: "paint-new-price",
        sourceItemKey: "paint",
        currentQuantity: 50,
        price: 450,
        entitlementPercent: 100,
        priceChangeReason: "سعر جديد للكميات الجديدة فقط",
      },
    ],
  };
  assert.equal(
    (await post(priced, jars.manager, false)).status,
    400,
    "new price needs fresh proof even when draft already has attachment",
  );
  assert.equal(
    (
      await post(
        {
          ...priced,
          items: [
            third.items[0],
            { ...priced.items[1], priceChangeReason: "" },
          ],
        },
        jars.manager,
      )
    ).status,
    400,
  );
  r = await post(priced, jars.manager);
  assert.equal(r.status, 200, JSON.stringify(r));
  st = await read(thirdId);
  assert.equal(st.grossCents, 14250000);
  assert.equal(
    st.items.find((i) => i.itemKey === "paint").unitPriceCents,
    40000,
  );
  assert.equal(
    st.items.find((i) => i.itemKey === "paint-new-price").unitPriceCents,
    45000,
  );
  assert.equal(
    (await read(secondId)).grossCents,
    12000000,
    "previous approved snapshot unchanged",
  );
  await stage(thirdId, "TECHNICAL", jars.technical);
  await stage(thirdId, "SITE", jars.site);
  await stage(thirdId, "EXECUTIVE", jars.executive);
  assert.equal(
    expenseSummary(
      await db.subcontractStatement.findMany({
        where: { accountId },
        include: { payments: true },
      }),
    ).grossCents,
    14250000,
  );
  assert.equal(
    (
      await post(
        {
          ...third,
          items: [
            { ...row, currentQuantity: 1, entitlementPercent: 100 },
            { ...priced.items[1], currentQuantity: 0 },
          ],
        },
        jars.manager,
      )
    ).status,
    400,
    "future quantity cannot use retired price",
  );
  const page = await fetch(`${base}/expenses`, {
    headers: headers(jars.accounting),
  });
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.ok(html.includes("مستخلصات مقاولي الباطن"));
  assert.ok(!html.includes("إضافة مقاولة جديدة</button>"));
  console.log(
    "API passed: isolated approval permissions, ordering, mandatory evidence, executive financial effect, cumulative Jari2, stale writes, actual payment, advance, attachment protection, restricted UI.",
  );
} finally {
  if (accountId)
    await db.$transaction(async (tx) => {
      const sts = await tx.subcontractStatement.findMany({
        where: { accountId },
        select: { id: true },
      });
      const ids = sts.map((s) => s.id);
      const pays = await tx.subcontractPayment.findMany({
        where: { statementId: { in: ids } },
        select: { id: true },
      });
      await tx.expenseAttachment.deleteMany({
        where: {
          entityId: { in: [accountId, ...ids, ...pays.map((p) => p.id)] },
        },
      });
      await tx.subcontractPayment.deleteMany({
        where: { statementId: { in: ids } },
      });
      await tx.subcontractApproval.deleteMany({
        where: { statementId: { in: ids } },
      });
      await tx.subcontractItem.deleteMany({
        where: { statementId: { in: ids } },
      });
      await tx.subcontractDeduction.deleteMany({
        where: { statementId: { in: ids } },
      });
      await tx.subcontractStatement.deleteMany({ where: { accountId } });
      await tx.subcontractAccount.delete({ where: { id: accountId } });
    });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.role.deleteMany({ where: { id: { in: roles } } });
  await db.$disconnect();
  console.log(
    "Only exact temporary test records removed; demonstration, client data and audit retained.",
  );
}
