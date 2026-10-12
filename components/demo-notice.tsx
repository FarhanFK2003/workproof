import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { InfoIcon } from "./icons";

export function DemoTag({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border border-dashed border-line-strong bg-surface px-1.5 py-px text-[0.6875rem] font-semibold tracking-wide text-ink-subtle uppercase",
        className,
      )}
    >
      Demo
    </span>
  );
}

export function DemoNotice({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      role="note"
      className={cn(
        "flex items-start gap-3 rounded-lg border border-dashed border-line-strong bg-surface/70 px-4 py-3 text-sm text-ink-muted",
        className,
      )}
    >
      <InfoIcon className="mt-0.5 text-ink-subtle" />
      <p className="leading-relaxed">
        <span className="font-semibold text-ink">Demo data. </span>
        {children}
      </p>
    </div>
  );
}
