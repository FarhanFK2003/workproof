// Owner authentication, sessions, redirects, throttling, headers, and config.
// Run: npm run build && WORKPROOF_E2E_ALLOW_WRITES=1 npm run test:e2e:auth
import { randomBytes, randomUUID } from "node:crypto";
import path from "node:path";
import {
  actionStatus, bundleFilesContaining, check, COOKIE, craftSessionCookie, finish, launchBrowser,
  projectDir, replayAction, requireOptIn, sleep, startServer, testSecrets, waitForServer,
} from "./harness.mjs";

requireOptIn("auth e2e");
process.loadEnvFile(path.join(projectDir, ".env.local")); // only to assert values never leak

const PORT = 3124;
const BASE = `http://localhost:${PORT}`;
const TRUSTED = `http://localhost:${PORT + 2}`;
const { pass: PASS, secret: SECRET } = testSecrets();
const PROTECTED = /Total records|New work record|Private details<\/h2>|Work summary/;
const nowS = () => Math.floor(Date.now() / 1000);
const ownerEnv = { WORKPROOF_OWNER_PASSCODE: PASS, WORKPROOF_SESSION_SECRET: SECRET, WORKPROOF_SESSION_TTL_MINUTES: "10" };

async function get(base, pathname, cookie, headers = {}) {
  const res = await fetch(base + pathname, {
    redirect: "manual",
    headers: { ...headers, ...(cookie ? { cookie: `${COOKIE}=${cookie}` } : {}) },
  });
  return { status: res.status, location: res.headers.get("location"), body: await res.text(), headers: res.headers };
}
const redirectsToLogin = (r) =>
  (r.location ?? "").startsWith("/login") || /NEXT_REDIRECT[^"]*\/login|url=\/login|"\/login/.test(r.body);

// Default deployment shape: `next start` with no trusted proxy.
const server = startServer(PORT, ownerEnv);
await waitForServer(BASE);

// --- Owner routes reject missing, forged, tampered, expired cookies ------------
const ownerPaths = ["/dashboard", "/records/new", `/records/${randomUUID()}`];
const forged = {
  "no cookie": undefined,
  "garbage cookie": "garbage.value",
  "wrong secret": craftSessionCookie(randomBytes(32).toString("base64url"), PASS),
  "rotated passcode": craftSessionCookie(SECRET, "some-other-passcode"),
  expired: craftSessionCookie(SECRET, PASS, { iat: nowS() - 1200, exp: nowS() - 600 }),
  "over-long lifetime": craftSessionCookie(SECRET, PASS, { exp: nowS() + 13 * 3600 }),
};
for (const [label, cookie] of Object.entries(forged)) {
  for (const p of ownerPaths) {
    const r = await get(BASE, p, cookie);
    check(`[${label}] ${p.replace(/[0-9a-f-]{36}/, "<uuid>")} hides owner content`, !PROTECTED.test(r.body) && redirectsToLogin(r));
  }
}
for (const p of ["/dashboard", "/records/new"]) {
  for (const [label, headers] of [["RSC", { RSC: "1" }], ["RSC prefetch", { RSC: "1", "Next-Router-Prefetch": "1" }]]) {
    const r = await get(BASE, p, undefined, headers);
    check(`[${label}, no cookie] ${p} payload has no owner content`, !PROTECTED.test(r.body));
  }
}
const goodCookie = craftSessionCookie(SECRET, PASS);
const authed = await get(BASE, "/dashboard", goodCookie);
check("valid signed cookie unlocks /dashboard (control)", PROTECTED.test(authed.body) && !redirectsToLogin(authed));
check("signed-in owner gets not-found for an unknown record ID", /Record not found/.test((await get(BASE, `/records/${randomUUID()}`, goodCookie)).body));

// --- Security headers ----------------------------------------------------------
const home = await get(BASE, "/");
const confirmRes = await get(BASE, `/confirm/${randomBytes(32).toString("base64url")}`);
for (const [label, r] of [["/", home], ["/confirm", confirmRes]]) {
  check(`${label}: framing forbidden (CSP frame-ancestors + X-Frame-Options)`,
    /frame-ancestors 'none'/.test(r.headers.get("content-security-policy") ?? "") && r.headers.get("x-frame-options") === "DENY");
  check(`${label}: nosniff`, r.headers.get("x-content-type-options") === "nosniff");
  check(`${label}: no X-Powered-By`, !r.headers.has("x-powered-by"));
}
check("/: site-wide referrer policy", home.headers.get("referrer-policy") === "strict-origin-when-cross-origin");
check("/confirm: token URLs never sent as Referer", confirmRes.headers.get("referrer-policy") === "no-referrer");
check("public confirm route needs no session", confirmRes.status === 200 && !redirectsToLogin(confirmRes));
check("landing page renders signed out", home.status === 200 && !PROTECTED.test(home.body));

// --- Browser: login, cookie attributes, actions, logout, redirects ----------------
const browser = await launchBrowser();
async function login(passcode) {
  await browser.hydrated("#passcode");
  await browser.setValue("#passcode", passcode);
  await browser.clickButton("Sign in");
}

await browser.go(`${BASE}/dashboard`);
check("/dashboard redirects to login", await browser.waitFor(`location.pathname === "/login"`));
check("login keeps a safe next=/dashboard", await browser.waitFor(`document.querySelector("input[name=next]")?.value === "/dashboard"`));

await login("definitely-wrong-passcode");
check("wrong passcode shows a generic error", await browser.waitFor(`/isn.t correct/.test(document.body.innerText)`));
check("no session cookie after a failed login", !(await browser.cookie(BASE)));
const loginRequest = await browser.captureLastAction();

await login(PASS);
check("correct passcode lands on /dashboard", await browser.waitFor(`location.pathname === "/dashboard" && document.body.innerText.includes("Work records")`));
const cookie = await browser.cookie(BASE);
check("cookie is HttpOnly", cookie?.httpOnly === true);
check("cookie is Secure (production)", cookie?.secure === true);
check("cookie is SameSite=Lax", cookie?.sameSite === "Lax");
check("cookie path is /", cookie?.path === "/");
const ttl = cookie ? cookie.expires - Date.now() / 1000 : -1;
check("cookie expiry matches the configured TTL (10 min)", ttl > 590 && ttl <= 601, `${Math.round(ttl)}s`);
check("cookie is invisible to page JavaScript", !(await browser.evaluate("document.cookie")).includes("workproof"));
const ownerCookie = cookie?.value;

// Record creation Server Action: capture, then call it directly.
await browser.go(`${BASE}/records/new`);
await browser.hydrated("#title");
for (const [selector, value] of [
  ["#title", "[E2E TEST] auth check"], ["#category", "Design"], ["#startDate", "2026-05-01"], ["#endDate", "2026-06-01"],
  ["#summary", "End-to-end test of the protected record creation action."], ["#clientName", "Test Client"],
  ["#clientEmail", "client@example.com"],
]) await browser.setValue(selector, value);
await browser.clickButton("Create record");
check("signed-in form submit creates a record", await browser.waitFor(`/^\\/records\\/[0-9a-f-]{36}$/.test(location.pathname)`, 20000));
const createRequest = await browser.captureLastAction();
check("direct create call without a session is rejected", actionStatus(await replayAction(createRequest, { base: BASE })) === "unauthorized");
check("direct create call with a forged cookie is rejected",
  actionStatus(await replayAction(createRequest, { base: BASE, cookie: forged["wrong secret"] })) === "unauthorized");

// Logout.
await browser.go(`${BASE}/dashboard`);
await browser.hydrated("form button");
await browser.clickButton("Sign out");
check("logout lands on /login?signedOut=1", await browser.waitFor(`location.pathname === "/login" && location.search.includes("signedOut=1")`));
check("session cookie removed from the browser", !(await browser.cookie(BASE)));
const replayOld = await get(BASE, "/dashboard", ownerCookie);
check("replaying the logged-out cookie is rejected", !PROTECTED.test(replayOld.body) && redirectsToLogin(replayOld));

// Open redirects.
await browser.go(`${BASE}/login?next=https%3A%2F%2Fevil.example%2Fsteal`);
check("hostile next is replaced in the form", await browser.waitFor(`document.querySelector("input[name=next]")?.value === "/dashboard"`));
await login(PASS);
check("login with hostile next stays on this site", await browser.waitFor(`location.origin === ${JSON.stringify(BASE)} && location.pathname === "/dashboard"`));
await browser.go(`${BASE}/login?next=%2F%2Fevil.example`);
check("signed in + //evil next → /dashboard", await browser.waitFor(`location.origin === ${JSON.stringify(BASE)} && location.pathname === "/dashboard"`));
await browser.hydrated("form button");
await browser.clickButton("Sign out");
await browser.waitFor(`location.pathname === "/login"`);

// --- Throttling without a trusted proxy: spoofed X-Forwarded-For can't bypass ----
// One failure is already recorded above. Rotate a spoofed header on every attempt.
let failuresUntilBlocked = 1;
let blocked = false;
while (failuresUntilBlocked <= 30 && !blocked) {
  const text = await replayAction(loginRequest, {
    base: BASE,
    headers: { "X-Forwarded-For": `203.0.113.${failuresUntilBlocked}` },
  });
  blocked = /Too many attempts/.test(text);
  if (!blocked) failuresUntilBlocked++;
}
check("rotating spoofed X-Forwarded-For cannot exceed the global cap (25)", blocked && failuresUntilBlocked <= 25, `blocked after ${failuresUntilBlocked} failures`);
const correctWhileBlocked = await replayAction(loginRequest, {
  base: BASE,
  transform: (b) => b.split("definitely-wrong-passcode").join(PASS),
  headers: { "X-Forwarded-For": "203.0.113.250" },
});
check("correct passcode is refused while the cap is active", /Too many attempts/.test(correctWhileBlocked));
check("the throttle message does not reveal whether the passcode was right", !/isn.t correct/.test(correctWhileBlocked));

check("no uncaught browser errors", browser.pageErrors.length === 0, browser.pageErrors.join(" | ").slice(0, 300));
check("server log never contains the passcode or secret", !server.log.includes(PASS) && !server.log.includes(SECRET));
check("failed attempts are logged without values", server.log.includes("[auth] Failed owner sign-in attempt."));
server.kill();

// --- Behind a trusted proxy: per-client limits work ------------------------------
const trusted = startServer(PORT + 2, { ...ownerEnv, WORKPROOF_TRUST_PROXY_HEADERS: "true", WORKPROOF_APP_URL: TRUSTED });
await waitForServer(TRUSTED);
const attempt = (ip) => replayAction(loginRequest, { base: TRUSTED, origin: TRUSTED, headers: { "X-Forwarded-For": ip } });
for (let i = 0; i < 5; i++) await attempt("198.51.100.7");
check("trusted proxy: 6th failure from the same client is throttled", /Too many attempts/.test(await attempt("198.51.100.7")));
check("trusted proxy: another client is not affected", /isn.t correct/.test(await attempt("198.51.100.8")));

const lookups = [];
for (let i = 0; i < 31; i++) {
  const r = await get(TRUSTED, `/confirm/${randomBytes(32).toString("base64url")}`, undefined, { "X-Forwarded-For": "198.51.100.9" });
  lookups.push(/Too many attempts/.test(r.body) ? "throttled" : /isn(’|&#x27;|')t valid/.test(r.body) ? "invalid" : `other-${r.status}`);
}
check("confirm route: first 30 invalid links show the invalid-link page", lookups.slice(0, 30).every((s) => s === "invalid"), lookups.slice(0, 30).join(","));
check("confirm route: the 31st invalid link from that client is throttled", lookups[30] === "throttled");
const other = await get(TRUSTED, `/confirm/${randomBytes(32).toString("base64url")}`, undefined, { "X-Forwarded-For": "198.51.100.10" });
check("confirm route: other clients are unaffected", /isn(’|&#x27;|')t valid/.test(other.body));
trusted.kill();

// --- Missing configuration fails closed and is reported at startup ----------------
const BARE = `http://localhost:${PORT + 1}`;
const bare = startServer(PORT + 1, { WORKPROOF_OWNER_PASSCODE: "", WORKPROOF_SESSION_SECRET: "", SUPABASE_SECRET_KEY: "" });
await waitForServer(BARE);
const bareLogin = await (await fetch(`${BARE}/login`)).text();
check("missing config: login shows not-configured, no passcode field", /Sign-in isn(’|&#x27;|')t configured/.test(bareLogin) && !/name="passcode"/.test(bareLogin));
const bareDash = await get(BARE, "/dashboard", craftSessionCookie("", ""));
check("missing config: a crafted cookie still cannot open /dashboard", !PROTECTED.test(bareDash.body));
await sleep(500);
check("startup report lists the missing variables",
  /\[config\] WorkProof configuration problems/.test(bare.log) && bare.log.includes("WORKPROOF_OWNER_PASSCODE")
  && bare.log.includes("SUPABASE_SECRET_KEY is not set"));
check("startup report contains no secret values",
  [process.env.SUPABASE_SECRET_KEY, process.env.WORKPROOF_OWNER_PASSCODE, process.env.WORKPROOF_SESSION_SECRET]
    .every((value) => !value || !bare.log.includes(value)));
bare.kill();
browser.close();

// --- Browser bundles ----------------------------------------------------------------
const leaks = bundleFilesContaining([
  PASS, SECRET, process.env.SUPABASE_SECRET_KEY, process.env.WORKPROOF_OWNER_PASSCODE,
  process.env.WORKPROOF_SESSION_SECRET, "sb_secret_", "workproof-owner-session:v1",
]);
check("browser bundles contain no secrets or signing code", leaks.length === 0, leaks.map((f) => path.basename(f)).join(", "));

finish();
