import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

interface LabelProps extends ComponentProps<"label"> {
  optional?: boolean;
}

export function Label({ optional, className, children, ...props }: LabelProps) {
  return (
    <label
      className={cn("flex items-baseline gap-2 text-sm font-medium text-ink", className)}
      {...props}
    >
      {children}
      {optional && <span className="text-xs font-normal text-ink-subtle">Optional</span>}
    </label>
  );
}

export interface ControlA11yProps {
  id: string;
  "aria-invalid"?: true;
  "aria-describedby"?: string;
  "aria-required"?: true;
}

interface FieldProps {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  className?: string;
  /** Receives the ids and aria attributes that wire the control to its label, hint, and error. */
  children: (control: ControlA11yProps) => ReactNode;
}

/** Label + control + hint + error, with accessible wiring. */
export function Field({ id, label, hint, error, required, className, children }: FieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id} optional={!required}>
        {label}
      </Label>
      {children({
        id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": describedBy,
        "aria-required": required ? true : undefined,
      })}
      {hint && (
        <p id={hintId} className="text-xs leading-relaxed text-ink-subtle">
          {hint}
        </p>
      )}
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </div>
  );
}

export function FieldError({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} className="flex items-start gap-1.5 text-sm text-danger">
      <svg viewBox="0 0 20 20" aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 fill-current">
        <path d="M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm0 4a1 1 0 0 1 1 1v3.5a1 1 0 1 1-2 0V7a1 1 0 0 1 1-1Zm0 8.5a1.1 1.1 0 1 1 0-2.2 1.1 1.1 0 0 1 0 2.2Z" />
      </svg>
      <span>{children}</span>
    </p>
  );
}
