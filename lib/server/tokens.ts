import "server-only";

import { createHash, randomBytes } from "node:crypto";

/** 32 random bytes = 256 bits; base64url-encodes to 43 URL-safe characters. */
const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** How long a client confirmation link stays valid. The database caps this at 30 days. */
export const CONFIRMATION_LINK_TTL_DAYS = 14;

/**
 * Creates a confirmation token. Return `token` to the freelancer once (inside the
 * link) and persist only `tokenHash`.
 */
export function generateConfirmationToken(): { token: string; tokenHash: string } {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  return { token, tokenHash: hashConfirmationToken(token) };
}

/**
 * SHA-256 hex digest. A fast hash is appropriate here: tokens are 256-bit random
 * values, so they cannot be guessed or brute-forced from the digest.
 */
export function hashConfirmationToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Rejects malformed tokens before any database lookup. */
export function isWellFormedToken(token: string): boolean {
  return TOKEN_PATTERN.test(token);
}
