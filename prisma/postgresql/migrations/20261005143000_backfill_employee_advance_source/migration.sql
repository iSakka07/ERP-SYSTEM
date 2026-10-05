-- Recover the source of legacy salary advances from their actual cash trail.
-- A paired FUNDING row proves executive-director funding. A salary advance
-- payout without that row was funded by the main petty-cash balance.
UPDATE "PettyCashTransaction"
SET
  "type" = 'EMPLOYEE_ADVANCE_PAYMENT',
  "destinationAccountId" = NULL,
  "linkedEntityType" = 'EMPLOYEE_ADVANCE',
  "operationId" = substr("documentNumber", 8)
WHERE "documentNumber" LIKE 'SALADV-%'
  AND "type" <> 'FUNDING';

UPDATE "EmployeeAdvance"
SET "source" = CASE
  WHEN EXISTS (
    SELECT 1
    FROM "PettyCashTransaction" AS funding
    WHERE funding."type" = 'FUNDING'
      AND (
        funding."operationId" = "EmployeeAdvance"."id"
        OR funding."documentNumber" = 'SALADV-' || "EmployeeAdvance"."id"
      )
  ) THEN 'EXECUTIVE_DIRECTOR'
  ELSE 'PETTY_CASH'
END
WHERE EXISTS (
  SELECT 1
  FROM "PettyCashTransaction" AS payout
  WHERE payout."type" = 'EMPLOYEE_ADVANCE_PAYMENT'
    AND (
      payout."operationId" = "EmployeeAdvance"."id"
      OR payout."documentNumber" = 'SALADV-' || "EmployeeAdvance"."id"
    )
);
