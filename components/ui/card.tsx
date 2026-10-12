import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "rounded-xl border border-line bg-surface shadow-[0_1px_2px_rgb(11_27_51/0.04)]",
        className,
      )}
      {...props}
    />
  );
}

interface CardHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  id?: string;
  className?: string;
}

export function CardHeader({ title, description, action, id, className }: CardHeaderProps) {
  return (
    <div className={cn("flex items-start justify-between gap-4 px-5 pt-5 sm:px-6", className)}>
      <div className="min-w-0 space-y-1">
        <h2 id={id} className="text-[0.9375rem] font-semibold tracking-tight text-ink">
          {title}
        </h2>
        {description && (
          <p className="text-sm leading-relaxed text-ink-subtle">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

export function CardBody({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("px-5 pt-4 pb-5 sm:px-6", className)} {...props} />;
}
