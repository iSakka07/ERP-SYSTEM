-- Preserve the accounting-period table for existing deployments and ensure
-- the table remains protected after any earlier drop/recreate migration.
CREATE TABLE IF NOT EXISTS "AccountingPeriod" (
  "id" TEXT NOT NULL,
  "month" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "closedAt" TIMESTAMP(3),
  "closedById" TEXT,
  "reopenReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccountingPeriod_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AccountingPeriod_month_key"
  ON "AccountingPeriod"("month");

ALTER TABLE "AccountingPeriod" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "AccountingPeriod" FROM anon, authenticated, service_role;
