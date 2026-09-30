CREATE TABLE "EmployeeStatusPeriod" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "employeeId" TEXT NOT NULL,
  "startDate" DATETIME NOT NULL,
  "endDate" DATETIME,
  "startedById" TEXT NOT NULL,
  "endedById" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmployeeStatusPeriod_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "EmployeeStatusPeriod_employeeId_startDate_idx" ON "EmployeeStatusPeriod"("employeeId", "startDate");
CREATE INDEX "EmployeeStatusPeriod_employeeId_endDate_idx" ON "EmployeeStatusPeriod"("employeeId", "endDate");

INSERT INTO "EmployeeStatusPeriod" ("id", "employeeId", "startDate", "endDate", "startedById", "endedById", "createdAt")
SELECT lower(hex(randomblob(12))), "id", "createdAt", CASE WHEN "active" = 1 THEN NULL ELSE "updatedAt" END, 'system-migration', CASE WHEN "active" = 1 THEN NULL ELSE 'system-migration' END, CURRENT_TIMESTAMP
FROM "Employee";
