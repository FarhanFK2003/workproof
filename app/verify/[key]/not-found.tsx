import { LinkIcon } from "@/components/icons";
import { Container } from "@/components/page-layout";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export default function VerifyLinkNotFound() {
  return (
    <Container size="narrow">
      <Card>
        <EmptyState
          icon={<LinkIcon className="size-5" />}
          title="This verification link isn't valid"
          description="It may have been copied incompletely, or the record is not anchored. Ask the person who shared it for the full link."
        />
      </Card>
    </Container>
  );
}
