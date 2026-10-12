import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DemoNotice, DemoTag } from "@/components/demo-notice";
import { ArrowRightIcon, CheckIcon, HashIcon, LockIcon } from "@/components/icons";
import { Container, PageHeader } from "@/components/page-layout";
import { CopyLinkField } from "@/components/records/copy-link-field";
import { RecordTimeline } from "@/components/records/record-timeline";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { demoFreelancer, demoRecords, getDemoRecord } from "@/lib/demo-data";
import { formatDate, formatDateRange, formatMoney } from "@/lib/format";
import type { WorkRecord } from "@/lib/types";

export function generateStaticParams() {
  return demoRecords.map((record) => ({ id: record.id }));
}

export async function generateMetadata({
  params,
}: PageProps<"/records/[id]">): Promise<Metadata> {
  const { id } = await params;
  return { title: getDemoRecord(id)?.title ?? "Record not found" };
}

function ConfirmationCard({ record }: { record: WorkRecord }) {
  const path = record.confirmationToken ? `/confirm/${record.confirmationToken}` : null;

  if (record.status === "pending" && path) {
    return (
      <Card>
        <CardHeader
          title="Client confirmation link"
          description={`Send this link to ${record.client.name}. They can confirm or dispute without creating an account.`}
        />
        <CardBody className="space-y-3">
          <CopyLinkField path={path} label="Client confirmation link" />
          <div className="flex flex-col gap-2 border-t border-line pt-4 text-sm sm:flex-row sm:items-center sm:justify-between">
            {record.linkExpiresAt && (
              <p className="text-ink-subtle">Expires {formatDate(record.linkExpiresAt)}</p>
            )}
            <Link
              href={path}
              className="inline-flex items-center gap-1.5 font-medium text-accent-strong hover:underline focus-visible:outline-2 focus-visible:outline-accent"
            >
              Preview as client
              <ArrowRightIcon className="size-3.5" />
            </Link>
          </div>
        </CardBody>
      </Card>
    );
  }

  if (record.status === "draft") {
    return (
      <Card>
        <CardHeader
          title="Client confirmation link"
          description="Generate a secure, single-use link to send to your client."
        />
        <CardBody className="space-y-3">
          <Button disabled className="w-full" aria-describedby="generate-note">
            Generate confirmation link
          </Button>
          <p id="generate-note" className="text-xs leading-relaxed text-ink-subtle">
            Unavailable in this demo. Link generation is enabled once records are saved (next
            milestone).
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Client confirmation link"
        description={
          record.response
            ? `Used on ${formatDate(record.response.respondedAt)}. The link no longer accepts responses.`
            : "This link is no longer active."
        }
      />
      <CardBody />
    </Card>
  );
}

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
            Visible to you and the confirming client only. Never public or on-chain.
          </span>
        }
      />
      <CardBody>
        <dl className="divide-y divide-line text-sm">
          {rows.map((row) => (
            <div key={row.label} className="flex justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
              <dt className="shrink-0 text-ink-subtle">{row.label}</dt>
              <dd className={row.mono ? "truncate font-mono text-xs leading-5 text-ink" : "truncate text-ink"}>
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      </CardBody>
    </Card>
  );
}

function AnchoringCard({ record }: { record: WorkRecord }) {
  return (
    <Card>
      <CardHeader
        title="Integrity anchoring"
        action={<HashIcon className="mt-0.5 text-violet" />}
        description="Records a fingerprint of the confirmed record on Monad so anyone can check it hasn't changed."
      />
      <CardBody className="space-y-3">
        <p className="flex items-center justify-between rounded-lg bg-canvas px-3 py-2 text-sm">
          <span className="text-ink-subtle">Status</span>
          <span className="font-medium text-ink">Not anchored</span>
        </p>
        <Button variant="secondary" disabled className="w-full" aria-describedby="anchor-note">
          Anchor to Monad
        </Button>
        <p id="anchor-note" className="text-xs leading-relaxed text-ink-subtle">
          {record.status === "confirmed"
            ? "Coming in a later milestone. Only a salted fingerprint will be recorded, never emails, amounts, or receipts."
            : "Only client-confirmed records can be anchored."}
        </p>
      </CardBody>
    </Card>
  );
}

export default async function RecordPage({ params }: PageProps<"/records/[id]">) {
  const { id } = await params;
  const record = getDemoRecord(id);
  if (!record) notFound();

  return (
    <Container className="space-y-6 py-8 sm:py-10">
      <PageHeader
        back={{ href: "/dashboard", label: "All records" }}
        eyebrow={
          <>
            <StatusBadge status={record.status} />
            <DemoTag />
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

      <DemoNotice>This is a sample record. Buttons that would change it are simulated or disabled.</DemoNotice>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Work summary" />
            <CardBody className="space-y-5">
              <p className="text-[0.9375rem] leading-relaxed text-ink-muted">{record.summary}</p>
              {record.deliverables.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-ink">Deliverables</h3>
                  <ul className="mt-2 space-y-2">
                    {record.deliverables.map((item) => (
                      <li key={item} className="flex gap-2.5 text-sm text-ink-muted">
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
              <RecordTimeline record={record} freelancerName={demoFreelancer.name} />
            </CardBody>
          </Card>
        </div>

        <aside className="space-y-6" aria-label="Record actions and details">
          <ConfirmationCard record={record} />
          <PrivateDetails record={record} />
          <AnchoringCard record={record} />
        </aside>
      </div>
    </Container>
  );
}
