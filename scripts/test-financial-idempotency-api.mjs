import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const base = process.env.ERP_TEST_URL || "http://localhost:3090";
const tag = `IDEMPOTENCY-${randomUUID()}`;
const password = randomUUID();
let user;
const createdIds = [];

function take(response, jar) { for (const cookie of response.headers.getSetCookie()) { const [key, ...value] = cookie.split(";")[0].split("="); jar.set(key, value.join("=")); } }
const cookie = (jar) => [...jar].map(([key, value]) => `${key}=${value}`).join("; ");

async function login(email) {
  const jar = new Map(); const csrf = await fetch(`${base}/api/auth/csrf`); take(csrf, jar); const csrfToken = (await csrf.json()).csrfToken;
  const response = await fetch(`${base}/api/auth/callback/credentials`, { method: "POST", redirect: "manual", headers: { Cookie: cookie(jar), "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ csrfToken, email, password, callbackUrl: `${base}/bank` }) }); take(response, jar);
  assert.ok((await (await fetch(`${base}/api/auth/session`, { headers: { Cookie: cookie(jar) } })).json()).user);
  return jar;
}

async function send(jar, key, payload, confirmation) {
  const form = new FormData(); form.set("payload", JSON.stringify(payload));
  if (payload.action === "reverse") form.append("files", new Blob(["%PDF-1.4\nAUTOMATED TEST"], { type: "application/pdf" }), "BANK-REVERSAL-TEST.pdf");
  const response = await fetch(`${base}/api/bank`, { method: "POST", headers: { Cookie: cookie(jar), Origin: base, "Idempotency-Key": key, ...(confirmation ? { "Duplicate-Confirmation": confirmation } : {}) }, body: form });
  return { status: response.status, replayHeader: response.headers.get("Idempotency-Replayed"), ...(await response.json()) };
}

async function setPeriod(jar, status) {
  const response = await fetch(`${base}/api/accounting`, {
    method: "POST",
    headers: { Cookie: cookie(jar), Origin: base, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "period", month: "2098-12", status, reason: "اختبار آلي لإقفال الفترة" }),
  });
  return { status: response.status, ...(await response.json()) };
}

try {
  const role = await db.role.findUniqueOrThrow({ where: { key: "admin" } });
  user = await db.user.create({ data: { name: tag, email: `${tag}@test.invalid`.toLowerCase(), passwordHash: await hash(password, 10), roleId: role.id } });
  const jar = await login(user.email);
  const payload = { type: "OWNER_FUNDING", amount: 123.45, date: "2026-09-19", description: tag, reference: tag };
  assert.equal((await setPeriod(jar, "CLOSED")).status, 200, "accountant can close an accounting period");
  assert.equal((await send(jar, randomUUID(), { ...payload, date: "2098-12-19", description: `${tag}-closed`, reference: `${tag}-closed` })).status, 400, "closed period blocks financial posting");
  assert.equal((await setPeriod(jar, "OPEN")).status, 200, "accountant can reopen a closed period with a reason");
  const afterReopen = await send(jar, randomUUID(), { ...payload, date: "2098-12-19", description: `${tag}-reopened`, reference: `${tag}-reopened` });
  assert.equal(afterReopen.status, 201, "reopened period accepts financial posting"); createdIds.push(afterReopen.id);
  const key = randomUUID();
  const first = await send(jar, key, payload); assert.equal(first.status, 201); createdIds.push(first.id);
  const replay = await send(jar, key, payload); assert.equal(replay.status, 201); assert.equal(replay.id, first.id); assert.equal(replay.replayed, true); assert.equal(replay.replayHeader, "true");
  assert.equal(await db.bankTransaction.count({ where: { reference: tag } }), 1, "sequential retry creates one movement");
  assert.equal(await db.journalEntry.count({ where: { sourceType: "BANK_MOVEMENT", sourceId: first.id } }), 1, "sequential retry creates one journal");
  const mismatch = await send(jar, key, { ...payload, amount: 124.45 }); assert.equal(mismatch.status, 409); assert.equal(mismatch.code, "IDEMPOTENCY_PAYLOAD_MISMATCH");

  const similarKey = randomUUID(); const warning = await send(jar, similarKey, payload); assert.equal(warning.status, 409); assert.equal(warning.code, "SIMILAR_FINANCIAL_OPERATION");
  const confirmed = await send(jar, similarKey, payload, warning.confirmationToken); assert.equal(confirmed.status, 201); createdIds.push(confirmed.id);
  assert.ok(await db.auditLog.findFirst({ where: { actorId: user.id, action: "financial.duplicate.confirm", target: confirmed.id } }));

  const concurrentPayload = { ...payload, amount: 222.22, description: `${tag}-concurrent`, reference: `${tag}-concurrent` }; const concurrentKey = randomUUID();
  const concurrent = await Promise.all([send(jar, concurrentKey, concurrentPayload), send(jar, concurrentKey, concurrentPayload)]);
  assert.ok(concurrent.every((item) => item.status === 201)); assert.equal(new Set(concurrent.map((item) => item.id)).size, 1); createdIds.push(concurrent[0].id);
  assert.equal(await db.bankTransaction.count({ where: { reference: `${tag}-concurrent` } }), 1, "parallel retry creates one movement");

  const retryKey = randomUUID(); const invalid = { type: "MANUAL_DEPOSIT", amount: 10, date: "2026-09-19", description: `${tag}-retry`, reference: `${tag}-retry` };
  assert.equal((await send(jar, retryKey, invalid)).status, 400); assert.equal(await db.financialOperationRequest.count({ where: { actorId: user.id, idempotencyKey: retryKey } }), 0, "failed transaction does not reserve key");
  const retried = await send(jar, retryKey, { ...invalid, counterAccountKey: "OWNER_FUNDING" }); assert.equal(retried.status, 201); createdIds.push(retried.id);
  const originalJournal = await db.journalEntry.findFirstOrThrow({ where: { sourceType: "BANK_MOVEMENT", sourceId: first.id } });
  const reversed = await send(jar, randomUUID(), { action: "reverse", id: first.id, reason: "اختبار إلغاء بنكي موثق" });
  assert.equal(reversed.status, 200, JSON.stringify(reversed));
  assert.equal((await db.bankTransaction.findUniqueOrThrow({ where: { id: first.id } })).status, "REVERSED");
  assert.ok(await db.journalEntry.findFirst({ where: { reversalOfId: originalJournal.id } }), "bank reversal creates balancing journal");
  assert.equal((await send(jar, randomUUID(), { action: "reverse", id: first.id, reason: "محاولة مكررة" })).status, 400);
  console.log("Financial idempotency API passed: replay, mismatch, similar confirmation, audit, rollback retry and parallel requests.");
} finally {
  if (user) {
    const operationIds = (await db.financialOperationRequest.findMany({ where: { actorId: user.id }, select: { id: true } })).map((item) => item.id);
    await db.$transaction(async (tx) => {
      const entries = await tx.journalEntry.findMany({ where: { OR: [{ sourceType: "BANK_MOVEMENT", sourceId: { in: createdIds } }, { reversalOf: { sourceType: "BANK_MOVEMENT", sourceId: { in: createdIds } } }] }, select: { id: true } });
      await tx.journalLine.deleteMany({ where: { entryId: { in: entries.map((entry) => entry.id) } } });
      await tx.journalEntry.deleteMany({ where: { id: { in: entries.map((entry) => entry.id) } } });
      await tx.bankAttachment.deleteMany({ where: { transactionId: { in: createdIds } } });
      await tx.bankTransaction.deleteMany({ where: { id: { in: createdIds } } });
      await tx.auditLog.deleteMany({ where: { OR: [{ actorId: user.id }, { target: { in: operationIds } }] } });
      await tx.financialOperationRequest.deleteMany({ where: { actorId: user.id } });
      await tx.accountingPeriod.deleteMany({ where: { month: "2098-12" } });
      await tx.user.delete({ where: { id: user.id } });
    });
  }
  await db.$disconnect();
}
