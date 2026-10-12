"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronRightIcon, FileTextIcon, HashIcon, PlusIcon } from "@/components/icons";
import { buttonStyles } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/cn";
import { formatDateRange } from "@/lib/format";
import { STATUS_META, STATUS_ORDER } from "@/lib/status";
import type { RecordStatus, WorkRecord } from "@/lib/types";

type Filter = "all" | RecordStatus;

function RecordRow({ record }: { record: WorkRecord }) {
  return (
    <li>
      <Link
        href={`/records/${record.id}`}
        className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-canvas focus-visible:bg-canvas focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent sm:px-6"
      >
        <div className="min-w-0 flex-1 sm:grid sm:grid-cols-[minmax(0,1fr)_11rem_9.5rem] sm:items-center sm:gap-6">
          <div className="min-w-0">
            <p className="truncate font-medium text-ink">{record.title}</p>
            <p className="mt-0.5 truncate text-sm text-ink-subtle">
              {record.client.name}
              {record.client.organization && ` · ${record.client.organization}`}
            </p>
          </div>
          <p className="mt-2 text-sm text-ink-subtle tabular-nums sm:mt-0">
            {formatDateRange(record.startDate, record.endDate)}
          </p>
          <div className="mt-2 sm:mt-0">
            <StatusBadge status={record.status} />
          </div>
        </div>
        <ChevronRightIcon className="text-ink-subtle transition-transform group-hover:translate-x-0.5" />
      </Link>
    </li>
  );
}

function FilteredEmptyState({ filter }: { filter: Filter }) {
  if (filter === "anchored") {
    return (
      <EmptyState
        icon={<HashIcon className="size-5" />}
        title="No anchored records yet"
        description="Anchoring client-confirmed records to Monad arrives in a later milestone. Nothing has been written on-chain."
      />
    );
  }
  return (
    <EmptyState
      icon={<FileTextIcon className="size-5" />}
      title={
        filter === "all"
          ? "No work records yet"
          : `No “${STATUS_META[filter].label.toLowerCase()}” records`
      }
      description={
        filter === "all"
          ? "Log your first project and send it to your client for confirmation."
          : "Records with this status will appear here."
      }
      action={
        filter === "all" && (
          <Link href="/records/new" className={buttonStyles()}>
            <PlusIcon />
            New record
          </Link>
        )
      }
    />
  );
}

export function RecordList({ records }: { records: readonly WorkRecord[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const filters: Filter[] = ["all", ...STATUS_ORDER];
  const visible = filter === "all" ? records : records.filter((r) => r.status === filter);

  function count(f: Filter) {
    return f === "all" ? records.length : records.filter((r) => r.status === f).length;
  }

  return (
    <div>
      <div
        role="group"
        aria-label="Filter records by status"
        className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
      >
        {filters.map((f) => {
          const active = f === filter;
          return (
            <button
              key={f}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(f)}
              className={cn(
                "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                active
                  ? "bg-ink text-white"
                  : "bg-surface text-ink-muted ring-1 ring-line ring-inset hover:text-ink hover:ring-line-strong",
              )}
            >
              {f === "all" ? "All" : STATUS_META[f].label}
              <span
                className={cn(
                  "text-xs tabular-nums",
                  active ? "text-white/70" : "text-ink-subtle",
                )}
              >
                {count(f)}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-line bg-surface">
        <div
          aria-hidden="true"
          className="hidden border-b border-line bg-canvas/60 px-6 py-2.5 text-xs font-medium text-ink-subtle sm:flex sm:items-center sm:gap-4"
        >
          <div className="grid flex-1 grid-cols-[minmax(0,1fr)_11rem_9.5rem] gap-6">
            <span>Project</span>
            <span>Period</span>
            <span>Status</span>
          </div>
          <span className="size-4" />
        </div>
        {visible.length > 0 ? (
          <ul className="divide-y divide-line" aria-label="Work records">
            {visible.map((record) => (
              <RecordRow key={record.id} record={record} />
            ))}
          </ul>
        ) : (
          <FilteredEmptyState filter={filter} />
        )}
      </div>
      <p className="sr-only" aria-live="polite">
        Showing {visible.length} {visible.length === 1 ? "record" : "records"}
      </p>
    </div>
  );
}
