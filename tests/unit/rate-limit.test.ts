import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isConfirmLookupBlocked,
  MAX_INVALID_PER_CLIENT,
  MAX_INVALID_UNTRUSTED,
  recordInvalidConfirmToken,
} from "../../lib/server/confirm-throttle";
import {
  checkLoginAllowed,
  clearLoginFailures,
  MAX_FAILURES_GLOBAL,
  MAX_FAILURES_PER_CLIENT,
  recordLoginFailure,
} from "../../lib/server/login-throttle";
import { createSlidingWindowLimiter } from "../../lib/server/rate-limit";

const MINUTE = 60_000;
// Each test uses its own time range so module-level limiter state never overlaps.
const hour = (n: number) => 1_000_000_000_000 + n * 60 * MINUTE;

test("sliding window: limit, retry-after, expiry, and bounded memory", () => {
  const limiter = createSlidingWindowLimiter({ windowMs: 10 * MINUTE, max: 3, maxKeys: 2 });
  const t = hour(0);
  for (let i = 0; i < 3; i++) limiter.hit("a", t);
  const blocked = limiter.check("a", t + MINUTE);
  assert.equal(blocked.allowed, false);
  assert.ok(!blocked.allowed && blocked.retryAfterSeconds === 9 * 60);
  assert.equal(limiter.check("a", t + 10 * MINUTE).allowed, true, "window expires");
  limiter.hit("b", t);
  limiter.hit("c", t);
  assert.equal(limiter.check("a", t + MINUTE).allowed, true, "oldest key evicted at maxKeys");
});

test("login: trusted clients get a per-client limit; others are unaffected", () => {
  const t = hour(1);
  for (let i = 0; i < MAX_FAILURES_PER_CLIENT; i++) {
    assert.equal(checkLoginAllowed("ip-a", t).allowed, true);
    recordLoginFailure("ip-a", t);
  }
  assert.equal(checkLoginAllowed("ip-a", t + 1).allowed, false);
  assert.equal(checkLoginAllowed("ip-b", t + 1).allowed, true);
  assert.equal(checkLoginAllowed("ip-a", t + 15 * MINUTE + 1).allowed, true, "window expires");
});

test("login: without a trusted key only the global cap applies, and it cannot be bypassed", () => {
  const t = hour(3);
  for (let i = 0; i < MAX_FAILURES_GLOBAL - 1; i++) recordLoginFailure(null, t);
  assert.equal(checkLoginAllowed(null, t + 1).allowed, true, "below the global cap");
  recordLoginFailure(null, t);
  assert.equal(checkLoginAllowed(null, t + 1).allowed, false, "global cap reached");
  assert.equal(checkLoginAllowed("fresh-trusted-client", t + 1).allowed, false, "applies to every client");
  clearLoginFailures("fresh-trusted-client");
  assert.equal(checkLoginAllowed(null, t + 2).allowed, false, "a success never resets the global count");
});

test("confirm route: invalid tokens are limited per trusted client", () => {
  const t = hour(5);
  for (let i = 0; i < MAX_INVALID_PER_CLIENT; i++) {
    assert.equal(isConfirmLookupBlocked("ip-c", t), false);
    recordInvalidConfirmToken("ip-c", t);
  }
  assert.equal(isConfirmLookupBlocked("ip-c", t + 1), true);
  assert.equal(isConfirmLookupBlocked("ip-d", t + 1), false, "other clients unaffected");
  assert.equal(isConfirmLookupBlocked("ip-c", t + 10 * MINUTE + 1), false, "window expires");
});

test("confirm route: untrusted traffic shares a generous budget", () => {
  const t = hour(7);
  for (let i = 0; i < MAX_INVALID_UNTRUSTED - 1; i++) recordInvalidConfirmToken(null, t);
  assert.equal(isConfirmLookupBlocked(null, t + 1), false);
  recordInvalidConfirmToken(null, t);
  assert.equal(isConfirmLookupBlocked(null, t + 1), true);
  assert.equal(isConfirmLookupBlocked("trusted-client", t + 1), false, "trusted clients use their own budget");
});
