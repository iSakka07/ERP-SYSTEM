import "server-only";

let checked = false;

export function assertSecureRuntimeConfig() {
  // الاختبارات المعزولة تشغل خادم production محليًا فوق قاعدة مؤقتة. الاستثناء
  // لا يعمل إلا إذا كان ملف SQLite نفسه داخل مجلد الاختبارات المؤقت.
  if (
    process.env.ERP_ISOLATED_TEST === "true" &&
    (/[\\/]tmp[\\/]isolated-test-/.test(process.env.DATABASE_URL || "") ||
      process.env.ERP_ISOLATED_POSTGRES === "true")
  )
    return;
  if (checked || process.env.NODE_ENV !== "production") return;
  const secret = process.env.AUTH_SECRET || "";
  if (secret.length < 32 || /replace-with|development-only|demo/i.test(secret))
    throw new Error("إعدادات الإنتاج غير آمنة: اضبط AUTH_SECRET عشوائيًا بطول 32 حرفًا على الأقل.");
  if (process.env.AUTH_URL && !process.env.AUTH_URL.startsWith("https://"))
    throw new Error("إعدادات الإنتاج غير آمنة: يجب أن يبدأ AUTH_URL بـ https://.");
  const databaseUrl = process.env.DATABASE_URL || "";
  if (!new RegExp("^postgres(?:ql)?://").test(databaseUrl))
    throw new Error("إعدادات الإنتاج غير آمنة: DATABASE_URL يجب أن يشير إلى PostgreSQL.");
  checked = true;
}


