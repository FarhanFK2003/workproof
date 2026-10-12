"use client";

import { useEffect } from "react";
import { AlertIcon } from "./icons";
import { Container } from "./page-layout";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { EmptyState } from "./ui/empty-state";

/** Shared UI for error.tsx boundaries. */
export function ErrorState({
  error,
  retry,
  size,
}: {
  error: Error & { digest?: string };
  retry: () => void;
  size?: "default" | "narrow";
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Container size={size} className="py-12 sm:py-16">
      <Card>
        <EmptyState
          icon={<AlertIcon className="size-5 text-danger" />}
          title="Something went wrong"
          description={
            <>
              This page couldn&rsquo;t be displayed. Try again, and if the problem continues,
              refresh the page.
              {error.digest && (
                <span className="mt-2 block font-mono text-xs">Reference: {error.digest}</span>
              )}
            </>
          }
          action={<Button onClick={() => retry()}>Try again</Button>}
        />
      </Card>
    </Container>
  );
}
