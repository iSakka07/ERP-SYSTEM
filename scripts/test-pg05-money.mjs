import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [sqliteSchema, postgresSchema, migration] = await Promise.all([
  readFile("prisma/schema.prisma", "utf8"),
  readFile("prisma/postgresql/schema.prisma", "utf8"),
  readFile("prisma/postgresql/migrations/20260929180000_convert_financial_cents_to_decimal/migration.sql", "utf8"),
]);

const expectedPostgresSchema = sqliteSchema.replace('provider = "sqlite"', 'provider = "postgresql"');
assert.equal(postgresSchema, expectedPostgresSchema, "مخطط PostgreSQL يجب أن يطابق مخطط التطبيق عدا provider.");

const moneyFields = [...sqliteSchema.matchAll(/^\s*\w+Cents\s+Float\??/gm)];
assert.equal(moneyFields.length, 46, "عدد حقول القروش المتوقع تغير؛ راجع ترحيل PG-05.");

const convertedColumns = [...migration.matchAll(/ALTER COLUMN "\w+Cents" SET DATA TYPE DECIMAL\(20,0\)/g)];
assert.equal(convertedColumns.length, moneyFields.length, "ترحيل PG-05 لا يغطي كل حقول القروش.");
assert.match(migration, /<> trunc\(/, "الترحيل يجب أن يرفض كسور القروش قبل التحويل.");
assert.match(migration, /9007199254740991/, "الترحيل يجب أن يفرض نطاق JavaScript الآمن.");
assert.match(migration, /ADD CONSTRAINT .*CHECK/, "الترحيل يجب أن يضيف قيودًا دائمة على حقول القروش.");

console.log(`PASS: PG-05 يغطي ${moneyFields.length} حقل قروش بتخزين DECIMAL(20,0) وقيود نطاق آمن.`);
