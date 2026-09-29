INSERT OR IGNORE INTO "AccountingAccount" ("id", "code", "name", "type", "systemKey", "active", "allowManualEntry", "createdAt", "updatedAt")
VALUES (lower(hex(randomblob(12))), '4900', 'فوائض جرد', 'REVENUE', 'INVENTORY_COUNT_SURPLUS', 1, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO "AccountingAccount" ("id", "code", "name", "type", "systemKey", "active", "allowManualEntry", "createdAt", "updatedAt")
VALUES (lower(hex(randomblob(12))), '5285', 'عجز جرد', 'EXPENSE', 'INVENTORY_COUNT_SHORTAGE', 1, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
