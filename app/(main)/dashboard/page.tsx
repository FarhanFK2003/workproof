import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DemoNotice } from "@/components/demo-notice";
import { PlusIcon } from "@/components/icons";
import { Container, PageHeader } from "@/components/page-layout";
import { PageSkeleton } from "@/components/page-skeleton";
import { RecordList } from "@/components/records/record-list";
import { buttonStyles } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { countByStatus, demoFreelancer, demoRecords } from "@/lib/demo-data";
import { requireOwnerForPage } from "@/lib/server/session";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <Container className="py-8 sm:py-10">
      <Suspense fallback={<PageSkeleton label="Loading dashboard" />}>
        <DashboardContent />
      </Suspense>
    </Container>
  );
}

function Metric({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <Card className="p-5">
      <dt className="text-sm font-medium text-ink-subtle">{label}</dt>
      <dd className="mt-2 text-3xl font-semibold tracking-tight text-ink tabular-nums">{value}</dd>
      <dd className="mt-1 text-xs text-ink-subtle">{hint}</dd>
    </Card>
  );
}

// Everything owner-specific renders here, after the server-side session check.
async function DashboardContent() {
  await requireOwnerForPage("/dashboard");
  const counts = countByStatus(demoRecords);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Work records"
        description={`${demoFreelancer.name} · ${demoFreelancer.headline}`}
        actions={
          <Link href="/records/new" className={buttonStyles()}>
            <PlusIcon />
            New record
          </Link>
        }
      />

      <DemoNotice>
        These records, clients, and amounts are fictional samples. Actions on this page
        aren&rsquo;t saved.
      </DemoNotice>

      <section aria-labelledby="summary-heading">
        <h2 id="summary-heading" className="sr-only">
          Summary
        </h2>
        <dl className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <Metric label="Total records" value={demoRecords.length} hint="Across all clients" />
          <Metric label="Client-confirmed" value={counts.confirmed} hint="Ready to share" />
          <Metric label="Awaiting client" value={counts.pending} hint="Link sent, no response yet" />
          <Metric label="Anchored" value={counts.anchored} hint="On-chain anchoring coming soon" />
        </dl>
      </section>

      <section aria-labelledby="records-heading" className="space-y-4">
        <h2 id="records-heading" className="text-lg font-semibold tracking-tight text-ink">
          All records
        </h2>
        <RecordList records={demoRecords} />
      </section>
    </div>
  );
}
