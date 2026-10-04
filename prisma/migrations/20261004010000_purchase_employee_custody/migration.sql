ALTER TABLE "PurchaseInvoice" ADD COLUMN "paymentAccountId" TEXT;
ALTER TABLE "PurchasePayment" ADD COLUMN "paymentAccountId" TEXT;
CREATE INDEX "PurchasePayment_paymentAccountId_idx" ON "PurchasePayment"("paymentAccountId");
