import "server-only";

import { createSlidingWindowLimiter, type ThrottleDecision } from "./rate-limit";

/*
 * Login throttling for a single-owner demo (process-local; see rate-limit.ts).
 *
 * - Per client: 5 failures per 15 minutes, but only when the client key comes
 *   from a trusted proxy header (see getTrustedClientKey). An untrusted
 *   X-Forwarded-For can be rotated freely, so it is ignored rather than used.
 * - Global: 25 failures per 15 minutes across all clients. This is the hard cap
 *   on guessing. It also means an attacker can temporarily lock the owner out.
 */

const WINDOW_MS = 15 * 60 * 1000;
export const MAX_FAILURES_PER_CLIENT = 5;
export const MAX_FAILURES_GLOBAL = 25;
const GLOBAL_KEY = "*";

const perClient = createSlidingWindowLimiter({ windowMs: WINDOW_MS, max: MAX_FAILURES_PER_CLIENT });
const global = createSlidingWindowLimiter({ windowMs: WINDOW_MS, max: MAX_FAILURES_GLOBAL, maxKeys: 1 });

export type { ThrottleDecision };

/** `clientKey` is null when no trustworthy client identifier is available. */
export function checkLoginAllowed(clientKey: string | null, now: number = Date.now()): ThrottleDecision {
  if (clientKey !== null) {
    const client = perClient.check(clientKey, now);
    if (!client.allowed) return client;
  }
  return global.check(GLOBAL_KEY, now);
}

export function recordLoginFailure(clientKey: string | null, now: number = Date.now()): void {
  if (clientKey !== null) perClient.hit(clientKey, now);
  global.hit(GLOBAL_KEY, now);
}

/** Clears the client's own failures after a successful login (the global count stays). */
export function clearLoginFailures(clientKey: string | null): void {
  if (clientKey !== null) perClient.reset(clientKey);
}
