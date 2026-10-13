import assert from "node:assert/strict";
import { test } from "node:test";
import type { Hex } from "viem";
import {
  createAnchorService,
  type AnchorableRecord,
  type AnchorRow,
  type AnchorStore,
} from "../../lib/server/anchoring";
import type { AnchorChainWriter, AnchorReceipt, OnChainAnchor, SubmitResult } from "../../lib/server/chain";

const RECORD_ID = "0b9c6f3e-1f2a-4c3b-9d8e-123456789abc";
const TX = `0x${"1".repeat(64)}` as Hex;
const OTHER_TX = `0x${"2".repeat(64)}` as Hex;
const CONTRACT = `0x${"c".repeat(40)}` as Hex;

function confirmedRecord(overrides: Partial<AnchorableRecord["input"]> = {}, status = "confirmed"): AnchorableRecord {
  return {
    status,
    input: {
      recordId: RECORD_ID, title: "Brand site", category: "Design", summary: "Built a site.", deliverables: ["Site"],
      periodStart: "2026-01-01", periodEnd: "2026-02-01", clientOrganization: "Acme",
      confirmedAt: status === "confirmed" ? "2026-02-03T08:20:30Z" : null, ...overrides,
    },
  };
}

/** In-memory store mirroring the SQL state machine. */
function fakeStore(record: AnchorableRecord | null) {
  let row: AnchorRow | null = null;
  const calls: string[] = [];
  const store: AnchorStore & { calls: string[]; row: () => AnchorRow | null; setRecord: (r: AnchorableRecord) => void } = {
    calls,
    row: () => row,
    setRecord: (r) => { record = r; },
    async loadRecord() { return record; },
    async loadAnchor() { return row ? { ...row } : null; },
    async begin(_id, values) {
      calls.push("begin");
      if (!record) return "not_found";
      if (record.status !== "confirmed") return "not_confirmed";
      if (row) return "exists";
      row = { status: "preparing", salt: values.salt, recordCommitment: values.recordCommitment, contentHash: values.contentHash,
        txHash: null, chainId: null, contractAddress: null, blockNumber: null, failureCode: null };
      return "created";
    },
    async markSubmitted(_id, tx) {
      calls.push(`markSubmitted:${tx.txHash}`);
      if (!row || (row.status !== "preparing" && row.status !== "failed")) return "invalid_state";
      row = { ...row, status: "submitted", txHash: tx.txHash, chainId: tx.chainId, contractAddress: tx.contractAddress, failureCode: null };
      return "ok";
    },
    async resolveConfirmed(_id, tx) {
      calls.push(`confirmed:${tx.txHash}`);
      if (!row || row.status === "confirmed") return "invalid_state";
      row = { ...row, status: "confirmed", txHash: tx.txHash, chainId: tx.chainId, contractAddress: tx.contractAddress, blockNumber: tx.blockNumber };
      return "ok";
    },
    async resolveFailed(_id, code) {
      calls.push(`failed:${code}`);
      if (!row || (row.status !== "preparing" && row.status !== "submitted")) return "invalid_state";
      row = { ...row, status: "failed", failureCode: code };
      return "ok";
    },
  };
  return store;
}

/** Scriptable chain. Records sends so tests can assert "no second transaction". */
function fakeChain(options: {
  chainId?: number;
  onChain?: OnChainAnchor | null;
  submit?: SubmitResult | (() => SubmitResult);
  receipts?: Record<string, AnchorReceipt | null>;
  logs?: { txHash: Hex; blockNumber: bigint } | null;
  down?: boolean;
} = {}) {
  const sends: string[] = [];
  let onChain = options.onChain ?? null;
  const receipts = options.receipts ?? {};
  const fail = () => { if (options.down) throw new TypeError("fetch failed"); };
  const chain: AnchorChainWriter & { sends: string[]; land: (hash: Hex, receipt: AnchorReceipt, anchor: OnChainAnchor) => void } = {
    chainId: 10143,
    contractAddress: CONTRACT,
    explorerUrl: "https://testnet.monadscan.com",
    sends,
    land(hash, receipt, anchor) { receipts[hash] = receipt; onChain = anchor; },
    async getChainId() { fail(); return options.chainId ?? 10143; },
    async readAnchor() { fail(); return onChain; },
    async getReceipt(hash) { fail(); return receipts[hash] ?? null; },
    async findAnchorTransaction() { fail(); return options.logs ?? null; },
    async submitAnchor(commitment, contentHash) {
      sends.push(`${commitment}:${contentHash}`);
      const result = typeof options.submit === "function" ? options.submit() : (options.submit ?? { kind: "accepted", txHash: TX });
      if (result.kind === "accepted") {
        // Default to a success receipt unless the test scripted one (null = "not yet").
        if (!(result.txHash in receipts)) receipts[result.txHash] = { status: "success", blockNumber: BigInt(7) };
        if (receipts[result.txHash]?.status === "success") onChain = { contentHash, anchoredAt: BigInt(1) };
      }
      return result;
    },
  };
  return chain;
}

const fast = { receiptTimeoutMs: 50, receiptPollMs: 5 };

test("happy path: tx hash saved only after acceptance, anchored only after a success receipt", async () => {
  const store = fakeStore(confirmedRecord());
  const chain = fakeChain();
  const outcome = await createAnchorService(store, chain, fast).anchorRecord(RECORD_ID);
  assert.equal(outcome.state, "anchored");
  assert.deepEqual(store.calls, ["begin", `markSubmitted:${TX}`, `confirmed:${TX}`]);
  assert.equal(chain.sends.length, 1);
  assert.equal(store.row()?.blockNumber, BigInt(7));
});

test("disputed, pending, or missing records are never anchored", async () => {
  for (const status of ["disputed", "pending", "draft"]) {
    const store = fakeStore(confirmedRecord({}, status));
    const chain = fakeChain();
    assert.equal((await createAnchorService(store, chain, fast).anchorRecord(RECORD_ID)).state, "not_confirmed", status);
    assert.equal(chain.sends.length, 0);
    assert.deepEqual(store.calls, []);
  }
  assert.equal((await createAnchorService(fakeStore(null), fakeChain(), fast).anchorRecord(RECORD_ID)).state, "not_found");
});

test("without a signing key the service refuses to anchor", async () => {
  const chain = fakeChain();
  const { submitAnchor: _drop, ...readerOnly } = chain;
  void _drop;
  const outcome = await createAnchorService(fakeStore(confirmedRecord()), readerOnly, fast).anchorRecord(RECORD_ID);
  assert.equal(outcome.state, "not_configured");
  assert.equal((await createAnchorService(fakeStore(confirmedRecord()), null, fast).anchorRecord(RECORD_ID)).state, "not_configured");
});

test("RPC unreachable: nothing sent, nothing marked", async () => {
  const store = fakeStore(confirmedRecord());
  const chain = fakeChain({ down: true });
  assert.equal((await createAnchorService(store, chain, fast).anchorRecord(RECORD_ID)).state, "chain_unavailable");
  assert.equal(chain.sends.length, 0);
  assert.deepEqual(store.calls, ["begin"]);
  assert.equal(store.row()?.status, "preparing");
});

test("wrong chain ID from the RPC: nothing sent", async () => {
  const chain = fakeChain({ chainId: 143 });
  assert.equal((await createAnchorService(fakeStore(confirmedRecord()), chain, fast).anchorRecord(RECORD_ID)).state, "chain_unavailable");
  assert.equal(chain.sends.length, 0);
});

test("uncertain broadcast: no tx hash saved, no resend, later reconciled from the receipt", async () => {
  const store = fakeStore(confirmedRecord());
  const chain = fakeChain({ submit: { kind: "uncertain", txHash: TX } });
  const service = createAnchorService(store, chain, fast);
  assert.equal((await service.anchorRecord(RECORD_ID)).state, "uncertain");
  assert.ok(!store.calls.some((c) => c.startsWith("markSubmitted")), "hash not stored without an RPC acknowledgement");

  assert.equal((await service.anchorRecord(RECORD_ID)).state, "uncertain", "second click does not resend");
  assert.equal(chain.sends.length, 1);

  chain.land(TX, { status: "success", blockNumber: BigInt(9) }, { contentHash: store.row()!.contentHash, anchoredAt: BigInt(1) });
  assert.equal((await service.refresh(RECORD_ID)).state, "anchored");
  assert.equal(chain.sends.length, 1);
  assert.equal(store.row()?.txHash, TX);
});

test("already anchored on-chain before sending: reconcile instead of a second transaction", async () => {
  // Create a valid "preparing" row (the RPC is down, so nothing is sent).
  const fresh = fakeStore(confirmedRecord());
  await createAnchorService(fresh, fakeChain({ down: true }), fast).anchorRecord(RECORD_ID);
  const row = fresh.row()!;
  // An earlier attempt (e.g. before a restart) already anchored this exact hash.
  const chain = fakeChain({ onChain: { contentHash: row.contentHash, anchoredAt: BigInt(1) }, logs: { txHash: OTHER_TX, blockNumber: BigInt(3) } });
  const outcome = await createAnchorService(fresh, chain, fast).anchorRecord(RECORD_ID);
  assert.equal(outcome.state, "anchored");
  assert.equal(chain.sends.length, 0);
  assert.equal(fresh.row()?.txHash, OTHER_TX);
});

test("a different hash on-chain for our commitment is an integrity error, never overwritten", async () => {
  const store = fakeStore(confirmedRecord());
  await createAnchorService(store, fakeChain({ down: true }), fast).anchorRecord(RECORD_ID);
  const chain = fakeChain({ onChain: { contentHash: `0x${"f".repeat(64)}`, anchoredAt: BigInt(1) } });
  assert.equal((await createAnchorService(store, chain, fast).anchorRecord(RECORD_ID)).state, "integrity_error");
  assert.equal(chain.sends.length, 0);
});

test("record changed after preparing: integrity error, nothing sent", async () => {
  const store = fakeStore(confirmedRecord());
  await createAnchorService(store, fakeChain({ down: true }), fast).anchorRecord(RECORD_ID);
  store.setRecord(confirmedRecord({ title: "Edited title" }));
  const chain = fakeChain();
  assert.equal((await createAnchorService(store, chain, fast).anchorRecord(RECORD_ID)).state, "integrity_error");
  assert.equal(chain.sends.length, 0);
});

test("reverted receipt without an anchor is recorded as failed; retry is allowed", async () => {
  const store = fakeStore(confirmedRecord());
  const chain = fakeChain({ receipts: { [TX]: { status: "reverted", blockNumber: BigInt(4) } } });
  const service = createAnchorService(store, chain, fast);
  const outcome = await service.anchorRecord(RECORD_ID);
  assert.equal(outcome.state, "failed");
  assert.equal(store.row()?.status, "failed");
  assert.ok(store.calls.includes("failed:reverted"));
});

test("reverted receipt but an earlier tx anchored our hash: reconciled as anchored", async () => {
  const store = fakeStore(confirmedRecord());
  await createAnchorService(store, fakeChain({ down: true }), fast).anchorRecord(RECORD_ID);
  const hash = store.row()!.contentHash;
  let first = true;
  const chain = fakeChain({
    receipts: { [TX]: { status: "reverted", blockNumber: BigInt(5) } },
    logs: { txHash: OTHER_TX, blockNumber: BigInt(4) },
    submit: () => {
      if (first) { first = false; chain.land(OTHER_TX, { status: "success", blockNumber: BigInt(4) }, { contentHash: hash, anchoredAt: BigInt(1) }); }
      return { kind: "accepted", txHash: TX };
    },
  });
  // Simulate the race: the earlier tx lands between our pre-check and our send.
  const original = chain.readAnchor.bind(chain);
  let reads = 0;
  chain.readAnchor = async (c) => (reads++ === 0 ? null : original(c));
  const outcome = await createAnchorService(store, chain, fast).anchorRecord(RECORD_ID);
  assert.equal(outcome.state, "anchored");
  assert.equal(store.row()?.txHash, OTHER_TX);
});

test("receipt timeout leaves it pending; a later status check confirms without resending", async () => {
  const store = fakeStore(confirmedRecord());
  const chain = fakeChain({ receipts: { [TX]: null } });
  const service = createAnchorService(store, chain, fast);
  assert.equal((await service.anchorRecord(RECORD_ID)).state, "pending");
  assert.equal(store.row()?.status, "submitted");
  assert.equal((await service.anchorRecord(RECORD_ID)).state, "pending", "submitted rows are only re-checked");
  assert.equal(chain.sends.length, 1);
  chain.land(TX, { status: "success", blockNumber: BigInt(11) }, { contentHash: store.row()!.contentHash, anchoredAt: BigInt(1) });
  assert.equal((await service.refresh(RECORD_ID)).state, "anchored");
  assert.equal(chain.sends.length, 1);
});

test("definitive RPC rejection (insufficient funds) is recorded as failed", async () => {
  const store = fakeStore(confirmedRecord());
  const chain = fakeChain({ submit: { kind: "rejected", code: "insufficient_funds" } });
  const outcome = await createAnchorService(store, chain, fast).anchorRecord(RECORD_ID);
  assert.equal(outcome.state, "failed");
  assert.ok(store.calls.includes("failed:insufficient_funds"));
  assert.ok(!store.calls.some((c) => c.startsWith("markSubmitted")));
});

test("concurrent anchor requests send exactly one transaction", async () => {
  const store = fakeStore(confirmedRecord());
  const chain = fakeChain();
  const service = createAnchorService(store, chain, fast);
  const results = await Promise.all([service.anchorRecord(RECORD_ID), service.anchorRecord(RECORD_ID), service.anchorRecord(RECORD_ID)]);
  assert.equal(chain.sends.length, 1);
  assert.ok(results.every((r) => r.state === "anchored"), results.map((r) => r.state).join(","));
});

test("refresh never sends a transaction", async () => {
  const store = fakeStore(confirmedRecord());
  const chain = fakeChain();
  const service = createAnchorService(store, chain, fast);
  assert.equal((await service.refresh(RECORD_ID)).state, "not_anchored");
  await createAnchorService(store, fakeChain({ down: true }), fast).anchorRecord(RECORD_ID);
  assert.equal((await service.refresh(RECORD_ID)).state, "not_anchored");
  assert.equal(chain.sends.length, 0);
});
