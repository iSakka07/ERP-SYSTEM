import { DatabaseSync } from "node:sqlite";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

const volumeRoot = process.env.ERP_VOLUME_ROOT || "/data";
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
      if (tables.includes(table)) counts[table] = Number(db.prepare(`SELECT COUNT(*) AS count FROM "${table}"`).get().count);
    }
    candidates.push({ path, bytes: info.size, integrity, tables: tables.length, counts });
  } catch (error) {
    candidates.push({ path, bytes: info.size, error: error instanceof Error ? error.message : String(error) });
  } finally {
    db?.close();
  }
}

console.log(`Railway volume inspection: ${volumeRoot}`);
console.log(JSON.stringify(candidates, null, 2));

if (!candidates.some((candidate) => candidate.integrity === "ok" && candidate.counts?.User !== undefined)) {
  throw new Error(`No valid ERP SQLite database was found under ${volumeRoot}.`);
}
