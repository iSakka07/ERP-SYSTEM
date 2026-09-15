CREATE TABLE "IncomingContract" (
 "id" TEXT NOT NULL PRIMARY KEY, "number" TEXT NOT NULL, "name" TEXT NOT NULL,
 "projectId" TEXT NOT NULL, "originalCents" INTEGER NOT NULL, "estimateReference" TEXT, "notes" TEXT,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL,
 FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "IncomingStatement" (
 "id" TEXT NOT NULL PRIMARY KEY, "contractId" TEXT NOT NULL, "sequence" INTEGER NOT NULL,
 "kind" TEXT NOT NULL DEFAULT 'CURRENT', "grossCents" INTEGER NOT NULL, "stage" TEXT NOT NULL DEFAULT 'COMPANY',
 "submittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "paidAt" DATETIME, "paymentMethod" TEXT,
 "paymentReference" TEXT, "notes" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL,
 FOREIGN KEY ("contractId") REFERENCES "IncomingContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "MaterialCertificate" (
 "id" TEXT NOT NULL PRIMARY KEY, "number" TEXT NOT NULL, "statementId" TEXT NOT NULL,
 "totalCents" INTEGER NOT NULL, "notes" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL,
 FOREIGN KEY ("statementId") REFERENCES "IncomingStatement"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "MaterialCertificateItem" (
 "id" TEXT NOT NULL PRIMARY KEY, "certificateId" TEXT NOT NULL, "name" TEXT NOT NULL, "unit" TEXT NOT NULL,
 "quantity" REAL NOT NULL, "unitPriceCents" INTEGER NOT NULL, "totalCents" INTEGER NOT NULL,
 FOREIGN KEY ("certificateId") REFERENCES "MaterialCertificate"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "IncomingMemo" (
 "id" TEXT NOT NULL PRIMARY KEY, "contractId" TEXT NOT NULL, "kind" TEXT NOT NULL, "amountCents" INTEGER NOT NULL,
 "reason" TEXT NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY ("contractId") REFERENCES "IncomingContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "IncomingAttachment" (
 "id" TEXT NOT NULL PRIMARY KEY, "entityType" TEXT NOT NULL, "entityId" TEXT NOT NULL,
 "name" TEXT NOT NULL, "mime" TEXT NOT NULL, "size" INTEGER NOT NULL, "data" BLOB NOT NULL,
 "actorId" TEXT NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "IncomingContract_number_key" ON "IncomingContract"("number");
CREATE UNIQUE INDEX "IncomingStatement_contractId_sequence_key" ON "IncomingStatement"("contractId", "sequence");
CREATE UNIQUE INDEX "MaterialCertificate_number_key" ON "MaterialCertificate"("number");
CREATE INDEX "IncomingAttachment_entityType_entityId_idx" ON "IncomingAttachment"("entityType", "entityId");
