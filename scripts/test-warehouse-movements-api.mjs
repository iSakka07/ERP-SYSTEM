import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const base = process.env.ERP_TEST_URL || "http://localhost:3090";
const tag = randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase();
const cookies = new Map();
const createdMovementIds = [];
const createdCountIds = [];
const operationIds = [];
let itemId;
let secondaryWarehouseId;

const cookieHeader = () => [...cookies].map(([key, value]) => `${key}=${value}`).join("; ");
function saveCookies(response) {
  for (const cookie of response.headers.getSetCookie()) {
    const [key, ...value] = cookie.split(";")[0].split("=");
    cookies.set(key, value.join("="));
  }
}

async function login() {
  const csrf = await fetch(`${base}/api/auth/csrf`); saveCookies(csrf);
  const { csrfToken } = await csrf.json();
  const response = await fetch(`${base}/api/auth/callback/credentials`, {
    method: "POST",
    redirect: "manual",
    headers: { Cookie: cookieHeader(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrfToken, email: "admin@erp.local", password: process.env.ERP_TEST_ADMIN_PASSWORD || "Admin@123456", callbackUrl: `${base}/warehouse` }),
  });
  saveCookies(response);
  assert.ok((await (await fetch(`${base}/api/auth/session`, { headers: { Cookie: cookieHeader() } })).json()).user, "admin login");
}

async function postWarehouse(payload) {
  const key = randomUUID();
  const send = async () => {
    const response = await fetch(`${base}/api/warehouse`, {
      method: "POST",
      headers: { Cookie: cookieHeader(), Origin: base, "Content-Type": "application/json", "Idempotency-Key": key },
      body: JSON.stringify(payload),
    });
    return { response, body: await response.json() };
  };
  const first = await send();
  assert.equal(first.response.status, 200, JSON.stringify(first.body));
  const replay = await send();
  assert.equal(replay.response.status, 200, JSON.stringify(replay.body));
  assert.equal(replay.response.headers.get("Idempotency-Replayed"), "true", `${payload.action} retry is replayed`);
  assert.equal(replay.body.id, first.body.id, `${payload.action} retry returns the original entity`);
  const operation = await db.financialOperationRequest.findUniqueOrThrow({ where: { actorId_operation_idempotencyKey: { actorId: (await db.user.findUniqueOrThrow({ where: { email: "admin@erp.local" } })).id, operation: `warehouse.${payload.action}`, idempotencyKey: key } } });
  operationIds.push(operation.id);
  return first.body.id;
}

async function balance(warehouseId, itemId) {
  const movements = await db.stockMovement.findMany({ where: { status: "POSTED", OR: [{ fromWarehouseId: warehouseId }, { toWarehouseId: warehouseId }] }, include: { lines: { where: { itemId } } } });
  return movements.reduce((sum, movement) => sum + movement.lines.reduce((lineSum, line) => lineSum + (movement.toWarehouseId === warehouseId ? line.quantity : 0) - (movement.fromWarehouseId === warehouseId ? line.quantity : 0), 0), 0);
}

async function assertBalancedJournal(sourceType, sourceId, expectedCents) {
  const entry = await db.journalEntry.findUniqueOrThrow({ where: { sourceType_sourceId: { sourceType, sourceId } }, include: { lines: true } });
  const debit = entry.lines.reduce((sum, line) => sum + Number(line.debitCents), 0);
  const credit = entry.lines.reduce((sum, line) => sum + Number(line.creditCents), 0);
  assert.equal(debit, expectedCents, `${sourceType} debit value`);
  assert.equal(credit, expectedCents, `${sourceType} credit value`);
}

try {
  await login();
  const actor = await db.user.findUniqueOrThrow({ where: { email: "admin@erp.local" } });
  const project = await db.project.findFirstOrThrow({ where: { active: true } });
  const main = await db.warehouse.findFirstOrThrow({ where: { active: true, type: { not: "PROJECT" } } });
  const projectWarehouse = await db.warehouse.findFirstOrThrow({ where: { active: true, type: "PROJECT", projectId: project.id } });
  const secondary = await db.warehouse.create({ data: { code: `TEST-${tag}`, name: `مخزن اختبار ${tag}`, type: "COMPANY" } });
  secondaryWarehouseId = secondary.id;
  const item = await db.inventoryItem.create({ data: { code: `MOV-${tag}`, name: `صنف حركات ${tag}`, unit: "وحدة" } });
  itemId = item.id;
  const opening = await db.stockMovement.create({ data: { number: `OPEN-${tag}`, type: "RECEIPT", movementDate: new Date("2026-08-01T00:00:00.000Z"), toWarehouseId: main.id, recipient: "رصيد اختبار", actorId: actor.id, lines: { create: { itemId: item.id, quantity: 20, unitCostCents: 100, totalCents: 2_000 } } } });
  createdMovementIds.push(opening.id);

  const transferId = await postWarehouse({ action: "transfer", fromWarehouseId: main.id, toWarehouseId: secondary.id, movementDate: "2026-08-02", recipient: "مسؤول التحويل", lines: [{ itemId: item.id, quantity: 4 }] });
  createdMovementIds.push(transferId);
  assert.equal(await balance(main.id, item.id), 16);
  assert.equal(await balance(secondary.id, item.id), 4);
  assert.equal(await db.journalEntry.count({ where: { sourceId: transferId } }), 0, "internal transfer does not create a financial journal");

  const issueId = await postWarehouse({ action: "issue", warehouseId: main.id, projectId: project.id, movementDate: "2026-08-03", recipient: "مسؤول المشروع", lines: [{ itemId: item.id, quantity: 6 }] });
  createdMovementIds.push(issueId);
  assert.equal(await balance(main.id, item.id), 10);
  assert.equal(await balance(projectWarehouse.id, item.id), 6);
  await assertBalancedJournal("WAREHOUSE_ISSUE", issueId, 600);

  const consumeId = await postWarehouse({ action: "consume", projectId: project.id, movementDate: "2026-08-04", recipient: "مهندس الموقع", lines: [{ itemId: item.id, quantity: 2 }] });
  createdMovementIds.push(consumeId);
  assert.equal(await balance(projectWarehouse.id, item.id), 4);
  assert.equal(await db.journalEntry.count({ where: { sourceId: consumeId } }), 0, "consumption does not duplicate the project cost journal posted on issue");

  const returnId = await postWarehouse({ action: "return", warehouseId: main.id, projectId: project.id, movementDate: "2026-08-05", recipient: "أمين المخزن", lines: [{ itemId: item.id, quantity: 1 }] });
  createdMovementIds.push(returnId);
  assert.equal(await balance(main.id, item.id), 11);
  assert.equal(await balance(projectWarehouse.id, item.id), 3);
  await assertBalancedJournal("WAREHOUSE_RETURN", returnId, 100);

  const countId = await postWarehouse({ action: "count", warehouseId: main.id, countDate: "2026-08-06", notes: "جرد قبول آلي", lines: [{ itemId: item.id, actualQuantity: 9, reason: "عجز اختبار" }] });
  createdCountIds.push(countId);
  const adjustment = await db.stockMovement.findFirstOrThrow({ where: { type: "ADJUSTMENT_OUT", notes: { contains: (await db.inventoryCount.findUniqueOrThrow({ where: { id: countId } })).number } } });
  createdMovementIds.push(adjustment.id);
  assert.equal(await balance(main.id, item.id), 9);
  await assertBalancedJournal("INVENTORY_ADJUSTMENT", adjustment.id, 200);

  for (const id of [transferId, issueId, consumeId, returnId]) assert.equal(await db.stockMovement.count({ where: { id } }), 1, "replay does not duplicate stock movements");
  assert.equal(await db.inventoryCount.count({ where: { id: countId } }), 1, "replay does not duplicate inventory counts");
  console.log("Warehouse movement API passed: transfer, issue, consumption, return and count balances, journals and same-key replay protection.");
} finally {
  await db.journalEntry.deleteMany({ where: { sourceId: { in: createdMovementIds } } });
  await db.auditLog.deleteMany({ where: { target: { in: [...createdMovementIds, ...createdCountIds] } } });
  if (operationIds.length) await db.financialOperationRequest.deleteMany({ where: { id: { in: operationIds } } });
  if (createdMovementIds.length) await db.stockMovement.deleteMany({ where: { id: { in: createdMovementIds } } });
  if (createdCountIds.length) await db.inventoryCount.deleteMany({ where: { id: { in: createdCountIds } } });
  if (itemId) await db.inventoryItem.delete({ where: { id: itemId } }).catch(() => undefined);
  if (secondaryWarehouseId) await db.warehouse.delete({ where: { id: secondaryWarehouseId } }).catch(() => undefined);
  await db.$disconnect();
}
