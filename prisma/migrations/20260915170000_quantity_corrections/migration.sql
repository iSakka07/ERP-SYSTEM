ALTER TABLE "SubcontractItem" ADD COLUMN "correctionQuantity" REAL NOT NULL DEFAULT 0;
ALTER TABLE "SubcontractItem" ADD COLUMN "correctionReason" TEXT;
ALTER TABLE "SubcontractStatement" ADD COLUMN "correctionDebtCents" REAL NOT NULL DEFAULT 0;
