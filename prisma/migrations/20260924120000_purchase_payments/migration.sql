ALTER TABLE "PurchaseInvoice" ADD COLUMN "paidCents" REAL NOT NULL DEFAULT 0;
ALTER TABLE "PurchaseInvoice" ADD COLUMN "paymentTrackingStarted" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "PurchasePayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invoiceId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "amountCents" REAL NOT NULL,
    "paymentDate" DATETIME NOT NULL,
    "paymentSource" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "notes" TEXT,
    "actorId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversedAt" DATETIME,
    "reversalReason" TEXT,
    CONSTRAINT "PurchasePayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "PurchaseInvoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PurchasePayment_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PurchasePayment_number_key" ON "PurchasePayment"("number");
CREATE INDEX "PurchasePayment_invoiceId_status_paymentDate_idx" ON "PurchasePayment"("invoiceId", "status", "paymentDate");
CREATE INDEX "PurchasePayment_actorId_createdAt_idx" ON "PurchasePayment"("actorId", "createdAt");
