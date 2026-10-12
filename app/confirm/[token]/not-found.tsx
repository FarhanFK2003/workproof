import { LinkIcon } from "@/components/icons";
import { Container } from "@/components/page-layout";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export default function ConfirmLinkNotFound() {
  return (
    <Container size="narrow">
      <Card>
        <EmptyState
          icon={<LinkIcon className="size-5" />}
          title="This confirmation link isn't valid"
          description="It may have expired, already been replaced, or been copied incompletely. Ask the freelancer who sent it to share a new link."
        />
      </Card>
    </Container>
  );
}
