"use client";

import { useActionState } from "react";
import { login, type LoginState } from "@/app/(main)/login/actions";
import { AlertIcon, CheckIcon, LockIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";

interface LoginFormProps {
  next: string;
  signedOut: boolean;
  configured: boolean;
}

export function LoginForm({ next, signedOut, configured }: LoginFormProps) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(login, {});

  return (
    <Card className="p-6 sm:p-8">
      <span className="grid size-10 place-items-center rounded-xl bg-accent-soft text-accent-strong">
        <LockIcon className="size-5" />
      </span>
      <h1 className="mt-5 text-xl font-semibold tracking-tight text-ink">Owner sign in</h1>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-subtle">
        Enter your workspace passcode to manage your records. Clients don&rsquo;t sign in. They use
        the confirmation link you send them.
      </p>

      {signedOut && !state.error && (
        <p
          role="status"
          className="mt-5 flex items-center gap-2 rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent-strong"
        >
          <CheckIcon />
          You&rsquo;ve been signed out.
        </p>
      )}

      {configured ? (
        <form action={formAction} className="mt-6 space-y-5">
          <input type="hidden" name="next" value={next} />
          <Field id="passcode" label="Passcode" required error={state.error}>
            {(a11y) => (
              <Input
                {...a11y}
                type="password"
                name="passcode"
                autoComplete="current-password"
                autoFocus
                spellCheck={false}
              />
            )}
          </Field>
          <Button type="submit" className="w-full" loading={pending} loadingText="Signing in…">
            Sign in
          </Button>
        </form>
      ) : (
        <div
          role="alert"
          className="mt-6 flex gap-3 rounded-lg border border-danger/30 bg-danger-soft p-4 text-sm"
        >
          <AlertIcon className="mt-0.5 text-danger" />
          <div className="space-y-1">
            <p className="font-medium text-danger">Sign-in isn&rsquo;t configured</p>
            <p className="leading-relaxed text-ink-muted">
              Set <code className="font-mono text-xs">WORKPROOF_OWNER_PASSCODE</code> and{" "}
              <code className="font-mono text-xs">WORKPROOF_SESSION_SECRET</code> in the server
              environment, then restart the app.
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}
