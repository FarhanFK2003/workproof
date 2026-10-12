import { Suspense } from "react";
import { Logo } from "./logo";
import { NavLinks, NavList } from "./nav-links";
import { OwnerMenu, OwnerMenuFallback } from "./owner-menu";
import { Container } from "./page-layout";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface">
      <Container className="flex h-15 items-center justify-between gap-3">
        <div className="flex items-center gap-3 sm:gap-8">
          <Logo compact />
          <nav aria-label="Main">
            {/* usePathname needs a Suspense boundary on routes with runtime params. */}
            <Suspense fallback={<NavList pathname={null} />}>
              <NavLinks />
            </Suspense>
          </nav>
        </div>
        {/* Reads the session cookie, so it streams in behind its own boundary. */}
        <Suspense fallback={<OwnerMenuFallback />}>
          <OwnerMenu />
        </Suspense>
      </Container>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line">
      <Container className="flex flex-col gap-1 py-6 text-xs text-ink-subtle sm:flex-row sm:justify-between">
        <p>WorkProof prototype · Monad Metropolis Hackathon</p>
        <p>All records shown are demo data. Nothing is written to a blockchain yet.</p>
      </Container>
    </footer>
  );
}
