import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, test } from "node:test";
import {
  contentHashOf,
  recordCommitmentOf,
  serializeCanonicalRecord,
  toCanonicalRecord,
  verifyCanonicalDocument,
  type CanonicalRecordInput,
} from "../../lib/anchoring/canonical";
import { evaluateVerification } from "../../lib/anchoring/verification";
import { readAnchorReadConfig, readAnchorWriteConfig } from "../../lib/server/anchor-config";

const INPUT: CanonicalRecordInput = {
  recordId: "0B9C6F3E-1F2A-4C3B-9D8E-123456789ABC",
  salt: "0123456789abcdef0123456789abcdef",
  title: "  Brand site  ",
  category: "Design",
  summary: "Line one\r\nLine two\rLine three",
  deliverables: [" Logo ", "", "Website"],
  periodStart: "2026-01-01",
  periodEnd: "2026-02-01",
  clientOrganization: "  ",
  confirmedAt: "2026-02-03T10:20:30.987654+02:00",
};

test("canonical document: normalized, sorted, compact, private fields excluded", () => {
  const record = toCanonicalRecord(INPUT);
  const json = serializeCanonicalRecord(record);
  assert.equal(
    json,
    '{"category":"Design","client_organization":null,"confirmed_at":"2026-02-03T08:20:30Z",' +
      '"deliverables":["Logo","Website"],"period_end":"2026-02-01","period_start":"2026-01-01",' +
      '"record_id":"0b9c6f3e-1f2a-4c3b-9d8e-123456789abc","salt":"0123456789abcdef0123456789abcdef",' +
      '"summary":"Line one\\nLine two\\nLine three","title":"Brand site","version":"workproof-record-v1"}',
  );
  for (const forbidden of ["email", "amount", "client_name", "note", "decided_by", "token"]) {
    assert.ok(!json.includes(forbidden), `must not contain ${forbidden}`);
  }
});

test("hashing is deterministic and equals sha256 of the document", () => {
  const a = toCanonicalRecord(INPUT);
  const b = toCanonicalRecord({ ...INPUT, deliverables: [...INPUT.deliverables] });
  assert.equal(contentHashOf(a), contentHashOf(b));
  const expected = `0x${createHash("sha256").update(serializeCanonicalRecord(a), "utf8").digest("hex")}`;
  assert.equal(contentHashOf(a), expected);
  assert.match(contentHashOf(a), /^0x[0-9a-f]{64}$/);
});

test("Unicode is NFC-normalized (composed and decomposed forms hash the same)", () => {
  const composed = toCanonicalRecord({ ...INPUT, title: "Café rebrand" });
  const decomposed = toCanonicalRecord({ ...INPUT, title: "Café rebrand" });
  assert.equal(contentHashOf(composed), contentHashOf(decomposed));
});

test("equivalent timestamps normalize to the same UTC second", () => {
  const variants = ["2026-02-03T08:20:30Z", "2026-02-03T08:20:30.999Z", "2026-02-03T10:20:30+02:00", "2026-02-03T08:20:30.123456+00:00"];
  const hashes = new Set(variants.map((confirmedAt) => contentHashOf(toCanonicalRecord({ ...INPUT, confirmedAt }))));
  assert.equal(hashes.size, 1);
});

test("changing any covered field changes the hash", () => {
  const base = contentHashOf(toCanonicalRecord(INPUT));
  const changes: Partial<CanonicalRecordInput>[] = [
    { title: "Brand site v2" }, { category: "Development" }, { summary: "Different" }, { deliverables: ["Logo"] },
    { periodStart: "2026-01-02" }, { periodEnd: "2026-02-02" }, { clientOrganization: "Acme" },
    { confirmedAt: "2026-02-03T08:20:31Z" }, { salt: "f".repeat(32) },
    { recordId: "1b9c6f3e-1f2a-4c3b-9d8e-123456789abc" },
  ];
  for (const change of changes) {
    assert.notEqual(contentHashOf(toCanonicalRecord({ ...INPUT, ...change })), base, JSON.stringify(change));
  }
});

test("record commitment depends on record ID and salt only", () => {
  const c = recordCommitmentOf(INPUT.recordId, INPUT.salt);
  assert.equal(c, recordCommitmentOf(INPUT.recordId.toLowerCase(), INPUT.salt));
  assert.notEqual(c, recordCommitmentOf(INPUT.recordId, "f".repeat(32)));
  assert.equal(
    c,
    `0x${createHash("sha256").update(`workproof-record-commitment-v1|${INPUT.recordId.toLowerCase()}|${INPUT.salt}`).digest("hex")}`,
  );
});

test("invalid canonical inputs are rejected", () => {
  for (const bad of [{ recordId: "not-a-uuid" }, { salt: "short" }, { salt: "G".repeat(32) }, { periodStart: "01/01/2026" }, { confirmedAt: "yesterday" }]) {
    assert.throws(() => toCanonicalRecord({ ...INPUT, ...bad }), /CanonicalRecordError|must|valid/, JSON.stringify(bad));
  }
});

test("verifying a supplied document: match, edit, reformat, wrong record, garbage", () => {
  const record = toCanonicalRecord(INPUT);
  const json = serializeCanonicalRecord(record);
  const expected = { contentHash: contentHashOf(record), recordCommitment: recordCommitmentOf(INPUT.recordId, INPUT.salt) };
  assert.equal(verifyCanonicalDocument(json, expected).status, "match");
  assert.equal(verifyCanonicalDocument(json.replace("Brand site", "Brand sites"), expected).status, "content_mismatch");
  assert.equal(verifyCanonicalDocument(JSON.stringify(record, null, 2), expected).status, "content_mismatch");
  const other = { ...expected, recordCommitment: recordCommitmentOf(INPUT.recordId, "f".repeat(32)) };
  assert.equal(verifyCanonicalDocument(json, other).status, "commitment_mismatch");
  for (const garbage of ["not json", "[]", '{"version":"workproof-record-v1"}', json.replace('"workproof-record-v1"', '"v2"')]) {
    assert.equal(verifyCanonicalDocument(garbage, expected).status, "invalid_document", garbage.slice(0, 30));
  }
});

test("verification verdicts", () => {
  const h = `0x${"a".repeat(64)}`;
  const other = `0x${"b".repeat(64)}`;
  const base = { anchorStatus: "confirmed" as const, storedContentHash: h, recomputedContentHash: h };
  assert.equal(evaluateVerification({ ...base, chain: { kind: "found", contentHash: h, anchoredAt: BigInt(1) } }), "verified");
  assert.equal(evaluateVerification({ ...base, chain: { kind: "found", contentHash: other, anchoredAt: BigInt(1) } }), "chain_mismatch");
  assert.equal(evaluateVerification({ ...base, recomputedContentHash: other, chain: { kind: "found", contentHash: h, anchoredAt: BigInt(1) } }), "modified");
  assert.equal(evaluateVerification({ ...base, chain: { kind: "not_found" } }), "not_on_chain");
  assert.equal(evaluateVerification({ ...base, chain: { kind: "unavailable" } }), "unverifiable_now");
  assert.equal(evaluateVerification({ ...base, anchorStatus: "submitted", chain: { kind: "not_found" } }), "in_progress");
  assert.equal(evaluateVerification({ ...base, anchorStatus: "failed", chain: { kind: "not_found" } }), "not_completed");
});

// --- Anchor configuration ------------------------------------------------------
const VARS = ["NODE_ENV", "MONAD_RPC_URL", "MONAD_CHAIN_ID", "WORKPROOF_ANCHOR_CONTRACT_ADDRESS", "WORKPROOF_ANCHOR_PRIVATE_KEY", "MONAD_EXPLORER_URL", "WORKPROOF_ALLOW_LOCAL_CHAIN"];
const env = process.env as Record<string, string | undefined>;
let saved: Record<string, string | undefined> = {};
beforeEach(() => { saved = Object.fromEntries(VARS.map((v) => [v, env[v]])); });
afterEach(() => { for (const v of VARS) { if (saved[v] === undefined) delete env[v]; else env[v] = saved[v]; } });
function setEnv(values: Record<string, string>) {
  for (const v of VARS) delete env[v];
  Object.assign(env, values);
}
// Synthetic values only (well-known Hardhat test key, never funded on any real network).
const TEST_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const GOOD = {
  NODE_ENV: "production",
  MONAD_RPC_URL: "https://testnet-rpc.monad.xyz",
  MONAD_CHAIN_ID: "10143",
  WORKPROOF_ANCHOR_CONTRACT_ADDRESS: `0x${"AB".repeat(20)}`,
  WORKPROOF_ANCHOR_PRIVATE_KEY: TEST_KEY,
};

test("anchor config: off when unset; full config parsed; explorer defaults to Monadscan testnet", () => {
  setEnv({ NODE_ENV: "production" });
  assert.equal(readAnchorReadConfig(), null);
  assert.equal(readAnchorWriteConfig(), null);
  setEnv(GOOD);
  const config = readAnchorWriteConfig();
  assert.ok(config);
  assert.equal(config.chainId, 10143);
  assert.equal(config.contractAddress, `0x${"ab".repeat(20)}`);
  assert.equal(config.explorerUrl, "https://testnet.monadscan.com");
  const { WORKPROOF_ANCHOR_PRIVATE_KEY: _omit, ...readOnly } = GOOD;
  void _omit;
  setEnv(readOnly);
  assert.ok(readAnchorReadConfig(), "verification works without a signing key");
  assert.equal(readAnchorWriteConfig(), null, "but anchoring is disabled");
});

test("anchor config: refuses mainnet, wrong chains, insecure RPC, malformed values", () => {
  const bad: Record<string, string>[] = [
    { ...GOOD, MONAD_CHAIN_ID: "143" },
    { ...GOOD, MONAD_CHAIN_ID: "1" },
    { ...GOOD, MONAD_CHAIN_ID: "31337" }, // local chain not allowed in production
    { ...GOOD, MONAD_RPC_URL: "http://testnet-rpc.monad.xyz" },
    { ...GOOD, MONAD_RPC_URL: "http://localhost:8545" }, // production
    { ...GOOD, MONAD_RPC_URL: "https://user:pass@rpc.example" },
    { ...GOOD, WORKPROOF_ANCHOR_CONTRACT_ADDRESS: "0x1234" },
    { ...GOOD, MONAD_EXPLORER_URL: "http://explorer.example" },
    { NODE_ENV: "production", MONAD_RPC_URL: GOOD.MONAD_RPC_URL }, // partial
  ];
  for (const values of bad) {
    setEnv(values);
    assert.throws(readAnchorReadConfig, (e: Error) => e.name === "AnchorConfigError", JSON.stringify(values));
  }
  setEnv({ ...GOOD, WORKPROOF_ANCHOR_PRIVATE_KEY: "not-a-key" });
  assert.throws(readAnchorWriteConfig, (e: Error) => e.name === "AnchorConfigError" && !e.message.includes("not-a-key"));
});

test("anchor config: local Hardhat chain only in development or with the explicit test opt-in", () => {
  const local = { ...GOOD, MONAD_CHAIN_ID: "31337", MONAD_RPC_URL: "http://127.0.0.1:8545" };
  setEnv({ ...local, NODE_ENV: "development" });
  assert.equal(readAnchorReadConfig()?.chainId, 31337);
  assert.equal(readAnchorReadConfig()?.explorerUrl, null);
  setEnv(local);
  assert.throws(readAnchorReadConfig, (e: Error) => e.name === "AnchorConfigError", "refused in production by default");
  setEnv({ ...local, WORKPROOF_ALLOW_LOCAL_CHAIN: "true" });
  assert.equal(readAnchorReadConfig()?.chainId, 31337, "explicit test opt-in");
  setEnv({ ...GOOD, MONAD_CHAIN_ID: "143", WORKPROOF_ALLOW_LOCAL_CHAIN: "true" });
  assert.throws(readAnchorReadConfig, /mainnet/, "mainnet stays refused");
});
