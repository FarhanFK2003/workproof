import type { ReactNode } from "react";
import { PublicShell } from "@/components/public-shell";

export default function ConfirmLayout({ children }: { children: ReactNode }) {
  return (
    <PublicShell
      badge="Secure confirmation link"
      footer="WorkProof helps freelancers keep a client-confirmed work history. Your email address and any amounts are never made public or written to a blockchain."
    >
      {children}
    </PublicShell>
  );
}
