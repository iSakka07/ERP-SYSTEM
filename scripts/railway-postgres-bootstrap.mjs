import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const requiredRoles = ["anon", "authenticated", "service_role"];

try {
  const rows = await prisma.$queryRawUnsafe(
    "SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role')",
  );
  const existing = new Set(rows.map(({ rolname }) => rolname));

  for (const role of requiredRoles) {
    if (!existing.has(role)) {
      await prisma.$executeRawUnsafe(`CREATE ROLE ${role} NOLOGIN`);
    }
  }

  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
        UPDATE "_prisma_migrations"
        SET rolled_back_at = NOW()
        WHERE migration_name = '20260924130000_supabase_private_tables'
          AND finished_at IS NULL
          AND rolled_back_at IS NULL;
      END IF;
    END $$
  `);

  console.log("PostgreSQL compatibility roles are ready.");
} finally {
  await prisma.$disconnect();
}
