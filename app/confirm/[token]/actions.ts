"use server";

import { isConfirmLookupBlocked, recordInvalidConfirmToken } from "@/lib/server/confirm-throttle";
import { submitClientDecision } from "@/lib/server/records";
import { getTrustedClientKey } from "@/lib/server/session";
import type { ClientResponseValues, FieldErrors } from "@/lib/validation";

export type DecisionState =
  | { status: "idle" }
  | { status: "recorded"; kind: "confirmed" | "disputed" }
  | { status: "invalid_input"; errors: FieldErrors<"name" | "acknowledged" | "reason"> }
  | { status: "invalid" | "expired" | "already_used" | "not_pending" | "rate_limited" }
  | { status: "error" };

/** Accepts only the expected shape; everything from the browser is untrusted. */
function readValues(input: unknown): ClientResponseValues | null {
  if (typeof input !== "object" || input === null) return null;
  const v = input as Record<string, unknown>;
  if (v.kind !== "confirmed" && v.kind !== "disputed") return null;
  if (typeof v.name !== "string" || typeof v.reason !== "string" || typeof v.acknowledged !== "boolean") {
    return null;
  }
  return { kind: v.kind, name: v.name, acknowledged: v.acknowledged, reason: v.reason };
}

/**
 * Public: authorized by the confirmation token, not an owner session. The
 * database function consumes the token and records the decision atomically,
 * so duplicate or concurrent submissions cannot both succeed.
 */
export async function submitDecisionAction(token: unknown, input: unknown): Promise<DecisionState> {
  const clientKey = await getTrustedClientKey();
  if (isConfirmLookupBlocked(clientKey)) return { status: "rate_limited" };
  if (typeof token !== "string") {
    recordInvalidConfirmToken(clientKey);
    return { status: "invalid" };
  }
  const values = readValues(input);
  if (!values) return { status: "invalid_input", errors: { name: "Please check your response and try again." } };

  try {
    const result = await submitClientDecision(token, values);
    if (result.ok) return { status: "recorded", kind: values.kind };
    if (result.reason === "invalid_input") return { status: "invalid_input", errors: result.errors };
    if (result.reason === "invalid") recordInvalidConfirmToken(clientKey);
    return { status: result.reason };
  } catch (error) {
    // Never log the token or the submitted values.
    console.error("[confirm] Could not record a client decision:", error instanceof Error ? error.message : "unknown error");
    return { status: "error" };
  }
}
