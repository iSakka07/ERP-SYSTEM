ALTER TABLE "PurchaseInvoice" ADD COLUMN "paidCents" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "PurchaseInvoice" ADD COLUMN "paymentTrackingStarted" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "PurchasePayment" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "amountCents" DOUBLE PRECISION NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "paymentSource" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "notes" TEXT,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversedAt" TIMESTAMP(3),
    "reversalReason" TEXT,
    CONSTRAINT "PurchasePayment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PurchasePayment_number_key" ON "PurchasePayment"("number");
CREATE INDEX "PurchasePayment_invoiceId_status_paymentDate_idx" ON "PurchasePayment"("invoiceId", "status", "paymentDate");
CREATE INDEX "PurchasePayment_actorId_createdAt_idx" ON "PurchasePayment"("actorId", "createdAt");

ALTER TABLE "PurchasePayment" ADD CONSTRAINT "PurchasePayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "PurchaseInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PurchasePayment" ADD CONSTRAINT "PurchasePayment_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
