import { Container } from "@/components/page-layout";
import { Card } from "@/components/ui/card";

function Bar({ className }: { className: string }) {
  return <div className={`rounded-md bg-muted motion-safe:animate-pulse ${className}`} />;
}

export default function RecordLoading() {
  return (
    <Container className="space-y-6 py-8 sm:py-10">
      <div role="status" aria-label="Loading record" className="space-y-3">
        <Bar className="h-4 w-24" />
        <Bar className="h-5 w-32" />
        <Bar className="h-8 w-2/3 max-w-md" />
        <Bar className="h-4 w-1/2 max-w-sm" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card className="space-y-3 p-6">
          <Bar className="h-4 w-32" />
          <Bar className="h-4 w-full" />
          <Bar className="h-4 w-5/6" />
          <Bar className="h-4 w-2/3" />
        </Card>
        <Card className="space-y-3 p-6">
          <Bar className="h-4 w-40" />
          <Bar className="h-10 w-full" />
        </Card>
      </div>
    </Container>
  );
}
