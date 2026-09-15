CREATE TABLE "WorkWithdrawal" (
"id" TEXT NOT NULL PRIMARY KEY,
"sourceAccountId" TEXT NOT NULL REFERENCES "SubcontractAccount"("id"),
"sourceStatementId" TEXT NOT NULL REFERENCES "SubcontractStatement"("id"),
"destinationAccountId" TEXT REFERENCES "SubcontractAccount"("id"),
"destinationCompanyId" TEXT,
"itemKey" TEXT NOT NULL,
"itemName" TEXT NOT NULL,
"unit" TEXT NOT NULL,
"itemKeysJson" TEXT NOT NULL,
"kind" TEXT NOT NULL,
"quantity" REAL,
"withdrawnScope" TEXT NOT NULL,
"retainedScope" TEXT,
"retainedItemKey" TEXT,
"reason" TEXT NOT NULL,
"effectiveDate" DATETIME NOT NULL,
"stage" TEXT NOT NULL DEFAULT 'DRAFT',
"revision" INTEGER NOT NULL DEFAULT 1,
"snapshotJson" TEXT NOT NULL,
"actorId" TEXT NOT NULL,
"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "WorkWithdrawal_destinationAccountId_key" ON "WorkWithdrawal"("destinationAccountId");
CREATE INDEX "WorkWithdrawal_sourceAccountId_stage_idx" ON "WorkWithdrawal"("sourceAccountId", "stage");
