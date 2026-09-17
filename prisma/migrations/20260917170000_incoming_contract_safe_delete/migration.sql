ALTER TABLE "IncomingContract" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "IncomingContract_active_idx" ON "IncomingContract"("active");
