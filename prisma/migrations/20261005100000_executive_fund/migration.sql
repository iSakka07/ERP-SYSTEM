INSERT INTO "PettyCashAccount" ("id", "name", "type", "active", "createdAt", "updatedAt")
SELECT 'executive-fund', 'صندوق المدير التنفيذي', 'EXECUTIVE', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "PettyCashAccount" WHERE "type" = 'EXECUTIVE');

INSERT INTO "AccountingAccount" ("id", "code", "name", "type", "parentId", "systemKey", "active", "allowManualEntry", "createdAt", "updatedAt")
SELECT 'account-executive-cash', '1115', 'صندوق المدير التنفيذي', 'ASSET',
       (SELECT "id" FROM "AccountingAccount" WHERE "code" = '1000' LIMIT 1),
       'EXECUTIVE_CASH', true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "AccountingAccount" WHERE "systemKey" = 'EXECUTIVE_CASH');
