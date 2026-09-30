ALTER TABLE "IncomingAttachment" ADD COLUMN "label" TEXT NOT NULL DEFAULT 'مرفق';
ALTER TABLE "ExpenseAttachment" ADD COLUMN "label" TEXT NOT NULL DEFAULT 'مرفق';
ALTER TABLE "PurchaseAttachment" ADD COLUMN "label" TEXT NOT NULL DEFAULT 'مرفق';
ALTER TABLE "PettyCashAttachment" ADD COLUMN "label" TEXT NOT NULL DEFAULT 'مرفق';
ALTER TABLE "BankAttachment" ADD COLUMN "label" TEXT NOT NULL DEFAULT 'مرفق';
ALTER TABLE "SalaryAttachment" ADD COLUMN "label" TEXT NOT NULL DEFAULT 'مرفق';
