import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DemoTag } from "@/components/demo-notice";
import { CheckIcon, LockIcon } from "@/components/icons";
import { Container, PageHeader } from "@/components/page-layout";
import { PageSkeleton } from "@/components/page-skeleton";
import { AnchorPanel } from "@/components/records/anchor-panel";
import { ConfirmationLinkPanel } from "@/components/records/confirmation-link-panel";
import { RecordTimeline } from "@/components/records/record-timeline";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDateRange, formatMoney } from "@/lib/format";
import { panelStateFromRow } from "@/lib/server/anchor-runtime";
import { getRecordAnchor } from "@/lib/server/anchors";
import { getWorkRecord } from "@/lib/server/records";
import { requireOwnerForPage } from "@/lib/server/session";
import type { WorkRecord } from "@/lib/types";

// Generic on purpose: metadata renders before the session check, so it must not
// reveal record details.
export const metadata: Metadata = { title: "Work record" };

function PrivateDetails({ record }: { record: WorkRecord }) {
  const rows: { label: string; value: string; mono?: boolean }[] = [
    { label: "Client email", value: record.client.email },
    { label: "Amount", value: record.amount ? formatMoney(record.amount) : "Not provided" },
    { label: "Record ID", value: record.id, mono: true },
  ];
  return (
    <Card>
      <CardHeader
        title="Private details"
        description={
          <span className="inline-flex items-start gap-1.5">
            <LockIcon className="mt-0.5 size-3.5" />
            Visible to you. The amount is also shown to the confirming client. Never public or
            on-chain.
          </span>
        }
      />
      <CardBody>
        <dl className="divide-y divide-line text-sm">
          {rows.map((row) => (
            <div key={row.label} className="flex justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
              <dt className="shrink-0 text-ink-subtle">{row.label}</dt>
              <dd className={row.mono ? "min-w-0 truncate font-mono text-xs leading-5 text-ink" : "min-w-0 truncate text-ink"}>
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      </CardBody>
    </Card>
  );
}

export default function RecordPage({ params }: PageProps<"/records/[id]">) {
  return (
    <Container className="py-8 sm:py-10">
      <Suspense fallback={<PageSkeleton label="Loading record" />}>
        {params.then(({ id }) => (
          <RecordContent id={id} />
        ))}
      </Suspense>
    </Container>
  );
}

// The session check runs before the lookup, so a guessed ID redirects to login
// instead of revealing whether the record exists. getWorkRecord() checks again.
async function RecordContent({ id }: { id: string }) {
  await requireOwnerForPage(`/records/${id}`);
  const record = await getWorkRecord(id);
  if (!record) notFound();
  // Anchoring state comes from the database only; the page never waits on the chain.
  const anchorState = panelStateFromRow(record.status, await getRecordAnchor(record.id));

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: "/dashboard", label: "All records" }}
        eyebrow={
          <>
            <StatusBadge status={record.status} />
            {record.isDemo && <DemoTag />}
          </>
        }
        title={record.title}
        description={
          <>
            {record.client.name}
            {record.client.organization && ` · ${record.client.organization}`} ·{" "}
            {formatDateRange(record.startDate, record.endDate)} · {record.category}
          </>
        }
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Work summary" />
            <CardBody className="space-y-5">
              <p className="text-[0.9375rem] leading-relaxed whitespace-pre-line text-ink-muted">
                {record.summary}
              </p>
              {record.deliverables.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-ink">Deliverables</h3>
                  <ul className="mt-2 space-y-2">
                    {record.deliverables.map((item, index) => (
                      <li key={index} className="flex gap-2.5 text-sm text-ink-muted">
                        <CheckIcon className="mt-0.5 text-accent" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Status timeline" />
            <CardBody>
              <RecordTimeline record={record} />
            </CardBody>
          </Card>
        </div>

        <aside className="space-y-6" aria-label="Record actions and details">
          <ConfirmationLinkPanel
            recordId={record.id}
            status={record.status}
            clientName={record.client.name}
            linkStatus={record.linkStatus}
            linkSharedAt={record.linkSharedAt}
            linkExpiresAt={record.linkExpiresAt}
            respondedAt={record.response?.respondedAt}
          />
          <PrivateDetails record={record} />
          <AnchorPanel recordId={record.id} initial={anchorState} />
        </aside>
      </div>
    </div>
  );
}
