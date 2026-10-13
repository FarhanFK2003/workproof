/** Browser-safe view of a record's anchoring state (no private data). */
export type AnchorPanelState =
  | { kind: "unavailable"; reason: "not_configured" | "misconfigured" }
  | { kind: "ineligible" }
  | { kind: "ready" }
  | { kind: "in_progress"; uncertain: boolean; txHash: string | null; txUrl: string | null }
  | {
      kind: "anchored";
      txHash: string;
      txUrl: string | null;
      blockNumber: string;
      chainId: number;
      verifyUrl: string | null;
    }
  | { kind: "failed"; message: string }
  | { kind: "error"; message: string };

const FAILURE_MESSAGES: Record<string, string> = {
  reverted: "The transaction was included but reverted. Nothing was anchored.",
  insufficient_funds: "The anchoring wallet doesn't have enough testnet MON for gas.",
  not_anchorer: "The configured wallet isn't the contract's anchorer.",
  simulation_reverted: "The contract refused the anchor during simulation.",
  rpc_rejected: "The Monad RPC refused the transaction.",
};

export function failureMessage(code: string): string {
  return FAILURE_MESSAGES[code] ?? "Anchoring didn't complete.";
}
