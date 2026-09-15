import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsPath = resolve(here, "../prisma/migrations");

const prisma = new PrismaClient();

try {
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "_erp_migrations" (
    "name" TEXT NOT NULL PRIMARY KEY,
    "appliedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  const applied = await prisma.$queryRawUnsafe('SELECT "name" FROM "_erp_migrations"');
  const appliedNames = new Set(applied.map((migration) => migration.name));
  const entries = await readdir(migrationsPath, { withFileTypes: true });
  const migrations = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();

  for (const name of migrations) {
    if (appliedNames.has(name)) continue;
    const sql = await readFile(resolve(migrationsPath, name, "migration.sql"), "utf8");
    const statements = sql.split(";").map((statement) => statement.trim()).filter(Boolean);
    for (const statement of statements) await prisma.$executeRawUnsafe(statement);
    await prisma.$executeRawUnsafe('INSERT INTO "_erp_migrations" ("name") VALUES (?)', name);
    console.log(`Applied migration: ${name}`);
  }

  console.log("Database migrations are up to date.");
} finally {
  await prisma.$disconnect();
}
