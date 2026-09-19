import assert from "node:assert/strict";
import { clearLoginFailures, loginIsBlocked, loginRateLimitPolicy, recordLoginFailure, resetLoginRateLimitForTests } from "../src/lib/login-rate-limit.ts";

resetLoginRateLimitForTests();
const email = "user@example.com", ip = "192.0.2.10", startedAt = 1_000_000;
for (let index = 0; index < loginRateLimitPolicy.maxAccountFailures - 1; index += 1) recordLoginFailure(email, ip, startedAt + index);
assert.equal(loginIsBlocked(email, ip, startedAt + 10), false);
recordLoginFailure(email, ip, startedAt + 20);
assert.equal(loginIsBlocked(email, ip, startedAt + 21), true);
assert.equal(loginIsBlocked(email, "192.0.2.11", startedAt + 21), true, "account is throttled across IP changes");
clearLoginFailures(email);
assert.equal(loginIsBlocked(email, ip, startedAt + 21), false);
for (let index = 0; index < loginRateLimitPolicy.maxIpFailures; index += 1) {
  recordLoginFailure(`guess-${index}@example.com`, ip, startedAt + 100 + index);
}
assert.equal(loginIsBlocked("different@example.com", ip, startedAt + 200), true, "IP is throttled across account guesses");
clearLoginFailures("different@example.com");
assert.equal(loginIsBlocked("different@example.com", ip, startedAt + 201), true, "successful account reset does not clear the IP throttle");
resetLoginRateLimitForTests();
recordLoginFailure(email, ip, startedAt);
assert.equal(loginIsBlocked(email, ip, startedAt + loginRateLimitPolicy.windowMs + 1), false);
console.log("Login rate limiting passed: account and IP thresholds, success reset and time-window expiry.");
