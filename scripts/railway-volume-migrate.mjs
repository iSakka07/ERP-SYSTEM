import { DatabaseSync } from "node:sqlite";
import { gzipSync } from "node:zlib";
import { readdir, stat, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

const volumeRoot = process.env.ERP_VOLUME_ROOT || "/data";
const importRequested = process.env.ERP_IMPORT_LEGACY_VOLUME === "true";
const markerPath = join(volumeRoot, ".postgres-import-complete.json");
const safeIdent = (value) => {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) throw new Error(`Unsafe SQL identifier: ${value}`);
  return `"${value}"`;
};

async function inspectCandidates() {
  const entries = await readdir(volumeRoot, { withFileTypes: true });
  const candidates = [];
  for (const entry of entries) {
    if (!entry.isFile() || !/\.(?:db|sqlite|sqlite3)$/i.test(entry.name)) continue;
    const path = join(volumeRoot, entry.name);
    const info = await stat(path);
    let db;
    try {
      db = new DatabaseSync(path, { readOnly: true });
      const integrity = db.prepare("PRAGMA integrity_check").get()?.integrity_check;
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map(({ name }) => name);
      const counts = {};
      for (const table of ["User", "Project", "Company", "IncomingContract", "PurchaseInvoice", "JournalEntry"]) {
        if (tables.includes(table)) counts[table] = Number(db.prepare(`SELECT COUNT(*) AS count FROM ${safeIdent(table)}`).get().count);
      }
      candidates.push({ path, bytes: info.size, integrity, tables, counts });
    } catch (error) {
      candidates.push({ path, bytes: info.size, error: error instanceof Error ? error.message : String(error) });
    } finally {
      db?.close();
    }
  }
  return candidates;
}

const candidates = await inspectCandidates();
console.log(`Railway volume inspection: ${volumeRoot}`);
console.log(JSON.stringify(candidates.map(({ tables, ...candidate }) => ({ ...candidate, tables: tables?.length })), null, 2));

const valid = candidates
  .filter((candidate) => candidate.integrity === "ok" && candidate.counts?.User !== undefined)
  .sort((a, b) => ((b.counts.Project || 0) + (b.counts.JournalEntry || 0) + b.bytes / 1_000_000) - ((a.counts.Project || 0) + (a.counts.JournalEntry || 0) + a.bytes / 1_000_000));
if (!valid.length) throw new Error(`No valid ERP SQLite database was found under ${volumeRoot}.`);
if (!importRequested) process.exit(0);

try {
  await access(markerPath);
  console.log(`Legacy import already completed; marker exists at ${markerPath}.`);
  process.exit(0);
} catch { /* first import */ }

const source = valid[0];
const sqlite = new DatabaseSync(source.path, { readOnly: true });
const prisma = new PrismaClient();
const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
const backupPath = join(volumeRoot, `postgres-before-legacy-import-${stamp}.json.gz`);

function normalizeValue(value, column) {
  if (value === null || value === undefined) return null;
  if (column.data_type === "boolean") return Boolean(value);
  if (column.data_type.includes("timestamp") || column.data_type === "date") {
    if (value instanceof Date) return value;
    const parsed = typeof value === "number" ? new Date(value) : new Date(String(value));
    if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid date in ${column.table_name}.${column.column_name}`);
    return parsed;
  }
  if (column.data_type === "bytea" && value instanceof Uint8Array) return Buffer.from(value);
  return value;
}

try {
  const pgTables = await prisma.$queryRawUnsafe(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> '_prisma_migrations' ORDER BY table_name`);
  const pgTableNames = pgTables.map(({ table_name }) => table_name);
  const transferable = source.tables.filter((table) => pgTableNames.includes(table) && table !== "_erp_migrations");
  if (!transferable.includes("User") || !transferable.includes("Project")) throw new Error("The selected SQLite database does not match the PostgreSQL application schema.");

  const current = {};
  for (const table of pgTableNames) current[table] = await prisma.$queryRawUnsafe(`SELECT * FROM ${safeIdent(table)}`);
  const backup = JSON.stringify({ createdAt: new Date().toISOString(), source: "PostgreSQL before legacy import", tables: current }, (_key, value) => {
    if (typeof value === "bigint") return { $bigint: value.toString() };
    if (Buffer.isBuffer(value)) return { $bytes: value.toString("base64") };
    return value;
  });
  await writeFile(backupPath, gzipSync(backup, { level: 9 }), { flag: "wx" });
  console.log(`Pre-import PostgreSQL backup created: ${backupPath}`);

  const columns = await prisma.$queryRawUnsafe(`SELECT table_name, column_name, data_type, udt_name, ordinal_position FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position`);
  const columnsByTable = new Map();
  for (const column of columns) {
    if (!columnsByTable.has(column.table_name)) columnsByTable.set(column.table_name, []);
    columnsByTable.get(column.table_name).push(column);
  }

  const importedCounts = {};
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(72695001)");
    await tx.$executeRawUnsafe("SET LOCAL session_replication_role = replica");
    await tx.$executeRawUnsafe(`TRUNCATE ${transferable.map(safeIdent).join(", ")} CASCADE`);
    for (const table of transferable) {
      const targetColumns = columnsByTable.get(table) || [];
      const sourceColumns = new Set(sqlite.prepare(`PRAGMA table_info(${safeIdent(table)})`).all().map(({ name }) => name));
      const shared = targetColumns.filter(({ column_name }) => sourceColumns.has(column_name));
      const rows = sqlite.prepare(`SELECT * FROM ${safeIdent(table)}`).all();
      importedCounts[table] = rows.length;
      if (!rows.length || !shared.length) continue;
      const names = shared.map(({ column_name }) => safeIdent(column_name)).join(", ");
      for (const row of rows) {
        const values = shared.map((column) => normalizeValue(row[column.column_name], column));
        const placeholders = values.map((_value, index) => `$${index + 1}`).join(", ");
        await tx.$executeRawUnsafe(`INSERT INTO ${safeIdent(table)} (${names}) VALUES (${placeholders})`, ...values);
      }
    }
    await tx.$executeRawUnsafe("SET LOCAL session_replication_role = origin");
  }, { maxWait: 30_000, timeout: 600_000 });

  const verification = {};
  for (const table of ["User", "Project", "Company", "IncomingContract", "PurchaseInvoice", "JournalEntry"]) {
    const result = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM ${safeIdent(table)}`);
    verification[table] = result[0].count;
    if (verification[table] !== source.counts[table]) throw new Error(`Count mismatch after import for ${table}: expected ${source.counts[table]}, got ${verification[table]}.`);
  }
  const marker = { completedAt: new Date().toISOString(), sqlite: source.path, backup: backupPath, counts: verification };
  await writeFile(markerPath, JSON.stringify(marker, null, 2), { flag: "wx" });
  console.log(`Legacy SQLite import completed: ${JSON.stringify(marker)}`);
} finally {
  sqlite.close();
  await prisma.$disconnect();
}
