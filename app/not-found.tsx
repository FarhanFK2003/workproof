import Link from "next/link";
import { Logo } from "@/components/logo";
import { buttonStyles } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main id="main" className="flex flex-1 flex-col items-center justify-center px-4 py-16 text-center">
      <Logo />
      <p className="mt-10 font-mono text-sm text-ink-subtle">404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">Page not found</h1>
      <p className="mt-2 max-w-sm text-ink-muted">
        The page you&rsquo;re looking for doesn&rsquo;t exist or has moved.
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link href="/" className={buttonStyles()}>
          Go to home
        </Link>
        <Link href="/dashboard" className={buttonStyles({ variant: "secondary" })}>
          Open dashboard
        </Link>
      </div>
    </main>
  );
}
