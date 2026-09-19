CREATE TABLE "FinancialOperationRequest" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "idempotencyKey" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "businessHash" TEXT NOT NULL,
  "responseStatus" INTEGER NOT NULL,
  "responseJson" TEXT NOT NULL,
  "entityType" TEXT,
  "entityId" TEXT,
  "summaryJson" TEXT,
  "duplicateOfId" TEXT,
  "duplicateConfirmed" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "FinancialOperationRequest_actor_operation_key_key" ON "FinancialOperationRequest"("actorId", "operation", "idempotencyKey");
CREATE INDEX "FinancialOperationRequest_operation_businessHash_createdAt_idx" ON "FinancialOperationRequest"("operation", "businessHash", "createdAt");
CREATE INDEX "FinancialOperationRequest_entityType_entityId_idx" ON "FinancialOperationRequest"("entityType", "entityId");
