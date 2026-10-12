import Link from "next/link";
import { cn } from "@/lib/cn";

/** `compact` hides the wordmark below the sm breakpoint (the link keeps its accessible name). */
export function Logo({ href = "/", compact = false }: { href?: string; compact?: boolean }) {
  return (
    <Link
      href={href}
      aria-label={compact ? "WorkProof home" : undefined}
      className="-mx-1 inline-flex items-center gap-2 rounded-md px-1 py-1 text-ink focus-visible:outline-2 focus-visible:outline-accent"
    >
      <span className="grid size-7 place-items-center rounded-lg bg-ink text-white">
        <svg viewBox="0 0 20 20" aria-hidden="true" className="size-4" fill="none">
          <path
            d="M4.5 10.5 8 14l7.5-8"
            stroke="#5eead4"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span
        className={cn(
          "text-[0.9375rem] font-semibold tracking-tight",
          compact && "hidden sm:inline",
        )}
      >
        WorkProof
      </span>
    </Link>
  );
}
