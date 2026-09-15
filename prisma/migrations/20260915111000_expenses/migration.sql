CREATE TABLE "SubcontractAccount" (
 "id" TEXT NOT NULL PRIMARY KEY, "name" TEXT NOT NULL, "companyId" TEXT NOT NULL, "projectId" TEXT NOT NULL, "scope" TEXT NOT NULL, "notes" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "SubcontractStatement" (
 "id" TEXT NOT NULL PRIMARY KEY, "accountId" TEXT NOT NULL, "sequence" INTEGER NOT NULL, "kind" TEXT NOT NULL DEFAULT 'CURRENT', "stage" TEXT NOT NULL DEFAULT 'DRAFT', "revision" INTEGER NOT NULL DEFAULT 1,
 "statementDate" DATETIME NOT NULL, "notes" TEXT, "grossCents" REAL NOT NULL, "deductionCents" REAL NOT NULL, "netCents" REAL NOT NULL, "previousGrossCents" REAL NOT NULL, "executiveApprovedAt" DATETIME, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL,
 FOREIGN KEY ("accountId") REFERENCES "SubcontractAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "SubcontractItem" (
 "id" TEXT NOT NULL PRIMARY KEY, "statementId" TEXT NOT NULL, "itemKey" TEXT NOT NULL, "position" INTEGER NOT NULL, "name" TEXT NOT NULL, "unit" TEXT NOT NULL, "previousQuantity" REAL NOT NULL, "currentQuantity" REAL NOT NULL, "entitlementPercent" REAL NOT NULL, "unitPriceCents" REAL NOT NULL, "previousValueCents" REAL NOT NULL, "totalCents" REAL NOT NULL,
 FOREIGN KEY ("statementId") REFERENCES "SubcontractStatement"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "SubcontractDeduction" (
 "id" TEXT NOT NULL PRIMARY KEY, "statementId" TEXT NOT NULL, "name" TEXT NOT NULL, "kind" TEXT NOT NULL, "value" REAL NOT NULL, "amountCents" REAL NOT NULL, "position" INTEGER NOT NULL,
 FOREIGN KEY ("statementId") REFERENCES "SubcontractStatement"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "SubcontractPayment" (
 "id" TEXT NOT NULL PRIMARY KEY, "statementId" TEXT NOT NULL, "amountCents" REAL NOT NULL, "paymentDate" DATETIME NOT NULL, "method" TEXT NOT NULL, "reference" TEXT NOT NULL, "notes" TEXT, "actorId" TEXT NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY ("statementId") REFERENCES "SubcontractStatement"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "SubcontractApproval" (
 "id" TEXT NOT NULL PRIMARY KEY, "statementId" TEXT NOT NULL, "fromStage" TEXT NOT NULL, "toStage" TEXT NOT NULL, "reason" TEXT, "actorId" TEXT NOT NULL, "actorName" TEXT NOT NULL, "revision" INTEGER NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY ("statementId") REFERENCES "SubcontractStatement"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "ExpenseAttachment" (
 "id" TEXT NOT NULL PRIMARY KEY, "entityType" TEXT NOT NULL, "entityId" TEXT NOT NULL, "name" TEXT NOT NULL, "mime" TEXT NOT NULL, "size" INTEGER NOT NULL, "data" BLOB NOT NULL, "actorId" TEXT NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "SubcontractStatement_accountId_sequence_key" ON "SubcontractStatement"("accountId", "sequence");
CREATE UNIQUE INDEX "SubcontractItem_statementId_itemKey_key" ON "SubcontractItem"("statementId", "itemKey");
CREATE INDEX "ExpenseAttachment_entityType_entityId_idx" ON "ExpenseAttachment"("entityType", "entityId");
