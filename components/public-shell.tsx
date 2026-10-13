import type { ReactNode } from "react";
import { LockIcon } from "./icons";
import { Logo } from "./logo";
import { Container } from "./page-layout";

/** Minimal header/footer for public, token-addressed pages (confirm, verify). */
export function PublicShell({
  badge,
  footer,
  children,
}: {
  badge: string;
  footer: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <header className="border-b border-line bg-surface">
        <Container size="narrow" className="flex h-15 items-center justify-between">
          <Logo />
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-subtle">
            <LockIcon className="size-3.5 text-accent" />
            {badge}
          </span>
        </Container>
      </header>
      <main id="main" className="flex-1 py-8 sm:py-12">
        {children}
      </main>
      <footer className="border-t border-line">
        <Container size="narrow" className="py-6 text-xs leading-relaxed text-ink-subtle">
          {footer}
        </Container>
      </footer>
    </>
  );
}
