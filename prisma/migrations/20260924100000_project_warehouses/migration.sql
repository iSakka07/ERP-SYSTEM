ALTER TABLE "Warehouse" ADD COLUMN "projectId" TEXT REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "Warehouse_projectId_key" ON "Warehouse"("projectId");

INSERT INTO "Warehouse" ("id", "code", "name", "type", "projectId", "active", "createdAt", "updatedAt")
SELECT lower(hex(randomblob(12))), 'PRJ-' || substr(replace("code", ' ', '-'), 1, 55), 'مخزن مشروع — ' || "name", 'PROJECT', "id", 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Project"
WHERE "active" = 1 AND NOT EXISTS (SELECT 1 FROM "Warehouse" WHERE "Warehouse"."projectId" = "Project"."id");
