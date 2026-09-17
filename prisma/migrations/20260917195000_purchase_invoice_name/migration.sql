ALTER TABLE "PurchaseInvoice" ADD COLUMN "name" TEXT NOT NULL DEFAULT '';
UPDATE "PurchaseInvoice" SET "name" = "number" WHERE "name" = '';
