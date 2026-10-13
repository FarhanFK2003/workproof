/*
 * Integration test for lib/server/chain.ts against a real local Hardhat node
 * (chain 31337). Started by scripts/run-chain-integration.mjs; no Supabase,
 * no testnet, no real funds. Uses Hardhat's well-known development accounts.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { after, before, test } from "node:test";
import { createPublicClient, createWalletClient, http, keccak256, toHex, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createAnchorChainReader, createAnchorChainWriter } from "../../lib/server/chain";

const RPC = process.env.CHAIN_IT_RPC_URL ?? "http://127.0.0.1:8545";
// Hardhat default development accounts #0 and #1 (publicly known; local only).
const ANCHORER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;
const STRANGER_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f6603b6b4b690d" as Hex;
const chainDef = { id: 31337, name: "Hardhat", nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } } as const;

let contractAddress: Hex;
const commitment = keccak256(toHex(`it-commitment-${Date.now()}`));
const contentHash = keccak256(toHex("it-content"));

before(async () => {
  const artifact = JSON.parse(
    readFileSync(path.join(process.cwd(), "chain/artifacts/contracts/WorkProofAnchor.sol/WorkProofAnchor.json"), "utf8"),
  ) as { abi: unknown[]; bytecode: Hex };
  const account = privateKeyToAccount(ANCHORER_KEY);
  const wallet = createWalletClient({ account, chain: chainDef, transport: http(RPC) });
  const client = createPublicClient({ chain: chainDef, transport: http(RPC) });
  const hash = await wallet.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode, args: [account.address] });
  const receipt = await client.waitForTransactionReceipt({ hash });
  assert.ok(receipt.contractAddress);
  contractAddress = receipt.contractAddress.toLowerCase() as Hex;
});

const config = () => ({ rpcUrl: RPC, chainId: 31337, contractAddress, explorerUrl: null });

test("reader: chain ID and an unknown commitment", async () => {
  const reader = createAnchorChainReader(config());
  assert.equal(await reader.getChainId(), 31337);
  assert.equal(await reader.readAnchor(commitment), null);
  assert.equal(await reader.findAnchorTransaction(commitment), null);
  assert.equal(await reader.getReceipt(`0x${"9".repeat(64)}`), null);
});

test("writer: simulate, sign with the fixed gas limit, send, receipt, read back, find in logs", async () => {
  const writer = createAnchorChainWriter({ ...config(), privateKey: ANCHORER_KEY });
  const result = await writer.submitAnchor(commitment, contentHash);
  assert.equal(result.kind, "accepted");
  if (result.kind !== "accepted") return;

  let receipt = null;
  for (let i = 0; i < 40 && !receipt; i++) {
    receipt = await writer.getReceipt(result.txHash);
    if (!receipt) await new Promise((r) => setTimeout(r, 100));
  }
  assert.equal(receipt?.status, "success");

  const onChain = await writer.readAnchor(commitment);
  assert.equal(onChain?.contentHash, contentHash);
  const found = await writer.findAnchorTransaction(commitment);
  assert.equal(found?.txHash, result.txHash);
  assert.equal(found?.blockNumber, receipt?.blockNumber);
});

test("writer: a duplicate is rejected by simulation, so no transaction is sent", async () => {
  const writer = createAnchorChainWriter({ ...config(), privateKey: ANCHORER_KEY });
  const client = createPublicClient({ chain: chainDef, transport: http(RPC) });
  const address = privateKeyToAccount(ANCHORER_KEY).address;
  const nonceBefore = await client.getTransactionCount({ address });
  const result = await writer.submitAnchor(commitment, keccak256(toHex("different")));
  assert.deepEqual(result, { kind: "rejected", code: "already_anchored" });
  assert.equal(await client.getTransactionCount({ address }), nonceBefore, "no transaction was sent");
  assert.equal((await writer.readAnchor(commitment))?.contentHash, contentHash, "original anchor unchanged");
});

test("writer: a key that isn't the anchorer is rejected before sending", async () => {
  const writer = createAnchorChainWriter({ ...config(), privateKey: STRANGER_KEY });
  const result = await writer.submitAnchor(keccak256(toHex("stranger")), contentHash);
  assert.deepEqual(result, { kind: "rejected", code: "not_anchorer" });
});

/*
 * A JSON-RPC proxy in front of the local node that behaves like Monad's public
 * RPC: eth_getLogs spanning more than 100 blocks is refused. Every requested
 * log range is recorded so tests can assert none exceeded the limit.
 */
const LOG_LIMIT = BigInt(100);
type LogRange = { fromBlock: bigint; toBlock: bigint };
let proxy: Server | undefined;
let proxyUrl = "";
const logRanges: LogRange[] = [];

async function startLimitedProxy() {
  proxy = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const body = Buffer.concat(chunks).toString("utf8");
    const calls = ([] as { id: unknown; method: string; params?: unknown[] }[]).concat(JSON.parse(body));
    for (const call of calls) {
      if (call.method !== "eth_getLogs") continue;
      const filter = (call.params?.[0] ?? {}) as { fromBlock?: string; toBlock?: string };
      const ok = /^0x[0-9a-f]+$/i;
      if (!ok.test(filter.fromBlock ?? "") || !ok.test(filter.toBlock ?? "")) {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ jsonrpc: "2.0", id: call.id, error: { code: -32602, message: "test proxy: explicit block numbers required" } }));
        return;
      }
      const range = { fromBlock: BigInt(filter.fromBlock!), toBlock: BigInt(filter.toBlock!) };
      logRanges.push(range);
      if (range.toBlock - range.fromBlock + BigInt(1) > LOG_LIMIT) {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ jsonrpc: "2.0", id: call.id, error: { code: -32614, message: "eth_getLogs is limited to a 100 range" } }));
        return;
      }
    }
    const upstream = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body });
    res.setHeader("content-type", "application/json");
    res.end(await upstream.text());
  });
  await new Promise<void>((resolve) => proxy!.listen(0, "127.0.0.1", resolve));
  proxyUrl = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`;
}

after(() => {
  // close() alone waits for viem's idle keep-alive sockets.
  proxy?.closeAllConnections();
  proxy?.close();
});

async function mine(blocks: number) {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "hardhat_mine", params: [`0x${blocks.toString(16)}`] }),
  });
  assert.equal(((await res.json()) as { error?: unknown }).error, undefined);
}

function assertWithinLimit(ranges: LogRange[]) {
  assert.ok(ranges.length > 0, "at least one log query was made");
  for (const r of ranges) {
    assert.ok(r.toBlock - r.fromBlock + BigInt(1) <= LOG_LIMIT, `log query ${r.fromBlock}..${r.toBlock} exceeds 100 blocks`);
  }
}

test("log-limit proxy refuses a 101-block query (sanity check of the test harness)", async () => {
  await startLimitedProxy();
  await mine(150);
  const client = createPublicClient({ chain: chainDef, transport: http(proxyUrl, { retryCount: 0 }) });
  await assert.rejects(client.getLogs({ address: contractAddress, fromBlock: BigInt(0), toBlock: BigInt(100) }), /limited to a 100 range/);
  await client.getLogs({ address: contractAddress, fromBlock: BigInt(1), toBlock: BigInt(100) }); // exactly 100 is fine
});

test("recovery search: a missing commitment covers the full 1,000-block window in ≤100-block queries", async () => {
  await mine(1_100); // ensure the chain is longer than the lookback window
  const reader = createAnchorChainReader({ ...config(), rpcUrl: proxyUrl });
  const latest = await createPublicClient({ chain: chainDef, transport: http(RPC) }).getBlockNumber();
  logRanges.length = 0;
  assert.equal(await reader.findAnchorTransaction(keccak256(toHex("never-anchored"))), null);
  const ranges = [...logRanges];
  assertWithinLimit(ranges);
  assert.equal(ranges.length, 11);
  assert.equal(ranges[0].toBlock, latest, "starts at the latest block");
  assert.equal(ranges.at(-1)!.fromBlock, latest - BigInt(1_000), "ends at the start of the original window");
  for (let i = 1; i < ranges.length; i++) {
    assert.equal(ranges[i - 1].fromBlock, ranges[i].toBlock + BigInt(1), `no gap or overlap before query ${i}`);
  }
});

test("recovery search: an anchor older than 100 blocks is found in a later chunk", async () => {
  const writer = createAnchorChainWriter({ ...config(), privateKey: ANCHORER_KEY });
  const older = keccak256(toHex(`it-older-${Date.now()}`));
  const result = await writer.submitAnchor(older, contentHash);
  assert.equal(result.kind, "accepted");
  if (result.kind !== "accepted") return;
  let receipt = null;
  for (let i = 0; i < 40 && !receipt; i++) {
    receipt = await writer.getReceipt(result.txHash);
    if (!receipt) await new Promise((r) => setTimeout(r, 100));
  }
  assert.equal(receipt?.status, "success");
  await mine(250); // push the event into the third 100-block chunk

  const reader = createAnchorChainReader({ ...config(), rpcUrl: proxyUrl });
  logRanges.length = 0;
  const found = await reader.findAnchorTransaction(older);
  assert.equal(found?.txHash, result.txHash);
  assert.equal(found?.blockNumber, receipt?.blockNumber);
  assertWithinLimit(logRanges);
  assert.equal(logRanges.length, 3, "stopped at the chunk containing the event");
  const last = logRanges.at(-1)!;
  assert.ok(last.fromBlock <= receipt!.blockNumber && receipt!.blockNumber <= last.toBlock);
});

test("unreachable RPC: reads throw (the service maps this to 'chain unavailable')", async () => {
  const down = { ...config(), rpcUrl: "http://127.0.0.1:1" };
  const reader = createAnchorChainReader(down);
  await assert.rejects(reader.readAnchor(commitment));
  const writer = createAnchorChainWriter({ ...down, privateKey: ANCHORER_KEY });
  await assert.rejects(writer.submitAnchor(keccak256(toHex("down")), contentHash), "nothing can be sent");
});
