import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { financials, incomingStages } from "../src/lib/incoming.ts";
const db = new PrismaClient();
const base = process.env.ERP_TEST_URL || "http://localhost:3090";
const cookieMap = new Map();
function takeCookies(response, jar) {
  for (const c of response.headers.getSetCookie()) {
    const [name, ...value] = c.split(";")[0].split("=");
    jar.set(name, value.join("="));
  }
}
function cookies(jar) {
  return [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
}
async function login(email) {
  const jar = new Map();
  const csrf = await fetch(`${base}/api/auth/csrf`);
  takeCookies(csrf, jar);
  const { csrfToken } = await csrf.json();
  const r = await fetch(`${base}/api/auth/callback/credentials`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookies(jar),
    },
    body: new URLSearchParams({
      csrfToken,
      email,
      password: "Admin@123456",
      callbackUrl: `${base}/incoming`,
    }),
  });
  takeCookies(r, jar);
  const session = await fetch(`${base}/api/auth/session`, {
    headers: { Cookie: cookies(jar) },
  });
  assert.ok((await session.json()).user, `login ${email}`);
  return jar;
}
async function post(payload, files = true, jar = cookieMap) {
  const key = randomUUID();
  const send = async (confirmation) => { const form = new FormData(); form.set("payload", JSON.stringify(payload)); if (files) form.append("files", new Blob([proof], { type: "application/pdf" }), "AUTOMATED-TEST-ONLY.pdf"); const r = await fetch(`${base}/api/incoming`, { method: "POST", headers: { Cookie: cookies(jar), Origin: base, "Idempotency-Key": key, ...(confirmation ? { "Duplicate-Confirmation": confirmation } : {}) }, body: form }); const result = await r.json(); if (r.status === 409 && result.code === "SIMILAR_FINANCIAL_OPERATION") return send(result.confirmationToken); return { status: r.status, ...result }; };
  return send();
}
async function remove(id, jar = cookieMap) {
  const response = await fetch(`${base}/api/incoming`, { method: "DELETE", headers: { "Content-Type": "application/json", Cookie: cookies(jar), Origin: base }, body: JSON.stringify({ id }) });
  return { status: response.status, ...(await response.json()) };
}
let proof;
let testContractId;
try {
  const fixture = await db.incomingAttachment.findFirstOrThrow({
    where: { name: "DEMO-ONLY.pdf" },
  });
  proof = fixture.data;
  const admin = await login("admin@erp.local");
  admin.forEach((v, k) => cookieMap.set(k, v));
  const sales = await login("sales@erp.local");
  const accountant = await login("accountant@erp.local");
  assert.equal((await post({ action: "contract" }, false, sales)).status, 403);
  assert.equal(
    (
      await fetch(`${base}/api/incoming/attachments/${fixture.id}`, {
        headers: { Cookie: cookies(sales) },
      })
    ).status,
    403,
  );
  assert.equal(
    (await fetch(`${base}/api/incoming/attachments/${fixture.id}`)).status,
    401,
  );
  const project = await db.project.findUniqueOrThrow({
    where: { code: "MAYAN-27" },
  });
  const stamp = Date.now();
  const contract = {
    action: "contract",
    number: `TEST-${stamp}`,
    name: "اختبار آلي — بيانات تجريبية فقط",
    projectId: project.id,
    value: 10_000_000,
  };
  const missingProof = await post(contract, false);
  assert.equal(missingProof.status, 400, JSON.stringify(missingProof));
  let r = await post(contract);
  assert.equal(r.status, 200, JSON.stringify(r));
  const contractId = r.id;
  testContractId = contractId;
  assert.equal((await post(contract)).status, 400, "duplicate number");
  r = await post({ ...contract, id: contractId, value: 192_315_028 }, false);
  assert.equal(r.status, 200, "large construction contract");
  assert.equal(
    (await db.incomingContract.findUniqueOrThrow({ where: { id: contractId } }))
      .originalCents,
    19_231_502_800,
  );
  r = await post(
    { ...contract, id: contractId, name: "اختبار آلي — عقد معدّل" },
    false,
  );
  assert.equal(r.status, 200);
  r = await post({
    action: "statement",
    contractId,
    kind: "CURRENT",
    value: 1_000_000,
  });
  assert.equal(r.status, 200, JSON.stringify(r));
  const first = r.id;
  r = await post({
    action: "material",
    number: `TEST-MAT-${stamp}`,
    statementId: first,
    items: [{ name: "حديد — اختبار", unit: "طن", quantity: 5, price: 20_000 }],
  });
  assert.equal(r.status, 200, JSON.stringify(r));
  const material = r.id;
  r = await post({
    action: "material",
    number: `TEST-EXCESS-${stamp}`,
    statementId: first,
    items: [{ name: "تجاوز", unit: "طن", quantity: 100, price: 20_000 }],
  });
  assert.equal(r.status, 400, "materials above gross");
  r = await post({
    action: "statement",
    contractId,
    kind: "CURRENT",
    value: 900_000,
  });
  assert.equal(r.status, 400, "cumulative must not decrease");
  for (const [stage] of incomingStages.slice(1, -1)) {
    r = await post({ action: "stage", id: first, stage }, false);
    assert.equal(r.status, 200, JSON.stringify(r));
  }
  const paid = {
    action: "stage",
    id: first,
    stage: "PAID",
    paidAt: "2026-09-15",
    paymentMethod: "TRANSFER",
    paymentReference: "AUTOMATED-TEST-ONLY",
  };
  assert.equal((await post(paid, false)).status, 400, "payment proof required");
  assert.equal(
    (await post({ action: "stage", id: first, stage: "PAID" })).status,
    400,
    "payment fields required",
  );
  r = await post(paid);
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.equal(
    (
      await post(
        {
          action: "statement",
          id: first,
          contractId,
          kind: "CURRENT",
          value: 1_100_000,
        },
        false,
      )
    ).status,
    400,
    "paid immutable",
  );
  assert.equal(
    (
      await post(
        {
          action: "material",
          id: material,
          statementId: first,
          number: `TEST-MAT-${stamp}`,
          items: [{ name: "معدل", unit: "طن", quantity: 6, price: 20_000 }],
        },
        false,
      )
    ).status,
    400,
    "paid materials immutable",
  );
  r = await post({
    action: "statement",
    contractId,
    kind: "CURRENT",
    value: 1_600_000,
  });
  assert.equal(r.status, 200);
  const second = r.id;
  r = await post({
    action: "material",
    number: `TEST-MAT2-${stamp}`,
    statementId: second,
    items: [{ name: "أسمنت — اختبار", unit: "طن", quantity: 10, price: 5_000 }],
  });
  assert.equal(r.status, 200);
  const load = () =>
    db.incomingContract.findUniqueOrThrow({
      where: { id: contractId },
      include: { memos: true, statements: { include: { materials: true } } },
    });
  assert.equal(
    financials(await load()).net,
    90_000_000,
    "unpaid second does not affect net",
  );
  for (const [stage] of incomingStages.slice(1, -1))
    assert.equal(
      (await post({ action: "stage", id: second, stage }, false)).status,
      200,
    );
  assert.equal((await post({ ...paid, id: second })).status, 200);
  const f = financials(await load());
  assert.equal(f.gross, 160_000_000);
  assert.equal(f.net, 145_000_000);
  assert.equal(f.remaining, 840_000_000);
  assert.equal(
    (
      await post(
        { action: "stage", id: first, stage: "CENTRAL", reason: "اختبار" },
        false,
      )
    ).status,
    400,
    "rollback latest first",
  );
  assert.equal(
    (
      await post(
        { action: "stage", id: second, stage: "CENTRAL", reason: "اختبار" },
        false,
        accountant,
      )
    ).status,
    400,
    "only admin rolls back paid",
  );
  assert.equal(
    (
      await post(
        {
          action: "stage",
          id: second,
          stage: "CENTRAL",
          reason: "اختبار رجوع",
        },
        false,
      )
    ).status,
    200,
  );
  assert.equal(
    financials(await load()).net,
    90_000_000,
    "rollback restores previous paid",
  );
  let secondBankEvents = await db.bankTransaction.findMany({
    where: {
      OR: [
        { sourceType: "INCOMING_STATEMENT", sourceId: { startsWith: second } },
        { sourceType: "INCOMING_STATEMENT_REVERSAL" },
      ],
    },
  });
  const secondOriginalIds = new Set(secondBankEvents.filter((event) => event.sourceId?.startsWith(second)).map((event) => event.id));
  secondBankEvents = secondBankEvents.filter((event) => event.sourceId?.startsWith(second) || (event.sourceId && secondOriginalIds.has(event.sourceId)));
  assert.equal(
    secondBankEvents.reduce((sum, event) => sum + (event.type === "INCOMING_COLLECTION" ? event.amountCents : -event.amountCents), 0),
    0,
    "paid rollback reverses the bank collection",
  );
  const reversedCollection = await db.journalEntry.findFirst({
    where: { sourceType: "INCOMING_COLLECTION", sourceId: { startsWith: second } },
    include: { reversalEntry: true },
    orderBy: { createdAt: "desc" },
  });
  assert.ok(reversedCollection?.reversalEntry, "paid rollback reverses the collection journal");
  assert.equal((await post({ ...paid, id: second })).status, 200, "re-payment creates a new collection event");
  assert.equal(financials(await load()).net, 145_000_000);
  assert.equal((await post({ action: "stage", id: second, stage: "CENTRAL", reason: "اختبار رجوع ثانٍ" }, false)).status, 200);
  assert.equal(financials(await load()).net, 90_000_000);
  assert.equal(
    (
      await post({
        action: "memo",
        contractId,
        kind: "DECREASE",
        value: 9_000_000,
        reason: "اختبار تجاوز",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await post({
        action: "memo",
        contractId,
        kind: "INCREASE",
        value: 1_000_000,
        reason: "رفع تجريبي",
      })
    ).status,
    200,
  );
  assert.equal(financials(await load()).value, 1_100_000_000);
  // Neutralize synthetic financial effects through the actual documented rollback path.
  assert.equal(
    (
      await post(
        {
          action: "stage",
          id: first,
          stage: "CENTRAL",
          reason: "إنهاء الاختبار — إلغاء الأثر التجريبي",
        },
        false,
      )
    ).status,
    200,
  );
  assert.equal(financials(await load()).net, 0);
  assert.ok(await db.auditLog.count({ where: { target: first } }));
  assert.equal((await remove(contractId, sales)).status, 403, "forbidden safe delete");
  assert.equal((await remove(contractId)).status, 200, "safe delete linked contract");
  assert.equal((await db.incomingContract.findUniqueOrThrow({ where: { id: contractId } })).active, false);
  assert.equal((await post({ ...contract, id: contractId, name: "لا يجب تعديله" }, false)).status, 400, "safe-deleted contract is locked");
  assert.ok(await db.auditLog.count({ where: { target: contractId, action: "incoming.contract.delete" } }));
  console.log(
    "PASS: API RBAC, attachment access, contract edits, duplicate validation, statement/material CRUD, nine-stage cycle, financial gate, cumulative net, memo, locks, audited rollback and safe delete.",
  );
} finally {
  if (testContractId) {
    const fixture = await db.incomingContract.findUnique({
      where: { id: testContractId },
      include: { memos: true, statements: { include: { materials: true } } },
    });
    if (fixture?.number.startsWith("TEST-"))
      await db.$transaction(async (tx) => {
        const statements = fixture.statements.map((s) => s.id);
        const materials = fixture.statements.flatMap((s) =>
          s.materials.map((m) => m.id),
        );
        const bankOriginals = await tx.bankTransaction.findMany({ where: { sourceType: "INCOMING_STATEMENT", OR: statements.map((id) => ({ sourceId: { startsWith: id } })) }, select: { id: true } });
        await tx.bankTransaction.deleteMany({ where: { sourceType: "INCOMING_STATEMENT_REVERSAL", sourceId: { in: bankOriginals.map((item) => item.id) } } });
        await tx.bankTransaction.deleteMany({ where: { id: { in: bankOriginals.map((item) => item.id) } } });
        const journalOriginals = await tx.journalEntry.findMany({ where: { OR: [...statements.map((id) => ({ sourceId: { startsWith: id } })), ...materials.map((id) => ({ sourceId: id }))] }, select: { id: true } });
        await tx.journalEntry.deleteMany({ where: { reversalOfId: { in: journalOriginals.map((item) => item.id) } } });
        await tx.journalEntry.deleteMany({ where: { id: { in: journalOriginals.map((item) => item.id) } } });
        await tx.incomingAttachment.deleteMany({
          where: {
            entityId: {
              in: [
                fixture.id,
                ...statements,
                ...materials,
                ...fixture.memos.map((m) => m.id),
              ],
            },
          },
        });
        await tx.materialCertificateItem.deleteMany({
          where: { certificateId: { in: materials } },
        });
        await tx.materialCertificate.deleteMany({
          where: { id: { in: materials } },
        });
        await tx.incomingStatement.deleteMany({
          where: { id: { in: statements } },
        });
        await tx.incomingMemo.deleteMany({ where: { contractId: fixture.id } });
        await tx.incomingContract.delete({ where: { id: fixture.id } });
      });
  }
  await db.$disconnect();
}
