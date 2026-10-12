import type { Metadata } from "next";
import { Container, PageHeader } from "@/components/page-layout";
import { NewRecordForm } from "@/components/records/new-record-form";

export const metadata: Metadata = { title: "New record" };

export default function NewRecordPage() {
  return (
    <Container className="space-y-8 py-8 sm:py-10">
      <PageHeader
        back={{ href: "/dashboard", label: "All records" }}
        title="New work record"
        description="Describe a completed project. Once it's saved, you'll get a secure link to send your client for confirmation."
      />
      <NewRecordForm />
    </Container>
  );
}
