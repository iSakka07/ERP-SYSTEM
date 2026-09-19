type Attempt = { failures: number; firstFailureAt: number; blockedUntil: number };

const WINDOW_MS = 15 * 60 * 1000;
const BLOCK_MS = 15 * 60 * 1000;
const MAX_ACCOUNT_FAILURES = 5;
const MAX_IP_FAILURES = 25;

const globalStore = globalThis as typeof globalThis & { __erpLoginAttempts?: Map<string, Attempt> };
const attempts = globalStore.__erpLoginAttempts ?? new Map<string, Attempt>();
globalStore.__erpLoginAttempts = attempts;

function normalizedEmail(email: string) { return email.trim().toLowerCase(); }
function accountKey(email: string) { return `email:${normalizedEmail(email)}`; }
function ipKey(ip: string) { return `ip:${ip || "unknown"}`; }
function activeAttempt(key: string, now: number) {
  const attempt = attempts.get(key);
  if (!attempt) return null;
  if (attempt.blockedUntil > now) return attempt;
  if (now - attempt.firstFailureAt >= WINDOW_MS) { attempts.delete(key); return null; }
  return attempt;
}

export function loginIsBlocked(email: string, ip: string, now = Date.now()) {
  return [accountKey(email), ipKey(ip)].some((key) => (activeAttempt(key, now)?.blockedUntil ?? 0) > now);
}

export function recordLoginFailure(email: string, ip: string, now = Date.now()) {
  for (const [key, threshold] of [[accountKey(email), MAX_ACCOUNT_FAILURES], [ipKey(ip), MAX_IP_FAILURES]] as const) {
    const current = activeAttempt(key, now) ?? { failures: 0, firstFailureAt: now, blockedUntil: 0 };
    const failures = current.failures + 1;
    attempts.set(key, { failures, firstFailureAt: current.firstFailureAt, blockedUntil: failures >= threshold ? now + BLOCK_MS : 0 });
  }
}

export function clearLoginFailures(email: string) {
  attempts.delete(accountKey(email));
}

export function resetLoginRateLimitForTests() { attempts.clear(); }

export const loginRateLimitPolicy = {
  windowMs: WINDOW_MS,
  blockMs: BLOCK_MS,
  maxAccountFailures: MAX_ACCOUNT_FAILURES,
  maxIpFailures: MAX_IP_FAILURES,
} as const;
