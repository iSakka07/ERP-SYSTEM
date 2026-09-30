ALTER TABLE "SubcontractPayment" ADD COLUMN "paymentSource" TEXT NOT NULL DEFAULT 'EXECUTIVE_DIRECTOR';
ALTER TABLE "SubcontractPayment" ADD COLUMN "cashOperationId" TEXT;
ALTER TABLE "PettyCashTransaction" ADD COLUMN "operationId" TEXT;
ALTER TABLE "PettyCashTransaction" ADD COLUMN "linkedEntityType" TEXT;
CREATE INDEX "PettyCashTransaction_operationId_idx" ON "PettyCashTransaction"("operationId");
