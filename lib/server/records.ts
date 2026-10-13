import "server-only";

import {
  CATEGORIES,
  CURRENCIES,
  type Category,
  type ClientResponse,
  type ConfirmationView,
  type Money,
  type RecordStatus,
  type WorkRecord,
} from "@/lib/types";
import { deriveLinkStatus } from "@/lib/status";
import {
  parseClientResponse,
  parseWorkRecord,
  type ClientResponseValues,
  type FieldErrors,
  type WorkRecordFormValues,
} from "@/lib/validation";
import type { Database } from "./database.types";
import { requireOwner } from "./session";
import { getServiceClient } from "./supabase";
import {
  CONFIRMATION_LINK_TTL_DAYS,
  generateConfirmationToken,
  hashConfirmationToken,
  isWellFormedToken,
} from "./tokens";

/*
 * Data-access layer for work records and client confirmations.
 *
 * This is the only module that talks to the database. Every function validates
 * its input before querying, because the service-role client bypasses RLS.
 * Status changes go through the database functions, which enforce the workflow.
 *
 * Authorization: freelancer operations call requireOwner() first and throw
 * UnauthorizedError without a valid owner session, regardless of which page or
 * action calls them. Client operations are authorized by the confirmation token.
 */

type WorkRecordRow = Database["public"]["Tables"]["work_records"]["Row"];
type RequestRow = Database["public"]["Tables"]["confirmation_requests"]["Row"];
type RequestSummary = Pick<RequestRow, "created_at" | "expires_at" | "consumed_at">;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STORED_STATUSES = ["draft", "pending", "confirmed", "disputed"] as const;

class DataAccessError extends Error {
  constructor(operation: string, cause: { code?: string; message: string }) {
    // Supabase error messages describe the query, not secrets, but keep them server-side.
    super(`Database operation "${operation}" failed${cause.code ? ` (${cause.code})` : ""}.`, {
      cause,
    });
    this.name = "DataAccessError";
  }
}

function expectOneOf<T extends string>(list: readonly T[], value: string, field: string): T {
  if ((list as readonly string[]).includes(value)) return value as T;
  throw new Error(`Unexpected ${field} value in database: ${value}`);
}

function toMoney(amount: number | null, currency: string | null): Money | undefined {
  if (amount === null || currency === null) return undefined;
  return { value: Number(amount), currency: expectOneOf(CURRENCIES, currency, "currency") };
}

function toResponse(
  row: Pick<WorkRecordRow, "decided_at" | "decided_by_name" | "decision_note">,
  status: RecordStatus,
): ClientResponse | undefined {
  if ((status !== "confirmed" && status !== "disputed") || !row.decided_at || !row.decided_by_name) {
    return undefined;
  }
  return {
    kind: status,
    respondedBy: row.decided_by_name,
    respondedAt: row.decided_at,
    note: row.decision_note ?? undefined,
  };
}

function latestRequest(requests: RequestSummary[]): RequestSummary | undefined {
  return requests.reduce<RequestSummary | undefined>(
    (latest, request) =>
      !latest || Date.parse(request.created_at) > Date.parse(latest.created_at) ? request : latest,
    undefined,
  );
}

function toWorkRecord(row: WorkRecordRow & { confirmation_requests: RequestSummary[] }): WorkRecord {
  const status = expectOneOf(STORED_STATUSES, row.status, "status");
  const request = latestRequest(row.confirmation_requests);
  return {
    id: row.id,
    title: row.title,
    category: expectOneOf<Category>(CATEGORIES, row.category, "category"),
    summary: row.summary,
    deliverables: row.deliverables,
    startDate: row.start_date,
    endDate: row.end_date,
    client: {
      name: row.client_name,
      organization: row.client_organization ?? undefined,
      email: row.client_email,
    },
    amount: toMoney(row.amount, row.currency),
    status,
    createdAt: row.created_at,
    linkSharedAt: request?.created_at,
    linkExpiresAt: request?.expires_at,
    linkStatus: request
      ? deriveLinkStatus(
          { expiresAt: request.expires_at, consumedAt: request.consumed_at },
          Date.now(),
        )
      : undefined,
    response: toResponse(row, status),
    isDemo: false,
  };
}

const RECORD_SELECT =
  "id, title, category, summary, deliverables, start_date, end_date, client_name, client_organization, client_email, amount, currency, status, decided_by_name, decision_note, decided_at, created_at, updated_at, confirmation_requests(created_at, expires_at, consumed_at)";

// ---------------------------------------------------------------------------
// Freelancer operations
// ---------------------------------------------------------------------------

export async function listWorkRecords(): Promise<WorkRecord[]> {
  await requireOwner();
  const { data, error } = await getServiceClient()
    .from("work_records")
    .select(RECORD_SELECT)
    .order("created_at", { ascending: false });
  if (error) throw new DataAccessError("listWorkRecords", error);
  return data.map(toWorkRecord);
}

export async function getWorkRecord(id: string): Promise<WorkRecord | null> {
  await requireOwner();
  if (!UUID_PATTERN.test(id)) return null;
  const { data, error } = await getServiceClient()
    .from("work_records")
    .select(RECORD_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new DataAccessError("getWorkRecord", error);
  return data ? toWorkRecord(data) : null;
}

export type CreateWorkRecordResult =
  | { ok: true; id: string }
  | { ok: false; errors: FieldErrors<keyof WorkRecordFormValues> };

/** Creates a record in 'draft' status. The database refuses any other status on insert. */
export async function createWorkRecord(
  values: WorkRecordFormValues,
): Promise<CreateWorkRecordResult> {
  await requireOwner();
  const parsed = parseWorkRecord(values);
  if (!parsed.ok) return parsed;
  const input = parsed.value;

  const { data, error } = await getServiceClient()
    .from("work_records")
    .insert({
      title: input.title,
      category: input.category,
      summary: input.summary,
      deliverables: input.deliverables,
      start_date: input.startDate,
      end_date: input.endDate,
      client_name: input.clientName,
      client_organization: input.clientOrganization,
      client_email: input.clientEmail,
      amount: input.amount?.value ?? null,
      currency: input.amount?.currency ?? null,
    })
    .select("id")
    .single();
  if (error) throw new DataAccessError("createWorkRecord", error);
  return { ok: true, id: data.id };
}

export type IssueLinkResult =
  | { ok: true; token: string; expiresAt: string }
  | { ok: false; reason: "not_found" | "already_decided" };

/**
 * Creates a single-use confirmation link and moves the record to 'pending'.
 * Any previous unused link for the record stops working.
 * The raw token is returned once for building the URL and is never stored.
 */
export async function issueConfirmationLink(recordId: string): Promise<IssueLinkResult> {
  await requireOwner();
  if (!UUID_PATTERN.test(recordId)) return { ok: false, reason: "not_found" };

  const { token, tokenHash } = generateConfirmationToken();
  const expiresAt = new Date(
    Date.now() + CONFIRMATION_LINK_TTL_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data, error } = await getServiceClient().rpc("issue_confirmation_request", {
    p_record_id: recordId,
    p_token_hash: tokenHash,
    p_expires_at: expiresAt,
  });
  if (error) throw new DataAccessError("issueConfirmationLink", error);

  if (data === "issued") return { ok: true, token, expiresAt };
  if (data === "not_found" || data === "already_decided") return { ok: false, reason: data };
  throw new Error(`Unexpected issue_confirmation_request result: ${data}`);
}

// ---------------------------------------------------------------------------
// Client operations (reached through a confirmation link, no account)
// ---------------------------------------------------------------------------

/** Loads what the client needs to review. Returns null for unknown or replaced links. */
export async function getConfirmationView(token: string): Promise<ConfirmationView | null> {
  if (!isWellFormedToken(token)) return null;

  const { data, error } = await getServiceClient()
    .from("confirmation_requests")
    .select(
      "expires_at, consumed_at, work_records(title, category, summary, deliverables, start_date, end_date, client_name, client_organization, amount, currency, status, decided_by_name, decision_note, decided_at)",
    )
    .eq("token_hash", hashConfirmationToken(token))
    .maybeSingle();
  if (error) throw new DataAccessError("getConfirmationView", error);
  if (!data?.work_records) return null;

  const row = data.work_records;
  const status = expectOneOf(STORED_STATUSES, row.status, "status");
  const linkStatus = deriveLinkStatus(
    { expiresAt: data.expires_at, consumedAt: data.consumed_at },
    Date.now(),
  );
  const state: ConfirmationView["state"] = linkStatus === "active" ? "open" : linkStatus;

  return {
    state,
    record: {
      title: row.title,
      category: expectOneOf<Category>(CATEGORIES, row.category, "category"),
      summary: row.summary,
      deliverables: row.deliverables,
      startDate: row.start_date,
      endDate: row.end_date,
      client: { name: row.client_name, organization: row.client_organization ?? undefined },
      amount: toMoney(row.amount, row.currency),
      status,
      response: toResponse(row, status),
    },
  };
}

export type SubmitDecisionResult =
  | { ok: true }
  | { ok: false; reason: "invalid_input"; errors: FieldErrors<"name" | "acknowledged" | "reason"> }
  | { ok: false; reason: "invalid" | "expired" | "already_used" | "not_pending" };

/**
 * Validates the client's response, then atomically consumes the token and records
 * the decision. Concurrent submissions are serialized by the database; only the
 * first succeeds and later ones get "already_used".
 */
export async function submitClientDecision(
  token: string,
  values: ClientResponseValues,
): Promise<SubmitDecisionResult> {
  if (!isWellFormedToken(token)) return { ok: false, reason: "invalid" };

  const parsed = parseClientResponse(values);
  if (!parsed.ok) return { ok: false, reason: "invalid_input", errors: parsed.errors };

  const { data, error } = await getServiceClient().rpc("submit_confirmation_decision", {
    p_token_hash: hashConfirmationToken(token),
    p_decision: parsed.value.decision,
    p_decided_by: parsed.value.decidedBy,
    p_note: parsed.value.note,
  });
  if (error) throw new DataAccessError("submitClientDecision", error);

  const outcome = data[0]?.outcome;
  if (outcome === "recorded") return { ok: true };
  if (
    outcome === "invalid" ||
    outcome === "expired" ||
    outcome === "already_used" ||
    outcome === "not_pending"
  ) {
    return { ok: false, reason: outcome };
  }
  throw new Error(`Unexpected submit_confirmation_decision result: ${outcome}`);
}
