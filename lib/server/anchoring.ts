import "server-only";

import { randomBytes } from "node:crypto";
import type { Hex } from "viem";
import {
  CANONICAL_VERSION,
  contentHashOf,
  recordCommitmentOf,
  toCanonicalRecord,
  type CanonicalRecordInput,
} from "../anchoring/canonical";
import type { AnchorChainReader, AnchorChainWriter, AnchorReceipt } from "./chain";

/*
 * Anchoring workflow. Dependencies are injected so every path (RPC failure,
 * timeout, revert, reconciliation) can be tested without a network.
 *
 * Invariants:
 * - Only records with status 'confirmed' are anchored (re-checked in SQL).
 * - Before sending, the contract is read: an existing anchor is reconciled,
 *   never re-sent.
 * - A tx hash is stored only after the RPC accepted the transaction.
 * - An uncertain broadcast (timeout) is never blindly retried; status checks
 *   look for on-chain evidence first.
 * - Submissions are serialized within this process (one nonce at a time).
 */

export type AnchorRowStatus = "preparing" | "submitted" | "confirmed" | "failed";

export interface AnchorRow {
  status: AnchorRowStatus;
  salt: string;
  recordCommitment: Hex;
  contentHash: Hex;
  txHash: Hex | null;
  chainId: number | null;
  contractAddress: Hex | null;
  blockNumber: bigint | null;
  failureCode: string | null;
}

export interface AnchorableRecord {
  status: string;
  /** Canonical fields; confirmedAt is null until the client confirms. */
  input: Omit<CanonicalRecordInput, "salt" | "confirmedAt"> & { confirmedAt: string | null };
}

export interface AnchorStore {
  loadRecord(recordId: string): Promise<AnchorableRecord | null>;
  loadAnchor(recordId: string): Promise<AnchorRow | null>;
  begin(
    recordId: string,
    values: { salt: string; recordCommitment: Hex; contentHash: Hex },
  ): Promise<"created" | "exists" | "not_found" | "not_confirmed">;
  markSubmitted(recordId: string, tx: { txHash: Hex; chainId: number; contractAddress: Hex }): Promise<string>;
  resolveConfirmed(
    recordId: string,
    tx: { txHash: Hex; chainId: number; contractAddress: Hex; blockNumber: bigint },
  ): Promise<string>;
  resolveFailed(recordId: string, failureCode: string): Promise<string>;
}

export type AnchorOutcome =
  | { state: "not_configured" }
  | { state: "not_found" }
  | { state: "not_confirmed" }
  | { state: "not_anchored"; anchor: AnchorRow | null }
  | { state: "anchored"; anchor: AnchorRow }
  /** Submitted; the receipt is not visible yet. */
  | { state: "pending"; anchor: AnchorRow }
  /** Broadcast outcome unknown. Do not resend; check status again shortly. */
  | { state: "uncertain"; anchor: AnchorRow | null }
  | { state: "failed"; anchor: AnchorRow | null; code: string }
  /** Stored hash no longer matches the record, or the chain holds a different hash. */
  | { state: "integrity_error" }
  /** The RPC could not be reached or reports another chain. Nothing was sent. */
  | { state: "chain_unavailable" };

export interface AnchorServiceOptions {
  receiptTimeoutMs?: number;
  receiptPollMs?: number;
  /** How long an uncertain broadcast blocks a resend (Monad has no global mempool). */
  uncertainHoldMs?: number;
  now?: () => number;
}

export function createAnchorService(
  store: AnchorStore,
  chain: AnchorChainReader | AnchorChainWriter | null,
  options: AnchorServiceOptions = {},
) {
  const receiptTimeoutMs = options.receiptTimeoutMs ?? 15_000;
  const receiptPollMs = options.receiptPollMs ?? 500;
  const uncertainHoldMs = options.uncertainHoldMs ?? 2 * 60_000;
  const now = options.now ?? Date.now;
  const uncertain = new Map<string, { txHash: Hex; at: number }>();
  let queue: Promise<unknown> = Promise.resolve();

  /** Serializes submissions in this process. */
  function withLock<T>(fn: () => Promise<T>): Promise<T> {
    const run = queue.then(fn, fn);
    queue = run.catch(() => undefined);
    return run;
  }

  const isWriter = (c: typeof chain): c is AnchorChainWriter => !!c && "submitAnchor" in c;
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  async function reload(recordId: string, fallback: AnchorRow): Promise<AnchorRow> {
    return (await store.loadAnchor(recordId)) ?? fallback;
  }

  /** The record must still hash to what was prepared; otherwise stop. */
  function integrityOk(recordId: string, record: AnchorableRecord, anchor: AnchorRow): boolean {
    if (!record.input.confirmedAt) return false;
    const canonical = toCanonicalRecord({ ...record.input, confirmedAt: record.input.confirmedAt, salt: anchor.salt });
    return (
      contentHashOf(canonical) === anchor.contentHash &&
      recordCommitmentOf(recordId, anchor.salt) === anchor.recordCommitment
    );
  }

  /** On-chain anchor exists with our hash: find its tx and record it. */
  async function reconcile(recordId: string, anchor: AnchorRow, reader: AnchorChainReader): Promise<AnchorOutcome> {
    const found = await reader.findAnchorTransaction(anchor.recordCommitment);
    if (!found) return { state: "uncertain", anchor };
    await store.resolveConfirmed(recordId, {
      txHash: found.txHash,
      chainId: reader.chainId,
      contractAddress: reader.contractAddress,
      blockNumber: found.blockNumber,
    });
    uncertain.delete(recordId);
    return { state: "anchored", anchor: await reload(recordId, anchor) };
  }

  async function settle(
    recordId: string,
    anchor: AnchorRow,
    txHash: Hex,
    receipt: AnchorReceipt,
    reader: AnchorChainReader,
  ): Promise<AnchorOutcome> {
    const onChain = await reader.readAnchor(anchor.recordCommitment);
    if (receipt.status === "success") {
      if (!onChain || onChain.contentHash !== anchor.contentHash) return { state: "integrity_error" };
      await store.resolveConfirmed(recordId, {
        txHash,
        chainId: reader.chainId,
        contractAddress: reader.contractAddress,
        blockNumber: receipt.blockNumber,
      });
      uncertain.delete(recordId);
      return { state: "anchored", anchor: await reload(recordId, anchor) };
    }
    // Reverted. If an earlier transaction anchored the same hash, reconcile to it.
    if (onChain && onChain.contentHash === anchor.contentHash) return reconcile(recordId, anchor, reader);
    await store.resolveFailed(recordId, "reverted");
    uncertain.delete(recordId);
    return { state: "failed", anchor: await reload(recordId, anchor), code: "reverted" };
  }

  async function waitForReceipt(recordId: string, anchor: AnchorRow, txHash: Hex, reader: AnchorChainReader) {
    const deadline = now() + receiptTimeoutMs;
    for (;;) {
      const receipt = await reader.getReceipt(txHash);
      if (receipt) return settle(recordId, anchor, txHash, receipt, reader);
      if (now() >= deadline) return { state: "pending", anchor: await reload(recordId, anchor) } as const;
      await sleep(receiptPollMs);
    }
  }

  /** Read-only status check: never sends a transaction. */
  async function refresh(recordId: string): Promise<AnchorOutcome> {
    const anchor = await store.loadAnchor(recordId);
    if (!anchor) return { state: "not_anchored", anchor: null };
    if (anchor.status === "confirmed") return { state: "anchored", anchor };
    if (!chain) return { state: "not_configured" };
    try {
      if (anchor.status === "submitted" && anchor.txHash) {
        const receipt = await chain.getReceipt(anchor.txHash);
        if (receipt) return await settle(recordId, anchor, anchor.txHash, receipt, chain);
        const onChain = await chain.readAnchor(anchor.recordCommitment);
        if (onChain?.contentHash === anchor.contentHash) return await reconcile(recordId, anchor, chain);
        return { state: "pending", anchor };
      }
      // preparing / failed. First, an uncertain broadcast from this process:
      // its receipt is the most direct evidence.
      const held = uncertain.get(recordId);
      if (held) {
        const receipt = await chain.getReceipt(held.txHash);
        if (receipt) {
          // The network has the transaction, so this now counts as a valid submission.
          await store.markSubmitted(recordId, {
            txHash: held.txHash, chainId: chain.chainId, contractAddress: chain.contractAddress,
          });
          return await settle(recordId, await reload(recordId, anchor), held.txHash, receipt, chain);
        }
      }
      // Otherwise, on-chain evidence of an earlier attempt (e.g. after a restart).
      const onChain = await chain.readAnchor(anchor.recordCommitment);
      if (onChain) {
        if (onChain.contentHash !== anchor.contentHash) return { state: "integrity_error" };
        return await reconcile(recordId, anchor, chain);
      }
      if (held) return { state: "uncertain", anchor };
      return anchor.status === "failed"
        ? { state: "failed", anchor, code: anchor.failureCode ?? "unknown" }
        : { state: "not_anchored", anchor };
    } catch {
      return { state: "chain_unavailable" };
    }
  }

  async function anchorRecord(recordId: string): Promise<AnchorOutcome> {
    if (!isWriter(chain)) return { state: "not_configured" };
    const writer = chain;

    const record = await store.loadRecord(recordId);
    if (!record) return { state: "not_found" };
    if (record.status !== "confirmed" || !record.input.confirmedAt) return { state: "not_confirmed" };

    let anchor = await store.loadAnchor(recordId);
    if (!anchor) {
      const salt = randomBytes(16).toString("hex");
      const canonical = toCanonicalRecord({ ...record.input, confirmedAt: record.input.confirmedAt, salt });
      const outcome = await store.begin(recordId, {
        salt,
        recordCommitment: recordCommitmentOf(recordId, salt),
        contentHash: contentHashOf(canonical),
      });
      if (outcome === "not_found" || outcome === "not_confirmed") return { state: outcome };
      // "exists": a concurrent request created it first; use its values.
      anchor = await store.loadAnchor(recordId);
      if (!anchor) return { state: "not_found" };
    }
    if (!integrityOk(recordId, record, anchor)) return { state: "integrity_error" };
    if (anchor.status === "confirmed") return { state: "anchored", anchor };
    if (anchor.status === "submitted") return refresh(recordId);

    return withLock(async () => {
      // Re-read inside the lock: another request may have moved it on.
      const current = (await store.loadAnchor(recordId)) ?? anchor!;
      if (current.status === "submitted" || current.status === "confirmed") return refresh(recordId);

      try {
        if ((await writer.getChainId()) !== writer.chainId) return { state: "chain_unavailable" };
        // Already on-chain (earlier attempt): reconcile through the read-only path.
        if (await writer.readAnchor(current.recordCommitment)) return await refresh(recordId);
      } catch {
        return { state: "chain_unavailable" };
      }

      // An earlier broadcast from this process may still land: do not resend yet.
      const held = uncertain.get(recordId);
      if (held && now() - held.at < uncertainHoldMs) return refresh(recordId);

      let result;
      try {
        result = await writer.submitAnchor(current.recordCommitment, current.contentHash);
      } catch {
        return { state: "chain_unavailable" }; // failed before broadcast (simulation/fees)
      }

      if (result.kind === "uncertain") {
        uncertain.set(recordId, { txHash: result.txHash, at: now() });
        return { state: "uncertain", anchor: current };
      }
      if (result.kind === "rejected") {
        if (result.code === "already_anchored") return reconcile(recordId, current, writer);
        if (current.status === "preparing") await store.resolveFailed(recordId, result.code);
        return { state: "failed", anchor: await reload(recordId, current), code: result.code };
      }

      const marked = await store.markSubmitted(recordId, {
        txHash: result.txHash,
        chainId: writer.chainId,
        contractAddress: writer.contractAddress,
      });
      if (marked !== "ok") return refresh(recordId);
      uncertain.delete(recordId);
      try {
        return await waitForReceipt(recordId, await reload(recordId, current), result.txHash, writer);
      } catch {
        return { state: "pending", anchor: await reload(recordId, current) };
      }
    });
  }

  return { anchorRecord, refresh };
}

export { CANONICAL_VERSION };
