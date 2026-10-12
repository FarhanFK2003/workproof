import Link from "next/link";
import { logout } from "@/app/(main)/login/actions";
import { demoFreelancer } from "@/lib/demo-data";
import { getOwnerSession } from "@/lib/server/session";
import { buttonStyles } from "./ui/button";

function initials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/** Session-aware header area. Reads the cookie, so render it inside <Suspense>. */
export async function OwnerMenu() {
  const session = await getOwnerSession();

  if (!session) {
    return (
      <Link href="/login" className={buttonStyles({ variant: "secondary", size: "sm" })}>
        Sign in
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2.5">
      <span className="hidden text-right leading-tight md:block">
        <span className="block text-sm font-medium text-ink">{demoFreelancer.name}</span>
        <span className="block text-xs text-ink-subtle">Workspace owner</span>
      </span>
      <span
        aria-hidden="true"
        className="hidden size-8 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent-strong ring-1 ring-accent/20 sm:grid"
      >
        {initials(demoFreelancer.name)}
      </span>
      <form action={logout}>
        <button type="submit" className={buttonStyles({ variant: "ghost", size: "sm" })}>
          Sign out
        </button>
      </form>
    </div>
  );
}

export function OwnerMenuFallback() {
  return <span aria-hidden="true" className="block h-8 w-20 rounded-lg bg-muted" />;
}
