import assert from "node:assert/strict";

const secret = process.env.AUTH_SECRET || "";
const url = process.env.AUTH_URL || "";
const databaseUrl = process.env.DATABASE_URL || "";

assert.ok(secret.length >= 32, "AUTH_SECRET يجب أن يكون عشوائيًا وبطول 32 حرفًا على الأقل.");
assert.ok(!/replace-with|development-only|demo|local-demo/i.test(secret), "AUTH_SECRET لا يجب أن يكون قيمة تجريبية أو افتراضية.");
assert.ok(url.startsWith("https://"), "AUTH_URL يجب أن يبدأ بـ https:// في النشر.");
assert.ok(databaseUrl.startsWith("file:"), "DATABASE_URL يجب أن يشير إلى ملف SQLite دائم.");
assert.ok(!/(^|[\\/])dev\.db(?:$|[?&#])/.test(databaseUrl), "لا تستخدم dev.db كقاعدة بيانات النشر.");

console.log("PASS: إعدادات النشر الأساسية آمنة؛ راجع أيضًا القرص الدائم وHTTPS والنسخ الاحتياطية.");
