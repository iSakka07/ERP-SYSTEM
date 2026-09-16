-- Required supporting documents for payroll bonuses and deductions.
ALTER TABLE "SalaryAttachment" ADD COLUMN "bonusId" TEXT;
ALTER TABLE "SalaryAttachment" ADD COLUMN "deductionId" TEXT;

CREATE INDEX "SalaryAttachment_bonusId_idx" ON "SalaryAttachment"("bonusId");
CREATE INDEX "SalaryAttachment_deductionId_idx" ON "SalaryAttachment"("deductionId");
