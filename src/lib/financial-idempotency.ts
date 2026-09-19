import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type Tx = Prisma.TransactionClient;
type JsonRecord = Record<string, unknown>;

export type FinancialOperationContext = {
  actorId: string;
  operation: string;
  key: string;
  requestHash: string;
  businessHash: string;
  duplicateOfId: string | null;
  duplicateConfirmed: boolean;
};

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as JsonRecord).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}

function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

function secret() {
  return process.env.AUTH_SECRET || "development-only-idempotency-secret";
}

function confirmationToken(input: { actorId: string; operation: string; key: string; requestHash: string; duplicateId: string }) {
  return createHmac("sha256", secret()).update([input.actorId, input.operation, input.key, input.requestHash, input.duplicateId].join("|")).digest("hex");
}

function sameToken(left: string, right: string) {
  if (!left || left.length !== right.length) return false;
  return timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

export async function guardFinancialOperation(request: Request, input: { actorId: string; operation: string; requestData: unknown; businessData: unknown }) {
  const key = request.headers.get("idempotency-key")?.trim() || "";
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(key)) return { response: NextResponse.json({ error: "تعذر تأمين العملية المالية. أعد فتح النموذج وحاول مرة أخرى.", code: "IDEMPOTENCY_KEY_REQUIRED" }, { status: 400 }) } as const;
  const requestHash = hash(input.requestData);
  const businessHash = hash(input.businessData);
  const existing = await prisma.financialOperationRequest.findUnique({ where: { actorId_operation_idempotencyKey: { actorId: input.actorId, operation: input.operation, idempotencyKey: key } } });
  if (existing) {
    if (existing.requestHash !== requestHash) return { response: NextResponse.json({ error: "مفتاح العملية مستخدم مع بيانات مختلفة. ابدأ عملية جديدة.", code: "IDEMPOTENCY_PAYLOAD_MISMATCH" }, { status: 409 }) } as const;
    const body = JSON.parse(existing.responseJson) as JsonRecord;
    return { response: NextResponse.json({ ...body, replayed: true, message: "العملية مسجلة بالفعل ولم تتكرر." }, { status: existing.responseStatus, headers: { "Idempotency-Replayed": "true" } }) } as const;
  }
  const similar = await prisma.financialOperationRequest.findFirst({ where: { operation: input.operation, businessHash }, orderBy: { createdAt: "desc" } });
  let duplicateOfId: string | null = null;
  let duplicateConfirmed = false;
  if (similar) {
    duplicateOfId = similar.id;
    const expected = confirmationToken({ actorId: input.actorId, operation: input.operation, key, requestHash, duplicateId: similar.id });
    duplicateConfirmed = sameToken(request.headers.get("duplicate-confirmation") || "", expected);
    if (!duplicateConfirmed) {
      return { response: NextResponse.json({ error: "توجد عملية مالية مشابهة مسجلة من قبل.", code: "SIMILAR_FINANCIAL_OPERATION", confirmationToken: expected, similar: { id: similar.entityId, entityType: similar.entityType, createdAt: similar.createdAt, summary: similar.summaryJson ? JSON.parse(similar.summaryJson) : null } }, { status: 409 }) } as const;
    }
  }
  return { context: { actorId: input.actorId, operation: input.operation, key, requestHash, businessHash, duplicateOfId, duplicateConfirmed } satisfies FinancialOperationContext } as const;
}

export async function completeFinancialOperation(tx: Tx, context: FinancialOperationContext, input: { status?: number; body: JsonRecord; entityType?: string; entityId?: string; summary?: JsonRecord }) {
  const saved = await tx.financialOperationRequest.create({ data: { idempotencyKey: context.key, actorId: context.actorId, operation: context.operation, requestHash: context.requestHash, businessHash: context.businessHash, responseStatus: input.status ?? 200, responseJson: JSON.stringify(input.body), entityType: input.entityType, entityId: input.entityId, summaryJson: input.summary ? JSON.stringify(input.summary) : null, duplicateOfId: context.duplicateOfId, duplicateConfirmed: context.duplicateConfirmed } });
  if (context.duplicateConfirmed && context.duplicateOfId) await tx.auditLog.create({ data: { actorId: context.actorId, action: "financial.duplicate.confirm", target: input.entityId || saved.id, details: JSON.stringify({ operation: context.operation, duplicateOfId: context.duplicateOfId, financialOperationRequestId: saved.id }) } });
  return saved;
}

export async function replayAfterConflict(error: unknown, context: FinancialOperationContext | null) {
  if (!context || !(typeof error === "object" && error && "code" in error && (error as { code?: string }).code === "P2002")) return null;
  const existing = await prisma.financialOperationRequest.findUnique({ where: { actorId_operation_idempotencyKey: { actorId: context.actorId, operation: context.operation, idempotencyKey: context.key } } });
  if (!existing || existing.requestHash !== context.requestHash) return null;
  return NextResponse.json({ ...(JSON.parse(existing.responseJson) as JsonRecord), replayed: true, message: "العملية مسجلة بالفعل ولم تتكرر." }, { status: existing.responseStatus, headers: { "Idempotency-Replayed": "true" } });
}
