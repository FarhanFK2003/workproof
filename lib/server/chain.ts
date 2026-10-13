import "server-only";

import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  defineChain,
  encodeFunctionData,
  getAbiItem,
  http,
  HttpRequestError,
  keccak256,
  TimeoutError,
  TransactionReceiptNotFoundError,
  type Hex,
  type PublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ANCHOR_GAS_LIMIT, workProofAnchorAbi } from "../anchoring/abi";
import type { AnchorReadConfig, AnchorWriteConfig } from "./anchor-config";

/*
 * The only module that talks to Monad. Reads work with just the read config;
 * submitting needs the server-only signing key, which never leaves this module.
 */

export interface OnChainAnchor {
  contentHash: Hex;
  anchoredAt: bigint;
}

export interface AnchorReceipt {
  status: "success" | "reverted";
  blockNumber: bigint;
}

export type SubmitResult =
  /** The RPC accepted the transaction. */
  | { kind: "accepted"; txHash: Hex }
  /** Broadcast outcome unknown (timeout or network error). Do not resend blindly. */
  | { kind: "uncertain"; txHash: Hex }
  /** Definitively not sent or refused; safe to record as failed. */
  | {
      kind: "rejected";
      code: "already_anchored" | "not_anchorer" | "simulation_reverted" | "insufficient_funds" | "rpc_rejected";
    };

export interface AnchorChainReader {
  readonly chainId: number;
  readonly contractAddress: Hex;
  readonly explorerUrl: string | null;
  getChainId(): Promise<number>;
  readAnchor(commitment: Hex): Promise<OnChainAnchor | null>;
  getReceipt(txHash: Hex): Promise<AnchorReceipt | null>;
  /** Searches recent RecordAnchored logs for a commitment. */
  findAnchorTransaction(commitment: Hex): Promise<{ txHash: Hex; blockNumber: bigint } | null>;
}

export interface AnchorChainWriter extends AnchorChainReader {
  submitAnchor(commitment: Hex, contentHash: Hex): Promise<SubmitResult>;
}

const RPC_TIMEOUT_MS = 10_000;
/** Recent-log window for reconciliation (~5 minutes at Monad's 300 ms blocks). */
const LOG_LOOKBACK_BLOCKS = BigInt(1_000);
/** Monad's public RPC rejects eth_getLogs spanning more than 100 blocks. */
export const MAX_LOG_RANGE_BLOCKS = BigInt(100);
const ZERO = BigInt(0);
const ONE = BigInt(1);

/**
 * Splits the inclusive block range [fromBlock, toBlock] into inclusive chunks
 * of at most `maxBlocks` blocks, newest first. Chunks are contiguous: together
 * they cover every block exactly once. Returns [] when fromBlock > toBlock.
 */
export function splitBlockRange(
  fromBlock: bigint,
  toBlock: bigint,
  maxBlocks: bigint = MAX_LOG_RANGE_BLOCKS,
): { fromBlock: bigint; toBlock: bigint }[] {
  if (maxBlocks < ONE) throw new RangeError("maxBlocks must be at least 1");
  const chunks: { fromBlock: bigint; toBlock: bigint }[] = [];
  let end = toBlock;
  while (end >= fromBlock) {
    const start = end - maxBlocks + ONE > fromBlock ? end - maxBlocks + ONE : fromBlock;
    chunks.push({ fromBlock: start, toBlock: end });
    end = start - ONE;
  }
  return chunks;
}
const recordAnchoredEvent = getAbiItem({ abi: workProofAnchorAbi, name: "RecordAnchored" });

function publicClientFor(config: AnchorReadConfig): PublicClient {
  const chain = defineChain({
    id: config.chainId,
    name: config.chainId === 10143 ? "Monad Testnet" : "Local chain",
    nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
    rpcUrls: { default: { http: [config.rpcUrl] } },
  });
  return createPublicClient({ chain, transport: http(config.rpcUrl, { timeout: RPC_TIMEOUT_MS, retryCount: 1 }) });
}

function isNetworkUncertainty(error: unknown): boolean {
  if (error instanceof TimeoutError) return true;
  if (error instanceof BaseError) {
    return error.walk((e) => e instanceof TimeoutError || e instanceof HttpRequestError) !== null;
  }
  return error instanceof TypeError; // fetch() network failure
}

function revertName(error: unknown): string | null {
  if (!(error instanceof BaseError)) return null;
  const revert = error.walk((e) => e instanceof ContractFunctionRevertedError);
  return revert instanceof ContractFunctionRevertedError ? (revert.data?.errorName ?? "unknown") : null;
}

export function createAnchorChainReader(config: AnchorReadConfig): AnchorChainReader {
  const client = publicClientFor(config);
  return {
    chainId: config.chainId,
    contractAddress: config.contractAddress,
    explorerUrl: config.explorerUrl,
    getChainId: () => client.getChainId(),
    async readAnchor(commitment) {
      const [contentHash, anchoredAt] = await client.readContract({
        address: config.contractAddress,
        abi: workProofAnchorAbi,
        functionName: "getAnchor",
        args: [commitment],
      });
      return anchoredAt === ZERO ? null : { contentHash, anchoredAt };
    },
    async getReceipt(txHash) {
      try {
        const receipt = await client.getTransactionReceipt({ hash: txHash });
        return { status: receipt.status, blockNumber: receipt.blockNumber };
      } catch (error) {
        if (error instanceof TransactionReceiptNotFoundError) return null;
        throw error;
      }
    },
    async findAnchorTransaction(commitment) {
      const latest = await client.getBlockNumber();
      const fromBlock = latest > LOG_LOOKBACK_BLOCKS ? latest - LOG_LOOKBACK_BLOCKS : ZERO;
      // Same window as before, queried in chunks the RPC accepts. Newest first:
      // recovery usually concerns a recent transaction. The contract allows at
      // most one RecordAnchored event per commitment, so the first match is it.
      // RPC errors propagate; callers treat them as "chain unavailable".
      for (const range of splitBlockRange(fromBlock, latest)) {
        const logs = await client.getLogs({
          address: config.contractAddress,
          event: recordAnchoredEvent,
          args: { commitment },
          fromBlock: range.fromBlock,
          toBlock: range.toBlock,
        });
        const log = logs[0];
        if (log?.transactionHash && log.blockNumber !== null) {
          return { txHash: log.transactionHash, blockNumber: log.blockNumber };
        }
      }
      return null;
    },
  };
}

export function createAnchorChainWriter(config: AnchorWriteConfig): AnchorChainWriter {
  const reader = createAnchorChainReader(config);
  const client = publicClientFor(config);
  const account = privateKeyToAccount(config.privateKey);

  return {
    ...reader,
    async submitAnchor(commitment, contentHash) {
      // 1. Simulate: catches AlreadyAnchored / NotAnchorer before spending gas.
      try {
        await client.simulateContract({
          account,
          address: config.contractAddress,
          abi: workProofAnchorAbi,
          functionName: "anchor",
          args: [commitment, contentHash],
        });
      } catch (error) {
        const name = revertName(error);
        if (name === "AlreadyAnchored") return { kind: "rejected", code: "already_anchored" };
        if (name === "NotAnchorer") return { kind: "rejected", code: "not_anchorer" };
        if (name) return { kind: "rejected", code: "simulation_reverted" };
        throw error; // RPC unavailable: nothing was sent
      }

      // 2. Sign locally with an explicit gas limit (Monad charges the full limit).
      const [nonce, fees] = await Promise.all([
        client.getTransactionCount({ address: account.address, blockTag: "pending" }),
        client.estimateFeesPerGas(),
      ]);
      const serialized = await account.signTransaction({
        type: "eip1559",
        chainId: config.chainId,
        to: config.contractAddress,
        data: encodeFunctionData({ abi: workProofAnchorAbi, functionName: "anchor", args: [commitment, contentHash] }),
        value: ZERO,
        gas: ANCHOR_GAS_LIMIT,
        nonce,
        maxFeePerGas: fees.maxFeePerGas,
        maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
      });
      const txHash = keccak256(serialized);

      // 3. Broadcast. Only an RPC acknowledgement counts as a valid submission.
      try {
        const returned = await client.sendRawTransaction({ serializedTransaction: serialized });
        return { kind: "accepted", txHash: returned };
      } catch (error) {
        const message = error instanceof BaseError ? error.details || error.shortMessage : "";
        if (/already known/i.test(message)) return { kind: "accepted", txHash };
        if (isNetworkUncertainty(error)) return { kind: "uncertain", txHash };
        if (/insufficient funds/i.test(message)) return { kind: "rejected", code: "insufficient_funds" };
        return { kind: "rejected", code: "rpc_rejected" };
      }
    },
  };
}
