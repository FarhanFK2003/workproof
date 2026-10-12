"use client";

import { ErrorState } from "@/components/error-state";

export default function ConfirmError(props: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorState {...props} size="narrow" />;
}
