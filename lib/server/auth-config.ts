import "server-only";

import { MAX_SESSION_TTL_SECONDS } from "./session-token";

/*
 * Owner-auth configuration, read only on the server. Values are never logged or
 * included in error messages; only variable names are.
 *
 *   WORKPROOF_OWNER_PASSCODE       required, at least 12 characters
 *   WORKPROOF_SESSION_SECRET       required, at least 32 characters (random)
 *   WORKPROOF_SESSION_TTL_MINUTES  optional, default 120, clamped to 5–720
 */

export class AuthConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthConfigError";
  }
}

export interface AuthConfig {
  passcode: string;
  sessionSecret: string;
  ttlSeconds: number;
}

const MIN_PASSCODE_LENGTH = 12;
const MIN_SECRET_LENGTH = 32;
const DEFAULT_TTL_MINUTES = 120;
const MIN_TTL_MINUTES = 5;

export function readAuthConfig(): AuthConfig {
  const passcode = process.env.WORKPROOF_OWNER_PASSCODE;
  const sessionSecret = process.env.WORKPROOF_SESSION_SECRET;
  const ttlRaw = process.env.WORKPROOF_SESSION_TTL_MINUTES;

  if (!passcode || passcode.length < MIN_PASSCODE_LENGTH) {
    throw new AuthConfigError(
      `WORKPROOF_OWNER_PASSCODE is missing or shorter than ${MIN_PASSCODE_LENGTH} characters.`,
    );
  }
  if (!sessionSecret || sessionSecret.length < MIN_SECRET_LENGTH) {
    throw new AuthConfigError(
      `WORKPROOF_SESSION_SECRET is missing or shorter than ${MIN_SECRET_LENGTH} characters.`,
    );
  }
  if (sessionSecret === passcode) {
    throw new AuthConfigError("WORKPROOF_SESSION_SECRET must differ from WORKPROOF_OWNER_PASSCODE.");
  }

  let ttlMinutes = DEFAULT_TTL_MINUTES;
  if (ttlRaw !== undefined && ttlRaw !== "") {
    const parsed = Number(ttlRaw);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new AuthConfigError("WORKPROOF_SESSION_TTL_MINUTES must be a positive whole number.");
    }
    ttlMinutes = parsed;
  }
  const ttlSeconds = Math.min(
    Math.max(ttlMinutes, MIN_TTL_MINUTES) * 60,
    MAX_SESSION_TTL_SECONDS,
  );

  return { passcode, sessionSecret, ttlSeconds };
}

let reported = false;

/** Like readAuthConfig, but logs the problem once and returns null instead of throwing. */
export function tryReadAuthConfig(): AuthConfig | null {
  try {
    return readAuthConfig();
  } catch (error) {
    if (!(error instanceof AuthConfigError)) throw error;
    if (!reported) {
      reported = true;
      console.error(`[auth] Owner sign-in is disabled: ${error.message}`);
    }
    return null;
  }
}
