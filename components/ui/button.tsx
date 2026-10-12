import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

const variantStyles: Record<ButtonVariant, string> = {
  primary: "bg-ink text-white shadow-sm hover:bg-ink/88",
  secondary:
    "bg-surface text-ink ring-1 ring-inset ring-line-strong shadow-xs hover:bg-muted",
  ghost: "text-ink-muted hover:bg-muted hover:text-ink",
  danger:
    "bg-surface text-danger ring-1 ring-inset ring-danger/35 shadow-xs hover:bg-danger-soft",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-11 px-5 text-[0.9375rem]",
};

/** Shared styles so links can look like buttons. */
export function buttonStyles({
  variant = "primary",
  size = "md",
  className,
}: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap transition-colors duration-150",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
    "disabled:pointer-events-none disabled:opacity-50",
    variantStyles[variant],
    sizeStyles[size],
    className,
  );
}

interface ButtonProps extends ComponentProps<"button"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  loadingText?: string;
}

export function Button({
  variant,
  size,
  loading = false,
  loadingText,
  disabled,
  className,
  children,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonStyles({ variant, size, className })}
      {...props}
    >
      {loading ? (
        <>
          <span
            aria-hidden="true"
            className="size-4 rounded-full border-2 border-current border-r-transparent motion-safe:animate-spin"
          />
          {loadingText ?? children}
        </>
      ) : (
        children
      )}
    </button>
  );
}
