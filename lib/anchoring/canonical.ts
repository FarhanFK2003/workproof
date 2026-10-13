import { createHash } from "node:crypto";

/*
 * Canonical record format "workproof-record-v1".
 *
 * The document is UTF-8 JSON with keys sorted by code point and no whitespace.
 * Covered fields (and nothing else):
 *   version, record_id, salt, title, category, summary, deliverables,
 *   period_start, period_end, client_organization, confirmed_at
 * Excluded on purpose: client name and email, amount, dispute notes, the
 * decider's name, confirmation tokens, and any server secret.
 *
 * Normalization: strings are Unicode NFC, CRLF/CR become LF, and surrounding
 * whitespace is trimmed; dates are YYYY-MM-DD; confirmed_at is UTC truncated to
 * whole seconds (YYYY-MM-DDTHH:MM:SSZ); an empty organization is null.
 *
 * contentHash      = 0x + sha256(document bytes)
 * recordCommitment = 0x + sha256("workproof-record-commitment-v1|" + record_id + "|" + salt)
 *
 * Changing any covered field (or the salt) changes contentHash, so a verifier
 * comparing it with the on-chain value detects modification. Anyone can
 * recompute both values from the document alone; no server secret is involved.
 * A matching hash proves integrity since anchoring. It does not prove that the
 * work claim is true or that any payment was made.
 */

export const CANONICAL_VERSION = "workproof-record-v1";
const COMMITMENT_PREFIX = "workproof-record-commitment-v1";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SALT = /^[0-9a-f]{32}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SECONDS_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const HASH = /^0x[0-9a-f]{64}$/;

export interface CanonicalRecordInput {
  recordId: string;
  salt: string;
  title: string;
  category: string;
  summary: string;
  deliverables: readonly string[];
  periodStart: string;
  periodEnd: string;
  clientOrganization: string | null | undefined;
  /** Any ISO 8601 timestamp; normalized to UTC whole seconds. */
  confirmedAt: string;
}

export interface CanonicalRecord {
  version: typeof CANONICAL_VERSION;
  record_id: string;
  salt: string;
  title: string;
  category: string;
  summary: string;
  deliverables: string[];
  period_start: string;
  period_end: string;
  client_organization: string | null;
  confirmed_at: string;
}

export class CanonicalRecordError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CanonicalRecordError";
  }
}

export function normalizeText(value: string): string {
  return value.normalize("NFC").replace(/\r\n?/g, "\n").trim();
}

export function normalizeTimestamp(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new CanonicalRecordError("confirmed_at is not a valid timestamp.");
  return new Date(Math.floor(ms / 1000) * 1000).toISOString().replace(".000Z", "Z");
}

export function toCanonicalRecord(input: CanonicalRecordInput): CanonicalRecord {
  const recordId = input.recordId.toLowerCase();
  if (!UUID.test(recordId)) throw new CanonicalRecordError("record_id must be a UUID.");
  if (!SALT.test(input.salt)) throw new CanonicalRecordError("salt must be 32 lowercase hex characters.");
  if (!DATE.test(input.periodStart) || !DATE.test(input.periodEnd)) {
    throw new CanonicalRecordError("period dates must be YYYY-MM-DD.");
  }
  const organization = input.clientOrganization ? normalizeText(input.clientOrganization) : "";
  return {
    version: CANONICAL_VERSION,
    record_id: recordId,
    salt: input.salt,
    title: normalizeText(input.title),
    category: normalizeText(input.category),
    summary: normalizeText(input.summary),
    deliverables: input.deliverables.map(normalizeText).filter(Boolean),
    period_start: input.periodStart,
    period_end: input.periodEnd,
    client_organization: organization || null,
    confirmed_at: normalizeTimestamp(input.confirmedAt),
  };
}

type Json = string | null | Json[] | { [key: string]: Json };

/** JSON with keys sorted by code point and no whitespace (deterministic). */
function stableStringify(value: Json): string {
  if (value === null || typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

export function serializeCanonicalRecord(record: CanonicalRecord): string {
  return stableStringify(record as unknown as Json);
}

const sha256Hex = (data: string) => `0x${createHash("sha256").update(data, "utf8").digest("hex")}`;

export function contentHashOf(record: CanonicalRecord): `0x${string}` {
  return sha256Hex(serializeCanonicalRecord(record)) as `0x${string}`;
}

export function recordCommitmentOf(recordId: string, salt: string): `0x${string}` {
  return sha256Hex(`${COMMITMENT_PREFIX}|${recordId.toLowerCase()}|${salt}`) as `0x${string}`;
}

/** Strictly parses a canonical document (as published on the verification page). */
export function parseCanonicalDocument(json: string): CanonicalRecord {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new CanonicalRecordError("The document is not valid JSON.");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new CanonicalRecordError("The document must be a JSON object.");
  }
  const doc = value as Record<string, unknown>;
  const expectedKeys = [
    "category", "client_organization", "confirmed_at", "deliverables", "period_end", "period_start",
    "record_id", "salt", "summary", "title", "version",
  ];
  if (Object.keys(doc).sort().join(",") !== expectedKeys.join(",")) {
    throw new CanonicalRecordError("The document has missing or unexpected fields.");
  }
  if (doc.version !== CANONICAL_VERSION) throw new CanonicalRecordError("Unsupported canonical version.");
  const strings = ["record_id", "salt", "title", "category", "summary", "period_start", "period_end", "confirmed_at"];
  if (strings.some((key) => typeof doc[key] !== "string")) {
    throw new CanonicalRecordError("The document has fields of the wrong type.");
  }
  if (!Array.isArray(doc.deliverables) || doc.deliverables.some((d) => typeof d !== "string")) {
    throw new CanonicalRecordError("deliverables must be a list of strings.");
  }
  if (doc.client_organization !== null && typeof doc.client_organization !== "string") {
    throw new CanonicalRecordError("client_organization must be a string or null.");
  }
  if (!SECONDS_UTC.test(doc.confirmed_at as string)) {
    throw new CanonicalRecordError("confirmed_at must be UTC with whole seconds.");
  }
  return doc as unknown as CanonicalRecord;
}

export type DocumentVerification =
  | { status: "match"; contentHash: string; recordCommitment: string }
  | { status: "content_mismatch" | "commitment_mismatch"; contentHash: string; recordCommitment: string }
  | { status: "invalid_document"; reason: string };

/**
 * Recomputes both values from a supplied document and compares them with the
 * expected (on-chain) values. The document is hashed exactly as given, so any
 * re-formatting or edit is detected.
 */
export function verifyCanonicalDocument(
  json: string,
  expected: { contentHash: string; recordCommitment: string },
): DocumentVerification {
  if (!HASH.test(expected.contentHash) || !HASH.test(expected.recordCommitment)) {
    return { status: "invalid_document", reason: "Expected values must be 0x-prefixed SHA-256 hashes." };
  }
  let record: CanonicalRecord;
  try {
    record = parseCanonicalDocument(json);
  } catch (error) {
    return { status: "invalid_document", reason: error instanceof Error ? error.message : "Invalid document." };
  }
  const contentHash = sha256Hex(json);
  const recordCommitment = recordCommitmentOf(record.record_id, record.salt);
  if (recordCommitment !== expected.recordCommitment) {
    return { status: "commitment_mismatch", contentHash, recordCommitment };
  }
  if (contentHash !== expected.contentHash) return { status: "content_mismatch", contentHash, recordCommitment };
  return { status: "match", contentHash, recordCommitment };
}
