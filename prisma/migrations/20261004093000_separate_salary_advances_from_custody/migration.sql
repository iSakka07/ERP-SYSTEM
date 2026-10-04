-- Salary advances are payroll receivables, not employee custody accounts.
-- Convert only legacy movements created by the salary module.
UPDATE "PettyCashTransaction"
SET
  "type" = 'EMPLOYEE_ADVANCE_PAYMENT',
  "destinationAccountId" = NULL,
  "linkedEntityType" = 'EMPLOYEE_ADVANCE',
  "operationId" = substr("documentNumber", 8)
WHERE "type" = 'CUSTODY_ISSUE'
  AND "documentNumber" LIKE 'SALADV-%';

DELETE FROM "PettyCashAccount"
WHERE "type" = 'CUSTODY'
  AND "name" LIKE 'سلفة %'
  AND NOT EXISTS (
    SELECT 1
    FROM "PettyCashTransaction"
    WHERE "sourceAccountId" = "PettyCashAccount"."id"
       OR "destinationAccountId" = "PettyCashAccount"."id"
  );
