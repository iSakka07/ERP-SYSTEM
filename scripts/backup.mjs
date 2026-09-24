import { access, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, isAbsolute, resolve } from "node:path";
import { spawnSync } from "node:child_process";

async function loadLocalEnv() {
  try {
    const text = await readFile(resolve(process.cwd(), ".env"), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match || process.env[match[1]] !== undefined) continue;
      const raw = match[2].trim();
      process.env[match[1]] = raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw;
    }
  } catch { /* production receives environment variables directly */ }
}

await loadLocalEnv();

const rawUrl = process.env.DATABASE_URL || "";
const backupDir = resolve(process.cwd(), process.env.ERP_BACKUP_DIR || "backups");
await mkdir(backupDir, { recursive: true });
const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");

if (rawUrl.startsWith("file:")) {
  const rawPath = rawUrl.slice(5);
  const source = isAbsolute(rawPath) ? rawPath : resolve(process.cwd(), "prisma", rawPath);
  await access(source);
  const target = resolve(backupDir, `${basename(source, ".db")}-${stamp}.db`);
  await copyFile(source, target);
  await writeFile(resolve(backupDir, "latest-backup.json"), JSON.stringify({ format: "sqlite-file", source, target, createdAt: new Date().toISOString() }));
  console.log(`Backup created: ${target}`);
} else if (/^postgres(?:ql)?:\/\//.test(rawUrl)) {
  const database = new URL(rawUrl);
  const databaseName = decodeURIComponent(database.pathname.replace(/^\//, "")).replace(/[^a-zA-Z0-9_-]/g, "_") || "postgres";
  const target = resolve(backupDir, `${databaseName}-${stamp}.dump`);
  const pgEnv = {
    ...process.env,
    PGHOST: decodeURIComponent(database.hostname),
    PGPORT: database.port || "5432",
    PGUSER: decodeURIComponent(database.username),
    PGPASSWORD: decodeURIComponent(database.password),
    PGDATABASE: databaseName,
    PGSSLMODE: database.searchParams.get("sslmode") || process.env.PGSSLMODE || "prefer",
  };
  const result = spawnSync("pg_dump", ["--format=custom", "--no-owner", "--no-acl", "--file", target], { env: pgEnv, encoding: "utf8", maxBuffer: 2 * 1024 * 1024 });
  if (result.error) throw new Error("تعذر تشغيل pg_dump. ثبّت أدوات PostgreSQL client على الخادم ثم أعد المحاولة.");
  if (result.status !== 0) throw new Error("فشل إنشاء نسخة PostgreSQL الاحتياطية. تحقق من اتصال القاعدة وصلاحيات القراءة.");
  await access(target);
  const source = `${database.hostname}${database.port ? `:${database.port}` : ""}${database.pathname}`;
  await writeFile(resolve(backupDir, "latest-backup.json"), JSON.stringify({ format: "postgresql-custom", source, target, createdAt: new Date().toISOString() }));
  console.log(`PostgreSQL backup created: ${target}`);
} else {
  throw new Error("DATABASE_URL يجب أن يشير إلى SQLite بصيغة file: أو PostgreSQL بصيغة postgresql://.");
}
