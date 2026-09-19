ALTER TABLE "SubcontractPayment" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'POSTED';
ALTER TABLE "SubcontractPayment" ADD COLUMN "reversedAt" DATETIME;
ALTER TABLE "SubcontractPayment" ADD COLUMN "reversalReason" TEXT;

CREATE INDEX "SubcontractPayment_status_idx" ON "SubcontractPayment"("status");
