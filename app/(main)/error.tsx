"use client";

import { ErrorState } from "@/components/error-state";

export default function MainError(props: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorState {...props} />;
}
