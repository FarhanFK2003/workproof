import "server-only";

import { createSlidingWindowLimiter } from "./rate-limit";

/*
 * Limits failed lookups on the public /confirm/[token] route and its decision
 * action (process-local; see rate-limit.ts).
 *
 * Tokens are 256-bit random values, so guessing is not a realistic threat. This
 * only stops floods of invalid tokens from reaching the database. Successful
 * lookups are never counted, so real clients are not affected.
 *
 * - Per trusted client key: 30 invalid tokens per 10 minutes.
 * - Without a trusted key: a shared budget of 300 per 10 minutes, generous
 *   enough that ordinary use never reaches it.
 */

const WINDOW_MS = 10 * 60 * 1000;
export const MAX_INVALID_PER_CLIENT = 30;
export const MAX_INVALID_UNTRUSTED = 300;
const UNTRUSTED_KEY = "untrusted";

const perClient = createSlidingWindowLimiter({ windowMs: WINDOW_MS, max: MAX_INVALID_PER_CLIENT });
const untrusted = createSlidingWindowLimiter({ windowMs: WINDOW_MS, max: MAX_INVALID_UNTRUSTED, maxKeys: 1 });

export function isConfirmLookupBlocked(clientKey: string | null, now: number = Date.now()): boolean {
  return clientKey !== null
    ? !perClient.check(clientKey, now).allowed
    : !untrusted.check(UNTRUSTED_KEY, now).allowed;
}

export function recordInvalidConfirmToken(clientKey: string | null, now: number = Date.now()): void {
  if (clientKey !== null) perClient.hit(clientKey, now);
  else untrusted.hit(UNTRUSTED_KEY, now);
}
