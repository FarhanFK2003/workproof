import type { ReactNode } from "react";
import { AlertIcon, CheckIcon } from "@/components/icons";
import { cn } from "@/lib/cn";
import { formatDate, formatDateTime } from "@/lib/format";
import type { WorkRecord } from "@/lib/types";

type StepState = "complete" | "current" | "attention" | "upcoming";

interface Step {
  title: string;
  state: StepState;
  description: ReactNode;
  timestamp?: string;
}

function buildSteps(record: WorkRecord, freelancerName: string): Step[] {
  const { client, response } = record;

  const responseStep: Step = response
    ? {
        title: response.kind === "confirmed" ? "Confirmed by client" : "Disputed by client",
        state: response.kind === "confirmed" ? "complete" : "attention",
        timestamp: response.respondedAt,
        description: (
          <>
            {response.respondedBy} {response.kind === "confirmed" ? "confirmed" : "disputed"}{" "}
            this claim.
            {response.note && (
              <span className="mt-2 block rounded-lg bg-canvas px-3 py-2 text-ink-muted">
                &ldquo;{response.note}&rdquo;
              </span>
            )}
          </>
        ),
      }
    : {
        title: "Client response",
        state: record.linkSharedAt ? "current" : "upcoming",
        description: record.linkSharedAt
          ? `Waiting for ${client.name} to review.${record.linkExpiresAt ? ` Link expires ${formatDate(record.linkExpiresAt)}.` : ""}`
          : `${client.name} confirms or disputes the claim.`,
      };

  return [
    {
      title: "Record created",
      state: "complete",
      timestamp: record.createdAt,
      description: `Drafted by ${freelancerName}.`,
    },
    record.linkSharedAt
      ? {
          title: "Confirmation link shared",
          state: "complete",
          timestamp: record.linkSharedAt,
          description: `Secure link sent to ${client.name}.`,
        }
      : {
          title: "Share confirmation link",
          state: "current",
          description: "Generate a secure link and send it to your client.",
        },
    responseStep,
    {
      title: "Anchor to Monad",
      state: "upcoming",
      description:
        record.status === "confirmed"
          ? "Not anchored. On-chain anchoring arrives in a later milestone."
          : "Available for client-confirmed records only.",
    },
  ];
}

const markerStyles: Record<StepState, string> = {
  complete: "bg-accent text-white",
  current: "bg-surface ring-2 ring-accent text-accent",
  attention: "bg-danger text-white",
  upcoming: "bg-surface ring-1 ring-line-strong",
};

const stateLabels: Record<StepState, string> = {
  complete: "Completed",
  current: "In progress",
  attention: "Needs attention",
  upcoming: "Not started",
};

export function RecordTimeline({
  record,
  freelancerName,
}: {
  record: WorkRecord;
  freelancerName: string;
}) {
  const steps = buildSteps(record, freelancerName);

  return (
    <ol className="relative">
      {steps.map((step, index) => {
        const last = index === steps.length - 1;
        return (
          <li key={step.title} className="relative flex gap-4 pb-6 last:pb-0">
            {!last && (
              <span
                aria-hidden="true"
                className={cn(
                  "absolute top-7 bottom-1 left-[11px] w-px",
                  step.state === "complete" ? "bg-accent/40" : "bg-line",
                )}
              />
            )}
            <span
              aria-hidden="true"
              className={cn(
                "relative mt-0.5 grid size-6 shrink-0 place-items-center rounded-full",
                markerStyles[step.state],
              )}
            >
              {step.state === "complete" && <CheckIcon className="size-3.5" />}
              {step.state === "attention" && <AlertIcon className="size-3.5" />}
              {step.state === "current" && <span className="size-2 rounded-full bg-accent" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                <p
                  className={cn(
                    "text-sm font-medium",
                    step.state === "upcoming" ? "text-ink-subtle" : "text-ink",
                  )}
                >
                  {step.title}
                  <span className="sr-only"> ({stateLabels[step.state]})</span>
                </p>
                {step.timestamp && (
                  <time dateTime={step.timestamp} className="text-xs text-ink-subtle tabular-nums">
                    {formatDateTime(step.timestamp)}
                  </time>
                )}
              </div>
              <div className="mt-1 text-sm leading-relaxed text-ink-subtle">{step.description}</div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
