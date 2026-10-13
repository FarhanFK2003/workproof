import "server-only";

/*
 * Application settings read on the server only.
 *
 *   WORKPROOF_APP_URL    Public origin used to build confirmation links, e.g.
 *                        https://workproof.example.com. Required in production;
 *                        defaults to http://localhost:3000 in development.
 *                        Never derived from request headers, which clients control.
 *   WORKPROOF_OWNER_NAME Optional display name shown to clients on the
 *                        confirmation page (max 80 characters).
 */

export class AppConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AppConfigError";
  }
}

const DEV_DEFAULT_APP_URL = "http://localhost:3000";
const OWNER_NAME_MAX = 80;

/** Validated application origin with no trailing slash. Throws AppConfigError. */
export function getAppBaseUrl(): string {
  const raw = process.env.WORKPROOF_APP_URL?.trim();
  if (!raw) {
    if (process.env.NODE_ENV !== "production") return DEV_DEFAULT_APP_URL;
    throw new AppConfigError("WORKPROOF_APP_URL is not set.");
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new AppConfigError("WORKPROOF_APP_URL must be an absolute URL, e.g. https://workproof.example.com.");
  }

  const isLocalhost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLocalhost)) {
    throw new AppConfigError("WORKPROOF_APP_URL must use https (http is allowed only for localhost).");
  }
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new AppConfigError("WORKPROOF_APP_URL must be an origin only, without a path, query, or credentials.");
  }
  return url.origin;
}

/** Name shown to clients, or null to use neutral wording. */
export function getOwnerDisplayName(): string | null {
  const name = process.env.WORKPROOF_OWNER_NAME?.trim();
  return name && name.length <= OWNER_NAME_MAX ? name : null;
}
