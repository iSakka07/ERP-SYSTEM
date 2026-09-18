CREATE TABLE "BankAccount" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "BankAccount_name_key" ON "BankAccount"("name");

CREATE TABLE "BankTransaction" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "number" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "amountCents" REAL NOT NULL,
  "transactionDate" DATETIME NOT NULL,
  "projectId" TEXT,
  "categoryKey" TEXT,
  "counterAccountKey" TEXT,
  "description" TEXT NOT NULL,
  "reference" TEXT,
  "sourceType" TEXT,
  "sourceId" TEXT,
  "actorId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BankTransaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "BankAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BankTransaction_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "BankTransaction_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "BankTransaction_number_key" ON "BankTransaction"("number");
CREATE UNIQUE INDEX "BankTransaction_sourceType_sourceId_key" ON "BankTransaction"("sourceType", "sourceId");
CREATE INDEX "BankTransaction_transactionDate_type_idx" ON "BankTransaction"("transactionDate", "type");
CREATE INDEX "BankTransaction_projectId_idx" ON "BankTransaction"("projectId");

CREATE TABLE "BankAttachment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "transactionId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "mime" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "data" BLOB NOT NULL,
  "actorId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BankAttachment_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "BankTransaction" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
