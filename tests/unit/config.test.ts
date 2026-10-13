import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { getAppBaseUrl, getOwnerDisplayName } from "../../lib/server/app-config";
import { readAuthConfig, tryReadAuthConfig } from "../../lib/server/auth-config";
import { findConfigProblems } from "../../lib/server/config-check";

const VARS = [
  "NODE_ENV",
  "WORKPROOF_OWNER_PASSCODE",
  "WORKPROOF_SESSION_SECRET",
  "WORKPROOF_SESSION_TTL_MINUTES",
  "WORKPROOF_APP_URL",
  "WORKPROOF_OWNER_NAME",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SECRET_KEY",
  "NEXT_PUBLIC_LEAKED",
] as const;
let saved: Record<string, string | undefined> = {};

// process.env.NODE_ENV is typed read-only; tests still need to vary it.
const env = process.env as Record<string, string | undefined>;
function setEnv(values: Partial<Record<(typeof VARS)[number], string>>) {
  for (const name of VARS) delete env[name];
  Object.assign(env, values);
}

// Synthetic values only.
const GOOD = {
  NODE_ENV: "production",
  WORKPROOF_OWNER_PASSCODE: "synthetic-passcode-123",
  WORKPROOF_SESSION_SECRET: "z".repeat(43),
  WORKPROOF_APP_URL: "https://workproof.example.com",
  NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
  SUPABASE_SECRET_KEY: `sb_secret_${"q".repeat(32)}`,
};

beforeEach(() => {
  saved = Object.fromEntries(VARS.map((name) => [name, env[name]]));
});
afterEach(() => {
  for (const name of VARS) {
    if (saved[name] === undefined) delete env[name];
    else env[name] = saved[name];
  }
});

test("auth config: defaults and clamping", () => {
  setEnv(GOOD);
  assert.equal(readAuthConfig().ttlSeconds, 7200);
  setEnv({ ...GOOD, WORKPROOF_SESSION_TTL_MINUTES: "1" });
  assert.equal(readAuthConfig().ttlSeconds, 300);
  setEnv({ ...GOOD, WORKPROOF_SESSION_TTL_MINUTES: "100000" });
  assert.equal(readAuthConfig().ttlSeconds, 43200);
});

test("auth config fails closed and never echoes values", () => {
  const bad = [
    {},
    { WORKPROOF_SESSION_SECRET: GOOD.WORKPROOF_SESSION_SECRET },
    { ...GOOD, WORKPROOF_OWNER_PASSCODE: "tiny" },
    { ...GOOD, WORKPROOF_SESSION_SECRET: "too-short-secret" },
    { ...GOOD, WORKPROOF_OWNER_PASSCODE: "x".repeat(40), WORKPROOF_SESSION_SECRET: "x".repeat(40) },
    { ...GOOD, WORKPROOF_SESSION_TTL_MINUTES: "abc" },
    { ...GOOD, WORKPROOF_SESSION_TTL_MINUTES: "-5" },
  ];
  for (const values of bad) {
    setEnv(values);
    assert.throws(readAuthConfig, (error: Error) => {
      assert.equal(error.name, "AuthConfigError");
      for (const value of Object.values(values)) {
        if (value.length >= 8) assert.ok(!error.message.includes(value), "message leaks a value");
      }
      return true;
    });
    assert.equal(tryReadAuthConfig(), null);
  }
});

test("WORKPROOF_APP_URL must be an https origin in production", () => {
  setEnv({ ...GOOD });
  assert.equal(getAppBaseUrl(), "https://workproof.example.com");
  setEnv({ ...GOOD, WORKPROOF_APP_URL: "https://workproof.example.com/" });
  assert.equal(getAppBaseUrl(), "https://workproof.example.com");
  setEnv({ ...GOOD, WORKPROOF_APP_URL: "http://localhost:3000" });
  assert.equal(getAppBaseUrl(), "http://localhost:3000");
  setEnv({ NODE_ENV: "development" });
  assert.equal(getAppBaseUrl(), "http://localhost:3000", "development default");

  const bad = [
    undefined, "", "workproof.example.com", "http://workproof.example.com", "javascript:alert(1)",
    "https://user:pw@workproof.example.com", "https://workproof.example.com/app",
    "https://workproof.example.com/?x=1", "https://workproof.example.com/#h", "ftp://workproof.example.com",
    "//evil.example",
  ];
  for (const value of bad) {
    setEnv(value === undefined ? { NODE_ENV: "production" } : { NODE_ENV: "production", WORKPROOF_APP_URL: value });
    assert.throws(getAppBaseUrl, (error: Error) => error.name === "AppConfigError", String(value));
  }
});

test("owner display name is trimmed and length-limited", () => {
  setEnv({ WORKPROOF_OWNER_NAME: "  Alex Rivera  " });
  assert.equal(getOwnerDisplayName(), "Alex Rivera");
  setEnv({ WORKPROOF_OWNER_NAME: "x".repeat(81) });
  assert.equal(getOwnerDisplayName(), null);
});

test("startup config check: clean config has no problems", () => {
  setEnv(GOOD);
  assert.deepEqual(findConfigProblems(), []);
});

test("startup config check names every problem without revealing values", () => {
  const publishableInSecretSlot = "sb_publishable_synthetic_value_123";
  setEnv({
    NODE_ENV: "production",
    WORKPROOF_OWNER_PASSCODE: "tiny",
    NEXT_PUBLIC_SUPABASE_URL: "http://insecure.example.com",
    SUPABASE_SECRET_KEY: publishableInSecretSlot,
    NEXT_PUBLIC_LEAKED: `sb_secret_${"w".repeat(32)}`,
  });
  const problems = findConfigProblems();
  const joined = problems.join("\n");
  for (const expected of [
    "WORKPROOF_OWNER_PASSCODE",
    "NEXT_PUBLIC_SUPABASE_URL must be an https origin",
    "SUPABASE_SECRET_KEY must be a Supabase secret key",
    "WORKPROOF_APP_URL is not set",
    "NEXT_PUBLIC_LEAKED appears to contain a secret key",
  ]) {
    assert.ok(joined.includes(expected), `missing: ${expected}`);
  }
  assert.ok(!joined.includes(publishableInSecretSlot) && !joined.includes("w".repeat(32)), "values leaked");

  setEnv({ NODE_ENV: "production" });
  const missing = findConfigProblems().join("\n");
  assert.ok(missing.includes("SUPABASE_SECRET_KEY is not set"));
  assert.ok(missing.includes("NEXT_PUBLIC_SUPABASE_URL is not set"));
});
