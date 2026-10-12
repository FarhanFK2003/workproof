import type { Metadata } from "next";
import Link from "next/link";
import { DemoNotice } from "@/components/demo-notice";
import { PlusIcon } from "@/components/icons";
import { Container, PageHeader } from "@/components/page-layout";
import { RecordList } from "@/components/records/record-list";
import { buttonStyles } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { countByStatus, demoFreelancer, demoRecords } from "@/lib/demo-data";

export const metadata: Metadata = { title: "Dashboard" };

function Metric({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <Card className="p-5">
      <dt className="text-sm font-medium text-ink-subtle">{label}</dt>
      <dd className="mt-2 text-3xl font-semibold tracking-tight text-ink tabular-nums">{value}</dd>
      <dd className="mt-1 text-xs text-ink-subtle">{hint}</dd>
    </Card>
  );
}

export default function DashboardPage() {
  const counts = countByStatus(demoRecords);

  return (
    <Container className="space-y-8 py-8 sm:py-10">
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
    </Container>
  );
}
