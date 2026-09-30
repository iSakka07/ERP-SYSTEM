CREATE TABLE "EmployeeSalaryRate" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "startDate" TIMESTAMP(3) NOT NULL,
  "monthlySalaryCents" DECIMAL(20,0) NOT NULL,
  "changedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmployeeSalaryRate_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EmployeeSalaryRate_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "EmployeeSalaryRate_employeeId_startDate_key" ON "EmployeeSalaryRate"("employeeId", "startDate");
CREATE INDEX "EmployeeSalaryRate_employeeId_startDate_idx" ON "EmployeeSalaryRate"("employeeId", "startDate");

INSERT INTO "EmployeeSalaryRate" ("id", "employeeId", "startDate", "monthlySalaryCents", "changedById", "createdAt")
SELECT md5(random()::text || clock_timestamp()::text || "id"), "id", "createdAt", "monthlySalaryCents", 'system-migration', CURRENT_TIMESTAMP
FROM "Employee";
