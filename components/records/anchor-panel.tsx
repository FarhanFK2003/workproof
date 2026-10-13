"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import { anchorRecordAction, checkAnchorStatusAction } from "@/app/(main)/records/[id]/actions";
import { AlertIcon, ArrowRightIcon, CheckIcon, ClockIcon, HashIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import type { AnchorPanelState } from "@/lib/anchoring/panel";
import { CopyLinkField } from "./copy-link-field";

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex items-center gap-1.5 font-medium text-accent-strong hover:underline focus-visible:outline-2 focus-visible:outline-accent"
    >
      {children}
      <ArrowRightIcon className="size-3.5" />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

const shortHash = (hash: string) => `${hash.slice(0, 10)}…${hash.slice(-8)}`;

export function AnchorPanel({ recordId, initial }: { recordId: string; initial: AnchorPanelState }) {
  const [state, setState] = useState<AnchorPanelState>(initial);
  const [pending, startTransition] = useTransition();
  const statusRef = useRef<HTMLDivElement>(null);

  function run(action: typeof anchorRecordAction) {
    startTransition(async () => {
      let next: AnchorPanelState;
      try {
        next = await action(recordId);
      } catch {
        next = { kind: "error", message: "The request didn't complete. Check your connection and try again." };
      }
      setState(next);
      requestAnimationFrame(() => statusRef.current?.focus());
    });
  }

  return (
    <Card>
      <CardHeader
        title="Integrity anchoring"
        action={<HashIcon className="mt-0.5 text-violet" />}
        description="Records a fingerprint of the confirmed record on Monad testnet so anyone can check it hasn't changed."
      />
      <CardBody className="space-y-3">
        <div ref={statusRef} tabIndex={-1} aria-live="polite" className="space-y-3 focus:outline-none">
          {state.kind === "anchored" && (
            <>
              <p className="flex items-center gap-2 rounded-lg bg-violet-soft px-3 py-2 text-sm font-medium text-violet">
                <CheckIcon />
                Anchored on Monad testnet
              </p>
              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-subtle">Transaction</dt>
                  <dd className="font-mono text-xs text-ink">{shortHash(state.txHash)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-subtle">Block</dt>
                  <dd className="font-mono text-xs text-ink">{state.blockNumber}</dd>
                </div>
              </dl>
              {state.txUrl && <ExternalLink href={state.txUrl}>View on explorer</ExternalLink>}
              {state.verifyUrl && (
                <div className="space-y-1.5 border-t border-line pt-3">
                  <p className="text-sm font-medium text-ink">Verification link</p>
                  <CopyLinkField url={state.verifyUrl} label="Public verification link" />
                  <p className="text-xs leading-relaxed text-ink-subtle">
                    Anyone with this link sees the work details, client organization, and confirmation
                    date, but not the client&rsquo;s name, email, or the amount.
                  </p>
                </div>
              )}
            </>
          )}

          {state.kind === "in_progress" && (
            <p className="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2.5 text-sm text-ink">
              <ClockIcon className="mt-0.5 text-warning" />
              <span>
                {state.uncertain
                  ? "Anchoring started, but the network hasn't confirmed it yet. Check the status before trying again."
                  : "Transaction submitted. Waiting for it to be confirmed on Monad testnet."}
                {state.txUrl && (
                  <>
                    {" "}
                    <a href={state.txUrl} target="_blank" rel="noreferrer noopener" className="font-medium underline">
                      View transaction
                    </a>
                  </>
                )}
              </span>
            </p>
          )}

          {(state.kind === "failed" || state.kind === "error") && (
            <p role="alert" className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2.5 text-sm text-ink">
              <AlertIcon className="mt-0.5 text-danger" />
              {state.message}
            </p>
          )}

          {state.kind === "ineligible" && (
            <p className="rounded-lg bg-canvas px-3 py-2 text-sm text-ink-subtle">
              Only client-confirmed records can be anchored.
            </p>
          )}
          {state.kind === "unavailable" && (
            <p className="rounded-lg bg-canvas px-3 py-2 text-sm text-ink-subtle">
              {state.reason === "misconfigured"
                ? "Anchoring is turned off because its server configuration is invalid."
                : "Anchoring isn't set up on this server."}
            </p>
          )}
        </div>

        {(state.kind === "ready" || state.kind === "failed") && (
          <Button className="w-full" onClick={() => run(anchorRecordAction)} loading={pending} loadingText="Anchoring…">
            {state.kind === "failed" ? "Try again" : "Anchor to Monad testnet"}
          </Button>
        )}
        {(state.kind === "in_progress" || state.kind === "error") && (
          <Button variant="secondary" className="w-full" onClick={() => run(checkAnchorStatusAction)} loading={pending} loadingText="Checking…">
            Check status
          </Button>
        )}

        <p className="text-xs leading-relaxed text-ink-subtle">
          Only a salted fingerprint goes on-chain, never names, emails, amounts, or receipts. An anchor
          proves the record hasn&rsquo;t changed since; it doesn&rsquo;t prove the claim or any payment.
        </p>
      </CardBody>
    </Card>
  );
}
