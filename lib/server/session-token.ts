import "server-only";

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/*
 * Stateless owner-session tokens: base64url(JSON claims) + "." + base64url(HMAC-SHA256).
 * Pure functions (no cookies or env access) so they can be unit-tested.
 */

export interface SessionClaims {
  /** Format version. */
  v: 1;
  /** Random session ID, used for logout revocation. */
  sid: string;
  /** Issued at / expires at, in seconds since the epoch. */
  iat: number;
  exp: number;
}

const MAX_TOKEN_LENGTH = 512;
const CLOCK_SKEW_SECONDS = 60;
/** Hard ceiling regardless of configuration: 12 hours. */
export const MAX_SESSION_TTL_SECONDS = 12 * 60 * 60;

/**
 * Derives the signing key from the session secret and the passcode, so rotating
 * either one immediately invalidates every existing session.
 */
export function deriveSigningKey(sessionSecret: string, ownerPasscode: string): Buffer {
  const passcodeDigest = createHash("sha256").update(ownerPasscode, "utf8").digest("hex");
  return createHmac("sha256", sessionSecret)
    .update(`workproof-owner-session:v1:${passcodeDigest}`)
    .digest();
}

function sign(key: Buffer, payload: string): string {
  return createHmac("sha256", key).update(payload).digest("base64url");
}

/** Constant-time comparison of two strings of possibly different lengths. */
function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

export function createSessionToken(
  key: Buffer,
  ttlSeconds: number,
  nowMs: number = Date.now(),
): { token: string; claims: SessionClaims } {
  const iat = Math.floor(nowMs / 1000);
  const claims: SessionClaims = {
    v: 1,
    sid: randomBytes(16).toString("base64url"),
    iat,
    exp: iat + Math.min(ttlSeconds, MAX_SESSION_TTL_SECONDS),
  };
  const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  return { token: `${payload}.${sign(key, payload)}`, claims };
}

function isSessionClaims(value: unknown): value is SessionClaims {
  if (typeof value !== "object" || value === null) return false;
  const claims = value as Record<string, unknown>;
  return (
    claims.v === 1 &&
    typeof claims.sid === "string" &&
    /^[A-Za-z0-9_-]{22}$/.test(claims.sid) &&
    Number.isSafeInteger(claims.iat) &&
    Number.isSafeInteger(claims.exp)
  );
}

/** Returns the claims for a valid, unexpired token, otherwise null. Never throws. */
export function verifySessionToken(
  key: Buffer,
  token: string,
  nowMs: number = Date.now(),
): SessionClaims | null {
  if (token.length === 0 || token.length > MAX_TOKEN_LENGTH) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;

  // Verify the signature before parsing anything attacker-controlled.
  if (!safeEqual(signature, sign(key, payload))) return null;

  let claims: unknown;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!isSessionClaims(claims)) return null;

  const now = Math.floor(nowMs / 1000);
  if (claims.exp <= now) return null;
  if (claims.iat > now + CLOCK_SKEW_SECONDS) return null;
  if (claims.exp - claims.iat > MAX_SESSION_TTL_SECONDS) return null;
  return claims;
}

/** Constant-time passcode check. Hashing first equalizes lengths. */
export function passcodeMatches(candidate: string, expected: string): boolean {
  const a = createHash("sha256").update(candidate, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}
