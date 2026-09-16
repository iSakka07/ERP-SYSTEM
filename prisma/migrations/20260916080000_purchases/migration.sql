CREATE TABLE "PurchaseInvoice" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "number" TEXT NOT NULL,
 "projectId" TEXT NOT NULL,
 "supplierId" TEXT,
 "invoiceDate" DATETIME NOT NULL,
 "notes" TEXT,
 "totalCents" REAL NOT NULL,
 "actorId" TEXT NOT NULL,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" DATETIME NOT NULL,
 FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 FOREIGN KEY ("supplierId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE TABLE "PurchaseItem" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "invoiceId" TEXT NOT NULL,
 "position" INTEGER NOT NULL,
 "name" TEXT NOT NULL,
 "unit" TEXT NOT NULL,
 "quantity" REAL NOT NULL,
 "unitPriceCents" REAL NOT NULL,
 "totalCents" REAL NOT NULL,
 FOREIGN KEY ("invoiceId") REFERENCES "PurchaseInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "PurchaseAttachment" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "entityType" TEXT NOT NULL,
 "entityId" TEXT NOT NULL,
 "name" TEXT NOT NULL,
 "mime" TEXT NOT NULL,
 "size" INTEGER NOT NULL,
 "data" BLOB NOT NULL,
 "actorId" TEXT NOT NULL,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "PurchaseInvoice_number_key" ON "PurchaseInvoice"("number");
CREATE INDEX "PurchaseInvoice_projectId_idx" ON "PurchaseInvoice"("projectId");
CREATE INDEX "PurchaseInvoice_supplierId_idx" ON "PurchaseInvoice"("supplierId");
CREATE INDEX "PurchaseAttachment_entityType_entityId_idx" ON "PurchaseAttachment"("entityType", "entityId");
