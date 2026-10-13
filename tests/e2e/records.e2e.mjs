// Records, confirmation links, and client decisions against the real Supabase
// project in .env.local. Creates synthetic rows titled "[E2E TEST] <name> <run>".
// Run: npm run build && WORKPROOF_E2E_ALLOW_WRITES=1 npm run test:e2e:records
// Cleanup (Supabase SQL Editor): delete from public.work_records where title like '[E2E TEST]%';
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import {
  actionStatus, bundleFilesContaining, check, COOKIE, craftSessionCookie, finish, launchBrowser,
  projectDir, replayAction, requireOptIn, startServer, testSecrets, waitForServer,
} from "./harness.mjs";

requireOptIn("records e2e");
process.loadEnvFile(path.join(projectDir, ".env.local"));
const require = createRequire(path.join(projectDir, "package.json"));
const { createClient } = require("@supabase/supabase-js");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const PORT = 3124;
const BASE = `http://localhost:${PORT}`;
const { pass: PASS, secret: SECRET } = testSecrets();
const RUN = randomBytes(3).toString("hex");
const TITLE = (n) => `[E2E TEST] ${n} ${RUN}`;
const EMAIL = (n) => `e2e-${n.toLowerCase()}-${RUN}@example.com`;
const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const INVALID_PAGE = /isn(’|&#x27;|')t valid/;

async function getHtml(base, p, cookie) {
  const res = await fetch(base + p, { headers: cookie ? { cookie: `${COOKIE}=${cookie}` } : {}, redirect: "manual" });
  return { status: res.status, body: await res.text() };
}
async function recordByTitle(title) {
  const { data, error } = await db.from("work_records").select("*, confirmation_requests(*)").eq("title", title).maybeSingle();
  if (error) throw new Error(`db read failed: ${error.code}`);
  return data;
}
const rowCount = async () => (await db.from("work_records").select("id", { count: "exact", head: true })).count;

const env = {
  WORKPROOF_OWNER_PASSCODE: PASS, WORKPROOF_SESSION_SECRET: SECRET, WORKPROOF_SESSION_TTL_MINUTES: "30",
  WORKPROOF_APP_URL: BASE, WORKPROOF_OWNER_NAME: "Test Owner",
};
const server = startServer(PORT, env);
await waitForServer(BASE);
const b = await launchBrowser();

async function signIn() {
  await b.go(`${BASE}/login`);
  await b.hydrated("#passcode");
  await b.setValue("#passcode", PASS);
  await b.clickButton("Sign in");
  return b.waitFor(`location.pathname === "/dashboard"`);
}
async function signOut() {
  await b.hydrated("form button");
  await b.clickButton("Sign out");
  return b.waitFor(`location.pathname === "/login"`);
}
async function createViaForm(name, extra = {}) {
  await b.go(`${BASE}/records/new`);
  await b.hydrated("#title");
  const fields = {
    "#title": TITLE(name), "#category": "Development", "#startDate": "2026-08-01", "#endDate": "2026-09-15",
    "#summary": `Synthetic end-to-end test record ${name}. Built and delivered a reporting dashboard.`,
    "#deliverables": "Dashboard\nDocumentation", "#clientName": `Client ${name}`, "#clientOrganization": "Example Org",
    "#clientEmail": EMAIL(name), ...extra,
  };
  for (const [selector, value] of Object.entries(fields)) await b.setValue(selector, value);
  await b.clickButton("Create record");
  const ok = await b.waitFor(`/^\\/records\\/[0-9a-f-]{36}$/.test(location.pathname)`, 20000);
  return ok ? (await b.evaluate("location.pathname")).split("/").pop() : null;
}
async function issueLink() {
  const clicked = (await b.clickButton("Generate confirmation link")) || (await b.clickButton("Generate a new link"));
  if (!clicked) return null;
  // Replacing an active link asks for confirmation first.
  if (await b.waitFor(`[...document.querySelectorAll("button")].some(x => x.textContent.trim() === "Replace link")`, 1500)) {
    await b.clickButton("Replace link");
  }
  const ok = await b.waitFor(`document.body.innerText.includes("Your confirmation link is ready")`, 20000);
  return ok ? b.evaluate(`document.querySelector("input[readonly]").value`) : null;
}
const tokenOf = (url) => url?.split("/confirm/")[1] ?? "";

// 1. Signed out --------------------------------------------------------------------
for (const p of ["/dashboard", "/records/new", `/records/${randomUUID()}`]) {
  const r = await getHtml(BASE, p);
  check(`signed out: ${p.replace(/[0-9a-f-]{36}/, "<uuid>")} has no owner content`, !/Work records|New work record|Private details<\/h2>|Total records/.test(r.body));
}

// 2. Create (real persistence + server validation) ----------------------------------
check("owner signs in", await signIn());
const alphaId = await createViaForm("Alpha", { "#amount": "1234.50", "#currency": "EUR" });
check("create redirects to the saved record", !!alphaId);
const alpha = await recordByTitle(TITLE("Alpha"));
check("record persisted as draft", alpha?.id === alphaId && alpha.status === "draft");
check("values normalized and stored", alpha && Number(alpha.amount) === 1234.5 && alpha.currency === "EUR"
  && alpha.deliverables.length === 2 && alpha.client_email === EMAIL("Alpha") && alpha.client_organization === "Example Org");
check("detail page shows the saved record", await b.waitFor(`document.body.innerText.includes(${JSON.stringify(TITLE("Alpha"))}) && document.body.innerText.includes("Draft")`));
const createReq = await b.captureLastAction();
const ownerCookie = (await b.cookie(BASE))?.value;

const countBefore = await rowCount();
check("server rejects a tampered invalid email",
  actionStatus(await replayAction(createReq, { base: BASE, cookie: ownerCookie, transform: (x) => x.split(EMAIL("Alpha")).join("not-an-email") })) === "invalid");
check("server rejects a category outside the allowed list",
  actionStatus(await replayAction(createReq, { base: BASE, cookie: ownerCookie, transform: (x) => x.split("Development").join("Hacking") })) === "invalid");
check("create without a session is rejected", actionStatus(await replayAction(createReq, { base: BASE })) === "unauthorized");
check("rejected calls wrote nothing", (await rowCount()) === countBefore);

await b.go(`${BASE}/records/new`);
await b.hydrated("#title");
await b.clickButton("Create record");
check("empty form shows the error summary", await b.waitFor(`document.body.innerText.includes("to continue")`));

// 3. Dashboard ------------------------------------------------------------------------
await b.go(`${BASE}/dashboard`);
check("dashboard lists the real record", await b.waitFor(`document.body.innerText.includes(${JSON.stringify(TITLE("Alpha"))})`));
check("dashboard payload omits client emails", !(await getHtml(BASE, "/dashboard", ownerCookie)).body.includes(EMAIL("Alpha")));

// 4. Confirmation links ------------------------------------------------------------------
await b.go(`${BASE}/records/${alphaId}`);
await b.hydrated("button");
const url1 = await issueLink();
const token1 = tokenOf(url1);
check("link uses WORKPROOF_APP_URL and a 43-char token", !!url1 && url1.startsWith(`${BASE}/confirm/`) && /^[A-Za-z0-9_-]{43}$/.test(token1));
const issueReq = await b.captureLastAction();
let alphaRow = await recordByTitle(TITLE("Alpha"));
check("record moved to pending", alphaRow.status === "pending");
check("only the token hash is stored", alphaRow.confirmation_requests.length === 1
  && alphaRow.confirmation_requests[0].token_hash === sha256(token1) && !JSON.stringify(alphaRow).includes(token1));
check("issue without a session is rejected", actionStatus(await replayAction(issueReq, { base: BASE })) === "unauthorized");
check("unauthorized issue changed nothing", (await recordByTitle(TITLE("Alpha"))).confirmation_requests.length === 1);

await b.go(`${BASE}/records/${alphaId}`);
await b.hydrated("button");
check("an existing link is never displayed again", await b.waitFor(`/can.t be displayed again/.test(document.body.innerText)`));
const token2 = tokenOf(await issueLink());
check("replacement link issued", token2.length === 43 && token2 !== token1);
check("replaced link no longer works", INVALID_PAGE.test((await getHtml(BASE, `/confirm/${token1}`)).body));
alphaRow = await recordByTitle(TITLE("Alpha"));
check("exactly one open link after replacement", alphaRow.confirmation_requests.filter((r) => !r.consumed_at).length === 1);

const betaId = await createViaForm("Beta");
await b.go(`${BASE}/records/${betaId}`);
await b.hydrated("button");
const betaToken = tokenOf(await issueLink());
const gammaId = await createViaForm("Gamma");
await b.go(`${BASE}/records/${gammaId}`);
await b.hydrated("button");
const gammaToken = tokenOf(await issueLink());
check("beta and gamma links issued", betaToken.length === 43 && gammaToken.length === 43);

// 5. Client flow (signed out) ---------------------------------------------------------
check("owner signs out", await signOut());
const clientHtml = await getHtml(BASE, `/confirm/${token2}`);
check("client page loads without an owner session", clientHtml.status === 200 && clientHtml.body.includes(TITLE("Alpha")));
check("client page hides the client email, record ID, and token hash",
  !clientHtml.body.includes(EMAIL("Alpha")) && !clientHtml.body.includes(alphaId) && !clientHtml.body.includes(sha256(token2)));
check("client token cannot see other records", !clientHtml.body.includes(TITLE("Beta")) && !clientHtml.body.includes(TITLE("Gamma")));
check("client page says confirmation doesn't prove payment", /does not confirm or prove that payment was made/.test(clientHtml.body));

await b.go(`${BASE}/confirm/${token2}`);
await b.hydrated("#responder-name");
await b.setValue("#responder-name", "Synthetic Client");
await b.clickButton("Confirm work");
check("unticked acknowledgement is rejected", await b.waitFor(`!!document.querySelector("#acknowledge-error")`));
await b.evaluate(`document.querySelector("#acknowledge").click()`);
await b.clickButton("Confirm work");
check("confirmation recorded", await b.waitFor(`document.body.innerText.includes("Your confirmation has been recorded")`, 20000));
const decisionReq = await b.captureLastAction();
alphaRow = await recordByTitle(TITLE("Alpha"));
check("DB: confirmed with decided_by/decided_at and the link consumed", alphaRow.status === "confirmed"
  && alphaRow.decided_by_name === "Synthetic Client" && !!alphaRow.decided_at
  && alphaRow.confirmation_requests.some((r) => r.token_hash === sha256(token2) && r.consumed_at));
check("re-submitting returns already_used", actionStatus(await replayAction(decisionReq, { base: BASE })) === "already_used");
const flip = await replayAction(decisionReq, {
  base: BASE,
  transform: (x) => x.split('"confirmed"').join('"disputed"').split('"reason":""').join('"reason":"Trying to change the answer later"'),
});
check("a conflicting later decision is refused", ["already_used", "not_pending"].includes(actionStatus(flip)));
check("decision unchanged in DB", (await recordByTitle(TITLE("Alpha"))).status === "confirmed");
await b.go(`${BASE}/confirm/${token2}`);
check("a used link shows 'already answered'", await b.waitFor(`document.body.innerText.includes("already been answered")`));

await b.go(`${BASE}/confirm/${betaToken}`);
await b.hydrated("#responder-name");
await b.clickButton("Something's not right");
await b.waitFor(`!!document.querySelector("#dispute-reason")`);
await b.setValue("#responder-name", "Synthetic Client B");
await b.setValue("#dispute-reason", "short");
await b.clickButton("Submit dispute");
check("a dispute needs a 10+ character reason", await b.waitFor(`!!document.querySelector("#dispute-reason-error")`));
await b.setValue("#dispute-reason", "The project ended in October, not September.");
await b.clickButton("Submit dispute");
check("dispute recorded", await b.waitFor(`document.body.innerText.includes("Your dispute has been recorded")`, 20000));
const beta = await recordByTitle(TITLE("Beta"));
check("DB: disputed with the reason stored", beta.status === "disputed" && beta.decision_note === "The project ended in October, not September.");
check("a used dispute link does not re-display the dispute reason", !(await getHtml(BASE, `/confirm/${betaToken}`)).body.includes("ended in October"));

const race = (n) => replayAction(decisionReq, {
  base: BASE,
  transform: (x) => x.split(token2).join(gammaToken).split('"Synthetic Client"').join(`"Racer ${n}"`),
});
const statuses = (await Promise.all([race("A"), race("B"), race("C")])).map(actionStatus);
check("concurrent submissions: exactly one recorded", statuses.filter((s) => s === "recorded").length === 1, statuses.join(", "));
check("concurrent submissions: the rest refused", statuses.filter((s) => s === "already_used" || s === "not_pending").length === 2);
const gamma = await recordByTitle(TITLE("Gamma"));
check("DB: one decision and one consumed link", gamma.status === "confirmed" && gamma.confirmation_requests.filter((r) => r.consumed_at).length === 1);

for (const t of [randomBytes(32).toString("base64url"), "short", "../../etc"]) {
  const r = await getHtml(BASE, `/confirm/${encodeURIComponent(t)}`);
  check(`unknown token "${t.slice(0, 8)}…" shows the invalid-link page`, INVALID_PAGE.test(r.body) && !r.body.includes("[E2E TEST]"));
}
check("decision with an unknown token returns invalid",
  actionStatus(await replayAction(decisionReq, { base: BASE, transform: (x) => x.split(token2).join(randomBytes(32).toString("base64url")) })) === "invalid");

// 6. Owner-only reads ----------------------------------------------------------------
for (const p of ["/dashboard", `/records/${alphaId}`]) {
  const r = await getHtml(BASE, p);
  check(`signed out: record data hidden at ${p.replace(alphaId, "<alpha-id>")}`, !r.body.includes(TITLE("Alpha")) && !r.body.includes(EMAIL("Alpha")));
}
const ownerView = await getHtml(BASE, `/records/${alphaId}`, craftSessionCookie(SECRET, PASS));
check("signed in: owner sees the confirmed record", ownerView.body.includes(TITLE("Alpha")) && ownerView.body.includes("Synthetic Client"));

// 7. Database failure: generic errors, no internals ------------------------------------
const BROKEN = `http://localhost:${PORT + 1}`;
const broken = startServer(PORT + 1, { ...env, WORKPROOF_APP_URL: BROKEN, SUPABASE_SECRET_KEY: `sb_secret_${"x".repeat(32)}` });
await waitForServer(BROKEN);
const brokenCookie = craftSessionCookie(SECRET, PASS);
await b.send("Network.setCookie", { name: COOKIE, value: brokenCookie, url: BROKEN, path: "/", secure: true, httpOnly: true, sameSite: "Lax" });
const errorsBefore = b.pageErrors.length;
const INTERNALS = /PGRST|Invalid API key|JWT|supabase\.co|42501|DataAccessError|stack/i;
await b.go(`${BROKEN}/dashboard`);
check("DB failure: dashboard shows the error state", await b.waitFor(`document.body.innerText.includes("Something went wrong") && !!document.querySelector("button")`, 20000));
check("DB failure: no internals on the dashboard", !INTERNALS.test(await b.bodyText()));
await b.go(`${BROKEN}/confirm/${randomBytes(32).toString("base64url")}`);
check("DB failure: confirm page shows the error state", await b.waitFor(`document.body.innerText.includes("Something went wrong")`, 20000));
check("DB failure: no internals on the confirm page", !INTERNALS.test(await b.bodyText()));
const brokenCreate = await replayAction(createReq, { base: BROKEN, cookie: brokenCookie });
check("DB failure: create returns a generic error", actionStatus(brokenCreate) === "error");
check("DB failure: action response has no internals", !/PGRST|Invalid API key|JWT|supabase\.co/.test(brokenCreate));
check("DB failure: server log is safe", !broken.log.includes(EMAIL("Alpha")) && !broken.log.includes(process.env.SUPABASE_SECRET_KEY)
  && /Could not create record: Database operation "createWorkRecord" failed/.test(broken.log));
broken.kill();
b.pageErrors.splice(errorsBefore); // errors thrown on purpose by the broken server

check("no uncaught browser errors", b.pageErrors.length === 0, b.pageErrors.join(" | ").slice(0, 300));
check("server log never contains tokens, passcode, or secrets",
  ![token1, token2, betaToken, gammaToken].some((t) => t && server.log.includes(t))
  && !server.log.includes(PASS) && !server.log.includes(process.env.SUPABASE_SECRET_KEY));
b.close();
server.kill();

const leaks = bundleFilesContaining([
  process.env.SUPABASE_SECRET_KEY, "sb_secret_", "SUPABASE_SECRET_KEY", "issue_confirmation_request",
  "submit_confirmation_decision", "service_role", PASS, SECRET,
]);
check("browser bundles contain no secret key, DB function names, or test secrets", leaks.length === 0, leaks.map((f) => path.basename(f)).join(", "));

console.log(`\nSynthetic rows created: ${TITLE("Alpha")}, ${TITLE("Beta")}, ${TITLE("Gamma")}`);
finish();
