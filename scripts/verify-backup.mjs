import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const backupDir = resolve(process.cwd(), process.env.ERP_BACKUP_DIR || "backups");
const metadata = JSON.parse(await readFile(resolve(backupDir, "latest-backup.json"), "utf8"));
if (metadata.format === "postgresql-custom") {
  const result = spawnSync("pg_restore", ["--list", metadata.target], { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
  if (result.error) throw new Error("تعذر تشغيل pg_restore لفحص النسخة. ثبّت أدوات PostgreSQL client على الخادم.");
  if (result.status !== 0 || !result.stdout.trim()) throw new Error("ملف PostgreSQL الاحتياطي فارغ أو غير صالح.");
  console.log(`PostgreSQL backup verified: ${metadata.target} · archive contents are readable.`);
  process.exit(0);
}
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
