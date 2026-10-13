import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_OWNER_PATH, loginPath, safeRedirectPath } from "../../lib/auth-redirect";
import {
  createSessionToken,
  deriveSigningKey,
  MAX_SESSION_TTL_SECONDS,
  passcodeMatches,
  verifySessionToken,
} from "../../lib/server/session-token";

const SECRET = "s".repeat(40);
const PASS = "correct horse battery";
const key = deriveSigningKey(SECRET, PASS);
const NOW = Date.UTC(2026, 9, 12, 12, 0, 0);

test("valid session token round-trips with the expected claims", () => {
  const { token, claims } = createSessionToken(key, 7200, NOW);
  assert.deepEqual(verifySessionToken(key, token, NOW + 1000), claims);
  assert.equal(claims.exp - claims.iat, 7200);
  assert.match(claims.sid, /^[A-Za-z0-9_-]{22}$/);
  assert.notEqual(createSessionToken(key, 7200, NOW).claims.sid, claims.sid);
});

test("expired, future-dated, and over-long sessions are rejected", () => {
  const { token } = createSessionToken(key, 600, NOW);
  assert.equal(verifySessionToken(key, token, NOW + 600_000), null, "at expiry");
  assert.equal(verifySessionToken(key, token, NOW + 600_001), null, "after expiry");
  assert.equal(verifySessionToken(key, token, NOW - 2 * 60_000), null, "issued in the future");
  const capped = createSessionToken(key, 999_999, NOW).claims;
  assert.equal(capped.exp - capped.iat, MAX_SESSION_TTL_SECONDS, "TTL capped at 12 h");
});

test("tampered, malformed, and wrongly keyed tokens never verify", () => {
  const { token } = createSessionToken(key, 600, NOW);
  const [payload, signature] = token.split(".");
  const forgedClaims = Buffer.from(
    JSON.stringify({ v: 1, sid: "A".repeat(22), iat: NOW / 1000, exp: NOW / 1000 + 99_999 }),
  ).toString("base64url");
  const lastChar = signature.at(-1) === "A" ? "B" : "A";
  const cases: Record<string, string> = {
    "forged payload, old signature": `${forgedClaims}.${signature}`,
    "flipped signature character": `${payload}.${signature.slice(0, -1)}${lastChar}`,
    "missing signature": `${payload}.`,
    "no separator": payload,
    "three parts": `${token}.x`,
    empty: "",
    oversized: "a".repeat(600),
    "alg none style": `${payload}.none`,
  };
  for (const [name, value] of Object.entries(cases)) {
    assert.equal(verifySessionToken(key, value, NOW), null, name);
  }
  assert.equal(verifySessionToken(deriveSigningKey("x".repeat(40), PASS), token, NOW), null, "other secret");
  assert.equal(verifySessionToken(deriveSigningKey(SECRET, "another passcode!"), token, NOW), null, "passcode rotated");
});

test("passcode comparison is exact", () => {
  assert.equal(passcodeMatches(PASS, PASS), true);
  for (const wrong of ["", `${PASS} `, "Correct horse battery", PASS.slice(0, -1), PASS + PASS]) {
    assert.equal(passcodeMatches(wrong, PASS), false, JSON.stringify(wrong));
  }
});

test("post-login redirects only go to known internal routes", () => {
  for (const ok of ["/dashboard", "/records/new", "/records/0b9c6f3e-1f2a-4c3b-9d8e-123456789abc"]) {
    assert.equal(safeRedirectPath(ok), ok);
  }
  const attacks: unknown[] = [
    "https://evil.example", "//evil.example", "///evil.example", "/\\evil.example", "\\\\evil.example",
    "javascript:alert(1)", "/dashboard?x=//evil", "/dashboard#x", "/records/../../evil", "/records/a/b",
    "/records/%2F%2Fevil", "/dashboard/", " /dashboard", "/login", "/confirm/abc", "/DASHBOARD",
    `/records/${"a".repeat(65)}`, "", null, undefined, 42, ["/dashboard"], "/dashboard\n", "/records/new\u0000",
  ];
  for (const attack of attacks) {
    assert.equal(safeRedirectPath(attack), DEFAULT_OWNER_PATH, JSON.stringify(attack));
  }
  assert.equal(loginPath("/records/new"), "/login?next=%2Frecords%2Fnew");
  assert.equal(loginPath("//evil.example"), "/login");
});
