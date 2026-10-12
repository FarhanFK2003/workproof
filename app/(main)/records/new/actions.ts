"use server";

import { getOwnerSession } from "@/lib/server/session";
import {
  parseWorkRecord,
  type FieldErrors,
  type WorkRecordFormValues,
} from "@/lib/validation";

export type CreateRecordState =
  | { status: "idle" }
  | { status: "unauthorized" }
  | { status: "invalid"; errors: FieldErrors<keyof WorkRecordFormValues> }
  | {
      status: "success";
      preview: { title: string; clientName: string; clientOrganization: string | null };
    };

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
 * Owner-only. Verifies the session and validates on the server.
 * Milestone 2B: records are not persisted yet. The database-backed version will
 * call createWorkRecord() from lib/server/records.ts, which re-checks the session.
 */
export async function createRecordAction(
  _previous: CreateRecordState,
  formData: FormData,
): Promise<CreateRecordState> {
  if (!(await getOwnerSession())) return { status: "unauthorized" };

  const parsed = parseWorkRecord(readWorkRecordForm(formData));
  if (!parsed.ok) return { status: "invalid", errors: parsed.errors };

  // Return only what the success screen shows, never the full input.
  return {
    status: "success",
    preview: {
      title: parsed.value.title,
      clientName: parsed.value.clientName,
      clientOrganization: parsed.value.clientOrganization,
    },
  };
}
