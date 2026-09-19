ALTER TABLE "BankTransaction" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'POSTED';
ALTER TABLE "BankTransaction" ADD COLUMN "reversedAt" DATETIME;
ALTER TABLE "BankTransaction" ADD COLUMN "reversalReason" TEXT;

CREATE INDEX "BankTransaction_status_idx" ON "BankTransaction"("status");
