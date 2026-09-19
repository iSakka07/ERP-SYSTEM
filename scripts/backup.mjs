import { access, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, isAbsolute, resolve } from "node:path";

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
if (!rawUrl.startsWith("file:")) throw new Error("النسخ الاحتياطي الحالي يدعم SQLite فقط عبر DATABASE_URL بصيغة file:.");
const rawPath = rawUrl.slice(5);
const source = isAbsolute(rawPath) ? rawPath : resolve(process.cwd(), "prisma", rawPath);
await access(source);
const backupDir = resolve(process.cwd(), process.env.ERP_BACKUP_DIR || "backups");
await mkdir(backupDir, { recursive: true });
const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
const target = resolve(backupDir, `${basename(source, ".db")}-${stamp}.db`);
await copyFile(source, target);
await writeFile(resolve(backupDir, "latest-backup.json"), JSON.stringify({ source, target, createdAt: new Date().toISOString() }));
console.log(`Backup created: ${target}`);
