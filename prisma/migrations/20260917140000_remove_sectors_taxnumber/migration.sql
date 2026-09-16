PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Company" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "phone" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

INSERT INTO "new_Company" ("id", "name", "type", "phone", "active", "createdAt", "updatedAt")
SELECT "id", "name", "type", CASE WHEN "type" = 'SUBCONTRACTOR' THEN "phone" ELSE NULL END, "active", "createdAt", "updatedAt"
FROM "Company";

DROP TABLE "Company";
ALTER TABLE "new_Company" RENAME TO "Company";
CREATE UNIQUE INDEX "Company_name_key" ON "Company"("name");

CREATE TABLE "new_Project" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Project_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "new_Project" ("id", "code", "name", "companyId", "status", "active", "createdAt", "updatedAt")
SELECT "id", "code", "name", "companyId", "status", "active", "createdAt", "updatedAt"
FROM "Project";

DROP TABLE "Project";
ALTER TABLE "new_Project" RENAME TO "Project";
CREATE UNIQUE INDEX "Project_code_key" ON "Project"("code");

DROP TABLE "Sector";

PRAGMA foreign_keys=ON;
