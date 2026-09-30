CREATE TABLE "EmployeeStatusPeriod" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3),
  "startedById" TEXT NOT NULL,
  "endedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmployeeStatusPeriod_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EmployeeStatusPeriod_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "EmployeeStatusPeriod_employeeId_startDate_idx" ON "EmployeeStatusPeriod"("employeeId", "startDate");
CREATE INDEX "EmployeeStatusPeriod_employeeId_endDate_idx" ON "EmployeeStatusPeriod"("employeeId", "endDate");

INSERT INTO "EmployeeStatusPeriod" ("id", "employeeId", "startDate", "endDate", "startedById", "endedById", "createdAt")
SELECT md5(random()::text || clock_timestamp()::text || "id"), "id", "createdAt", CASE WHEN "active" THEN NULL ELSE "updatedAt" END, 'system-migration', CASE WHEN "active" THEN NULL ELSE 'system-migration' END, CURRENT_TIMESTAMP
FROM "Employee";
