import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsPath = resolve(here, "../prisma/migrations");

const prisma = new PrismaClient();

try {
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "_erp_migrations" (
    "name" TEXT NOT NULL PRIMARY KEY,
    "appliedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checksum" TEXT
  )`);
  const columns = await prisma.$queryRawUnsafe('PRAGMA table_info("_erp_migrations")');
  if (!columns.some((column) => column.name === "checksum"))
    await prisma.$executeRawUnsafe('ALTER TABLE "_erp_migrations" ADD COLUMN "checksum" TEXT');

  const applied = await prisma.$queryRawUnsafe('SELECT "name", "checksum" FROM "_erp_migrations"');
  const appliedByName = new Map(applied.map((migration) => [migration.name, migration]));
  const entries = await readdir(migrationsPath, { withFileTypes: true });
  const migrations = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();

  for (const name of migrations) {
    const sql = await readFile(resolve(migrationsPath, name, "migration.sql"), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const recorded = appliedByName.get(name);
    if (recorded) {
      if (recorded.checksum && recorded.checksum !== checksum)
        throw new Error(`ملف migration ${name} تغير بعد تطبيقه؛ أوقف الترحيل وراجع النسخة الاحتياطية.`);
      if (!recorded.checksum)
        await prisma.$executeRawUnsafe('UPDATE "_erp_migrations" SET "checksum" = ? WHERE "name" = ?', checksum, name);
      continue;
    }
    // بعض ملفات الترحيل القديمة تضع BEGIN/COMMIT داخل الملف. الـtransaction
    // الخارجية هي مصدر الذرية الآن، لذلك نحذف أغلفتها فقط لتفادي nested transaction.
    const statements = sql
      .split(";")
      .map((statement) => statement.trim())
      .filter(Boolean)
      .filter((statement) => !/^(BEGIN(?:\s+TRANSACTION)?|COMMIT|ROLLBACK)$/i.test(statement));
    await prisma.$transaction(async (tx) => {
      for (const statement of statements) await tx.$executeRawUnsafe(statement);
      await tx.$executeRawUnsafe('INSERT INTO "_erp_migrations" ("name", "checksum") VALUES (?, ?)', name, checksum);
    });
    console.log(`Applied migration: ${name}`);
  }

  console.log("Database migrations are up to date.");
} finally {
  await prisma.$disconnect();
}
