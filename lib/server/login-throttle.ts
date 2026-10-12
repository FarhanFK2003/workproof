import "server-only";

/*
 * Minimal in-memory login throttling for a single-owner demo.
 *
 * Limits failed attempts per client key (IP) and globally within a sliding
 * window. State lives in this server process only: it resets on restart and is
 * not shared between serverless instances. The global cap keeps distributed
 * guessing slow, at the cost of letting an attacker temporarily lock the owner
 * out. Durable rate limiting would need a shared store.
 */

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES_PER_CLIENT = 5;
const MAX_FAILURES_GLOBAL = 25;
const MAX_TRACKED_CLIENTS = 1000;
const GLOBAL_KEY = "*";

const failures = new Map<string, number[]>();

function recent(key: string, now: number): number[] {
  const kept = (failures.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (kept.length > 0) failures.set(key, kept);
  else failures.delete(key);
  return kept;
}

export type ThrottleDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number };

export function checkLoginAllowed(clientKey: string, now: number = Date.now()): ThrottleDecision {
  for (const [key, limit] of [
    [clientKey, MAX_FAILURES_PER_CLIENT],
    [GLOBAL_KEY, MAX_FAILURES_GLOBAL],
  ] as const) {
    const attempts = recent(key, now);
    if (attempts.length >= limit) {
      const retryAfterMs = WINDOW_MS - (now - attempts[0]);
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
    }
  }
  return { allowed: true };
}

export function recordLoginFailure(clientKey: string, now: number = Date.now()): void {
  for (const key of [clientKey, GLOBAL_KEY]) {
    failures.set(key, [...recent(key, now), now]);
  }
  // Bound memory if many distinct client keys are used (e.g. spoofed headers).
  for (const key of failures.keys()) {
    if (failures.size <= MAX_TRACKED_CLIENTS) break;
    if (key !== GLOBAL_KEY) failures.delete(key); // oldest first (insertion order)
  }
}

/** Clears the client's own failures after a successful login (the global count stays). */
export function clearLoginFailures(clientKey: string): void {
  failures.delete(clientKey);
}
