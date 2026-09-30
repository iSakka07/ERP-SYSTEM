ALTER TABLE "Company" ADD COLUMN "isEngineeringAuthority" BOOLEAN NOT NULL DEFAULT false;
UPDATE "Company" SET "isEngineeringAuthority" = true WHERE "type" = 'OWNER';
