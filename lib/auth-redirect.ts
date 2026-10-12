/**
 * Post-login redirect allowlist. Only these internal owner routes are accepted;
 * anything else (absolute URLs, protocol-relative "//", backslashes, unknown
 * paths, query strings) falls back to the dashboard. This prevents open redirects.
 */
export const DEFAULT_OWNER_PATH = "/dashboard";

const ALLOWED_PATHS: readonly RegExp[] = [
  /^\/dashboard$/,
  /^\/records\/new$/,
  /^\/records\/[A-Za-z0-9-]{1,64}$/,
];

export function safeRedirectPath(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_OWNER_PATH;
  return ALLOWED_PATHS.some((pattern) => pattern.test(value)) ? value : DEFAULT_OWNER_PATH;
}

export function loginPath(next: string): string {
  const safe = safeRedirectPath(next);
  return safe === DEFAULT_OWNER_PATH ? "/login" : `/login?next=${encodeURIComponent(safe)}`;
}
