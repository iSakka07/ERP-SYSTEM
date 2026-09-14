import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

const here = dirname(fileURLToPath(import.meta.url));
const migrationPath = resolve(
  here,
  "../prisma/migrations/20260915010000_init/migration.sql",
);

const prisma = new PrismaClient();

try {
  const sql = await readFile(migrationPath, "utf8");
  await prisma.$executeRawUnsafe(sql);
  console.log("Phase 0 baseline migration applied.");
} finally {
  await prisma.$disconnect();
}
