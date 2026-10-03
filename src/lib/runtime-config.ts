import "server-only";

let checked = false;

/**
 * The one public origin through which this deployment is reachable. Auth.js
 * uses AUTH_URL to build callback URLs, so it must never be inferred from a
 * client-controlled Host or X-Forwarded-Host header in production.
 */
export function getConfiguredPublicOrigin(): URL | null {
  const rawUrl = process.env.AUTH_URL?.trim();
  if (!rawUrl) return null;

  try {
    const url = new URL(rawUrl);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      !url.hostname ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

function normalisedForwardedHosts(value: string | null) {
  if (!value) return [];
  return value.split(",").map((host) => host.trim().toLowerCase()).filter(Boolean);
}

/**
 * The reverse proxy must preserve the external Host and overwrite forwarding
 * headers. We require every supplied host value to equal AUTH_URL's host so a
 * forged Host/X-Forwarded-Host cannot influence Auth.js or application URLs.
 */
export function hasTrustedRequestHost(headers: Headers) {
  const publicOrigin = getConfiguredPublicOrigin();
  if (!publicOrigin) return process.env.NODE_ENV !== "production";

  const expectedHost = publicOrigin.host.toLowerCase();
  const host = headers.get("host")?.trim().toLowerCase();
  const forwardedHosts = normalisedForwardedHosts(headers.get("x-forwarded-host"));

  return host === expectedHost && forwardedHosts.every((forwardedHost) => forwardedHost === expectedHost);
}

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
  const publicOrigin = getConfiguredPublicOrigin();
  if (!publicOrigin || publicOrigin.protocol !== "https:")
    throw new Error("إعدادات الإنتاج غير آمنة: اضبط AUTH_URL كأصل HTTPS رسمي صالح، بلا مسار أو بيانات دخول.");
  const databaseUrl = process.env.DATABASE_URL || "";
  if (!new RegExp("^postgres(?:ql)?://").test(databaseUrl))
    throw new Error("إعدادات الإنتاج غير آمنة: DATABASE_URL يجب أن يشير إلى PostgreSQL.");
  checked = true;
}


