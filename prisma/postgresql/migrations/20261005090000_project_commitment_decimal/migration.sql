DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "ProjectCommitment"
    WHERE "totalCents" <> trunc("totalCents")
       OR abs("totalCents") > 9007199254740991
  ) THEN
    RAISE EXCEPTION 'ProjectCommitment.totalCents contains unsafe financial values';
  END IF;
END $$;

ALTER TABLE "ProjectCommitment"
  ALTER COLUMN "totalCents" SET DATA TYPE DECIMAL(20,0)
  USING "totalCents"::DECIMAL(20,0);

ALTER TABLE "ProjectCommitment"
  ADD CONSTRAINT "ProjectCommitment_totalCents_safe_check"
  CHECK ("totalCents" >= 0 AND "totalCents" <= 9007199254740991 AND "totalCents" = trunc("totalCents"));
