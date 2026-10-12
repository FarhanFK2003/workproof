import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";
import { Container } from "@/components/page-layout";
import { Card } from "@/components/ui/card";
import { safeRedirectPath } from "@/lib/auth-redirect";
import { tryReadAuthConfig } from "@/lib/server/auth-config";
import { getOwnerSession } from "@/lib/server/session";

export const metadata: Metadata = {
  title: "Owner sign in",
  robots: { index: false, follow: false },
};

// searchParams and the session cookie are request-time data, so they are read inside Suspense.
export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <Container className="py-12 sm:py-20">
      <div className="mx-auto w-full max-w-sm">
        <Suspense fallback={<LoginSkeleton />}>
          {searchParams.then(({ next, signedOut }) => (
            <LoginContent next={next} signedOut={signedOut === "1"} />
          ))}
        </Suspense>
      </div>
    </Container>
  );
}

async function LoginContent({ next, signedOut }: { next: unknown; signedOut: boolean }) {
  const target = safeRedirectPath(next);
  if (await getOwnerSession()) redirect(target);
  return (
    <LoginForm next={target} signedOut={signedOut} configured={tryReadAuthConfig() !== null} />
  );
}

function LoginSkeleton() {
  return (
    <Card role="status" aria-label="Loading sign-in" className="space-y-4 p-6 sm:p-8">
      <div className="size-10 rounded-xl bg-muted motion-safe:animate-pulse" />
      <div className="h-6 w-40 rounded-md bg-muted motion-safe:animate-pulse" />
      <div className="h-4 w-full rounded-md bg-muted motion-safe:animate-pulse" />
      <div className="h-10 w-full rounded-lg bg-muted motion-safe:animate-pulse" />
    </Card>
  );
}
