import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [sqliteSchema, postgresSchema, migration, salaryRateMigration, commitmentMigration] = await Promise.all([
  readFile("prisma/schema.prisma", "utf8"),
  readFile("prisma/postgresql/schema.prisma", "utf8"),
  readFile("prisma/postgresql/migrations/20260929180000_convert_financial_cents_to_decimal/migration.sql", "utf8"),
  readFile("prisma/postgresql/migrations/20260930110000_employee_salary_rates/migration.sql", "utf8"),
  readFile("prisma/postgresql/migrations/20261005090000_project_commitment_decimal/migration.sql", "utf8"),
]);

const normalizeLines = (value) => value.replace(/\r\n/g, "\n");
const expectedPostgresSchema = sqliteSchema.replace('provider = "sqlite"', 'provider = "postgresql"');
assert.equal(normalizeLines(postgresSchema), normalizeLines(expectedPostgresSchema), "مخطط PostgreSQL يجب أن يطابق مخطط التطبيق عدا provider.");

const moneyFields = [...sqliteSchema.matchAll(/^\s*\w+Cents\s+Float\??/gm)];
assert.equal(moneyFields.length, 48, "عدد حقول القروش المتوقع تغير؛ راجع مسار ترحيل الأموال في PostgreSQL.");

const convertedColumns = [...migration.matchAll(/ALTER COLUMN "\w+Cents" SET DATA TYPE DECIMAL\(20,0\)/g)];
assert.equal(convertedColumns.length, 46, "ترحيل PG-05 الأساسي يجب أن يغطي حقول القروش الموجودة وقت إنشائه.");
assert.match(salaryRateMigration, /"monthlySalaryCents" DECIMAL\(20,0\)/, "راتب الموظف التاريخي يجب أن يبدأ كـ DECIMAL.");
assert.match(commitmentMigration, /ALTER COLUMN "totalCents" SET DATA TYPE DECIMAL\(20,0\)/, "التزامات المشروع المالية يجب ترحيلها إلى DECIMAL.");
assert.match(migration, /<> trunc\(/, "الترحيل يجب أن يرفض كسور القروش قبل التحويل.");
assert.match(migration, /9007199254740991/, "الترحيل يجب أن يفرض نطاق JavaScript الآمن.");
assert.match(migration, /ADD CONSTRAINT .*CHECK/, "الترحيل يجب أن يضيف قيودًا دائمة على حقول القروش.");

console.log(`PASS: PG-05 يغطي ${moneyFields.length} حقل قروش بتخزين DECIMAL(20,0) وقيود نطاق آمن.`);
