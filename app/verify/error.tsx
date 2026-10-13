"use client";

import { ErrorState } from "@/components/error-state";

export default function VerifyError(props: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorState {...props} size="narrow" />;
}
