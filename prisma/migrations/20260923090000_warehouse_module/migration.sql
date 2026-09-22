ALTER TABLE "PurchaseInvoice" ADD COLUMN "stockMode" TEXT NOT NULL DEFAULT 'LEGACY_DIRECT';
ALTER TABLE "PurchaseInvoice" ADD COLUMN "warehouseId" TEXT;

CREATE TABLE "Warehouse" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'MAIN',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "Warehouse_code_key" ON "Warehouse"("code");

CREATE TABLE "InventoryItem" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "unit" TEXT NOT NULL,
  "category" TEXT,
  "minimumQuantity" REAL NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "InventoryItem_code_key" ON "InventoryItem"("code");
CREATE UNIQUE INDEX "InventoryItem_name_unit_key" ON "InventoryItem"("name", "unit");
CREATE INDEX "InventoryItem_active_name_idx" ON "InventoryItem"("active", "name");

ALTER TABLE "PurchaseItem" ADD COLUMN "inventoryItemId" TEXT REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "StockMovement" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "number" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "movementDate" DATETIME NOT NULL,
  "fromWarehouseId" TEXT,
  "toWarehouseId" TEXT,
  "projectId" TEXT,
  "purchaseInvoiceId" TEXT,
  "recipient" TEXT,
  "notes" TEXT,
  "status" TEXT NOT NULL DEFAULT 'POSTED',
  "actorId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StockMovement_fromWarehouseId_fkey" FOREIGN KEY ("fromWarehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "StockMovement_toWarehouseId_fkey" FOREIGN KEY ("toWarehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "StockMovement_purchaseInvoiceId_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "PurchaseInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "StockMovement_number_key" ON "StockMovement"("number");
CREATE INDEX "StockMovement_movementDate_type_idx" ON "StockMovement"("movementDate", "type");
CREATE INDEX "StockMovement_fromWarehouseId_movementDate_idx" ON "StockMovement"("fromWarehouseId", "movementDate");
CREATE INDEX "StockMovement_toWarehouseId_movementDate_idx" ON "StockMovement"("toWarehouseId", "movementDate");
CREATE INDEX "StockMovement_projectId_movementDate_idx" ON "StockMovement"("projectId", "movementDate");
CREATE INDEX "StockMovement_purchaseInvoiceId_idx" ON "StockMovement"("purchaseInvoiceId");

CREATE TABLE "StockMovementLine" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "movementId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "quantity" REAL NOT NULL,
  "unitCostCents" REAL NOT NULL,
  "totalCents" REAL NOT NULL,
  "sourcePurchaseItemId" TEXT,
  CONSTRAINT "StockMovementLine_movementId_fkey" FOREIGN KEY ("movementId") REFERENCES "StockMovement"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StockMovementLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockMovementLine_sourcePurchaseItemId_fkey" FOREIGN KEY ("sourcePurchaseItemId") REFERENCES "PurchaseItem"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "StockMovementLine_itemId_movementId_idx" ON "StockMovementLine"("itemId", "movementId");
CREATE INDEX "StockMovementLine_sourcePurchaseItemId_idx" ON "StockMovementLine"("sourcePurchaseItemId");

CREATE TABLE "InventoryCount" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "number" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "countDate" DATETIME NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'POSTED',
  "notes" TEXT,
  "actorId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryCount_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "InventoryCount_number_key" ON "InventoryCount"("number");
CREATE INDEX "InventoryCount_warehouseId_countDate_idx" ON "InventoryCount"("warehouseId", "countDate");

CREATE TABLE "InventoryCountLine" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "countId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "bookQuantity" REAL NOT NULL,
  "actualQuantity" REAL NOT NULL,
  "difference" REAL NOT NULL,
  "unitCostCents" REAL NOT NULL,
  "reason" TEXT,
  CONSTRAINT "InventoryCountLine_countId_fkey" FOREIGN KEY ("countId") REFERENCES "InventoryCount"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "InventoryCountLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "InventoryCountLine_countId_itemId_idx" ON "InventoryCountLine"("countId", "itemId");

INSERT INTO "Warehouse" ("id", "code", "name", "type", "active", "createdAt", "updatedAt")
VALUES (lower(hex(randomblob(12))), 'MAIN', 'المخزن الرئيسي', 'MAIN', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO "Permission" ("id", "key", "name", "module") VALUES (lower(hex(randomblob(12))), 'warehouse.view', 'عرض المخزن', 'warehouse');
INSERT OR IGNORE INTO "Permission" ("id", "key", "name", "module") VALUES (lower(hex(randomblob(12))), 'warehouse.manage', 'إدارة حركات المخزن', 'warehouse');
INSERT OR IGNORE INTO "RolePermission" ("roleId", "permissionId") SELECT r."id", p."id" FROM "Role" r CROSS JOIN "Permission" p WHERE r."key" IN ('admin', 'accountant') AND p."key" IN ('warehouse.view', 'warehouse.manage');
INSERT OR IGNORE INTO "AccountingAccount" ("id", "code", "name", "type", "systemKey", "active", "allowManualEntry", "createdAt", "updatedAt")
VALUES (lower(hex(randomblob(12))), '1130', 'مخزون الخامات', 'ASSET', 'INVENTORY_ASSET', 1, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
