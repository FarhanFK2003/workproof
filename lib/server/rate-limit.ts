import "server-only";

/*
 * Minimal in-memory sliding-window limiter.
 *
 * State lives in this server process only: it resets on restart and is not
 * shared between serverless instances or replicas. For distributed or
 * high-traffic deployments, add platform-level rate limiting (e.g. a WAF or a
 * shared store) in front of the app.
 */

export type ThrottleDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number };

export interface SlidingWindowLimiter {
  check(key: string, now?: number): ThrottleDecision;
  hit(key: string, now?: number): void;
  reset(key: string): void;
}

export function createSlidingWindowLimiter(options: {
  windowMs: number;
  max: number;
  /** Bounds memory when many distinct keys are used (e.g. spoofed headers). */
  maxKeys?: number;
}): SlidingWindowLimiter {
  const { windowMs, max, maxKeys = 1000 } = options;
  const hits = new Map<string, number[]>();

  function recent(key: string, now: number): number[] {
    const kept = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (kept.length > 0) hits.set(key, kept);
    else hits.delete(key);
    return kept;
  }

  return {
    check(key, now = Date.now()) {
      const attempts = recent(key, now);
      if (attempts.length < max) return { allowed: true };
      const retryAfterMs = windowMs - (now - attempts[0]);
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
    },
    hit(key, now = Date.now()) {
      hits.set(key, [...recent(key, now), now]);
      for (const oldest of hits.keys()) {
        if (hits.size <= maxKeys) break;
        hits.delete(oldest); // insertion order: oldest first
      }
    },
    reset(key) {
      hits.delete(key);
    },
  };
}
