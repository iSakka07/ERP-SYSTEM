-- Phase 0 technical baseline. No business feature tables are included.
CREATE TABLE IF NOT EXISTS "SystemMetadata" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
