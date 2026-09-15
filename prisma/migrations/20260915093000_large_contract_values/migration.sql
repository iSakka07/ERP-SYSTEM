PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;
CREATE TABLE "new_IncomingContract" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "number" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "originalCents" REAL NOT NULL,
    "estimateReference" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "IncomingContract_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_IncomingContract" ("createdAt", "estimateReference", "id", "name", "notes", "number", "originalCents", "projectId", "updatedAt") SELECT "createdAt", "estimateReference", "id", "name", "notes", "number", "originalCents", "projectId", "updatedAt" FROM "IncomingContract";
DROP TABLE "IncomingContract";
ALTER TABLE "new_IncomingContract" RENAME TO "IncomingContract";
CREATE UNIQUE INDEX "IncomingContract_number_key" ON "IncomingContract"("number");
CREATE TABLE "new_IncomingMemo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contractId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amountCents" REAL NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IncomingMemo_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "IncomingContract" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_IncomingMemo" ("amountCents", "contractId", "createdAt", "id", "kind", "reason") SELECT "amountCents", "contractId", "createdAt", "id", "kind", "reason" FROM "IncomingMemo";
DROP TABLE "IncomingMemo";
ALTER TABLE "new_IncomingMemo" RENAME TO "IncomingMemo";
CREATE TABLE "new_IncomingStatement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contractId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'CURRENT',
    "grossCents" REAL NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'COMPANY',
    "submittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" DATETIME,
    "paymentMethod" TEXT,
    "paymentReference" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "IncomingStatement_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "IncomingContract" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_IncomingStatement" ("contractId", "createdAt", "grossCents", "id", "kind", "notes", "paidAt", "paymentMethod", "paymentReference", "sequence", "stage", "submittedAt", "updatedAt") SELECT "contractId", "createdAt", "grossCents", "id", "kind", "notes", "paidAt", "paymentMethod", "paymentReference", "sequence", "stage", "submittedAt", "updatedAt" FROM "IncomingStatement";
DROP TABLE "IncomingStatement";
ALTER TABLE "new_IncomingStatement" RENAME TO "IncomingStatement";
CREATE UNIQUE INDEX "IncomingStatement_contractId_sequence_key" ON "IncomingStatement"("contractId", "sequence");
CREATE TABLE "new_MaterialCertificate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "number" TEXT NOT NULL,
    "statementId" TEXT NOT NULL,
    "totalCents" REAL NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MaterialCertificate_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "IncomingStatement" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_MaterialCertificate" ("createdAt", "id", "notes", "number", "statementId", "totalCents", "updatedAt") SELECT "createdAt", "id", "notes", "number", "statementId", "totalCents", "updatedAt" FROM "MaterialCertificate";
DROP TABLE "MaterialCertificate";
ALTER TABLE "new_MaterialCertificate" RENAME TO "MaterialCertificate";
CREATE UNIQUE INDEX "MaterialCertificate_number_key" ON "MaterialCertificate"("number");
CREATE TABLE "new_MaterialCertificateItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "certificateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "quantity" REAL NOT NULL,
    "unitPriceCents" REAL NOT NULL,
    "totalCents" REAL NOT NULL,
    CONSTRAINT "MaterialCertificateItem_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "MaterialCertificate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_MaterialCertificateItem" ("certificateId", "id", "name", "quantity", "totalCents", "unit", "unitPriceCents") SELECT "certificateId", "id", "name", "quantity", "totalCents", "unit", "unitPriceCents" FROM "MaterialCertificateItem";
DROP TABLE "MaterialCertificateItem";
ALTER TABLE "new_MaterialCertificateItem" RENAME TO "MaterialCertificateItem";
COMMIT;
PRAGMA foreign_keys=ON;
