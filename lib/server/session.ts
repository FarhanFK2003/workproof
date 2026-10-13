import "server-only";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { loginPath } from "@/lib/auth-redirect";
import { tryReadAuthConfig } from "./auth-config";
import {
  createSessionToken,
  deriveSigningKey,
  verifySessionToken,
  type SessionClaims,
} from "./session-token";

/*
 * Owner session: the only code that reads or writes the session cookie.
 * Every freelancer-only page, Server Action, and data-access function must call
 * getOwnerSession(), requireOwner(), or requireOwnerForPage() on the server.
 */

const isProduction = process.env.NODE_ENV === "production";

// `__Host-` requires Secure, Path=/ and no Domain, so browsers refuse a cookie
// that was scoped more broadly or set over plain HTTP.
const COOKIE_NAME = isProduction ? "__Host-workproof_session" : "workproof_session";

function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

// Logged-out session IDs, kept until their natural expiry. In-memory only, so a
// copied cookie becomes valid again after a restart or on another instance;
// the short TTL bounds that window.
const revokedSessions = new Map<string, number>();

function isRevoked(claims: SessionClaims): boolean {
  const now = Math.floor(Date.now() / 1000);
  for (const [sid, exp] of revokedSessions) {
    if (exp <= now) revokedSessions.delete(sid);
  }
  return revokedSessions.has(claims.sid);
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Owner session required.");
    this.name = "UnauthorizedError";
  }
}

export interface OwnerSession {
  expiresAt: Date;
}

/** Verified owner session for this request, or null. Deduplicated per request. */
export const getOwnerSession = cache(async (): Promise<OwnerSession | null> => {
  // Read the cookie first: it makes every caller request-time. Checking config
  // first would let the build prerender a "signed out" result into static pages.
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;

  const config = tryReadAuthConfig();
  if (!config) return null; // Fail closed when auth isn't configured.

  const claims = verifySessionToken(deriveSigningKey(config.sessionSecret, config.passcode), token);
  if (!claims || isRevoked(claims)) return null;
  return { expiresAt: new Date(claims.exp * 1000) };
});

/** For Server Actions and the data layer: throws when there is no valid session. */
export async function requireOwner(): Promise<OwnerSession> {
  const session = await getOwnerSession();
  if (!session) throw new UnauthorizedError();
  return session;
}

/** For pages: redirects to login (returning to `currentPath` if allowed). */
export async function requireOwnerForPage(currentPath: string): Promise<OwnerSession> {
  const session = await getOwnerSession();
  if (!session) redirect(loginPath(currentPath));
  return session;
}

/** Sets a fresh session cookie. Call only after the passcode has been verified. */
export async function createOwnerSession(): Promise<void> {
  const config = tryReadAuthConfig();
  if (!config) throw new Error("Owner sign-in is not configured.");
  const { token, claims } = createSessionToken(
    deriveSigningKey(config.sessionSecret, config.passcode),
    config.ttlSeconds,
  );
  (await cookies()).set(COOKIE_NAME, token, cookieOptions(claims.exp - claims.iat));
}

/** Revokes the current session ID (this process) and expires the cookie. */
export async function deleteOwnerSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const config = tryReadAuthConfig();
  if (token && config) {
    const claims = verifySessionToken(deriveSigningKey(config.sessionSecret, config.passcode), token);
    if (claims) revokedSessions.set(claims.sid, claims.exp);
  }
  // Same attributes as when set, or browsers ignore the deletion for __Host- cookies.
  cookieStore.set(COOKIE_NAME, "", cookieOptions(0));
}

/**
 * Client identifier for rate limiting, or null when none can be trusted.
 *
 * X-Forwarded-For is only trustworthy when a proxy in front of the app
 * overwrites it. Vercel does; `next start` exposed directly does not (Next only
 * fills the header when the client didn't send one), so a client could rotate it
 * to dodge per-client limits. Trust it on Vercel, or when
 * WORKPROOF_TRUST_PROXY_HEADERS=true is set behind a proxy you control.
 */
export async function getTrustedClientKey(): Promise<string | null> {
  const trusted = process.env.VERCEL === "1" || process.env.WORKPROOF_TRUST_PROXY_HEADERS === "true";
  if (!trusted) return null;
  const forwarded = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded ? forwarded.slice(0, 64) : null;
}
