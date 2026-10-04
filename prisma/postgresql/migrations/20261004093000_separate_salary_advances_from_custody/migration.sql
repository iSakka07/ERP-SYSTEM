-- Salary advances are payroll receivables, not employee custody accounts.
-- Convert only legacy movements created by the salary module.
UPDATE "PettyCashTransaction"
SET
  "type" = 'EMPLOYEE_ADVANCE_PAYMENT',
  "destinationAccountId" = NULL,
  "linkedEntityType" = 'EMPLOYEE_ADVANCE',
  "operationId" = substring("documentNumber" FROM 8)
WHERE "type" = 'CUSTODY_ISSUE'
  AND "documentNumber" LIKE 'SALADV-%';

DELETE FROM "PettyCashAccount" account
WHERE account."type" = 'CUSTODY'
  AND account."name" LIKE 'سلفة %'
  AND NOT EXISTS (
    SELECT 1
    FROM "PettyCashTransaction" movement
    WHERE movement."sourceAccountId" = account."id"
       OR movement."destinationAccountId" = account."id"
  );
