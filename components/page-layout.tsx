import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { ArrowLeftIcon } from "./icons";

const containerSizes = {
  default: "max-w-6xl",
  narrow: "max-w-3xl",
} as const;

export function Container({
  size = "default",
  className,
  children,
}: {
  size?: keyof typeof containerSizes;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("mx-auto w-full px-4 sm:px-6 lg:px-8", containerSizes[size], className)}>
      {children}
    </div>
  );
}

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
}

export function PageHeader({ title, description, eyebrow, actions, back }: PageHeaderProps) {
  return (
    <header className="space-y-4">
      {back && (
        <Link
          href={back.href}
          className="-ml-1 inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 text-sm font-medium text-ink-subtle transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
        >
          <ArrowLeftIcon className="size-3.5" />
          {back.label}
        </Link>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-2">
          {eyebrow && <div className="flex flex-wrap items-center gap-2">{eyebrow}</div>}
          <h1 className="text-2xl font-semibold tracking-tight text-balance text-ink sm:text-[1.75rem]">
            {title}
          </h1>
          {description && (
            <p className="max-w-2xl text-[0.9375rem] leading-relaxed text-ink-muted">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </div>
    </header>
  );
}
