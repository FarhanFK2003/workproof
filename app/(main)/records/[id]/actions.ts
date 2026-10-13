"use server";

import { refresh } from "next/cache";
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
