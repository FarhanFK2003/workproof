import { cn } from "@/lib/cn";
import { STATUS_META } from "@/lib/status";
import type { RecordStatus } from "@/lib/types";

const statusStyles: Record<RecordStatus, { badge: string; dot: string }> = {
  draft: { badge: "bg-muted text-ink-muted ring-line-strong", dot: "bg-ink-subtle" },
  pending: { badge: "bg-warning-soft text-warning ring-warning/20", dot: "bg-[#d98a1c]" },
  confirmed: { badge: "bg-accent-soft text-accent-strong ring-accent/20", dot: "bg-accent" },
  disputed: { badge: "bg-danger-soft text-danger ring-danger/20", dot: "bg-danger" },
  anchored: { badge: "bg-violet-soft text-violet ring-violet/20", dot: "bg-violet" },
};

export function StatusBadge({
  status,
  className,
}: {
  status: RecordStatus;
  className?: string;
}) {
  const styles = statusStyles[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
        styles.badge,
        className,
      )}
    >
      <span aria-hidden="true" className={cn("size-1.5 rounded-full", styles.dot)} />
      {STATUS_META[status].label}
    </span>
  );
}
