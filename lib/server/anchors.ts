import "server-only";

import type { Hex } from "viem";
import {
  CANONICAL_VERSION,
  serializeCanonicalRecord,
  toCanonicalRecord,
  type CanonicalRecord,
} from "@/lib/anchoring/canonical";
import type { Database } from "./database.types";
import type { AnchorableRecord, AnchorRow, AnchorRowStatus, AnchorStore } from "./anchoring";
import { requireOwner } from "./session";
import { getServiceClient } from "./supabase";

/*
 * Data access for record anchors (migration 20261013120000).
 * Owner operations call requireOwner(). The verification lookup is public and
 * keyed by the record's 128-bit random salt, which only appears in links the
 * owner chooses to share; it returns canonical (non-private) fields only.
 */

type AnchorDbRow = Database["public"]["Tables"]["record_anchors"]["Row"];
const STATUSES: readonly AnchorRowStatus[] = ["preparing", "submitted", "confirmed", "failed"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SALT = /^[0-9a-f]{32}$/;
const ANCHOR_COLUMNS =
  "record_id, canonical_version, salt, record_commitment, content_hash, status, chain_id, contract_address, tx_hash, block_number, failure_code, attempts, created_at, updated_at, submitted_at, confirmed_at";

class AnchorDataError extends Error {
  constructor(operation: string, code?: string) {
    super(`Database operation "${operation}" failed${code ? ` (${code})` : ""}.`);
    this.name = "AnchorDataError";
  }
}

function toAnchorRow(row: AnchorDbRow): AnchorRow {
  if (!STATUSES.includes(row.status as AnchorRowStatus)) throw new Error(`Unexpected anchor status: ${row.status}`);
  return {
    status: row.status as AnchorRowStatus,
    salt: row.salt,
    recordCommitment: row.record_commitment as Hex,
    contentHash: row.content_hash as Hex,
    txHash: row.tx_hash as Hex | null,
    chainId: row.chain_id,
    contractAddress: row.contract_address as Hex | null,
    blockNumber: row.block_number === null ? null : BigInt(row.block_number),
    failureCode: row.failure_code,
  };
}

let reportedMissingTable = false;

/** PostgREST "relation not found": the anchors migration hasn't been applied yet. */
function isMissingTable(code: string | undefined): boolean {
  if (code !== "PGRST205" && code !== "42P01") return false;
  if (!reportedMissingTable) {
    reportedMissingTable = true;
    console.error("[anchor] record_anchors table not found; apply migration 20261013120000 to enable anchoring.");
  }
  return true;
}

async function selectAnchor(recordId: string): Promise<AnchorRow | null> {
  if (!UUID.test(recordId)) return null;
  const { data, error } = await getServiceClient()
    .from("record_anchors")
    .select(ANCHOR_COLUMNS)
    .eq("record_id", recordId.toLowerCase())
    .maybeSingle();
  if (error) {
    if (isMissingTable(error.code)) return null;
    throw new AnchorDataError("loadAnchor", error.code);
  }
  return data ? toAnchorRow(data) : null;
}

/** Owner-only: IDs of records whose anchor is confirmed on-chain (empty before the migration). */
export async function listAnchoredRecordIds(): Promise<Set<string>> {
  await requireOwner();
  const { data, error } = await getServiceClient().from("record_anchors").select("record_id").eq("status", "confirmed");
  if (error) {
    if (isMissingTable(error.code)) return new Set();
    throw new AnchorDataError("listAnchoredRecordIds", error.code);
  }
  return new Set(data.map((row) => row.record_id));
}

/** Owner-only store used by the anchoring service. */
export const ownerAnchorStore: AnchorStore = {
  async loadRecord(recordId): Promise<AnchorableRecord | null> {
    await requireOwner();
    if (!UUID.test(recordId)) return null;
    const { data, error } = await getServiceClient()
      .from("work_records")
      .select("id, status, title, category, summary, deliverables, start_date, end_date, client_organization, decided_at")
      .eq("id", recordId)
      .maybeSingle();
    if (error) throw new AnchorDataError("loadRecord", error.code);
    if (!data) return null;
    return {
      status: data.status,
      input: {
        recordId: data.id,
        title: data.title,
        category: data.category,
        summary: data.summary,
        deliverables: data.deliverables,
        periodStart: data.start_date,
        periodEnd: data.end_date,
        clientOrganization: data.client_organization,
        confirmedAt: data.status === "confirmed" ? data.decided_at : null,
      },
    };
  },

  async loadAnchor(recordId) {
    await requireOwner();
    return selectAnchor(recordId);
  },

  async begin(recordId, values) {
    await requireOwner();
    const { data, error } = await getServiceClient().rpc("begin_record_anchor", {
      p_record_id: recordId,
      p_canonical_version: CANONICAL_VERSION,
      p_salt: values.salt,
      p_record_commitment: values.recordCommitment,
      p_content_hash: values.contentHash,
    });
    if (error) throw new AnchorDataError("begin_record_anchor", error.code);
    const outcome = data[0]?.outcome;
    if (outcome === "created" || outcome === "exists" || outcome === "not_found" || outcome === "not_confirmed") {
      return outcome;
    }
    throw new Error(`Unexpected begin_record_anchor outcome: ${outcome}`);
  },

  async markSubmitted(recordId, tx) {
    await requireOwner();
    const { data, error } = await getServiceClient().rpc("mark_record_anchor_submitted", {
      p_record_id: recordId,
      p_tx_hash: tx.txHash.toLowerCase(),
      p_chain_id: tx.chainId,
      p_contract_address: tx.contractAddress.toLowerCase(),
    });
    if (error) throw new AnchorDataError("mark_record_anchor_submitted", error.code);
    return data;
  },

  async resolveConfirmed(recordId, tx) {
    await requireOwner();
    const { data, error } = await getServiceClient().rpc("resolve_record_anchor", {
      p_record_id: recordId,
      p_outcome: "confirmed",
      p_tx_hash: tx.txHash.toLowerCase(),
      p_chain_id: tx.chainId,
      p_contract_address: tx.contractAddress.toLowerCase(),
      p_block_number: Number(tx.blockNumber),
    });
    if (error) throw new AnchorDataError("resolve_record_anchor", error.code);
    return data;
  },

  async resolveFailed(recordId, failureCode) {
    await requireOwner();
    const { data, error } = await getServiceClient().rpc("resolve_record_anchor", {
      p_record_id: recordId,
      p_outcome: "failed",
      p_failure_code: failureCode,
    });
    if (error) throw new AnchorDataError("resolve_record_anchor", error.code);
    return data;
  },
};

/** Owner-only: the anchor row for the record page (null when never started). */
export async function getRecordAnchor(recordId: string): Promise<AnchorRow | null> {
  await requireOwner();
  return selectAnchor(recordId);
}

export interface VerificationView {
  anchor: AnchorRow;
  /** Canonical document recomputed from the current stored record. */
  document: CanonicalRecord;
  /** Exact bytes that were hashed (sorted keys, no whitespace). */
  documentJson: string;
}

/**
 * Public: looks up an anchor by its salt (the verification key). Returns null
 * for unknown keys. Exposes canonical fields only: no client name, email,
 * amount, notes, or tokens.
 */
export async function getVerificationView(key: string): Promise<VerificationView | null> {
  if (!SALT.test(key)) return null;
  const db = getServiceClient();
  const { data: row, error } = await db.from("record_anchors").select(ANCHOR_COLUMNS).eq("salt", key).maybeSingle();
  if (error) {
    if (isMissingTable(error.code)) return null;
    throw new AnchorDataError("getVerificationView", error.code);
  }
  if (!row) return null;

  const { data: record, error: recordError } = await db
    .from("work_records")
    .select("id, status, title, category, summary, deliverables, start_date, end_date, client_organization, decided_at")
    .eq("id", row.record_id)
    .maybeSingle();
  if (recordError) throw new AnchorDataError("getVerificationView", recordError.code);
  if (!record || record.status !== "confirmed" || !record.decided_at) return null;

  const document = toCanonicalRecord({
    recordId: record.id,
    salt: row.salt,
    title: record.title,
    category: record.category,
    summary: record.summary,
    deliverables: record.deliverables,
    periodStart: record.start_date,
    periodEnd: record.end_date,
    clientOrganization: record.client_organization,
    confirmedAt: record.decided_at,
  });
  return { anchor: toAnchorRow(row), document, documentJson: serializeCanonicalRecord(document) };
}
