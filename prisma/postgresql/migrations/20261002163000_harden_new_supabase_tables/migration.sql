-- These tables were added after the original Supabase hardening migration.
-- The ERP accesses them only through server-side Prisma, not the Data API.
ALTER TABLE "EmployeeStatusPeriod" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmployeeSalaryRate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProjectPlan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProjectCommitment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProjectCommitmentSource" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  "EmployeeStatusPeriod",
  "EmployeeSalaryRate",
  "ProjectPlan",
  "ProjectCommitment",
  "ProjectCommitmentSource"
FROM anon, authenticated, service_role;
