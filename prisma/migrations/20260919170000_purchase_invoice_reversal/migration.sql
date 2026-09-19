ALTER TABLE "PurchaseInvoice" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'POSTED';
ALTER TABLE "PurchaseInvoice" ADD COLUMN "reversedAt" DATETIME;
ALTER TABLE "PurchaseInvoice" ADD COLUMN "reversalReason" TEXT;

CREATE INDEX "PurchaseInvoice_status_idx" ON "PurchaseInvoice"("status");
