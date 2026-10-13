import "server-only";

import { AppConfigError, getAppBaseUrl } from "./app-config";
import { AuthConfigError, readAuthConfig } from "./auth-config";

/**
 * Validates server configuration and returns human-readable problems. Messages
 * name variables but never include their values.
 *
 * The app already fails closed at the point of use (sign-in disabled, database
 * calls refused, links not issued); this surfaces every problem once, at startup.
 */
export function findConfigProblems(): string[] {
  const problems: string[] = [];

  try {
    readAuthConfig();
  } catch (error) {
    if (!(error instanceof AuthConfigError)) throw error;
    problems.push(error.message);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) problems.push("NEXT_PUBLIC_SUPABASE_URL is not set.");
  else if (!/^https:\/\/[^/\s]+\/?$/.test(supabaseUrl)) {
    problems.push("NEXT_PUBLIC_SUPABASE_URL must be an https origin.");
  }

  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) problems.push("SUPABASE_SECRET_KEY is not set.");
  else if (!secretKey.startsWith("sb_secret_")) {
    problems.push("SUPABASE_SECRET_KEY must be a Supabase secret key (starts with sb_secret_).");
  }

  try {
    getAppBaseUrl();
  } catch (error) {
    if (!(error instanceof AppConfigError)) throw error;
    problems.push(error.message);
  }

  // Anything prefixed NEXT_PUBLIC_ is inlined into browser bundles.
  for (const [name, value] of Object.entries(process.env)) {
    if (name.startsWith("NEXT_PUBLIC_") && value && /sb_secret_|service_role/.test(value)) {
      problems.push(`${name} appears to contain a secret key. Secrets must never use the NEXT_PUBLIC_ prefix.`);
    }
  }

  return problems;
}
