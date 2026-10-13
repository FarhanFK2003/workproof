/** Outcome of reading the anchor contract for a commitment. */
export type ChainCheck =
  | { kind: "found"; contentHash: string; anchoredAt: bigint }
  | { kind: "not_found" }
  | { kind: "unavailable" }
  | { kind: "not_configured" };

export type VerificationStatus =
  /** Record hashes to the anchored value and the chain holds that same value. */
  | "verified"
  /** The record as stored today no longer hashes to the anchored value. */
  | "modified"
  /** The chain holds a different hash for this commitment. */
  | "chain_mismatch"
  /** Marked anchored, but the commitment isn't on the configured chain (e.g. a testnet reset). */
  | "not_on_chain"
  /** The chain couldn't be read right now. */
  | "unverifiable_now"
  /** Anchoring hasn't finished (preparing or submitted). */
  | "in_progress"
  /** Anchoring was attempted but didn't complete. */
  | "not_completed";

export function evaluateVerification(input: {
  anchorStatus: "preparing" | "submitted" | "confirmed" | "failed";
  storedContentHash: string;
  recomputedContentHash: string;
  chain: ChainCheck;
}): VerificationStatus {
  if (input.recomputedContentHash !== input.storedContentHash) return "modified";
  if (input.anchorStatus === "failed") return "not_completed";
  if (input.anchorStatus !== "confirmed") {
    // An in-flight anchor may already be on-chain; still report it as in progress.
    return "in_progress";
  }
  switch (input.chain.kind) {
    case "found":
      return input.chain.contentHash === input.storedContentHash ? "verified" : "chain_mismatch";
    case "not_found":
      return "not_on_chain";
    default:
      return "unverifiable_now";
  }
}
