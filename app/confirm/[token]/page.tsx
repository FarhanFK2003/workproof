import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { CheckIcon, ClockIcon, InfoIcon } from "@/components/icons";
import { Container } from "@/components/page-layout";
import { ConfirmPanel } from "@/components/records/confirm-panel";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDate, formatDateRange, formatMoney } from "@/lib/format";
import { getOwnerDisplayName } from "@/lib/server/app-config";
import { getConfirmationView } from "@/lib/server/records";
import type { ConfirmationView } from "@/lib/types";

export const metadata: Metadata = {
  title: "Review work confirmation",
  robots: { index: false, follow: false },
};

// Tokens are only known at request time, so params are read inside Suspense.
// Public route: the token is the authorization. It only ever resolves the one
// record it was issued for, and the view excludes the client email and IDs.
export default function ConfirmPage({ params }: PageProps<"/confirm/[token]">) {
  return (
    <Container size="narrow">
      <Suspense fallback={<ConfirmSkeleton />}>
        {params.then(({ token }) => (
          <ConfirmContent token={token} />
        ))}
      </Suspense>
    </Container>
  );
}

async function ConfirmContent({ token }: { token: string }) {
  const view = await getConfirmationView(token);
  if (!view) notFound();

  const ownerName = getOwnerDisplayName();
  const freelancerRef = ownerName ?? "the freelancer";
  const { record } = view;
  const canRespond = view.state === "open" && record.status === "pending";

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <p className="text-sm font-medium text-accent-strong">Work confirmation request</p>
        <h1 className="text-2xl font-semibold tracking-tight text-balance text-ink sm:text-3xl">
          {ownerName ?? "A freelancer"} asked you to confirm a completed project
        </h1>
        <p className="text-[0.9375rem] leading-relaxed text-ink-muted">
          Please review the details below and let them know whether they&rsquo;re accurate.
        </p>
      </header>

      <ClaimCard record={record} ownerName={ownerName} />

      <section
        aria-labelledby="meaning-heading"
        className="rounded-xl border border-line bg-surface/60 p-5 sm:p-6"
      >
        <h2 id="meaning-heading" className="flex items-center gap-2 text-sm font-semibold text-ink">
          <InfoIcon className="text-accent" />
          What your confirmation means
        </h2>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-ink-muted">
          <li>You&rsquo;re confirming the work described above was delivered.</li>
          <li>It does not confirm or prove that payment was made.</li>
          <li>Your email address and the amount are never shown publicly.</li>
        </ul>
      </section>

      {canRespond ? (
        <ConfirmPanel
          token={token}
          freelancerName={freelancerRef}
          organization={record.client.organization}
        />
      ) : view.state === "expired" && record.status === "pending" ? (
        <StatusCard
          icon={<ClockIcon className="size-5" />}
          title="This link has expired"
          description={`Ask ${freelancerRef} to send you a new confirmation link.`}
        />
      ) : (
        <StatusCard
          icon={<CheckIcon className="size-5" />}
          title="This request has already been answered"
          description={
            record.response
              ? `${record.response.respondedBy} responded on ${formatDate(record.response.respondedAt)}. No further action is needed.`
              : "This link no longer accepts responses."
          }
          badge={<StatusBadge status={record.status} />}
        />
      )}
    </div>
  );
}

function ClaimCard({
  record,
  ownerName,
}: {
  record: ConfirmationView["record"];
  ownerName: string | null;
}) {
  const details: { label: string; value: string }[] = [
    {
      label: "Client",
      value: record.client.organization
        ? `${record.client.name}, ${record.client.organization}`
        : record.client.name,
    },
    { label: "Project period", value: formatDateRange(record.startDate, record.endDate) },
    { label: "Category", value: record.category },
  ];
  if (record.amount) {
    details.push({ label: "Stated amount", value: `${formatMoney(record.amount)} (private)` });
  }

  return (
    <Card>
      <CardHeader
        title={record.title}
        description={ownerName ? `Submitted by ${ownerName}` : undefined}
      />
      <CardBody className="space-y-5">
        <dl className="grid gap-x-6 gap-y-3 rounded-lg bg-canvas p-4 text-sm sm:grid-cols-2">
          {details.map((item) => (
            <div key={item.label}>
              <dt className="text-ink-subtle">{item.label}</dt>
              <dd className="mt-0.5 font-medium text-ink">{item.value}</dd>
            </div>
          ))}
        </dl>
        <div>
          <h3 className="text-sm font-medium text-ink">Summary</h3>
          <p className="mt-1.5 text-sm leading-relaxed whitespace-pre-line text-ink-muted">
            {record.summary}
          </p>
        </div>
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
  );
}

function StatusCard({
  icon,
  title,
  description,
  badge,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  badge?: ReactNode;
}) {
  return (
    <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-ink-subtle">
          {icon}
        </span>
        <div>
          <h2 className="text-[0.9375rem] font-semibold text-ink">{title}</h2>
          <p className="mt-1 text-sm text-ink-subtle">{description}</p>
        </div>
      </div>
      {badge}
    </Card>
  );
}

function ConfirmSkeleton() {
  return (
    <div role="status" aria-label="Loading confirmation request" className="space-y-6">
      <div className="space-y-3">
        <div className="h-4 w-40 rounded-md bg-muted motion-safe:animate-pulse" />
        <div className="h-8 w-4/5 rounded-md bg-muted motion-safe:animate-pulse" />
      </div>
      <Card className="space-y-3 p-6">
        <div className="h-4 w-1/3 rounded-md bg-muted motion-safe:animate-pulse" />
        <div className="h-20 w-full rounded-md bg-muted motion-safe:animate-pulse" />
        <div className="h-4 w-2/3 rounded-md bg-muted motion-safe:animate-pulse" />
      </Card>
    </div>
  );
}
