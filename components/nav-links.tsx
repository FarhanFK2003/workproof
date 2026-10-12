"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/records/new", label: "New record" },
] as const;

function isActive(href: string, pathname: string | null): boolean {
  if (!pathname) return false;
  if (href === "/dashboard") {
    return (
      pathname === "/dashboard" ||
      (pathname.startsWith("/records/") && pathname !== "/records/new")
    );
  }
  return pathname === href;
}

/** Static markup; used directly as the Suspense fallback. */
export function NavList({ pathname }: { pathname: string | null }) {
  return (
    <ul className="flex items-center gap-0.5 sm:gap-1">
      {links.map(({ href, label }) => {
        const active = isActive(href, pathname);
        return (
          <li key={href}>
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "rounded-md px-2.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors sm:px-3",
                "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
                active ? "bg-muted text-ink" : "text-ink-subtle hover:text-ink",
              )}
            >
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function NavLinks() {
  return <NavList pathname={usePathname()} />;
}
