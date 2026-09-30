CREATE TABLE "EmployeeSalaryRate" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "employeeId" TEXT NOT NULL,
  "startDate" DATETIME NOT NULL,
  "monthlySalaryCents" REAL NOT NULL,
  "changedById" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmployeeSalaryRate_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "EmployeeSalaryRate_employeeId_startDate_key" ON "EmployeeSalaryRate"("employeeId", "startDate");
CREATE INDEX "EmployeeSalaryRate_employeeId_startDate_idx" ON "EmployeeSalaryRate"("employeeId", "startDate");

INSERT INTO "EmployeeSalaryRate" ("id", "employeeId", "startDate", "monthlySalaryCents", "changedById", "createdAt")
SELECT lower(hex(randomblob(12))), "id", "createdAt", "monthlySalaryCents", 'system-migration', CURRENT_TIMESTAMP
FROM "Employee";
