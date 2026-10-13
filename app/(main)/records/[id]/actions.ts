"use server";

import { refresh } from "next/cache";
import type { AnchorPanelState } from "@/lib/anchoring/panel";
import { getAnchorService, panelStateFromOutcome } from "@/lib/server/anchor-runtime";
import { AppConfigError, getAppBaseUrl } from "@/lib/server/app-config";
import { issueConfirmationLink } from "@/lib/server/records";
import { getOwnerSession, UnauthorizedError } from "@/lib/server/session";

export type IssueLinkState =
  | { status: "idle" }
  | { status: "issued"; url: string; expiresAt: string }
  | { status: "unauthorized" }
  | { status: "not_found" }
  | { status: "already_decided" }
  | { status: "error"; message: string };

/**
 * Owner-only. Issues a new single-use confirmation link for a draft or pending
 * record. Any previous unused link stops working. The raw token is returned
 * once inside the URL and is never stored or logged.
 */
export async function issueConfirmationLinkAction(recordId: unknown): Promise<IssueLinkState> {
  if (!(await getOwnerSession())) return { status: "unauthorized" };
  if (typeof recordId !== "string") return { status: "not_found" };

  // Validate the base URL first so we never issue a link we can't show.
  let baseUrl: string;
  try {
    baseUrl = getAppBaseUrl();
  } catch (error) {
    if (!(error instanceof AppConfigError)) throw error;
    console.error(`[config] ${error.message}`);
    return {
      status: "error",
      message: "Links can't be created because the app URL isn't configured on the server.",
    };
  }

  try {
    const result = await issueConfirmationLink(recordId);
    refresh(); // Re-render the record page with its new status and timeline.
    if (!result.ok) return { status: result.reason };
    return {
      status: "issued",
      url: `${baseUrl}/confirm/${result.token}`,
      expiresAt: result.expiresAt,
    };
  } catch (error) {
    if (error instanceof UnauthorizedError) return { status: "unauthorized" };
    console.error("[records] Could not issue a confirmation link:", error instanceof Error ? error.message : "unknown error");
    return { status: "error", message: "The link couldn't be created. Please try again." };
  }
}

// ---------------------------------------------------------------------------
// Monad anchoring (owner-only)
// ---------------------------------------------------------------------------

/**
 * Owner-only. Anchors a client-confirmed record on Monad testnet. The service
 * checks the chain before sending and never re-sends after an uncertain
 * broadcast; the record shows as anchored only after an on-chain receipt.
 */
export async function anchorRecordAction(recordId: unknown): Promise<AnchorPanelState> {
  if (!(await getOwnerSession())) return { kind: "error", message: "Your session has ended. Sign in again." };
  if (typeof recordId !== "string") return { kind: "error", message: "This record couldn't be found." };
  try {
    const outcome = await getAnchorService().anchorRecord(recordId);
    refresh();
    return panelStateFromOutcome(outcome);
  } catch (error) {
    if (error instanceof UnauthorizedError) return { kind: "error", message: "Your session has ended. Sign in again." };
    console.error("[anchor] Anchoring failed:", error instanceof Error ? error.message : "unknown error");
    return { kind: "error", message: "Anchoring couldn't be completed. Please try again." };
  }
}

/** Owner-only. Re-checks an in-flight anchor from on-chain evidence. Never sends a transaction. */
export async function checkAnchorStatusAction(recordId: unknown): Promise<AnchorPanelState> {
  if (!(await getOwnerSession())) return { kind: "error", message: "Your session has ended. Sign in again." };
  if (typeof recordId !== "string") return { kind: "error", message: "This record couldn't be found." };
  try {
    const outcome = await getAnchorService().refresh(recordId);
    refresh();
    return panelStateFromOutcome(outcome);
  } catch (error) {
    if (error instanceof UnauthorizedError) return { kind: "error", message: "Your session has ended. Sign in again." };
    console.error("[anchor] Status check failed:", error instanceof Error ? error.message : "unknown error");
    return { kind: "error", message: "The status couldn't be checked. Please try again." };
  }
}
