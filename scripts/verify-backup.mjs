import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

const backupDir = resolve(process.cwd(), process.env.ERP_BACKUP_DIR || "backups");
const metadata = JSON.parse(await readFile(resolve(backupDir, "latest-backup.json"), "utf8"));
const url = `file:${metadata.target.replaceAll("\\", "/")}`;
const prisma = new PrismaClient({ datasources: { db: { url } } });
try {
  const [integrity, foreignKeys, migrations] = await Promise.all([
    prisma.$queryRawUnsafe("PRAGMA integrity_check"),
    prisma.$queryRawUnsafe("PRAGMA foreign_key_check"),
    prisma.$queryRawUnsafe('SELECT COUNT(*) AS "count" FROM "_erp_migrations"'),
  ]);
  if (integrity[0]?.integrity_check !== "ok") throw new Error("فحص سلامة النسخة الاحتياطية لم ينجح.");
  if (foreignKeys.length) throw new Error("النسخة الاحتياطية تحتوي على علاقات غير سليمة.");
  console.log(`Backup verified: ${metadata.target} · ${migrations[0]?.count ?? 0} migrations.`);
} finally {
  await prisma.$disconnect();
}
