import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { AlertIcon, CheckIcon, ClockIcon, HashIcon, InfoIcon, ShieldCheckIcon } from "@/components/icons";
import { Container } from "@/components/page-layout";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DocumentChecker } from "@/components/verify/document-checker";
import { contentHashOf } from "@/lib/anchoring/canonical";
import { evaluateVerification, type ChainCheck, type VerificationStatus } from "@/lib/anchoring/verification";
import { cn } from "@/lib/cn";
import { formatDate, formatDateRange } from "@/lib/format";
import { explorerAddressUrl, explorerTxUrl } from "@/lib/server/anchor-config";
import { getAnchorReader } from "@/lib/server/anchor-runtime";
import { getVerificationView } from "@/lib/server/anchors";
import { isConfirmLookupBlocked, recordInvalidConfirmToken } from "@/lib/server/confirm-throttle";
import { getTrustedClientKey } from "@/lib/server/session";

export const metadata: Metadata = {
  title: "Verify a work record",
  robots: { index: false, follow: false },
};

// Public, keyed by the record's random salt. Keys are request-time data.
export default function VerifyPage({ params }: PageProps<"/verify/[key]">) {
  return (
    <Container size="narrow">
      <Suspense fallback={<VerifySkeleton />}>
        {params.then(({ key }) => (
          <VerifyContent verificationKey={key} />
        ))}
      </Suspense>
    </Container>
  );
}

const BANNERS: Record<VerificationStatus, { tone: "ok" | "warn" | "bad" | "info"; title: string; body: string }> = {
  verified: {
    tone: "ok",
    title: "Verified: this record matches its Monad testnet anchor",
    body: "The record below hashes to the exact fingerprint stored on-chain, so it hasn't changed since it was anchored.",
  },
  modified: {
    tone: "bad",
    title: "This record no longer matches its anchored fingerprint",
    body: "Something in the record changed after anchoring. Treat the details below with caution.",
  },
  chain_mismatch: {
    tone: "bad",
    title: "The on-chain fingerprint is different",
    body: "The contract holds a different fingerprint for this record, so the details below can't be verified.",
  },
  not_on_chain: {
    tone: "warn",
    title: "The anchor wasn't found on the configured network",
    body: "This can happen after a Monad testnet reset or a contract change. The record can't currently be verified on-chain.",
  },
  unverifiable_now: {
    tone: "warn",
    title: "The chain couldn't be checked right now",
    body: "The record was anchored, but Monad testnet couldn't be reached. Try again shortly, or check the transaction on the explorer.",
  },
  in_progress: {
    tone: "info",
    title: "Anchoring is in progress",
    body: "The transaction hasn't been confirmed yet, so this record can't be verified on-chain yet.",
  },
  not_completed: {
    tone: "warn",
    title: "Anchoring didn't complete",
    body: "No confirmed anchor exists for this record yet.",
  },
};

async function checkChain(commitment: `0x${string}`): Promise<ChainCheck> {
  const reader = getAnchorReader();
  if (!reader) return { kind: "not_configured" };
  try {
    const anchor = await reader.readAnchor(commitment);
    return anchor ? { kind: "found", contentHash: anchor.contentHash, anchoredAt: anchor.anchoredAt } : { kind: "not_found" };
  } catch {
    return { kind: "unavailable" };
  }
}

async function VerifyContent({ verificationKey }: { verificationKey: string }) {
  const clientKey = await getTrustedClientKey();
  if (isConfirmLookupBlocked(clientKey)) {
    return (
      <Card className="p-6 text-sm text-ink-muted">
        Too many invalid verification links were opened from your network. Please wait a few minutes and try again.
      </Card>
    );
  }
  const view = await getVerificationView(verificationKey);
  if (!view) {
    recordInvalidConfirmToken(clientKey);
    notFound();
  }

  const { anchor, document, documentJson } = view;
  const chain = anchor.status === "confirmed" ? await checkChain(anchor.recordCommitment) : ({ kind: "not_found" } as const);
  const status = evaluateVerification({
    anchorStatus: anchor.status,
    storedContentHash: anchor.contentHash,
    recomputedContentHash: contentHashOf(document),
    chain,
  });
  const banner = BANNERS[status];
  const explorer = getAnchorReader()?.explorerUrl ?? null;
  const txUrl = anchor.txHash ? explorerTxUrl(explorer, anchor.txHash) : null;
  const contractUrl = anchor.contractAddress ? explorerAddressUrl(explorer, anchor.contractAddress) : null;
  const downloadHref = `data:application/json;charset=utf-8,${encodeURIComponent(documentJson)}`;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-sm font-medium text-accent-strong">Work record verification</p>
        <h1 className="text-2xl font-semibold tracking-tight text-balance text-ink sm:text-3xl">{document.title}</h1>
        <p className="text-[0.9375rem] text-ink-muted">
          {document.client_organization ? `${document.client_organization} · ` : ""}
          {formatDateRange(document.period_start, document.period_end)} · {document.category}
        </p>
      </header>

      <div
        role="status"
        className={cn(
          "flex gap-3 rounded-xl border p-4 sm:p-5",
          banner.tone === "ok" && "border-accent/30 bg-accent-soft",
          banner.tone === "warn" && "border-warning/30 bg-warning-soft",
          banner.tone === "bad" && "border-danger/30 bg-danger-soft",
          banner.tone === "info" && "border-line bg-surface",
        )}
      >
        {banner.tone === "ok" ? (
          <ShieldCheckIcon className="mt-0.5 size-5 text-accent-strong" />
        ) : banner.tone === "info" ? (
          <ClockIcon className="mt-0.5 size-5 text-ink-subtle" />
        ) : (
          <AlertIcon className={cn("mt-0.5 size-5", banner.tone === "bad" ? "text-danger" : "text-warning")} />
        )}
        <div>
          <h2 className="font-semibold text-ink">{banner.title}</h2>
          <p className="mt-1 text-sm leading-relaxed text-ink-muted">{banner.body}</p>
        </div>
      </div>

      <Card>
        <CardHeader title="The record" description={`Client-confirmed on ${formatDate(document.confirmed_at)}`} />
        <CardBody className="space-y-4">
          <p className="text-sm leading-relaxed whitespace-pre-line text-ink-muted">{document.summary}</p>
          {document.deliverables.length > 0 && (
            <ul className="space-y-2">
              {document.deliverables.map((item, index) => (
                <li key={index} className="flex gap-2.5 text-sm text-ink-muted">
                  <CheckIcon className="mt-0.5 text-accent" />
                  {item}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <section aria-labelledby="proves-heading" className="rounded-xl border border-line bg-surface/60 p-5 sm:p-6">
        <h2 id="proves-heading" className="flex items-center gap-2 text-sm font-semibold text-ink">
          <InfoIcon className="text-accent" />
          What this does and doesn&rsquo;t prove
        </h2>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-ink-muted">
          <li><strong className="text-ink">Client confirmation:</strong> the client confirmed this work through a single-use link.</li>
          <li><strong className="text-ink">Record integrity:</strong> a matching anchor shows the record hasn&rsquo;t changed since it was anchored.</li>
          <li><strong className="text-ink">Not proven:</strong> that the claim is true in every detail, or that any payment was made.</li>
        </ul>
      </section>

      <Card>
        <CardHeader title="On-chain anchor" action={<HashIcon className="mt-0.5 text-violet" />} />
        <CardBody>
          <dl className="divide-y divide-line text-sm">
            <Row label="Network">{anchor.chainId === 10143 ? "Monad testnet (10143)" : anchor.chainId ? `Chain ${anchor.chainId}` : "Not submitted"}</Row>
            <Row label="Content hash" mono>{anchor.contentHash}</Row>
            <Row label="Record commitment" mono>{anchor.recordCommitment}</Row>
            {anchor.txHash && (
              <Row label="Transaction" mono>
                {txUrl ? <a href={txUrl} target="_blank" rel="noreferrer noopener" className="text-accent-strong underline">{anchor.txHash}</a> : anchor.txHash}
              </Row>
            )}
            {anchor.blockNumber !== null && <Row label="Block" mono>{anchor.blockNumber.toString()}</Row>}
            {anchor.contractAddress && (
              <Row label="Contract" mono>
                {contractUrl ? <a href={contractUrl} target="_blank" rel="noreferrer noopener" className="text-accent-strong underline">{anchor.contractAddress}</a> : anchor.contractAddress}
              </Row>
            )}
          </dl>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Verify it yourself"
          description="You don't need to trust this page. The fingerprint is SHA-256 over the exact document below (format workproof-record-v1)."
        />
        <CardBody className="space-y-4">
          <pre className="max-h-48 overflow-auto rounded-lg bg-canvas p-3 font-mono text-xs leading-relaxed break-all whitespace-pre-wrap text-ink">
            {documentJson}
          </pre>
          <a
            href={downloadHref}
            download="workproof-record.json"
            className="inline-flex text-sm font-medium text-accent-strong underline underline-offset-2"
          >
            Download workproof-record.json
          </a>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-ink-muted">
            <li>
              Hash the downloaded file; it must equal the content hash:
              <code className="mt-1 block overflow-x-auto rounded bg-canvas px-2 py-1 font-mono text-xs">
                {`node -e "console.log('0x'+require('crypto').createHash('sha256').update(require('fs').readFileSync('workproof-record.json')).digest('hex'))"`}
              </code>
            </li>
            <li>
              The record commitment is SHA-256 of{" "}
              <code className="font-mono text-xs">{`workproof-record-commitment-v1|${document.record_id}|${document.salt}`}</code>.
            </li>
            <li>On the explorer, call <code className="font-mono text-xs">getAnchor(commitment)</code> on the contract; it returns the content hash.</li>
          </ol>
          <div className="border-t border-line pt-4">
            <DocumentChecker contentHash={anchor.contentHash} recordCommitment={anchor.recordCommitment} />
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function Row({ label, mono, children }: { label: string; mono?: boolean; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0 sm:flex-row sm:justify-between sm:gap-4">
      <dt className="shrink-0 text-ink-subtle">{label}</dt>
      <dd className={cn("min-w-0 break-all text-ink sm:text-right", mono && "font-mono text-xs leading-5")}>{children}</dd>
    </div>
  );
}

function VerifySkeleton() {
  return (
    <div role="status" aria-label="Loading verification" className="space-y-6">
      <div className="h-8 w-3/4 rounded-md bg-muted motion-safe:animate-pulse" />
      <div className="h-24 w-full rounded-xl bg-muted motion-safe:animate-pulse" />
      <Card className="space-y-3 p-6">
        <div className="h-4 w-1/3 rounded-md bg-muted motion-safe:animate-pulse" />
        <div className="h-16 w-full rounded-md bg-muted motion-safe:animate-pulse" />
      </Card>
    </div>
  );
}
