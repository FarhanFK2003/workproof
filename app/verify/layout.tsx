import type { ReactNode } from "react";
import { PublicShell } from "@/components/public-shell";

export default function VerifyLayout({ children }: { children: ReactNode }) {
  return (
    <PublicShell
      badge="Record verification"
      footer="WorkProof anchors a fingerprint of client-confirmed records on Monad testnet. Client names, emails, amounts, and receipts are never published or written on-chain."
    >
      {children}
    </PublicShell>
  );
}
