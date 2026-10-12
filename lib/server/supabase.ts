import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/**
 * Privileged, server-only Supabase client (secret key → `service_role`).
 *
 * - `service_role` bypasses RLS. The migration narrows it to: SELECT on both
 *   tables, INSERT of content columns on work_records, and EXECUTE on the two
 *   confirmation functions. It cannot UPDATE or DELETE directly.
 * - Import this only from data-access modules in lib/server/, never from
 *   components or route files. `server-only` fails the build if browser code
 *   imports it.
 * - The secret key must never use a NEXT_PUBLIC_ name, or Next.js would inline
 *   it into browser bundles.
 * - WorkProof has no user login, so auth session storage and token refresh are
 *   disabled, which also makes one shared instance safe across requests.
 */

function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Add it to .env.local and restart the server.`,
    );
  }
  return value;
}

let client: SupabaseClient<Database> | undefined;

export function getServiceClient(): SupabaseClient<Database> {
  if (!client) {
    const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
    const secretKey = requireEnv("SUPABASE_SECRET_KEY", process.env.SUPABASE_SECRET_KEY);
    if (!secretKey.startsWith("sb_secret_")) {
      // Catches a publishable key pasted into the wrong variable.
      throw new Error("SUPABASE_SECRET_KEY must be a Supabase secret key (starts with sb_secret_).");
    }
    client = createClient<Database>(url, secretKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}
