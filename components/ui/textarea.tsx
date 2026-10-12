import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";
import { controlStyles } from "./input";

export function Textarea({ className, rows = 4, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      rows={rows}
      className={cn(controlStyles, "resize-y py-2 leading-relaxed", className)}
      {...props}
    />
  );
}
