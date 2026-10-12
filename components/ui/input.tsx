import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

/** Shared look for text inputs, textareas, and selects. */
export const controlStyles = cn(
  "block w-full rounded-lg border border-line-strong bg-surface px-3 text-base text-ink shadow-xs sm:text-sm",
  "placeholder:text-ink-subtle transition-[border-color,box-shadow] duration-150 hover:border-ink/30",
  "focus:border-accent focus:ring-3 focus:ring-accent/15 focus:outline-none",
  "aria-invalid:border-danger aria-invalid:focus:ring-danger/15",
  "disabled:cursor-not-allowed disabled:bg-muted disabled:text-ink-subtle",
);

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(controlStyles, "h-10", className)} {...props} />;
}
