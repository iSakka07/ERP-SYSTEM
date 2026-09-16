CREATE TABLE "PettyCashCategory" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "requiresDocument" BOOLEAN NOT NULL DEFAULT false,
  "requiresAttachment" BOOLEAN NOT NULL DEFAULT true,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "PettyCashCategory_key_key" ON "PettyCashCategory"("key");
CREATE TABLE "PettyCashAccount" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'MAIN',
  "employeeId" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "PettyCashAccount_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "PettyCashAccount_type_employeeId_idx" ON "PettyCashAccount"("type", "employeeId");
CREATE TABLE "PettyCashTransaction" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "number" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'POSTED',
  "amountCents" REAL NOT NULL,
  "transactionDate" DATETIME NOT NULL,
  "sourceAccountId" TEXT,
  "destinationAccountId" TEXT,
  "projectId" TEXT,
  "categoryId" TEXT,
  "description" TEXT NOT NULL,
  "documentNumber" TEXT,
  "fundingSource" TEXT,
  "recordedById" TEXT NOT NULL,
  "reversedAt" DATETIME,
  "reversalReason" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PettyCashTransaction_sourceAccountId_fkey" FOREIGN KEY ("sourceAccountId") REFERENCES "PettyCashAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "PettyCashTransaction_destinationAccountId_fkey" FOREIGN KEY ("destinationAccountId") REFERENCES "PettyCashAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "PettyCashTransaction_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "PettyCashTransaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "PettyCashCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "PettyCashTransaction_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PettyCashTransaction_number_key" ON "PettyCashTransaction"("number");
CREATE INDEX "PettyCashTransaction_transactionDate_type_idx" ON "PettyCashTransaction"("transactionDate", "type");
CREATE INDEX "PettyCashTransaction_projectId_idx" ON "PettyCashTransaction"("projectId");
CREATE TABLE "PettyCashAttachment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "transactionId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "mime" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "data" BLOB NOT NULL,
  "actorId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PettyCashAttachment_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "PettyCashTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "PettyCashCount" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountId" TEXT NOT NULL,
  "expectedCents" REAL NOT NULL,
  "actualCents" REAL NOT NULL,
  "differenceCents" REAL NOT NULL,
  "countedAt" DATETIME NOT NULL,
  "notes" TEXT,
  "actorId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PettyCashCount_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "PettyCashAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "PettyCashCount_accountId_countedAt_idx" ON "PettyCashCount"("accountId", "countedAt");
