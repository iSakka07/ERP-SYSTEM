import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const base = process.env.ERP_TEST_URL || "http://localhost:3090";
const tag = randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
const createdMovementIds = [];
const additionalInvoiceIds = [];
const createdInventoryItemIds = [];
let invoiceId;
let itemId;
let roleId;
let userId;

const cookieHeader = (jar) => [...jar].map(([key, value]) => `${key}=${value}`).join("; ");
function saveCookies(response, jar) { for (const cookie of response.headers.getSetCookie()) { const [key, ...value] = cookie.split(";")[0].split("="); jar.set(key, value.join("=")); } }
async function login(email, password = process.env.ERP_TEST_ADMIN_PASSWORD || "Admin@123456") {
  const jar = new Map();
  const csrf = await fetch(`${base}/api/auth/csrf`); saveCookies(csrf, jar);
  const { csrfToken } = await csrf.json();
  const response = await fetch(`${base}/api/auth/callback/credentials`, { method: "POST", redirect: "manual", headers: { Cookie: cookieHeader(jar), "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ csrfToken, email, password, callbackUrl: `${base}/warehouse?tab=receipts` }) });
  saveCookies(response, jar);
  assert.ok((await (await fetch(`${base}/api/auth/session`, { headers: { Cookie: cookieHeader(jar) } })).json()).user, `login ${email}`);
  return jar;
}

try {
  const admin = await login("admin@erp.local");
  const denied = await login("sales@erp.local");
  const readerPassword = `Receipt-${randomUUID()}-Pass`;
  const project = await db.project.findFirstOrThrow({ where: { active: true } });
  const supplier = await db.company.findFirstOrThrow({ where: { active: true, type: "SUPPLIER" } });
  const main = await db.warehouse.findFirstOrThrow({ where: { type: { not: "PROJECT" }, active: true } });
  const projectWarehouse = await db.warehouse.findFirstOrThrow({ where: { type: "PROJECT", projectId: project.id, active: true } });
  const role = await db.role.create({ data: { key: `warehouse_reader_${tag.toLowerCase()}`, name: "قارئ سجل الاستلام للاختبار" } }); roleId = role.id;
  const permission = await db.permission.findUniqueOrThrow({ where: { key: "warehouse.view" } });
  await db.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
  const user = await db.user.create({ data: { name: `Receipt reader ${tag}`, email: `receipt-reader-${tag.toLowerCase()}@test.invalid`, passwordHash: await hash(readerPassword, 10), roleId: role.id } }); userId = user.id;
  const reader = await login(user.email, readerPassword);

  const invoice = await db.purchaseInvoice.create({ data: { number: `PUR-RECEIPT-${tag}`, name: `فاتورة اختبار سجل ${tag}`, projectId: project.id, supplierId: supplier.id, invoiceDate: new Date("2026-09-18T00:00:00.000Z"), totalCents: 2_000, stockMode: "WAREHOUSE", warehouseId: main.id, actorId: (await db.user.findUniqueOrThrow({ where: { email: "admin@erp.local" } })).id, items: { create: { position: 1, name: `صنف سجل ${tag}`, unit: "وحدة", quantity: 10, unitPriceCents: 200, totalCents: 2_000 } } } }); invoiceId = invoice.id;
  const purchaseItem = await db.purchaseItem.findFirstOrThrow({ where: { invoiceId } });
  const inventoryItem = await db.inventoryItem.create({ data: { code: `TEST-${tag}`, name: `صنف سجل ${tag}`, unit: "وحدة" } }); itemId = inventoryItem.id;
  await db.purchaseItem.update({ where: { id: purchaseItem.id }, data: { inventoryItemId: inventoryItem.id } });
  const movement = async (number, date, status, receivedQuantity) => {
    const row = await db.stockMovement.create({ data: { number, type: "RECEIPT", movementDate: new Date(`${date}T00:00:00.000Z`), createdAt: new Date(`${date}T10:00:00.000Z`), toWarehouseId: main.id, purchaseInvoiceId: invoice.id, recipient: "مسؤول الاختبار", status, actorId: (await db.user.findUniqueOrThrow({ where: { email: "admin@erp.local" } })).id, lines: { create: { itemId: inventoryItem.id, quantity: receivedQuantity, unitCostCents: 200, totalCents: receivedQuantity * 200, sourcePurchaseItemId: purchaseItem.id } } } });
    createdMovementIds.push(row.id); return row;
  };
  const firstReceipt = await movement(`REC-TEST-${tag}-1`, "2026-09-19", "POSTED", 3);
  const partialReceipt = await movement(`REC-TEST-${tag}-2`, "2026-09-20", "POSTED", 4);
  await movement(`REC-TEST-${tag}-3`, "2026-09-21", "REVERSED", 2);
  const issue = await db.stockMovement.create({ data: { number: `ISS-TEST-${tag}`, type: "ISSUE_PROJECT", movementDate: new Date("2026-09-20T00:00:00.000Z"), fromWarehouseId: main.id, toWarehouseId: projectWarehouse.id, projectId: project.id, purchaseInvoiceId: invoice.id, recipient: "مسؤول الاختبار", status: "POSTED", actorId: (await db.user.findUniqueOrThrow({ where: { email: "admin@erp.local" } })).id, lines: { create: { itemId: inventoryItem.id, quantity: 7, unitCostCents: 200, totalCents: 1_400 } } } });
  createdMovementIds.push(issue.id);
  const adminId = (await db.user.findUniqueOrThrow({ where: { email: "admin@erp.local" } })).id;
  for (let index = 1; index <= 11; index += 1) {
    const paginationMovement = await db.stockMovement.create({ data: { number: `PAGE-${tag}-${String(index).padStart(2, "0")}`, type: "RECEIPT", movementDate: new Date(`2026-09-${String(10 + index).padStart(2, "0")}T00:00:00.000Z`), toWarehouseId: main.id, status: "POSTED", actorId: adminId } });
    createdMovementIds.push(paginationMovement.id);
  }
  await db.auditLog.createMany({ data: [
    { actorId: (await db.user.findUniqueOrThrow({ where: { email: "admin@erp.local" } })).id, action: "warehouse.receipt", target: partialReceipt.id, details: JSON.stringify({ automatedTest: true }) },
    { actorId: (await db.user.findUniqueOrThrow({ where: { email: "admin@erp.local" } })).id, action: "purchases.invoice", target: invoice.id, details: JSON.stringify({ automatedTest: true }) },
  ] });

  const request = async (path, jar) => {
    const response = await fetch(`${base}${path}`, { headers: { Cookie: cookieHeader(jar) } });
    const body = response.status === 200 && response.headers.get("content-type")?.includes("application/json") ? await response.json() : await response.text();
    return { response, body };
  };
  const itemRequest = async (method, path, jar, payload) => {
    const response = await fetch(`${base}${path}`, { method, headers: { Cookie: cookieHeader(jar), "Content-Type": "application/json" }, ...(payload ? { body: JSON.stringify(payload) } : {}) });
    return { response, body: await response.json() };
  };
  const createdItem = await itemRequest("POST", "/api/inventory-items", admin, { name: `أسمنت جديد ${tag}`, unit: "كيس", category: "مواد بناء" });
  assert.equal(createdItem.response.status, 201, "authorized users can create a master item from the picker");
  assert.equal("code" in createdItem.body.item, false, "the internal item code is not exposed to the picker");
  createdInventoryItemIds.push(createdItem.body.item.id);
  const normalizedSearch = await request(`/api/inventory-items?q=${encodeURIComponent(`اسمنت جديد ${tag}`)}`, reader);
  assert.equal(normalizedSearch.response.status, 200, "warehouse readers can search inventory items");
  assert.ok(normalizedSearch.body.items.some((item) => item.id === createdItem.body.item.id), "Arabic hamza variants find the same inventory item");
  const duplicateItem = await itemRequest("POST", "/api/inventory-items", admin, { name: `اسمنت جديد ${tag}`, unit: "كيس" });
  assert.equal(duplicateItem.response.status, 409); assert.equal(duplicateItem.body.code, "SIMILAR_ITEM_EXISTS");
  assert.ok(duplicateItem.body.candidates.some((item) => item.id === createdItem.body.item.id), "near-duplicate names offer the existing item");
  assert.equal((await itemRequest("POST", "/api/inventory-items", denied, { name: `صنف ممنوع ${tag}`, unit: "وحدة" })).response.status, 403, "item creation requires purchase or warehouse management permission");
  assert.equal((await request("/api/warehouse/receipts", denied)).response.status, 403, "warehouse permission is enforced");
  assert.equal((await request("/api/warehouse/receipts", admin)).response.status, 200, "register loads for permitted user");

  const invoiceSearch = await request(`/api/warehouse/receipts?invoice=${encodeURIComponent(invoice.number)}&size=10`, admin);
  assert.equal(invoiceSearch.body.total, 3, "all receipt movements for an invoice, including reversed, are registered");
  const registerRow = invoiceSearch.body.rows.find((row) => row.id === firstReceipt.id);
  assert.ok(registerRow.items.some((item) => item.name === inventoryItem.name && item.quantity === 3 && item.unit === inventoryItem.unit), "register shows the received item name, quantity, and unit instead of only the number of lines");
  const combined = await request(`/api/warehouse/receipts?invoice=${encodeURIComponent(invoice.number)}&kind=WAREHOUSE&warehouse=${main.id}&project=${project.id}&supplier=${supplier.id}&creator=${(await db.user.findUniqueOrThrow({ where: { email: "admin@erp.local" } })).id}&status=POSTED&receiptFrom=2026-09-20&receiptTo=2026-09-20&issue=linked`, admin);
  assert.equal(combined.body.total, 1, "combined filters use AND between filter groups");
  assert.equal(combined.body.rows[0].id, partialReceipt.id);
  const searchByItem = await request(`/api/warehouse/receipts?q=${encodeURIComponent(inventoryItem.name)}&invoice=${invoice.number}`, admin);
  assert.equal(searchByItem.body.total, 3, "server search can find receipt item names");
  const postedOnly = await request(`/api/warehouse/receipts?invoice=${invoice.number}&status=POSTED`, admin);
  assert.equal(postedOnly.body.total, 2, "status filters include only the requested status");
  const reversedOnly = await request(`/api/warehouse/receipts?invoice=${invoice.number}&status=REVERSED`, admin);
  assert.equal(reversedOnly.body.total, 1, "reversed historical receipts remain visible");
  const page = await request(`/api/warehouse/receipts?size=10&page=2&q=PAGE-${tag}`, admin);
  assert.equal(page.body.rows.length, 1); assert.equal(page.body.page, 2); assert.equal(page.body.total, 11, "server pagination reports the full filtered total");
  const linked = await request(`/api/warehouse/receipts?invoice=${invoice.number}&issue=linked`, admin);
  assert.equal(linked.body.total, 3, "invoice-level transfer links can be filtered");
  const postedIssue = await request(`/api/warehouse/receipts?invoice=${invoice.number}&issue=POSTED`, admin);
  assert.equal(postedIssue.body.total, 3, "invoice-level transfer status can be filtered");
  const none = await request(`/api/warehouse/receipts?q=${encodeURIComponent("no-such-receipt-${tag}")}`, admin);
  assert.equal(none.body.total, 0, "no-results state returns an empty page");

  const detail = await request(`/api/warehouse/receipts/${partialReceipt.id}`, admin);
  assert.equal(detail.response.status, 200);
  const testLine = detail.body.lines.find((line) => line.name === inventoryItem.name);
  assert.equal(testLine.orderedQuantity, 10); assert.equal(testLine.previouslyReceivedQuantity, 3); assert.equal(testLine.currentQuantity, 4); assert.equal(testLine.totalReceivedQuantity, 7); assert.equal(testLine.remainingQuantity, 3, "partial receipt traces the exact ordered and remaining quantities");
  assert.equal(detail.body.trace.length, 1); assert.match(detail.body.traceNote, /لا يربط كل حركة توريد/);
  assert.ok(detail.body.audit.some((event) => event.actor));
  const limitedDetail = await request(`/api/warehouse/receipts/${partialReceipt.id}`, reader);
  assert.equal(limitedDetail.response.status, 200); assert.equal(limitedDetail.body.maySeeValues, false);
  assert.equal("unitPriceCents" in limitedDetail.body.lines[0], false, "unit price is not serialized without purchases permission");
  assert.equal((await request(`/api/warehouse/receipts/${randomUUID()}`, admin)).response.status, 404, "missing details return not found");

  const csv = await request(`/api/warehouse/receipts?format=csv&invoice=${invoice.number}`, admin);
  assert.equal(csv.response.status, 200); assert.match(csv.response.headers.get("content-type"), /text\/csv/); assert.match(csv.body, new RegExp(invoice.number)); assert.match(csv.body, /سياق الفلاتر/);
  assert.equal((await request(`/api/warehouse/receipts?format=csv`, denied)).response.status, 403, "export permission is enforced");

  const retryInvoice = await db.purchaseInvoice.create({ data: { number: `PUR-RETRY-${tag}`, name: `فاتورة اختبار إعادة الإرسال ${tag}`, projectId: project.id, supplierId: supplier.id, invoiceDate: new Date("2026-09-18T00:00:00.000Z"), totalCents: 1_000, stockMode: "WAREHOUSE", warehouseId: main.id, actorId: (await db.user.findUniqueOrThrow({ where: { email: "admin@erp.local" } })).id, items: { create: { position: 1, name: inventoryItem.name, unit: inventoryItem.unit, quantity: 5, unitPriceCents: 200, totalCents: 1_000 } } } });
  additionalInvoiceIds.push(retryInvoice.id);
  const retryPurchaseItem = await db.purchaseItem.findFirstOrThrow({ where: { invoiceId: retryInvoice.id } });
  const receiptPayload = { action: "receipt", invoiceId: retryInvoice.id, warehouseId: main.id, movementDate: "2026-09-22", recipient: "مسؤول الاختبار", lines: [{ purchaseItemId: retryPurchaseItem.id, inventoryItemId: inventoryItem.id, quantity: 2 }] };
  const key = randomUUID();
  const postReceipt = async (idempotencyKey, confirmation, payload = receiptPayload) => {
    const response = await fetch(`${base}/api/warehouse`, { method: "POST", headers: { Cookie: cookieHeader(admin), Origin: base, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey, ...(confirmation ? { "Duplicate-Confirmation": confirmation } : {}) }, body: JSON.stringify(payload) });
    return { response, body: await response.json() };
  };
  const posted = await postReceipt(key); assert.equal(posted.response.status, 200); createdMovementIds.push(posted.body.id);
  assert.equal((await db.purchaseItem.findUniqueOrThrow({ where: { id: retryPurchaseItem.id } })).inventoryItemId, inventoryItem.id, "receipt saves the explicit invoice-line to inventory-item mapping");
  const replay = await postReceipt(key); assert.equal(replay.body.id, posted.body.id); assert.equal(replay.response.headers.get("Idempotency-Replayed"), "true");
  assert.equal((await db.stockMovement.count({ where: { purchaseInvoiceId: retryInvoice.id, type: "RECEIPT" } })), 1, "same-key retry posts only one stock receipt");
  const mismatch = await postReceipt(key, undefined, { ...receiptPayload, lines: [{ purchaseItemId: retryPurchaseItem.id, quantity: 3 }] }); assert.equal(mismatch.response.status, 409); assert.equal(mismatch.body.code, "IDEMPOTENCY_PAYLOAD_MISMATCH");
  const similarKey = randomUUID(); const warning = await postReceipt(similarKey); assert.equal(warning.response.status, 409); assert.equal(warning.body.code, "SIMILAR_FINANCIAL_OPERATION");
  const confirmed = await postReceipt(similarKey, warning.body.confirmationToken); assert.equal(confirmed.response.status, 200); createdMovementIds.push(confirmed.body.id);
  assert.equal((await db.stockMovement.count({ where: { purchaseInvoiceId: retryInvoice.id, type: "RECEIPT" } })), 2, "a confirmed independent receipt is a separate stock movement");

  const beforeCount = await db.stockMovement.count({ where: { id: { in: createdMovementIds } } });
  assert.equal((await fetch(`${base}/api/warehouse/receipts/${partialReceipt.id}`, { method: "POST", headers: { Cookie: cookieHeader(admin) } })).status, 405, "register details cannot change receipt state");
  assert.equal(await db.stockMovement.count({ where: { id: { in: createdMovementIds } } }), beforeCount, "register and details are read-only and do not post duplicate stock movements");
  assert.notEqual(firstReceipt.id, partialReceipt.id);
  console.log("Inventory receipt register API passed: RBAC, search, combined filters, sorting/paging, CSV permission, partial fulfillment, invoice-level trace, audit visibility, historical statuses and read-only stock integrity.");
} finally {
  if (createdMovementIds.length) await db.stockMovement.deleteMany({ where: { id: { in: createdMovementIds } } });
  const operationIds = (await db.financialOperationRequest.findMany({ where: { entityId: { in: createdMovementIds } }, select: { id: true } })).map((item) => item.id);
  await db.auditLog.deleteMany({ where: { target: { in: [...createdMovementIds, invoiceId, ...additionalInvoiceIds].filter(Boolean) } } });
  if (operationIds.length) await db.financialOperationRequest.deleteMany({ where: { id: { in: operationIds } } });
  if (invoiceId) await db.purchaseInvoice.delete({ where: { id: invoiceId } }).catch(() => undefined);
  for (const id of additionalInvoiceIds) await db.purchaseInvoice.delete({ where: { id } }).catch(() => undefined);
  if (itemId) await db.inventoryItem.delete({ where: { id: itemId } }).catch(() => undefined);
  if (createdInventoryItemIds.length) { await db.auditLog.deleteMany({ where: { target: { in: createdInventoryItemIds } } }); await db.inventoryItem.deleteMany({ where: { id: { in: createdInventoryItemIds } } }); }
  if (userId) await db.user.delete({ where: { id: userId } });
  if (roleId) { await db.rolePermission.deleteMany({ where: { roleId } }); await db.role.delete({ where: { id: roleId } }); }
  await db.$disconnect();
}
