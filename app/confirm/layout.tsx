import type { ReactNode } from "react";
import { LockIcon } from "@/components/icons";
import { Logo } from "@/components/logo";
import { Container } from "@/components/page-layout";

export default function ConfirmLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="border-b border-line bg-surface">
        <Container size="narrow" className="flex h-15 items-center justify-between">
          <Logo />
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-subtle">
            <LockIcon className="size-3.5 text-accent" />
            Secure confirmation link
          </span>
        </Container>
      </header>
      <main id="main" className="flex-1 py-8 sm:py-12">
        {children}
      </main>
      <footer className="border-t border-line">
        <Container size="narrow" className="py-6 text-xs leading-relaxed text-ink-subtle">
          WorkProof helps freelancers keep a client-confirmed work history. Your email address and
          any amounts are never made public or written to a blockchain.
        </Container>
      </footer>
    </>
  );
}
