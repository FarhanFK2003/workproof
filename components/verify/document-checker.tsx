"use client";

import { useId, useState } from "react";
import { AlertIcon, CheckIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Result = { kind: "match" } | { kind: "mismatch"; detail: string } | { kind: "invalid"; detail: string };

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return `0x${Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Lets a verifier paste a record document they received and check it in the
 * browser against the anchored values. Same algorithm as lib/anchoring/canonical.ts;
 * nothing is sent to the server.
 */
export function DocumentChecker({ contentHash, recordCommitment }: { contentHash: string; recordCommitment: string }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const id = useId();

  async function check() {
    let doc: unknown;
    try {
      doc = JSON.parse(text);
    } catch {
      setResult({ kind: "invalid", detail: "That isn't valid JSON." });
      return;
    }
    const fields = doc as { record_id?: unknown; salt?: unknown; version?: unknown };
    if (typeof fields.record_id !== "string" || typeof fields.salt !== "string" || fields.version !== "workproof-record-v1") {
      setResult({ kind: "invalid", detail: "This doesn't look like a workproof-record-v1 document." });
      return;
    }
    const commitment = await sha256Hex(`workproof-record-commitment-v1|${fields.record_id.toLowerCase()}|${fields.salt}`);
    if (commitment !== recordCommitment) {
      setResult({ kind: "mismatch", detail: "This document belongs to a different record." });
      return;
    }
    const hash = await sha256Hex(text);
    setResult(
      hash === contentHash
        ? { kind: "match" }
        : { kind: "mismatch", detail: "The document differs from the anchored version (an edit, or extra spaces or line breaks)." },
    );
  }

  return (
    <div className="space-y-3">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        Check a document you received
      </label>
      <Textarea
        id={id}
        rows={4}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setResult(null);
        }}
        spellCheck={false}
        className="font-mono text-xs sm:text-xs"
        placeholder='{"category":"…","client_organization":…}'
      />
      <Button variant="secondary" onClick={check} disabled={!text.trim()}>
        Check document
      </Button>
      <p aria-live="polite" className="min-h-5 text-sm">
        {result?.kind === "match" && (
          <span className="inline-flex items-center gap-1.5 text-accent-strong">
            <CheckIcon /> Matches the anchored fingerprint exactly.
          </span>
        )}
        {result && result.kind !== "match" && (
          <span className="inline-flex items-start gap-1.5 text-danger">
            <AlertIcon className="mt-0.5" /> {result.detail}
          </span>
        )}
      </p>
    </div>
  );
}
