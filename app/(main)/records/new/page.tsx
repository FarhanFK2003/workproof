import type { Metadata } from "next";
import { Suspense } from "react";
import { Container, PageHeader } from "@/components/page-layout";
import { PageSkeleton } from "@/components/page-skeleton";
import { NewRecordForm } from "@/components/records/new-record-form";
import { requireOwnerForPage } from "@/lib/server/session";

export const metadata: Metadata = { title: "New record" };

export default function NewRecordPage() {
  return (
    <Container className="py-8 sm:py-10">
      <Suspense fallback={<PageSkeleton label="Loading form" />}>
        <NewRecordContent />
      </Suspense>
    </Container>
  );
}

async function NewRecordContent() {
  await requireOwnerForPage("/records/new");
  return (
    <div className="space-y-8">
      <PageHeader
        back={{ href: "/dashboard", label: "All records" }}
        title="New work record"
        description="Describe a completed project. Once it's saved, you'll get a secure link to send your client for confirmation."
      />
      <NewRecordForm />
    </div>
  );
}
