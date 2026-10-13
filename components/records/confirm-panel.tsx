"use client";

import { useRef, useState, useTransition, type FormEvent, type ReactNode, type RefObject } from "react";
import { submitDecisionAction, type DecisionState } from "@/app/confirm/[token]/actions";
import { AlertIcon, CheckIcon, ClockIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, FieldError } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/cn";
import {
  hasErrors,
  validateClientResponse,
  type ClientResponseValues,
  type FieldErrors,
} from "@/lib/validation";

type Mode = "confirmed" | "disputed";
type Errors = FieldErrors<"name" | "acknowledged" | "reason">;

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Ends a sentence without doubling a trailing period (e.g. "Atlas Freight Co."). */
function endSentence(text: string): string {
  return text.endsWith(".") ? text : `${text}.`;
}

interface ConfirmPanelProps {
  token: string;
  /** Display name, or a neutral phrase such as "the freelancer". */
  freelancerName: string;
  organization?: string;
}

function Outcome({
  tone,
  title,
  children,
  headingRef,
}: {
  tone: "success" | "warning" | "neutral";
  title: string;
  children: ReactNode;
  headingRef: RefObject<HTMLHeadingElement | null>;
}) {
  const Icon = tone === "success" ? CheckIcon : tone === "warning" ? AlertIcon : ClockIcon;
  return (
    <Card className="p-6 sm:p-8">
      <div className="flex items-start gap-4">
        <span
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-full",
            tone === "success" && "bg-accent-soft text-accent-strong",
            tone === "warning" && "bg-warning-soft text-warning",
            tone === "neutral" && "bg-muted text-ink-subtle",
          )}
        >
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 space-y-2">
          <h2 ref={headingRef} tabIndex={-1} className="text-lg font-semibold text-ink focus:outline-none">
            {title}
          </h2>
          <div className="space-y-2 text-sm leading-relaxed text-ink-muted">{children}</div>
        </div>
      </div>
    </Card>
  );
}

export function ConfirmPanel({ token, freelancerName, organization }: ConfirmPanelProps) {
  const [mode, setMode] = useState<Mode>("confirmed");
  const [name, setName] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [result, setResult] = useState<DecisionState>({ status: "idle" });
  const [submitting, startTransition] = useTransition();
  const outcomeRef = useRef<HTMLHeadingElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function switchMode(next: Mode) {
    setMode(next);
    setErrors({});
    setResult({ status: "idle" });
  }

  function focusFirstInvalid() {
    requestAnimationFrame(() =>
      formRef.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus(),
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values: ClientResponseValues = { kind: mode, name, acknowledged, reason };
    const nextErrors = validateClientResponse(values);
    setErrors(nextErrors);
    if (hasErrors(nextErrors)) {
      focusFirstInvalid();
      return;
    }
    startTransition(async () => {
      let next: DecisionState;
      try {
        next = await submitDecisionAction(token, values);
      } catch {
        next = { status: "error" };
      }
      setResult(next);
      if (next.status === "invalid_input") {
        setErrors(next.errors);
        focusFirstInvalid();
      } else if (next.status === "error") {
        requestAnimationFrame(() => alertRef.current?.focus());
      } else {
        requestAnimationFrame(() => outcomeRef.current?.focus());
      }
    });
  }

  if (result.status === "recorded") {
    const confirmed = result.kind === "confirmed";
    return (
      <Outcome
        tone={confirmed ? "success" : "warning"}
        title={confirmed ? "Thank you. Your confirmation has been recorded." : "Your dispute has been recorded."}
        headingRef={outcomeRef}
      >
        <p>
          {confirmed
            ? `${capitalize(freelancerName)} can now show this project as client-confirmed.`
            : `${capitalize(freelancerName)} will see your explanation and can correct the record.`}
        </p>
        <p>
          Your response covers the work described above. It doesn&rsquo;t confirm or prove that a
          payment was made. This link can&rsquo;t be used again, and you can close this page.
        </p>
      </Outcome>
    );
  }
  if (result.status === "already_used" || result.status === "not_pending") {
    return (
      <Outcome tone="neutral" title="This request has already been answered" headingRef={outcomeRef}>
        <p>A response was already recorded for this project, so no further action is needed.</p>
      </Outcome>
    );
  }
  if (result.status === "expired") {
    return (
      <Outcome tone="neutral" title="This link has expired" headingRef={outcomeRef}>
        <p>Ask {freelancerName} to send you a new confirmation link.</p>
      </Outcome>
    );
  }
  if (result.status === "invalid") {
    return (
      <Outcome tone="neutral" title="This link is no longer valid" headingRef={outcomeRef}>
        <p>It may have been replaced by a newer link. Ask {freelancerName} to send you the latest one.</p>
      </Outcome>
    );
  }

  const disputing = mode === "disputed";

  return (
    <Card>
      <form ref={formRef} onSubmit={handleSubmit} noValidate className="space-y-5 p-5 sm:p-6">
        <div>
          <h2 className="text-[0.9375rem] font-semibold text-ink">
            {disputing ? "Dispute this claim" : "Your response"}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-ink-subtle">
            {disputing
              ? `Tell ${freelancerName} what doesn't match. They'll be able to correct the record.`
              : "Takes less than a minute. No account or wallet needed."}
          </p>
        </div>

        {result.status === "error" && (
          <div
            ref={alertRef}
            tabIndex={-1}
            role="alert"
            className="flex gap-2.5 rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm focus:outline-2 focus:outline-offset-2 focus:outline-danger"
          >
            <AlertIcon className="mt-0.5 text-danger" />
            <p className="text-ink">
              We couldn&rsquo;t save your response. Nothing was recorded, so please try again in a
              moment.
            </p>
          </div>
        )}

        <Field
          id="responder-name"
          label="Your full name"
          required
          error={errors.name}
          hint={organization ? endSentence(`As the representative of ${organization}`) : undefined}
        >
          {(a11y) => (
            <Input
              {...a11y}
              name="name"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>

        {disputing ? (
          <Field id="dispute-reason" label="What doesn't match?" required error={errors.reason}>
            {(a11y) => (
              <Textarea
                {...a11y}
                name="reason"
                rows={4}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. The project ended in October, not September."
              />
            )}
          </Field>
        ) : (
          <div className="space-y-1.5">
            <div
              className={cn(
                "flex gap-3 rounded-lg border p-3.5 transition-colors",
                errors.acknowledged ? "border-danger bg-danger-soft/50" : "border-line bg-canvas",
              )}
            >
              <input
                id="acknowledge"
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
                aria-invalid={errors.acknowledged ? true : undefined}
                aria-describedby={errors.acknowledged ? "acknowledge-error" : undefined}
                className="mt-0.5 size-4 shrink-0 accent-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              />
              <label htmlFor="acknowledge" className="text-sm leading-relaxed text-ink">
                {endSentence(
                  `I confirm that ${freelancerName} delivered the work described above${organization ? ` for ${organization}` : ""}`,
                )}
              </label>
            </div>
            {errors.acknowledged && <FieldError id="acknowledge-error">{errors.acknowledged}</FieldError>}
          </div>
        )}

        <div className="flex flex-col-reverse gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
          <Button
            variant="ghost"
            onClick={() => switchMode(disputing ? "confirmed" : "disputed")}
            disabled={submitting}
            className="sm:-ml-3"
          >
            {disputing ? "Back to confirmation" : "Something's not right? Dispute"}
          </Button>
          <Button
            type="submit"
            variant={disputing ? "danger" : "primary"}
            loading={submitting}
            loadingText={disputing ? "Submitting…" : "Confirming…"}
          >
            {disputing ? "Submit dispute" : "Confirm work"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
