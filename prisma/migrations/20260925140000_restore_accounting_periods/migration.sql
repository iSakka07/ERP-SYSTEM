CREATE TABLE "AccountingPeriod" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "month" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "closedAt" DATETIME,
  "closedById" TEXT,
  "reopenReason" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "AccountingPeriod_month_key" ON "AccountingPeriod"("month");
