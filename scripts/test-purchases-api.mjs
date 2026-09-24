import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const base = process.env.ERP_TEST_URL || "http://localhost:3090";
const stamp = Date.now();
const created = [];
let stockItemId;

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
      password: process.env.ERP_TEST_ADMIN_PASSWORD || "Admin@123456",
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
  payload = { ...(payload.action === "invoice" ? { paymentSource: "EXECUTIVE_DIRECTOR", paidAmount: payload.items?.reduce((sum, item) => sum + Math.round(item.price * 100) * item.quantity, 0) / 100 } : {}), ...payload };
  const key = randomUUID();
  const send = async (confirmation) => { const form = new FormData(); form.set("payload", JSON.stringify(payload)); if (files) form.append("files", new Blob([proof]), "AUTOMATED-PURCHASE-TEST.pdf"); const response = await fetch(`${base}/api/purchases`, { method: "POST", headers: { ...headers(jar), Origin: base, "Idempotency-Key": key, ...(confirmation ? { "Duplicate-Confirmation": confirmation } : {}) }, body: form }); const result = await response.json(); if (response.status === 409 && result.code === "SIMILAR_FINANCIAL_OPERATION") return send(result.confirmationToken); return { status: response.status, ...result }; };
  return send();
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
  const warehouse = await db.warehouse.findFirstOrThrow({ where: { active: true, type: { not: "PROJECT" } } });
  const projectCost = async () => {
    const response = await fetch(`${base}/api/project-cost-control?projectId=${project.id}`, { headers: headers(admin) });
    assert.equal(response.status, 200);
    return (await response.json()).cost.purchasesCents;
  };
  const purchasesBefore = await projectCost();
  const payload = {
    action: "invoice",
    name: `فاتورة اختبار مشتريات ${stamp}`,
    projectId: project.id,
    supplierId: supplier.id,
    invoiceDate: "2026-09-16",
    notes: "اختبار آلي — فاتورة مشتريات تجريبية فقط",
    items: [
      { name: "أسمنت", unit: "طن", quantity: 10, price: 2500 },
      { name: "رمل", unit: "م3", quantity: 12, price: 300 },
    ],
  };
  assert.equal((await post(payload, sales, proof)).status, 403);
  assert.equal((await post(payload, admin, proof, false)).status, 400);
  assert.equal((await post({ ...payload, name: "" }, admin, proof)).status, 400);
  assert.equal((await post({ ...payload, invoiceDate: "2026-02-31" }, admin, proof)).status, 400);
  assert.equal((await post({ ...payload, items: [{ name: "قيمة غير صالحة", unit: "وحدة", quantity: 1, price: 0.001 }] }, admin, proof)).status, 400);
  assert.equal((await post({ ...payload, paidAmount: 28_601 }, admin, proof)).status, 400, "initial paid amount cannot exceed invoice total");
  const missingCatalogItem = await post({ ...payload, name: `فاتورة بدون اختيار صنف ${stamp}`, stockMode: "WAREHOUSE", warehouseId: warehouse.id }, admin, proof);
  assert.equal(missingCatalogItem.status, 400, "warehouse invoices require an explicit inventory item selection");
  const response = await post(payload, admin, proof);
  assert.equal(response.status, 200, JSON.stringify(response));
  created.push(response.id);
  const invoice = await db.purchaseInvoice.findUniqueOrThrow({
    where: { id: response.id },
    include: { items: true },
  });
  assert.equal(invoice.totalCents, 2_860_000);
  assert.equal(await projectCost(), purchasesBefore + invoice.totalCents, "posted invoice enters project cost once");
  assert.equal(invoice.items.length, 2);
  assert.equal(
    await db.purchaseAttachment.count({
      where: { entityType: "invoice", entityId: response.id },
    }),
    1,
  );
  const originalJournal = await db.journalEntry.findFirstOrThrow({ where: { sourceType: "PURCHASE", sourceId: response.id } });
  const reversal = await post({ action: "reverse", id: response.id, reason: "اختبار إلغاء موثق" }, admin, proof);
  assert.equal(reversal.status, 200, JSON.stringify(reversal));
  assert.equal((await db.purchaseInvoice.findUniqueOrThrow({ where: { id: response.id } })).status, "REVERSED");
  assert.ok(await db.journalEntry.findFirst({ where: { reversalOfId: originalJournal.id } }), "reversal must balance purchase journal");
  assert.equal(await projectCost(), purchasesBefore, "reversed invoice leaves project cost");
  assert.equal((await post({ action: "reverse", id: response.id, reason: "محاولة مكررة" }, admin, proof)).status, 400);
  const partiallyPaid = await post({ ...payload, name: `فاتورة مسددة جزئيًا ${stamp}`, paidAmount: 250 }, admin, proof);
  assert.equal(partiallyPaid.status, 200, JSON.stringify(partiallyPaid));
  created.push(partiallyPaid.id);
  const partialPaymentInvoice = await db.purchaseInvoice.findUniqueOrThrow({ where: { id: partiallyPaid.id }, include: { payments: true } });
  assert.equal(partialPaymentInvoice.totalCents, 2_860_000);
  assert.equal(partialPaymentInvoice.paidCents, 25_000, "invoice records only the amount actually paid initially");
  assert.equal(partialPaymentInvoice.paymentTrackingStarted, true);
  assert.equal(partialPaymentInvoice.payments.reduce((sum, payment) => sum + payment.amountCents, 0), 25_000);
  const initialPurchaseJournal = await db.journalEntry.findFirstOrThrow({ where: { sourceType: "PURCHASE", sourceId: partiallyPaid.id }, include: { lines: { include: { account: true } } } });
  assert.equal(initialPurchaseJournal.lines.find((line) => line.account.key === "SUPPLIER_PAYABLE")?.creditCents, 2_835_000, "unpaid portion is posted to supplier payable");
  const remainingPayable = partialPaymentInvoice.totalCents - partialPaymentInvoice.paidCents;
  assert.equal((await post({ action: "payment", id: partiallyPaid.id, amount: (remainingPayable + 1) / 100, paymentDate: "2026-09-24", paymentSource: "EXECUTIVE_DIRECTOR" }, admin, proof)).status, 400, "supplier cannot be overpaid");
  const finalPayment = await post({ action: "payment", id: partiallyPaid.id, amount: remainingPayable / 100, paymentDate: "2026-09-24", paymentSource: "EXECUTIVE_DIRECTOR", notes: "دفعة اختبار أخيرة" }, admin, proof);
  assert.equal(finalPayment.status, 201, JSON.stringify(finalPayment));
  const fullyPaidInvoice = await db.purchaseInvoice.findUniqueOrThrow({ where: { id: partiallyPaid.id }, include: { payments: true } });
  assert.equal(fullyPaidInvoice.paidCents, fullyPaidInvoice.totalCents, "a later payment can settle the remaining balance exactly");
  assert.equal(fullyPaidInvoice.payments.filter((payment) => payment.status === "POSTED").reduce((sum, payment) => sum + payment.amountCents, 0), fullyPaidInvoice.totalCents);
  assert.ok(await db.journalEntry.findFirst({ where: { sourceType: "PURCHASE_PAYMENT", sourceId: finalPayment.id } }), "later payment has its own accounting journal");
  const stockItem = await db.inventoryItem.create({ data: { code: `TEST-PUR-${stamp}`, name: `صنف كتالوج مشتريات ${stamp}`, unit: "كيس" } });
  stockItemId = stockItem.id;
  const selectedInvoice = await post({ ...payload, name: `فاتورة صنف كتالوج ${stamp}`, items: [{ inventoryItemId: stockItem.id, name: "اسم مكتوب بشكل مختلف", unit: "وحدة غير صحيحة", quantity: 2, price: 100 }] }, admin, proof);
  assert.equal(selectedInvoice.status, 200, JSON.stringify(selectedInvoice));
  created.push(selectedInvoice.id);
  const canonicalInvoice = await db.purchaseInvoice.findUniqueOrThrow({ where: { id: selectedInvoice.id }, include: { items: true } });
  assert.equal(canonicalInvoice.items[0].inventoryItemId, stockItem.id);
  assert.equal(canonicalInvoice.items[0].name, stockItem.name, "invoice item uses the selected master item name");
  assert.equal(canonicalInvoice.items[0].unit, stockItem.unit, "invoice item uses the selected master item unit");
  assert.equal((await post({ action: "reverse", id: selectedInvoice.id, reason: "إنهاء اختبار اختيار الصنف" }, admin, proof)).status, 200);
  const warehousePartial = await post({ ...payload, name: `فاتورة استلام جزئي ${stamp}`, stockMode: "WAREHOUSE", warehouseId: warehouse.id, items: [{ inventoryItemId: stockItem.id, name: stockItem.name, unit: stockItem.unit, quantity: 10, receivedQuantity: 4, price: 100 }] }, admin, proof);
  assert.equal(warehousePartial.status, 200, JSON.stringify(warehousePartial));
  created.push(warehousePartial.id);
  const partialInvoice = await db.purchaseInvoice.findUniqueOrThrow({ where: { id: warehousePartial.id }, include: { items: true, stockMovements: { where: { type: "RECEIPT" }, include: { lines: true } } } });
  assert.equal(partialInvoice.items[0].quantity, 10, "the supplier invoice retains its full ordered quantity");
  assert.equal(partialInvoice.stockMovements.length, 1);
  assert.equal(partialInvoice.stockMovements[0].lines[0].quantity, 4, "only the amount received now is posted to company stock");

  const directPartial = await post({ ...payload, name: `فاتورة توريد جزئي مباشر ${stamp}`, stockMode: "DIRECT_PROJECT", warehouseId: warehouse.id, items: [{ inventoryItemId: stockItem.id, name: stockItem.name, unit: stockItem.unit, quantity: 10, receivedQuantity: 3, price: 100 }] }, admin, proof);
  assert.equal(directPartial.status, 200, JSON.stringify(directPartial));
  created.push(directPartial.id);
  const directInvoice = await db.purchaseInvoice.findUniqueOrThrow({ where: { id: directPartial.id }, include: { stockMovements: { where: { type: { in: ["RECEIPT", "ISSUE_PROJECT"] } }, include: { lines: true } } } });
  assert.equal(directInvoice.stockMovements.length, 2, "direct-to-project receipt creates exactly one receipt and one linked project issue");
  assert.deepEqual(directInvoice.stockMovements.map((movement) => movement.lines[0].quantity), [3, 3], "both linked movements use only the actually received quantity");

  const notYetReceived = await post({ ...payload, name: `فاتورة لم تستلم بعد ${stamp}`, stockMode: "WAREHOUSE", warehouseId: warehouse.id, items: [{ inventoryItemId: stockItem.id, name: stockItem.name, unit: stockItem.unit, quantity: 10, receivedQuantity: 0, price: 100 }] }, admin, proof);
  assert.equal(notYetReceived.status, 200, JSON.stringify(notYetReceived));
  created.push(notYetReceived.id);
  assert.equal(await db.stockMovement.count({ where: { purchaseInvoiceId: notYetReceived.id, type: "RECEIPT" } }), 0, "saving an invoice with no physical delivery does not invent a receipt movement");
  assert.equal((await post({ ...payload, name: `كمية مستلمة أكبر من الفاتورة ${stamp}`, stockMode: "WAREHOUSE", warehouseId: warehouse.id, items: [{ inventoryItemId: stockItem.id, name: stockItem.name, unit: stockItem.unit, quantity: 10, receivedQuantity: 11, price: 100 }] }, admin, proof)).status, 400, "received quantity cannot exceed the invoiced quantity");
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
    const movements = await db.stockMovement.findMany({ where: { purchaseInvoiceId: id }, select: { id: true } });
    const movementIds = movements.map((movement) => movement.id);
    const payments = await db.purchasePayment.findMany({ where: { invoiceId: id }, select: { id: true } });
    const paymentIds = payments.map((payment) => payment.id);
    const sources = [{ sourceType: "PURCHASE", sourceId: id }, { reversalOf: { sourceType: "PURCHASE", sourceId: id } }];
    if (paymentIds.length) sources.push({ sourceType: "PURCHASE_PAYMENT", sourceId: { in: paymentIds } }, { reversalOf: { sourceType: "PURCHASE_PAYMENT", sourceId: { in: paymentIds } } });
    if (movementIds.length) sources.push({ sourceType: "WAREHOUSE_ISSUE", sourceId: { in: movementIds } });
    const entries = await db.journalEntry.findMany({ where: { OR: sources }, select: { id: true } });
    if (entries.length) {
      await db.journalLine.deleteMany({ where: { entryId: { in: entries.map((entry) => entry.id) } } });
      await db.journalEntry.deleteMany({ where: { id: { in: entries.map((entry) => entry.id) } } });
    }
    await db.auditLog.deleteMany({ where: { target: { in: [id, ...movementIds] } } });
    await db.stockMovement.deleteMany({ where: { id: { in: movementIds } } });
    await db.purchaseAttachment.deleteMany({ where: { entityId: id } });
    await db.purchaseInvoice.deleteMany({ where: { id } });
  }
  if (stockItemId) await db.inventoryItem.delete({ where: { id: stockItemId } }).catch(() => undefined);
  await db.$disconnect();
}
