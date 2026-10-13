import "server-only";

import { failureMessage, type AnchorPanelState } from "@/lib/anchoring/panel";
import {
  AnchorConfigError,
  explorerTxUrl,
  readAnchorReadConfig,
  readAnchorWriteConfig,
} from "./anchor-config";
import { createAnchorService, type AnchorOutcome, type AnchorRow } from "./anchoring";
import { ownerAnchorStore } from "./anchors";
import { AppConfigError, getAppBaseUrl } from "./app-config";
import { createAnchorChainReader, createAnchorChainWriter, type AnchorChainReader } from "./chain";

/*
 * Process-wide wiring. One service instance per server process so its
 * submission lock and uncertain-broadcast memory are shared by all requests.
 */

type Availability = "enabled" | "read_only" | "not_configured" | "misconfigured";

let service: ReturnType<typeof createAnchorService> | null = null;
let availability: Availability | null = null;
let reader: AnchorChainReader | null = null;
let reported = false;

function init() {
  if (availability) return;
  try {
    const write = readAnchorWriteConfig();
    const read = write ?? readAnchorReadConfig();
    reader = read ? createAnchorChainReader(read) : null;
    const writer = write ? createAnchorChainWriter(write) : null;
    availability = write ? "enabled" : read ? "read_only" : "not_configured";
    service = createAnchorService(ownerAnchorStore, writer ?? reader);
  } catch (error) {
    if (!(error instanceof AnchorConfigError)) throw error;
    if (!reported) {
      reported = true;
      console.error(`[anchor] Monad anchoring is disabled: ${error.message}`);
    }
    availability = "misconfigured";
    service = createAnchorService(ownerAnchorStore, null);
  }
}

export function getAnchorAvailability(): Availability {
  init();
  return availability!;
}

export function getAnchorService() {
  init();
  return service!;
}

/** Read-only chain access for the public verification page. */
export function getAnchorReader(): AnchorChainReader | null {
  init();
  return reader;
}

export function verifyUrlFor(salt: string): string | null {
  try {
    return `${getAppBaseUrl()}/verify/${salt}`;
  } catch (error) {
    if (error instanceof AppConfigError) return null;
    throw error;
  }
}

/** Initial panel state from the stored row (no chain call during page render). */
export function panelStateFromRow(recordStatus: string, row: AnchorRow | null): AnchorPanelState {
  const available = getAnchorAvailability();
  const explorer = getAnchorReader()?.explorerUrl ?? null;
  if (row?.status === "confirmed" && row.txHash && row.blockNumber !== null && row.chainId) {
    return {
      kind: "anchored",
      txHash: row.txHash,
      txUrl: explorerTxUrl(explorer, row.txHash),
      blockNumber: row.blockNumber.toString(),
      chainId: row.chainId,
      verifyUrl: verifyUrlFor(row.salt),
    };
  }
  if (recordStatus !== "confirmed") return { kind: "ineligible" };
  if (available === "not_configured" || available === "misconfigured") {
    return { kind: "unavailable", reason: available };
  }
  if (row?.status === "submitted") {
    return { kind: "in_progress", uncertain: false, txHash: row.txHash, txUrl: row.txHash ? explorerTxUrl(explorer, row.txHash) : null };
  }
  if (row?.status === "failed") return { kind: "failed", message: failureMessage(row.failureCode ?? "") };
  if (row?.status === "preparing") return { kind: "in_progress", uncertain: true, txHash: null, txUrl: null };
  return available === "enabled" ? { kind: "ready" } : { kind: "unavailable", reason: "not_configured" };
}

export function panelStateFromOutcome(outcome: AnchorOutcome): AnchorPanelState {
  const explorer = getAnchorReader()?.explorerUrl ?? null;
  switch (outcome.state) {
    case "anchored":
      return panelStateFromRow("confirmed", outcome.anchor);
    case "pending":
      return {
        kind: "in_progress",
        uncertain: false,
        txHash: outcome.anchor.txHash,
        txUrl: outcome.anchor.txHash ? explorerTxUrl(explorer, outcome.anchor.txHash) : null,
      };
    case "uncertain":
      return { kind: "in_progress", uncertain: true, txHash: null, txUrl: null };
    case "failed":
      return { kind: "failed", message: failureMessage(outcome.code) };
    case "not_anchored":
      return outcome.anchor?.status === "failed"
        ? { kind: "failed", message: failureMessage(outcome.anchor.failureCode ?? "") }
        : { kind: "ready" };
    case "not_confirmed":
      return { kind: "ineligible" };
    case "not_configured":
      return { kind: "unavailable", reason: getAnchorAvailability() === "misconfigured" ? "misconfigured" : "not_configured" };
    case "not_found":
      return { kind: "error", message: "This record couldn't be found." };
    case "integrity_error":
      return { kind: "error", message: "The record no longer matches its prepared fingerprint, so it wasn't anchored." };
    case "chain_unavailable":
      return { kind: "error", message: "Monad testnet couldn't be reached. Nothing was sent; try again shortly." };
  }
}
