ALTER TABLE "Employee" ADD COLUMN "monthlySalaryCents" REAL NOT NULL DEFAULT 0;

CREATE TABLE "EmployeeSalaryAllocation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "employeeId" TEXT NOT NULL,
  "projectId" TEXT,
  "startDate" DATETIME NOT NULL,
  "endDate" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmployeeSalaryAllocation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "EmployeeSalaryAllocation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "EmployeeSalaryAllocation_employeeId_startDate_idx" ON "EmployeeSalaryAllocation"("employeeId", "startDate");
CREATE INDEX "EmployeeSalaryAllocation_projectId_startDate_idx" ON "EmployeeSalaryAllocation"("projectId", "startDate");
