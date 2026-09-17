ALTER TABLE "SubcontractAccount" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "SubcontractAccount_active_idx" ON "SubcontractAccount"("active");
