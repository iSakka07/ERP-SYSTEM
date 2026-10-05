import assert from "node:assert/strict";

const secret = process.env.AUTH_SECRET || "";
const url = process.env.AUTH_URL || "";
const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL || "";

assert.ok(secret.length >= 32, "AUTH_SECRET يجب أن يكون عشوائيًا وبطول 32 حرفًا على الأقل.");
assert.ok(!/replace-with|development-only|demo|local-demo/i.test(secret), "AUTH_SECRET لا يجب أن يكون قيمة تجريبية أو افتراضية.");
let publicOrigin;
try {
  publicOrigin = new URL(url);
} catch {
  assert.fail("AUTH_URL يجب أن يكون رابطًا صالحًا.");
}
assert.equal(publicOrigin.protocol, "https:", "AUTH_URL يجب أن يبدأ بـ https:// في النشر.");
assert.ok(publicOrigin.hostname, "AUTH_URL يجب أن يحتوي على الدومين الرسمي.");
assert.equal(publicOrigin.pathname, "/", "AUTH_URL يجب أن يكون أصل الدومين فقط، بلا مسار.");
assert.equal(publicOrigin.search, "", "AUTH_URL لا يجب أن يحتوي على query string.");
assert.equal(publicOrigin.hash, "", "AUTH_URL لا يجب أن يحتوي على hash.");
assert.equal(publicOrigin.username, "", "AUTH_URL لا يجب أن يحتوي على اسم مستخدم.");
assert.equal(publicOrigin.password, "", "AUTH_URL لا يجب أن يحتوي على كلمة مرور.");
const postgresDatabase = /^postgres(?:ql)?:\/\//.test(databaseUrl);
assert.ok(postgresDatabase, "DATABASE_URL أو POSTGRES_PRISMA_URL في بيئة النشر يجب أن يشير إلى PostgreSQL.");

const parsedDatabaseUrl = new URL(databaseUrl);
assert.ok(
  parsedDatabaseUrl.hostname.endsWith(".supabase.com"),
  "DATABASE_URL في الإنتاج يجب أن يشير إلى مشروع Supabase المعتمد.",
);
assert.ok(
  parsedDatabaseUrl.port === "5432" || parsedDatabaseUrl.port === "6543" || parsedDatabaseUrl.port === "",
  "رابط Supabase يجب أن يستخدم Session pooler على 5432 أو Transaction pooler على 6543.",
);

const expectedProjectRef = process.env.SUPABASE_PROJECT_REF || "";
if (expectedProjectRef) {
  assert.match(expectedProjectRef, /^[a-z0-9]{20}$/, "SUPABASE_PROJECT_REF غير صالح.");
  assert.ok(
    parsedDatabaseUrl.hostname.includes(expectedProjectRef) || parsedDatabaseUrl.username.includes(expectedProjectRef),
    "DATABASE_URL لا يطابق SUPABASE_PROJECT_REF المحدد.",
  );
}

console.log("PASS: إعدادات النشر وSupabase الأساسية سليمة؛ راجع أيضًا النسخ الاحتياطية والاستعادة.");
