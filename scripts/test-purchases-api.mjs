import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const base = process.env.ERP_TEST_URL || "http://localhost:3090";
const stamp = Date.now();
const created = [];

const headers = (jar) => ({
  Cookie: [...jar].map(([key, value]) => `${key}=${value}`).join("; "),
});

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
  const response = await fetch(`${base}/api/auth/callback/credentials`, {
    method: "POST",
    redirect: "manual",
    headers: {
      ...headers(jar),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      csrfToken,
      email,
      password: "Admin@123456",
      callbackUrl: `${base}/purchases`,
    }),
  });
  takeCookies(response, jar);
  const session = await fetch(`${base}/api/auth/session`, {
    headers: headers(jar),
  });
  assert.ok((await session.json()).user, `login ${email}`);
  return jar;
}

async function post(payload, jar, proof, files = true) {
  const form = new FormData();
  form.set("payload", JSON.stringify(payload));
  if (files)
    form.append("files", new Blob([proof]), "AUTOMATED-PURCHASE-TEST.pdf");
  const response = await fetch(`${base}/api/purchases`, {
    method: "POST",
    headers: { ...headers(jar), Origin: base },
    body: form,
  });
  return { status: response.status, ...(await response.json()) };
}

try {
  const proof = (
    await db.incomingAttachment.findFirstOrThrow({
      where: { name: "DEMO-ONLY.pdf" },
    })
  ).data;
  const admin = await login("admin@erp.local");
  const sales = await login("sales@erp.local");
  const project = await db.project.findUniqueOrThrow({
    where: { code: "MAYAN-27" },
  });
  const supplier = await db.company.findFirstOrThrow({
    where: { type: "SUPPLIER", active: true },
  });
  const payload = {
    action: "invoice",
    name: `فاتورة اختبار مشتريات ${stamp}`,
    projectId: project.id,
    supplierId: supplier.id,
    invoiceDate: "2026-09-16",
    notes: "اختبار آلي — فاتورة مشتريات تجريبية فقط",
    items: [
      { name: "أسمنت", unit: "طن", quantity: 10, price: 2500 },
      { name: "رمل", unit: "م3", quantity: 12.5, price: 300 },
    ],
  };
  assert.equal((await post(payload, sales, proof)).status, 403);
  assert.equal((await post(payload, admin, proof, false)).status, 400);
  assert.equal((await post({ ...payload, name: "" }, admin, proof)).status, 400);
  assert.equal((await post({ ...payload, invoiceDate: "2026-02-31" }, admin, proof)).status, 400);
  assert.equal((await post({ ...payload, items: [{ name: "قيمة غير صالحة", unit: "وحدة", quantity: 1, price: 0.001 }] }, admin, proof)).status, 400);
  const response = await post(payload, admin, proof);
  assert.equal(response.status, 200, JSON.stringify(response));
  created.push(response.id);
  const invoice = await db.purchaseInvoice.findUniqueOrThrow({
    where: { id: response.id },
    include: { items: true },
  });
  assert.equal(invoice.totalCents, 2_875_000);
  assert.equal(invoice.items.length, 2);
  assert.equal(
    await db.purchaseAttachment.count({
      where: { entityType: "invoice", entityId: response.id },
    }),
    1,
  );
  const generatedA = await post({ ...payload, name: `${payload.name} أ` }, admin, proof);
  const generatedB = await post({ ...payload, name: `${payload.name} ب` }, admin, proof);
  assert.equal(generatedA.status, 200, JSON.stringify(generatedA));
  assert.equal(generatedB.status, 200, JSON.stringify(generatedB));
  assert.notEqual(generatedA.id, generatedB.id);
  created.push(generatedA.id, generatedB.id);
  const file = await db.purchaseAttachment.findFirstOrThrow({
    where: { entityType: "invoice", entityId: response.id },
  });
  assert.equal(
    (
      await fetch(`${base}/api/purchases/attachments/${file.id}`, {
        headers: headers(sales),
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(`${base}/api/purchases/attachments/${file.id}`, {
        headers: headers(admin),
      })
    ).status,
    200,
  );
  console.log("Purchases API passed: RBAC, required proof, required invoice name, valid dates and cents, safe internal numbering, totals and attachments.");
} finally {
  for (const id of created) {
    await db.purchaseAttachment.deleteMany({ where: { entityId: id } });
    await db.purchaseInvoice.deleteMany({ where: { id } });
  }
  await db.$disconnect();
}
