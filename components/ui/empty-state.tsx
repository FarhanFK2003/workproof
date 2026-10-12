import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-12 text-center", className)}>
      <div className="grid size-11 place-items-center rounded-xl border border-line bg-canvas text-ink-subtle">
        {icon}
      </div>
      <h3 className="mt-4 text-[0.9375rem] font-semibold text-ink">{title}</h3>
      <p className="mt-1 max-w-sm text-sm leading-relaxed text-ink-subtle">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
