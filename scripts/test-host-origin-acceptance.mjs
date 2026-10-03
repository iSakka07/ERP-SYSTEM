import assert from "node:assert/strict";

assert.equal(process.env.ERP_ISOLATED_TEST, "true");
const base = process.env.ERP_TEST_URL || "";
const publicOrigin = process.env.ERP_TEST_PUBLIC_ORIGIN || "";
assert.match(base, /^http:\/\/127\.0\.0\.1:\d+$/);
assert.match(publicOrigin, /^https:\/\//);

const publicHost = new URL(publicOrigin).host;
const cookieHeader = (jar) => [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
const saveCookies = (response, jar) => {
  for (const cookie of response.headers.getSetCookie()) {
    const [name, ...value] = cookie.split(";")[0].split("=");
    jar.set(name, value.join("="));
  }
};
const trustedHeaders = () => ({
  Host: publicHost,
  "X-Forwarded-Host": publicHost,
  "X-Forwarded-Proto": "https",
});
async function request(path, jar = new Map(), options = {}) {
  const response = await fetch(base + path, {
    ...options,
    redirect: "manual",
    headers: { ...trustedHeaders(), Cookie: cookieHeader(jar), ...options.headers },
  });
  saveCookies(response, jar);
  return response;
}

async function login() {
  const jar = new Map();
  const csrfResponse = await request("/api/auth/csrf", jar);
  assert.equal(csrfResponse.status, 200);
  assert.match(csrfResponse.headers.get("set-cookie") || "", /; Secure/i, "HTTPS forwarded by the proxy must produce Secure auth cookies");
  const { csrfToken } = await csrfResponse.json();
  const callback = await request("/api/auth/callback/credentials", jar, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      csrfToken,
      email: "admin@erp.local",
      password: process.env.ERP_TEST_ADMIN_PASSWORD || "",
      callbackUrl: "https://attacker.invalid/steal-session",
    }),
  });
  assert.equal(callback.status, 302);
  const location = callback.headers.get("location") || "";
  assert.ok(location.startsWith(publicOrigin), `Auth.js redirected outside the configured origin: ${location}`);
  assert.ok(!location.includes("attacker.invalid"));
  const session = await (await request("/api/auth/session", jar)).json();
  assert.equal(session?.user?.email, "admin@erp.local");
  return jar;
}

const attackerHost = "attacker.invalid";
const attackerOrigin = `https://${attackerHost}`;
const fakeHost = await request("/login", new Map(), { headers: { Host: attackerHost, "X-Forwarded-Host": attackerHost, "X-Forwarded-Proto": "https" } });
assert.equal(fakeHost.status, 421, "a forged Host must be rejected before Auth.js can build a redirect");
const fakeForwardedHost = await request("/api/auth/csrf", new Map(), { headers: { "X-Forwarded-Host": attackerHost } });
assert.equal(fakeForwardedHost.status, 421, "a forged X-Forwarded-Host must be rejected");
const mismatchedHost = await request("/api/auth/csrf", new Map(), { headers: { Host: attackerHost } });
assert.equal(mismatchedHost.status, 421, "Host and X-Forwarded-Host must both match the configured domain");
console.log("PASS forged Host and X-Forwarded-Host are rejected before Auth.js");

const jar = await login();
const form = new FormData();
form.set("payload", JSON.stringify({ type: "OWNER_FUNDING", amount: 1, date: "2026-10-03", description: "host origin attack", reference: "HOST-ORIGIN-ATTACK" }));
const mutation = await request("/api/bank", jar, {
  method: "POST",
  headers: { Origin: attackerOrigin, "Idempotency-Key": "host-origin-acceptance" },
  body: form,
});
assert.equal(mutation.status, 403, "an untrusted Origin must remain rejected even with the real Host header");
console.log("PASS HTTPS proxy session, canonical Auth.js redirect, and Origin protection");
