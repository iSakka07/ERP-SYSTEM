import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { expenseSummary } from "../src/lib/expenses.ts";

const db = new PrismaClient();
const base = process.env.ERP_TEST_URL || "http://localhost:3090";
const stamp = Date.now();
const password = randomBytes(24).toString("base64url");
const userIds = [],
  roleIds = [];
let accountId, proof;
const headers = (jar) => ({
  Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
});
function cookies(response, jar) {
  for (const cookie of response.headers.getSetCookie()) {
    const [key, ...value] = cookie.split(";")[0].split("=");
    jar.set(key, value.join("="));
  }
}
async function login(email) {
  const jar = new Map();
  const csrf = await fetch(`${base}/api/auth/csrf`);
  cookies(csrf, jar);
  const response = await fetch(`${base}/api/auth/callback/credentials`, {
    method: "POST",
    redirect: "manual",
    headers: {
      ...headers(jar),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      csrfToken: (await csrf.json()).csrfToken,
      email,
      password,
      callbackUrl: `${base}/expenses`,
    }),
  });
  cookies(response, jar);
  assert.ok(
    (
      await (
        await fetch(`${base}/api/auth/session`, { headers: headers(jar) })
      ).json()
    ).user,
  );
  return jar;
}
async function post(payload, jar, files = true) {
  const form = new FormData();
  form.set("payload", JSON.stringify(payload));
  if (files)
    form.append("files", new Blob([proof]), "TEST-CORRECTION-ONLY.pdf");
  const response = await fetch(`${base}/api/expenses`, {
    method: "POST",
    headers: { ...headers(jar), Origin: base },
    body: form,
  });
  return { status: response.status, ...(await response.json()) };
}
const read = (id) =>
  db.subcontractStatement.findUniqueOrThrow({
    where: { id },
    include: { items: { orderBy: { position: "asc" } }, payments: true },
  });
const balance = async () =>
  expenseSummary(
    await db.subcontractStatement.findMany({
      where: { accountId },
      include: { payments: true },
    }),
  );
async function stage(id, key, jar, expected = 200) {
  const st = await read(id);
  const response = await post(
    { action: "stage", id, revision: st.revision, stage: key },
    jar,
    false,
  );
  assert.equal(response.status, expected, JSON.stringify(response));
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
  };
  const jars = {};
  for (const [key, keys] of Object.entries(grants)) {
    const permissions = await db.permission.findMany({
      where: { key: { in: keys } },
    });
    assert.equal(permissions.length, keys.length);
    const role = await db.role.create({
      data: {
        key: `TEST-CORRECTION-${stamp}-${key}`,
        name: `اختبار تصحيح ${key}`,
        permissions: {
          create: permissions.map((p) => ({ permissionId: p.id })),
        },
      },
    });
    roleIds.push(role.id);
    const user = await db.user.create({
      data: {
        email: `test-correction-${stamp}-${key}@erp.local`,
        name: "اختبار تصحيح مؤقت",
        passwordHash: await hash(password, 10),
        roleId: role.id,
      },
    });
    userIds.push(user.id);
    jars[key] = await login(user.email);
  }
  const project = await db.project.findUniqueOrThrow({
    where: { code: "MAYAN-27" },
  });
  const company = await db.company.findFirstOrThrow({
    where: { type: "SUBCONTRACTOR", active: true },
  });
  let response = await post(
    {
      action: "account",
      name: `TEST-CORRECTION-${stamp}`,
      scope: "بيانات اختبار تصحيح فقط",
      projectId: project.id,
      companyId: company.id,
    },
    jars.manager,
  );
  assert.equal(response.status, 200, JSON.stringify(response));
  accountId = response.id;
  const row = {
    itemKey: "old400",
    name: "نقاشة اختبار تصحيح",
    unit: "م2",
    currentQuantity: 300,
    price: 400,
    entitlementPercent: 100,
  };
  const payload = {
    action: "statement",
    accountId,
    kind: "CURRENT",
    statementDate: new Date().toISOString().slice(0, 10),
    items: [row],
    deductions: [{ name: "تأمين", kind: "PERCENT", value: 5 }],
  };
  response = await post(payload, jars.manager);
  assert.equal(response.status, 200, JSON.stringify(response));
  const firstId = response.id;
  for (const [key, jar] of [
    ["TECHNICAL", jars.technical],
    ["SITE", jars.site],
    ["EXECUTIVE", jars.executive],
  ])
    await stage(firstId, key, jar);
  const payment = {
    action: "accountingPayment",
    statementId: firstId,
    revision: (await read(firstId)).revision,
    amount: 90000,
    paymentDate: payload.statementDate,
    method: "TRANSFER",
    reference: "TEST-PAYMENT-CORRECTION",
  };
  response = await post(payment, jars.accounting);
  assert.equal(response.status, 200, JSON.stringify(response));
  const version = {
    ...row,
    itemKey: "new450",
    sourceItemKey: row.itemKey,
    priceChangeReason: "سعر جديد للكميات الجديدة",
    price: 450,
    currentQuantity: 100,
  };
  response = await post(
    { ...payload, items: [{ ...row, currentQuantity: 0 }, version] },
    jars.manager,
  );
  assert.equal(response.status, 200, JSON.stringify(response));
  const secondId = response.id;
  for (const [key, jar] of [
    ["TECHNICAL", jars.technical],
    ["SITE", jars.site],
    ["EXECUTIVE", jars.executive],
  ])
    await stage(secondId, key, jar);
  assert.equal((await balance()).grossCents, 16500000);
  const unchanged = {
    ...payload,
    items: [
      { ...row, currentQuantity: 0 },
      { ...version, currentQuantity: 0 },
    ],
  };
  response = await post(unchanged, jars.manager);
  assert.equal(response.status, 200, JSON.stringify(response));
  const thirdId = response.id;
  const corrected = {
    ...unchanged,
    id: thirdId,
    revision: (await read(thirdId)).revision,
    items: [
      {
        ...row,
        currentQuantity: 0,
        correctionQuantity: 200,
        correctionReason: "حصر زائد في إصدار400",
      },
      {
        ...version,
        currentQuantity: 0,
        correctionQuantity: 20,
        correctionReason: "حصر زائد في إصدار450",
      },
    ],
  };
  assert.equal((await post(corrected, jars.accounting)).status, 403);
  assert.equal(
    (await post(corrected, jars.manager, false)).status,
    400,
    "existing draft proof not sufficient for a new correction",
  );
  assert.equal(
    (await post({ ...corrected, statementDate: "2099-01-01" }, jars.manager))
      .status,
    400,
  );
  assert.equal(
    (await post({ ...corrected, statementDate: "2020-01-01" }, jars.manager))
      .status,
    400,
  );
  for (const patch of [
    { correctionQuantity: 301 },
    { correctionReason: " " },
    { currentQuantity: -1 },
    { price: 401 },
    { entitlementPercent: 99 },
  ])
    assert.equal(
      (
        await post(
          {
            ...corrected,
            items: [{ ...corrected.items[0], ...patch }, corrected.items[1]],
          },
          jars.manager,
        )
      ).status,
      400,
    );
  response = await post(corrected, jars.manager);
  assert.equal(response.status, 200, JSON.stringify(response));
  assert.equal(
    (await post(corrected, jars.manager)).status,
    400,
    "stale revision rejected",
  );
  let st = await read(thirdId);
  assert.equal(st.items[0].previousQuantity, 300);
  assert.equal(st.items[0].correctionQuantity, 200);
  assert.equal(st.items[0].unitPriceCents, 40000);
  assert.equal(st.items[1].unitPriceCents, 45000);
  assert.equal(st.grossCents, 7600000);
  assert.equal(st.netCents, 7220000);
  assert.equal(st.correctionDebtCents, 0, "draft has no effective debt");
  assert.equal((await balance()).debtCents, 0);
  assert.equal((await balance()).netCents, 15675000);
  assert.equal((await read(firstId)).grossCents, 12000000);
  assert.equal((await read(secondId)).grossCents, 16500000);
  assert.equal(
    (
      await post(
        { ...unchanged, id: thirdId, revision: st.revision },
        jars.manager,
        false,
      )
    ).status,
    400,
    "removing a correction needs fresh proof",
  );
  response = await post(
    { ...corrected, revision: st.revision },
    jars.manager,
    false,
  );
  assert.equal(response.status, 200, JSON.stringify(response));
  await stage(thirdId, "EXECUTIVE", jars.executive, 400);
  await stage(thirdId, "TECHNICAL", jars.manager, 403);
  await stage(thirdId, "TECHNICAL", jars.technical);
  await stage(thirdId, "SITE", jars.site);
  assert.equal(
    (await balance()).debtCents,
    0,
    "site approval does not affect financials",
  );
  await stage(thirdId, "EXECUTIVE", jars.executive);
  assert.equal((await balance()).debtCents, 1780000);
  assert.equal((await balance()).advanceCents, 0);
  assert.equal((await balance()).remainingCents, 0);
  // Documented return restores the preceding effective snapshot, without rewriting history.
  st = await read(thirdId);
  response = await post(
    {
      action: "stage",
      id: thirdId,
      revision: st.revision,
      stage: "DRAFT",
      reason: "مراجعة اختبار التصحيح قبل الصرف",
    },
    jars.manager,
    false,
  );
  assert.equal(response.status, 200, JSON.stringify(response));
  assert.equal((await balance()).debtCents, 0);
  for (const [key, jar] of [
    ["TECHNICAL", jars.technical],
    ["SITE", jars.site],
    ["EXECUTIVE", jars.executive],
  ])
    await stage(thirdId, key, jar);
  assert.equal((await balance()).debtCents, 1780000);
  const advance = {
    ...payment,
    statementId: thirdId,
    revision: (await read(thirdId)).revision,
    amount: 1000,
    reference: "TEST-EXPLICIT-ADVANCE",
  };
  assert.equal((await post(advance, jars.accounting)).status, 400);
  assert.equal(
    (
      await post(
        {
          ...advance,
          confirmAdvance: true,
          notes: "محاولة تجاوز منفصلة موثقة للاختبار",
        },
        jars.accounting,
      )
    ).status,
    400,
    "confirmed overpayment is still rejected",
  );
  assert.equal((await balance()).debtCents, 1780000);
  assert.equal(
    (await balance()).advanceCents,
    0,
    "overpayment no longer creates an advance",
  );
  const following = {
    ...unchanged,
    items: [unchanged.items[0], { ...version, currentQuantity: 50 }],
  };
  response = await post(following, jars.manager);
  assert.equal(response.status, 200, JSON.stringify(response));
  const fourthId = response.id;
  st = await read(fourthId);
  assert.equal(st.items[0].previousQuantity, 100);
  assert.equal(st.items[1].previousQuantity, 80);
  assert.equal(
    st.items[0].correctionQuantity,
    0,
    "period correction not repeated",
  );
  assert.equal(st.grossCents, 9850000);
  assert.equal(st.netCents, 9357500);
  for (const [key, jar] of [
    ["TECHNICAL", jars.technical],
    ["SITE", jars.site],
    ["EXECUTIVE", jars.executive],
  ])
    await stage(fourthId, key, jar);
  assert.equal((await balance()).debtCents, 0);
  assert.equal((await balance()).advanceCents, 0);
  assert.equal(
    (await balance()).remainingCents,
    357500,
    "subsequent entitlement settles debt once",
  );
  response = await post(
    {
      ...unchanged,
      kind: "FINAL",
      items: [
        {
          ...unchanged.items[0],
          correctionQuantity: 100,
          correctionReason: "تصحيح كامل الكمية السابقة400",
        },
        {
          ...unchanged.items[1],
          correctionQuantity: 130,
          correctionReason: "تصحيح كامل الكمية السابقة450",
        },
      ],
    },
    jars.manager,
  );
  assert.equal(response.status, 200, JSON.stringify(response));
  const finalId = response.id;
  assert.equal((await read(finalId)).grossCents, 0);
  for (const [key, jar] of [
    ["TECHNICAL", jars.technical],
    ["SITE", jars.site],
    ["EXECUTIVE", jars.executive],
  ])
    await stage(finalId, key, jar);
  assert.equal((await balance()).netCents, 0);
  assert.equal((await balance()).paidCents, 9000000);
  assert.equal((await balance()).debtCents, 9000000);
  assert.equal(
    (await read(firstId)).payments[0].amountCents,
    9000000,
    "actual historical payment unchanged",
  );
  console.log(
    "Correction API passed: original-price versions, fresh evidence, immutable history, permissions, ordered executive effect, return/reapproval, debt/advance separation, carry-forward settlement and zero final measurement.",
  );
} finally {
  if (accountId)
    await db.$transaction(async (tx) => {
      const account = await tx.subcontractAccount.findUniqueOrThrow({
        where: { id: accountId },
      });
      assert.equal(account.name, `TEST-CORRECTION-${stamp}`);
      const statements = await tx.subcontractStatement.findMany({
        where: { accountId },
        select: { id: true },
      });
      const ids = statements.map((s) => s.id);
      const payments = await tx.subcontractPayment.findMany({
        where: { statementId: { in: ids } },
        select: { id: true },
      });
      await tx.expenseAttachment.deleteMany({
        where: {
          entityId: { in: [accountId, ...ids, ...payments.map((p) => p.id)] },
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
      await tx.subcontractStatement.deleteMany({ where: { id: { in: ids } } });
      await tx.subcontractAccount.delete({ where: { id: accountId } });
    });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.role.deleteMany({ where: { id: { in: roleIds } } });
  await db.$disconnect();
  console.log(
    "Only exact temporary correction test records removed; client accounts, passwords, statements and payments preserved; audit retained.",
  );
}
