"use server";

import { redirect } from "next/navigation";
import { createWorkRecord } from "@/lib/server/records";
import { getOwnerSession, UnauthorizedError } from "@/lib/server/session";
import type { FieldErrors, WorkRecordFormValues } from "@/lib/validation";

export type CreateRecordState =
  | { status: "idle" }
  | { status: "unauthorized" }
  | { status: "invalid"; errors: FieldErrors<keyof WorkRecordFormValues> }
  | { status: "error" };

const FIELDS = [
  "title",
  "category",
  "startDate",
  "endDate",
  "summary",
  "deliverables",
  "clientName",
  "clientOrganization",
  "clientEmail",
  "amount",
  "currency",
] as const satisfies readonly (keyof WorkRecordFormValues)[];

/** Reads only the expected fields, as strings. Anything else is ignored. */
function readWorkRecordForm(formData: FormData): WorkRecordFormValues {
  const values = {} as WorkRecordFormValues;
  for (const field of FIELDS) {
    const value = formData.get(field);
    values[field] = typeof value === "string" ? value : "";
  }
  return values;
}

/**
 * Owner-only. Validates on the server, saves the record as a draft, and
 * redirects to it. createWorkRecord() re-checks the session and re-validates.
 */
export async function createRecordAction(
  _previous: CreateRecordState,
  formData: FormData,
): Promise<CreateRecordState> {
  if (!(await getOwnerSession())) return { status: "unauthorized" };

  let result: Awaited<ReturnType<typeof createWorkRecord>>;
  try {
    result = await createWorkRecord(readWorkRecordForm(formData));
  } catch (error) {
    if (error instanceof UnauthorizedError) return { status: "unauthorized" };
    // Log only our own message (operation + error code), never the submitted data.
    console.error("[records] Could not create record:", error instanceof Error ? error.message : "unknown error");
    return { status: "error" };
  }

  if (!result.ok) return { status: "invalid", errors: result.errors };
  // Outside the try: redirect() works by throwing.
  redirect(`/records/${result.id}`);
}
