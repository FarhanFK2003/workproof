import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client.
 *
 * - Uses the publishable key, so Row Level Security applies to every query.
 * - WorkProof has no user login, so auth session storage and token refresh are
 *   disabled. That also makes one shared instance safe across requests.
 * - Privileged keys (e.g. a future SUPABASE_SECRET_KEY) must never use a
 *   NEXT_PUBLIC_ name, or Next.js will inline them into browser bundles.
 *
 * Only modules under lib/server/ should read Supabase environment variables.
 */

function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Add it to .env.local and restart the server.`,
    );
  }
  return value;
}

let client: SupabaseClient | undefined;

export function getSupabase(): SupabaseClient {
  client ??= createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    requireEnv(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    ),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
  return client;
}
