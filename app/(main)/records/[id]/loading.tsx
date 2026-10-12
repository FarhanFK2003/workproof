import { Container } from "@/components/page-layout";
import { PageSkeleton } from "@/components/page-skeleton";

export default function RecordLoading() {
  return (
    <Container className="py-8 sm:py-10">
      <PageSkeleton label="Loading record" />
    </Container>
  );
}
