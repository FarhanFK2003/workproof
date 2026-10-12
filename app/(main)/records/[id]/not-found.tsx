import Link from "next/link";
import { FileTextIcon } from "@/components/icons";
import { Container } from "@/components/page-layout";
import { buttonStyles } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export default function RecordNotFound() {
  return (
    <Container className="py-12 sm:py-16">
      <Card>
        <EmptyState
          icon={<FileTextIcon className="size-5" />}
          title="Record not found"
          description="This record doesn't exist or may have been removed. Check the link, or return to your records."
          action={
            <Link href="/dashboard" className={buttonStyles()}>
              Back to dashboard
            </Link>
          }
        />
      </Card>
    </Container>
  );
}
