"use client";

import { useRef, useState, type FormEvent } from "react";
import { AlertIcon, CheckIcon } from "@/components/icons";
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

const SIMULATED_DELAY_MS = 900;

/** Ends a sentence without doubling a trailing period (e.g. "Atlas Freight Co."). */
function endSentence(text: string): string {
  return text.endsWith(".") ? text : `${text}.`;
}

interface ConfirmPanelProps {
  freelancerName: string;
  organization?: string;
}

export function ConfirmPanel({ freelancerName, organization }: ConfirmPanelProps) {
  const [mode, setMode] = useState<Mode>("confirmed");
  const [name, setName] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ kind: Mode; name: string } | null>(null);
  const resultRef = useRef<HTMLHeadingElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function switchMode(next: Mode) {
    setMode(next);
    setErrors({});
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values: ClientResponseValues = { kind: mode, name, acknowledged, reason };
    const nextErrors = validateClientResponse(values);
    setErrors(nextErrors);
    if (hasErrors(nextErrors)) {
      // Focus the first invalid control once the error state has rendered.
      requestAnimationFrame(() =>
        formRef.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus(),
      );
      return;
    }
    setSubmitting(true);
    await new Promise((resolve) => setTimeout(resolve, SIMULATED_DELAY_MS));
    setSubmitting(false);
    setResult({ kind: mode, name: name.trim() });
    requestAnimationFrame(() => resultRef.current?.focus());
  }

  function startOver() {
    setResult(null);
    setMode("confirmed");
    setName("");
    setAcknowledged(false);
    setReason("");
    setErrors({});
  }

  if (result) {
    const confirmed = result.kind === "confirmed";
    return (
      <Card className="p-6 sm:p-8">
        <div className="flex items-start gap-4">
          <span
            className={cn(
              "grid size-10 shrink-0 place-items-center rounded-full",
              confirmed ? "bg-accent-soft text-accent-strong" : "bg-warning-soft text-warning",
            )}
          >
            {confirmed ? <CheckIcon className="size-5" /> : <AlertIcon className="size-5" />}
          </span>
          <div className="min-w-0 space-y-2">
            <h2 ref={resultRef} tabIndex={-1} className="text-lg font-semibold text-ink focus:outline-none">
              {confirmed ? "Thanks, your confirmation is recorded (demo)" : "Dispute submitted (demo)"}
            </h2>
            <p className="text-sm leading-relaxed text-ink-muted">
              {confirmed
                ? `In the live product, ${freelancerName} would see that ${result.name} confirmed this work.`
                : `In the live product, ${freelancerName} would see your explanation and could update the record.`}
            </p>
            <p className="rounded-lg border border-dashed border-line-strong px-3 py-2 text-sm text-ink-muted">
              <span className="font-semibold text-ink">Simulated only.</span> Nothing was saved or
              sent, and nothing was written to a blockchain.
            </p>
            <Button variant="ghost" size="sm" className="-ml-3" onClick={startOver}>
              Start over
            </Button>
          </div>
        </div>
      </Card>
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
