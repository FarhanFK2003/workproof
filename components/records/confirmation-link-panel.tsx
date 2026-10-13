"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import {
  issueConfirmationLinkAction,
  type IssueLinkState,
} from "@/app/(main)/records/[id]/actions";
import { AlertIcon, ArrowRightIcon, ClockIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import type { LinkStatus, RecordStatus } from "@/lib/types";
import { CopyLinkField } from "./copy-link-field";

interface ConfirmationLinkPanelProps {
  recordId: string;
  status: RecordStatus;
  clientName: string;
  linkStatus?: LinkStatus;
  linkSharedAt?: string;
  linkExpiresAt?: string;
  respondedAt?: string;
}

const errorMessages: Partial<Record<IssueLinkState["status"], string>> = {
  not_found: "This record couldn't be found. It may have been removed.",
  already_decided: "Your client has already responded, so a new link isn't needed.",
};

export function ConfirmationLinkPanel(props: ConfirmationLinkPanelProps) {
  const { recordId, status, clientName, linkStatus, linkSharedAt, linkExpiresAt, respondedAt } = props;
  const [state, setState] = useState<IssueLinkState>({ status: "idle" });
  const [confirmingReplace, setConfirmingReplace] = useState(false);
  const [pending, startTransition] = useTransition();
  const alertRef = useRef<HTMLDivElement>(null);
  const issuedRef = useRef<HTMLHeadingElement>(null);

  function issue() {
    setConfirmingReplace(false);
    startTransition(async () => {
      let next: IssueLinkState;
      try {
        next = await issueConfirmationLinkAction(recordId);
      } catch {
        next = { status: "error", message: "The link couldn't be created. Check your connection and try again." };
      }
      setState(next);
      requestAnimationFrame(() =>
        (next.status === "issued" ? issuedRef.current : alertRef.current)?.focus(),
      );
    });
  }

  const decided = status === "confirmed" || status === "disputed" || status === "anchored";

  if (state.status === "issued") {
    return (
      <Card>
        <div className="px-5 pt-5 sm:px-6">
          <h2 ref={issuedRef} tabIndex={-1} className="text-[0.9375rem] font-semibold tracking-tight text-ink focus:outline-none">
            Your confirmation link is ready
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-ink-subtle">
            Send it to {clientName}. They can confirm or dispute without creating an account.
          </p>
        </div>
        <CardBody className="space-y-3">
          <CopyLinkField url={state.url} label="Client confirmation link" />
          <p className="rounded-lg bg-warning-soft px-3 py-2.5 text-xs leading-relaxed text-ink-muted">
            <span className="font-semibold text-warning">Copy it now.</span> For security, WorkProof
            stores only a fingerprint of this link, so it can&rsquo;t be shown again. You can always
            generate a replacement, and the old link stops working.
          </p>
          <div className="flex flex-col gap-2 border-t border-line pt-4 text-sm sm:flex-row sm:items-center sm:justify-between">
            <p className="text-ink-subtle">Expires {formatDate(state.expiresAt)}</p>
            <a
              href={state.url}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 font-medium text-accent-strong hover:underline focus-visible:outline-2 focus-visible:outline-accent"
            >
              Preview as client
              <ArrowRightIcon className="size-3.5" />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </div>
        </CardBody>
      </Card>
    );
  }

  const failure =
    state.status === "error"
      ? state.message
      : state.status === "unauthorized" || state.status === "idle"
        ? null
        : errorMessages[state.status];

  return (
    <Card>
      <CardHeader
        title="Client confirmation link"
        description={
          decided
            ? `Used on ${respondedAt ? formatDate(respondedAt) : "a previous date"}. The link no longer accepts responses.`
            : `A secure, single-use link for ${clientName}. No account or wallet needed.`
        }
      />
      <CardBody className="space-y-3">
        {(state.status === "unauthorized" || failure) && (
          <div
            ref={alertRef}
            tabIndex={-1}
            role="alert"
            className="flex gap-2.5 rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm focus:outline-2 focus:outline-offset-2 focus:outline-danger"
          >
            <AlertIcon className="mt-0.5 text-danger" />
            {state.status === "unauthorized" ? (
              <p className="text-ink">
                Your session has ended.{" "}
                <Link
                  href={`/login?next=${encodeURIComponent(`/records/${recordId}`)}`}
                  className="font-medium text-danger underline underline-offset-2 hover:no-underline"
                >
                  Sign in again
                </Link>
                .
              </p>
            ) : (
              <p className="text-ink">{failure}</p>
            )}
          </div>
        )}

        {!decided && linkStatus === "active" && linkExpiresAt && (
          <p className="flex items-start gap-2 rounded-lg bg-canvas px-3 py-2.5 text-sm text-ink-muted">
            <ClockIcon className="mt-0.5 text-ink-subtle" />
            <span>
              Link created {linkSharedAt ? formatDate(linkSharedAt) : ""} · expires{" "}
              {formatDate(linkExpiresAt)}. For security it can&rsquo;t be displayed again.
            </span>
          </p>
        )}
        {!decided && linkStatus === "expired" && linkExpiresAt && (
          <p className="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2.5 text-sm text-ink">
            <ClockIcon className="mt-0.5 text-warning" />
            <span>
              The link expired on {formatDate(linkExpiresAt)}. Generate a new one to send to{" "}
              {clientName}.
            </span>
          </p>
        )}

        {!decided &&
          (linkStatus === "active" && !confirmingReplace ? (
            <Button variant="secondary" className="w-full" onClick={() => setConfirmingReplace(true)}>
              Generate a new link
            </Button>
          ) : linkStatus === "active" && confirmingReplace ? (
            <div className="space-y-3 rounded-lg border border-line p-3">
              <p className="text-sm text-ink">
                The link you already sent will stop working. Continue?
              </p>
              <div className="flex gap-2">
                <Button size="sm" onClick={issue} loading={pending} loadingText="Generating…">
                  Replace link
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmingReplace(false)} disabled={pending}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button className="w-full" onClick={issue} loading={pending} loadingText="Generating…">
              {linkStatus === "expired" ? "Generate a new link" : "Generate confirmation link"}
            </Button>
          ))}
      </CardBody>
    </Card>
  );
}
