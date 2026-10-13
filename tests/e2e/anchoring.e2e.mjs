// Full-stack anchoring against a throwaway local Hardhat chain (31337) and the
// Supabase project in .env.local. Requires migration 20261013120000 applied,
// `npm run build`, and `cd chain && npm install && npx hardhat build`.
// Run: WORKPROOF_E2E_ALLOW_WRITES=1 npm run test:e2e:anchoring
// Uses Hardhat's public development key (local only). No testnet, no real funds:
// the app server is started with local-chain overrides, and the suite fails if
// the real app signer's Monad testnet nonce changes during the run.
// Cleanup (Supabase SQL Editor) — anchors first, because record_anchors uses
// ON DELETE RESTRICT; confirmation_requests rows cascade with their records:
//   delete from public.record_anchors where record_id in
//     (select id from public.work_records where title like '[E2E TEST]%');
//   delete from public.work_records where title like '[E2E TEST]%';
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  actionStatus, bundleFilesContaining, check, COOKIE, finish, launchBrowser, projectDir,
  replayAction, requireOptIn, sleep, startServer, testSecrets, waitForServer,
} from "./harness.mjs";

requireOptIn("anchoring e2e");
process.loadEnvFile(path.join(projectDir, ".env.local"));
const require = createRequire(path.join(projectDir, "package.json"));
const { createClient } = require("@supabase/supabase-js");
const viem = require("viem");
const { privateKeyToAccount } = require("viem/accounts");

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const probe = await db.from("record_anchors").select("record_id").limit(1);
if (probe.error) {
  console.error(`anchoring e2e: record_anchors is not available (${probe.error.code}). Apply migration 20261013120000 first.`);
  process.exit(2);
}

const RPC = "http://127.0.0.1:8545";
// Safety: the real app signer (from .env.local) must not transact on Monad testnet.
const REAL_SIGNER_KEY = process.env.WORKPROOF_ANCHOR_PRIVATE_KEY ?? null;
const testnet = viem.createPublicClient({ transport: viem.http("https://testnet-rpc.monad.xyz") });
const realSigner = REAL_SIGNER_KEY ? privateKeyToAccount(REAL_SIGNER_KEY).address : null;
const testnetNonceBefore = realSigner ? await testnet.getTransactionCount({ address: realSigner }) : null;
const PORT = 3127;
const BASE = `http://localhost:${PORT}`;
const ANCHORER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"; // Hardhat dev account #0
const { pass: PASS, secret: SECRET } = testSecrets();
const RUN = randomBytes(3).toString("hex");
const TITLE = (n) => `[E2E TEST] Anchor ${n} ${RUN}`;
const EMAIL = (n) => `e2e-anchor-${n.toLowerCase()}-${RUN}@example.com`;
const sha256 = (s) => `0x${createHash("sha256").update(s, "utf8").digest("hex")}`;

// --- Local chain + contract -------------------------------------------------------
const node = spawn(process.execPath, ["node_modules/hardhat/dist/src/cli.js", "node", "--port", "8545"], { cwd: path.join(projectDir, "chain"), stdio: "ignore" });
const chainDef = { id: 31337, name: "Hardhat", nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } };
const chainClient = viem.createPublicClient({ chain: chainDef, transport: viem.http(RPC) });
for (let i = 0; i < 120; i++) {
  try { await chainClient.getChainId(); break; } catch { await sleep(250); }
}
const artifact = JSON.parse(readFileSync(path.join(projectDir, "chain/artifacts/contracts/WorkProofAnchor.sol/WorkProofAnchor.json"), "utf8"));
const anchorer = privateKeyToAccount(ANCHORER_KEY);
const wallet = viem.createWalletClient({ account: anchorer, chain: chainDef, transport: viem.http(RPC) });
const deployHash = await wallet.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode, args: [anchorer.address] });
const CONTRACT = (await chainClient.waitForTransactionReceipt({ hash: deployHash })).contractAddress.toLowerCase();
const nonce = () => chainClient.getTransactionCount({ address: anchorer.address });

// --- App ------------------------------------------------------------------------------
const serverEnv = {
  WORKPROOF_OWNER_PASSCODE: PASS, WORKPROOF_SESSION_SECRET: SECRET, WORKPROOF_APP_URL: BASE,
  MONAD_RPC_URL: RPC, MONAD_CHAIN_ID: "31337", WORKPROOF_ANCHOR_CONTRACT_ADDRESS: CONTRACT,
  WORKPROOF_ANCHOR_PRIVATE_KEY: ANCHORER_KEY, WORKPROOF_ALLOW_LOCAL_CHAIN: "true", MONAD_EXPLORER_URL: "",
};
// Explicit process env wins over .env.local in Next.js, so these keep the app on the local chain.
if (serverEnv.MONAD_CHAIN_ID !== "31337" || !serverEnv.MONAD_RPC_URL.startsWith("http://127.0.0.1:") || serverEnv.WORKPROOF_ANCHOR_PRIVATE_KEY === REAL_SIGNER_KEY) {
  console.error("anchoring e2e: refusing to start; the app would not be isolated to the local chain.");
  node.kill();
  process.exit(2);
}
const server = startServer(PORT, serverEnv);
await waitForServer(BASE);
const b = await launchBrowser(9335);

async function signIn() {
  await b.go(`${BASE}/login`);
  await b.hydrated("#passcode");
  await b.setValue("#passcode", PASS);
  await b.clickButton("Sign in");
  return b.waitFor(`location.pathname === "/dashboard"`);
}
async function createRecord(name) {
  await b.go(`${BASE}/records/new`);
  await b.hydrated("#title");
  for (const [selector, value] of Object.entries({
    "#title": TITLE(name), "#category": "Design", "#startDate": "2026-07-01", "#endDate": "2026-08-15",
    "#summary": `Synthetic anchoring test ${name}. Delivered a brand system.`, "#deliverables": "Logo\nGuidelines",
    "#clientName": `Client ${name}`, "#clientOrganization": "Example Org", "#clientEmail": EMAIL(name), "#amount": "2500", "#currency": "USD",
  })) await b.setValue(selector, value);
  await b.clickButton("Create record");
  await b.waitFor(`/^\\/records\\/[0-9a-f-]{36}$/.test(location.pathname)`, 20000);
  return (await b.evaluate("location.pathname")).split("/").pop();
}
async function issueLink(id) {
  await b.go(`${BASE}/records/${id}`);
  await b.hydrated("button");
  await b.clickButton("Generate confirmation link");
  await b.waitFor(`document.body.innerText.includes("Your confirmation link is ready")`, 20000);
  return b.evaluate(`document.querySelector("input[readonly]").value`);
}
async function respond(url, kind) {
  await b.go(url);
  await b.hydrated("#responder-name");
  if (kind === "dispute") {
    await b.clickButton("Something's not right");
    await b.waitFor(`!!document.querySelector("#dispute-reason")`);
    await b.setValue("#responder-name", "Synthetic Client");
    await b.setValue("#dispute-reason", "The delivery dates are not accurate.");
    await b.clickButton("Submit dispute");
    return b.waitFor(`document.body.innerText.includes("Your dispute has been recorded")`, 20000);
  }
  await b.setValue("#responder-name", "Synthetic Client");
  await b.evaluate(`document.querySelector("#acknowledge").click()`);
  await b.clickButton("Confirm work");
  return b.waitFor(`document.body.innerText.includes("Your confirmation has been recorded")`, 20000);
}
const anchorRow = async (id) => (await db.from("record_anchors").select("*").eq("record_id", id).maybeSingle()).data;

check("owner signs in", await signIn());
const alpha = await createRecord("Alpha");
check("alpha confirmed by the client", await respond(await issueLink(alpha), "confirm"));
const draft = await createRecord("Draft");
const disputed = await createRecord("Disputed");
check("disputed record disputed by the client", await respond(await issueLink(disputed), "dispute"));

// Ineligible records: the panel says so and the server refuses.
await b.go(`${BASE}/records/${draft}`);
check("draft record: panel explains only confirmed records can be anchored",
  await b.waitFor(`document.body.innerText.includes("Only client-confirmed records can be anchored")`));

// --- Anchor alpha through the UI ---------------------------------------------------
await b.go(`${BASE}/records/${alpha}`);
await b.hydrated("button");
const nonceBefore = await nonce();
check("confirmed record offers anchoring", await b.clickButton("Anchor to Monad testnet"));
check("UI reports anchored only after the receipt", await b.waitFor(`document.body.innerText.includes("Anchored on Monad testnet")`, 30000));
const anchorRequest = await b.captureLastAction();
const row = await anchorRow(alpha);
check("DB: anchor confirmed with tx hash, chain, contract, block",
  row?.status === "confirmed" && /^0x[0-9a-f]{64}$/.test(row.tx_hash) && row.chain_id === 31337 && row.contract_address === CONTRACT && row.block_number !== null);
const receipt = await chainClient.getTransactionReceipt({ hash: row.tx_hash });
check("chain: the stored tx succeeded", receipt.status === "success");
const [onChainHash] = await chainClient.readContract({ address: CONTRACT, abi: artifact.abi, functionName: "getAnchor", args: [row.record_commitment] });
check("chain: getAnchor(commitment) returns the stored content hash", onChainHash === row.content_hash);
check("exactly one transaction was sent", (await nonce()) === nonceBefore + 1);

const cookie = (await b.cookie(BASE))?.value;
const again = await replayAction(anchorRequest, { base: BASE, cookie });
check("repeat anchor request: reported anchored, no second transaction", /"kind":"anchored"/.test(again) && (await nonce()) === nonceBefore + 1);
const anon = await replayAction(anchorRequest, { base: BASE });
check("anchor request without a session is refused", /session has ended/.test(anon) && (await nonce()) === nonceBefore + 1);
for (const [label, id] of [["draft", draft], ["disputed", disputed]]) {
  const res = await replayAction(anchorRequest, { base: BASE, cookie, transform: (x) => x.split(alpha).join(id) });
  check(`${label} record cannot be anchored (server-side)`, /"kind":"ineligible"/.test(res) && !(await anchorRow(id)));
}
check("still exactly one transaction", (await nonce()) === nonceBefore + 1);
check("action responses never echo the private key", ![again, anon].some((t) => t.includes(ANCHORER_KEY.slice(2))));
void actionStatus;

// --- Public verification page ---------------------------------------------------------
const verifyUrl = await b.evaluate(`[...document.querySelectorAll("input[readonly]")].map(i => i.value).find(v => v.includes("/verify/"))`);
check("owner gets a verification link", typeof verifyUrl === "string" && verifyUrl.startsWith(`${BASE}/verify/`));
const verifyHtml = await (await fetch(verifyUrl)).text();
check("verify page (no session) reports Verified", /Verified: this record matches/.test(verifyHtml));
check("verify page hides client name, email, and amount",
  !verifyHtml.includes(EMAIL("Alpha")) && !verifyHtml.includes("Client Alpha") && !/2,?500/.test(verifyHtml));
check("verify page distinguishes confirmation, integrity, and payment", /Not proven:/.test(verifyHtml) && /payment was made/.test(verifyHtml));
await b.go(verifyUrl);
await b.hydrated("pre");
const documentJson = await b.evaluate(`document.querySelector("pre").textContent`);
check("published document hashes to the on-chain content hash", sha256(documentJson) === onChainHash);
check("published commitment recomputes from record_id and salt", (() => {
  const doc = JSON.parse(documentJson);
  return sha256(`workproof-record-commitment-v1|${doc.record_id}|${doc.salt}`) === row.record_commitment;
})());
await b.setValue("textarea", documentJson);
await b.clickButton("Check document");
check("in-browser checker: original document matches", await b.waitFor(`document.body.innerText.includes("Matches the anchored fingerprint exactly")`));
await b.setValue("textarea", documentJson.replace("Delivered a brand system", "Delivered a brand system and a website"));
await b.clickButton("Check document");
check("in-browser checker: modified document is flagged", await b.waitFor(`document.body.innerText.includes("differs from the anchored version")`));
const bogus = await fetch(`${BASE}/verify/${"0".repeat(32)}`).then((r) => r.text());
check("unknown verification key shows the invalid-link page", /verification link isn(’|&#x27;|')t valid/.test(bogus));

// --- Chain unavailable: nothing marked, other flows keep working ---------------------
const gamma = await createRecord("Gamma");
check("gamma confirmed by the client", await respond(await issueLink(gamma), "confirm"));
node.kill();
await sleep(1000);
await b.go(`${BASE}/records/${gamma}`);
await b.hydrated("button");
await b.clickButton("Anchor to Monad testnet");
check("chain down: clear error, nothing claimed", await b.waitFor(`document.body.innerText.includes("couldn't be reached")`, 30000));
const gammaRow = await anchorRow(gamma);
check("chain down: anchor row not submitted or confirmed", !gammaRow || gammaRow.status === "preparing");
const stillWorks = await createRecord("Delta");
check("chain down: record creation still works", !!stillWorks);
const verifyDown = await (await fetch(verifyUrl)).text();
check("chain down: verify page says it can't check right now", /couldn(’|&#x27;|')t be checked right now/.test(verifyDown));

check("no uncaught browser errors", b.pageErrors.length === 0, b.pageErrors.join(" | ").slice(0, 300));
check("server log never contains the anchoring keys or session secrets",
  !server.log.includes(ANCHORER_KEY.slice(2)) && !server.log.includes(PASS) && !server.log.includes(SECRET)
  && (!REAL_SIGNER_KEY || !server.log.includes(REAL_SIGNER_KEY.slice(2))));
if (realSigner) {
  check("no Monad testnet transaction from the real app signer during this run",
    (await testnet.getTransactionCount({ address: realSigner })) === testnetNonceBefore);
}
b.close();
server.kill();
const leaks = bundleFilesContaining([ANCHORER_KEY.slice(2), REAL_SIGNER_KEY?.slice(2), "WORKPROOF_ANCHOR_PRIVATE_KEY", "privateKeyToAccount"]);
check("browser bundles contain no signing key or signing code", leaks.length === 0, leaks.map((f) => path.basename(f)).join(", "));

console.log(`\nSynthetic rows created: ${["Alpha", "Draft", "Disputed", "Gamma", "Delta"].map(TITLE).join(", ")}`);
finish();
