import { Suspense } from "react";
import { demoFreelancer } from "@/lib/demo-data";
import { Logo } from "./logo";
import { NavLinks, NavList } from "./nav-links";
import { Container } from "./page-layout";

function initials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface">
      <Container className="flex h-15 items-center justify-between gap-3">
        <div className="flex items-center gap-3 sm:gap-8">
          <Logo />
          <nav aria-label="Main">
            {/* usePathname needs a Suspense boundary on routes with runtime params. */}
            <Suspense fallback={<NavList pathname={null} />}>
              <NavLinks />
            </Suspense>
          </nav>
        </div>
        <div className="hidden items-center gap-2.5 sm:flex" title="Demo freelancer account">
          <span className="hidden text-right leading-tight md:block">
            <span className="block text-sm font-medium text-ink">{demoFreelancer.name}</span>
            <span className="block text-xs text-ink-subtle">Demo account</span>
          </span>
          <span
            aria-label={`Signed in as ${demoFreelancer.name} (demo account)`}
            className="grid size-8 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent-strong ring-1 ring-accent/20"
          >
            {initials(demoFreelancer.name)}
          </span>
        </div>
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
