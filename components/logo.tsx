import Link from "next/link";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link
      href={href}
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
      <span className="text-[0.9375rem] font-semibold tracking-tight">WorkProof</span>
    </Link>
  );
}
