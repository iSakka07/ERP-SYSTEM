import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

function run(command, args, env) {
  const result = spawnSync(command, args, { env, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  if (result.error) throw new Error(`تعذر تشغيل ${command}. ثبّت أدوات PostgreSQL client على الخادم.`);
  if (result.status !== 0) throw new Error(`${command} فشل: ${(result.stderr || result.stdout || "").trim()}`);
  return result.stdout;
}

const backupDir = resolve(process.cwd(), process.env.ERP_BACKUP_DIR || "backups");
const metadata = JSON.parse(await readFile(resolve(backupDir, "latest-backup.json"), "utf8"));
if (metadata.format === "postgresql-custom") {
  const rawUrl = process.env.DATABASE_URL || "";
  if (!/^postgres(?:ql)?:\/\//.test(rawUrl)) throw new Error("تحقق استعادة PostgreSQL يحتاج DATABASE_URL لقاعدة المصدر.");
  const source = new URL(rawUrl);
  const adminDatabase = process.env.ERP_BACKUP_VERIFY_DATABASE || "postgres";
  const temporaryDatabase = `erp_restore_verify_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const pgEnv = {
    ...process.env,
    PGHOST: source.hostname,
    PGPORT: source.port || "5432",
    PGUSER: decodeURIComponent(source.username),
    PGPASSWORD: decodeURIComponent(source.password),
    PGSSLMODE: source.searchParams.get("sslmode") || process.env.PGSSLMODE || "require",
  };
  const adminEnv = { ...pgEnv, PGDATABASE: adminDatabase };
  try {
    const archive = run("pg_restore", ["--list", metadata.target], pgEnv);
    if (!archive.trim()) throw new Error("ملف PostgreSQL الاحتياطي فارغ أو غير صالح.");
    run("psql", ["--set", "ON_ERROR_STOP=1", "--command", `CREATE DATABASE \"${temporaryDatabase}\"`], adminEnv);
    run("pg_restore", ["--dbname", temporaryDatabase, "--no-owner", "--no-acl", metadata.target], { ...pgEnv, PGDATABASE: temporaryDatabase });
    const counts = run("psql", ["--tuples-only", "--no-align", "--command", 'SELECT (SELECT count(*) FROM "User") || \',\' || (SELECT count(*) FROM "Project") || \',\' || (SELECT count(*) FROM "JournalEntry")'], { ...pgEnv, PGDATABASE: temporaryDatabase }).trim();
    const values = counts.split(",").map(Number);
    if (values.length !== 3 || values.some((value) => !Number.isSafeInteger(value) || value < 0)) throw new Error("تعذر قراءة عدد السجلات الأساسية بعد الاستعادة.");
    console.log(`PostgreSQL backup restored and verified: ${metadata.target} · users=${values[0]}, projects=${values[1]}, journals=${values[2]}.`);
  } finally {
    try { run("psql", ["--set", "ON_ERROR_STOP=1", "--command", `DROP DATABASE IF EXISTS \"${temporaryDatabase}\" WITH (FORCE)`], adminEnv); } catch { /* report the restore failure without hiding it */ }
  }
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
