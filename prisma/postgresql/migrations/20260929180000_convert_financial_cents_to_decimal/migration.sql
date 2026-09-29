-- Refuse to round legacy floating-point money silently. Every *Cents value
-- must already represent a whole cent and fit in DECIMAL(20,0).
DO $$
DECLARE
  money_column record;
  invalid_rows bigint;
BEGIN
  FOR money_column IN
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name LIKE '%Cents'
      AND data_type IN ('double precision', 'real', 'numeric')
  LOOP
    EXECUTE format(
      'SELECT count(*) FROM public.%I WHERE %I IS NOT NULL AND (%I <> trunc(%I) OR abs(%I) >= 100000000000000000000)',
      money_column.table_name,
      money_column.column_name,
      money_column.column_name,
      money_column.column_name,
      money_column.column_name
    ) INTO invalid_rows;

    IF invalid_rows > 0 THEN
      RAISE EXCEPTION
        'PG-05 blocked: %.% contains % fractional or out-of-range cent values',
        money_column.table_name,
        money_column.column_name,
        invalid_rows;
    END IF;
  END LOOP;
END $$;

-- AlterTable
ALTER TABLE "IncomingContract" ALTER COLUMN "originalCents" SET DATA TYPE DECIMAL(20,0),
ALTER COLUMN "estimateCents" SET DATA TYPE DECIMAL(20,0);

-- AlterTable
ALTER TABLE "IncomingStatement" ALTER COLUMN "grossCents" SET DATA TYPE DECIMAL(20,0);

-- AlterTable
ALTER TABLE "MaterialCertificate" ALTER COLUMN "totalCents" SET DATA TYPE DECIMAL(20,0);

-- AlterTable
ALTER TABLE "MaterialCertificateItem" ALTER COLUMN "unitPriceCents" SET DATA TYPE DECIMAL(20,0),
ALTER COLUMN "totalCents" SET DATA TYPE DECIMAL(20,0);

-- AlterTable
ALTER TABLE "IncomingMemo" ALTER COLUMN "amountCents" SET DATA TYPE DECIMAL(20,0);

-- AlterTable
ALTER TABLE "Employee" ALTER COLUMN "monthlySalaryCents" SET DATA TYPE DECIMAL(20,0);

-- AlterTable
ALTER TABLE "EmployeeBonus" ALTER COLUMN "amountCents" SET DATA TYPE DECIMAL(20,0);

-- AlterTable
ALTER TABLE "EmployeeDeduction" ALTER COLUMN "amountCents" SET DATA TYPE DECIMAL(20,0);

-- AlterTable
ALTER TABLE "EmployeeAdvance" ALTER COLUMN "amountCents" SET DATA TYPE DECIMAL(20,0),
ALTER COLUMN "remainingCents" SET DATA TYPE DECIMAL(20,0),
ALTER COLUMN "installmentCents" SET DATA TYPE DECIMAL(20,0);

-- AlterTable
ALTER TABLE "AdvanceInstallment" ALTER COLUMN "amountCents" SET DATA TYPE DECIMAL(20,0),
ALTER COLUMN "appliedCents" SET DATA TYPE DECIMAL(20,0);

-- AlterTable
ALTER TABLE "PayrollRun" ALTER COLUMN "totalCents" SET DATA TYPE DECIMAL(20,0);

-- AlterTable
ALTER TABLE "PayrollLine" ALTER COLUMN "basicCents" SET DATA TYPE DECIMAL(20,0),
ALTER COLUMN "bonusCents" SET DATA TYPE DECIMAL(20,0),
ALTER COLUMN "deductionCents" SET DATA TYPE DECIMAL(20,0),
ALTER COLUMN "advanceCents" SET DATA TYPE DECIMAL(20,0),
ALTER COLUMN "netCents" SET DATA TYPE DECIMAL(20,0);

-- AlterTable
ALTER TABLE "SubcontractStatement" ALTER COLUMN "grossCents" SET DATA TYPE DECIMAL(20,0),
ALTER COLUMN "deductionCents" SET DATA TYPE DECIMAL(20,0),
ALTER COLUMN "netCents" SET DATA TYPE DECIMAL(20,0),
ALTER COLUMN "previousGrossCents" SET DATA TYPE DECIMAL(20,0),
ALTER COLUMN "correctionDebtCents" SET DATA TYPE DECIMAL(20,0);

-- AlterTable
ALTER TABLE "SubcontractItem" ALTER COLUMN "unitPriceCents" SET DATA TYPE DECIMAL(20,0),
ALTER COLUMN "previousValueCents" SET DATA TYPE DECIMAL(20,0),
ALTER COLUMN "totalCents" SET DATA TYPE DECIMAL(20,0);

-- AlterTable
ALTER TABLE "SubcontractDeduction" ALTER COLUMN "amountCents" SET DATA TYPE DECIMAL(20,0);

-- AlterTable
ALTER TABLE "SubcontractPayment" ALTER COLUMN "amountCents" SET DATA TYPE DECIMAL(20,0);

-- AlterTable
ALTER TABLE "PurchaseInvoice" ALTER COLUMN "totalCents" SET DATA TYPE DECIMAL(20,0),
ALTER COLUMN "paidCents" SET DATA TYPE DECIMAL(20,0);

-- AlterTable
ALTER TABLE "PurchasePayment" ALTER COLUMN "amountCents" SET DATA TYPE DECIMAL(20,0);

-- AlterTable
ALTER TABLE "PurchaseItem" ALTER COLUMN "unitPriceCents" SET DATA TYPE DECIMAL(20,0),
ALTER COLUMN "totalCents" SET DATA TYPE DECIMAL(20,0);

-- AlterTable
ALTER TABLE "StockMovementLine" ALTER COLUMN "unitCostCents" SET DATA TYPE DECIMAL(20,0),
ALTER COLUMN "totalCents" SET DATA TYPE DECIMAL(20,0);

-- AlterTable
ALTER TABLE "InventoryCountLine" ALTER COLUMN "unitCostCents" SET DATA TYPE DECIMAL(20,0);

-- AlterTable
ALTER TABLE "PettyCashTransaction" ALTER COLUMN "amountCents" SET DATA TYPE DECIMAL(20,0);

-- AlterTable
ALTER TABLE "PettyCashCount" ALTER COLUMN "expectedCents" SET DATA TYPE DECIMAL(20,0),
ALTER COLUMN "actualCents" SET DATA TYPE DECIMAL(20,0),
ALTER COLUMN "differenceCents" SET DATA TYPE DECIMAL(20,0);

-- AlterTable
ALTER TABLE "BankTransaction" ALTER COLUMN "amountCents" SET DATA TYPE DECIMAL(20,0);

-- AlterTable
ALTER TABLE "JournalLine" ALTER COLUMN "debitCents" SET DATA TYPE DECIMAL(20,0),
ALTER COLUMN "creditCents" SET DATA TYPE DECIMAL(20,0);

-- The application intentionally exposes cents as JavaScript numbers. Whole
-- integers are exact up to Number.MAX_SAFE_INTEGER, so enforce that boundary
-- in PostgreSQL for every monetary column as well.
DO $$
DECLARE
  money_column record;
  constraint_name text;
BEGIN
  FOR money_column IN
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name LIKE '%Cents'
      AND data_type = 'numeric'
  LOOP
    constraint_name := 'safe_cents_' || substr(md5(money_column.table_name || '.' || money_column.column_name), 1, 16);
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (%I IS NULL OR (%I = trunc(%I) AND abs(%I) <= 9007199254740991))',
      money_column.table_name,
      constraint_name,
      money_column.column_name,
      money_column.column_name,
      money_column.column_name,
      money_column.column_name
    );
  END LOOP;
END $$;

