"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CheckIcon, CopyIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { controlStyles } from "@/components/ui/input";
import { cn } from "@/lib/cn";

type CopyStatus = "idle" | "copied" | "error";

/** Read-only link with a copy button. `url` must be built on the server. */
export function CopyLinkField({ url, label }: { url: string; label: string }) {
  const [status, setStatus] = useState<CopyStatus>("idle");
  const inputRef = useRef<HTMLInputElement>(null);
  const resetTimer = useRef<number | undefined>(undefined);
  const inputId = useId();
  const statusId = useId();

  useEffect(() => () => window.clearTimeout(resetTimer.current), []);

  async function copy() {
    window.clearTimeout(resetTimer.current);
    try {
      if (!navigator.clipboard) throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(url);
      setStatus("copied");
      resetTimer.current = window.setTimeout(() => setStatus("idle"), 2500);
    } catch {
      // Clipboard can be blocked (insecure context, permissions). Fall back to manual copy.
      setStatus("error");
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }

  return (
    <div className="space-y-2">
      <label htmlFor={inputId} className="sr-only">
        {label}
      </label>
      <div className="flex gap-2">
        <input
          ref={inputRef}
          id={inputId}
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className={cn(controlStyles, "h-10 min-w-0 truncate bg-canvas font-mono text-xs sm:text-xs")}
        />
        <Button
          variant={status === "copied" ? "secondary" : "primary"}
          onClick={copy}
          className="shrink-0"
          aria-describedby={statusId}
        >
          {status === "copied" ? (
            <>
              <CheckIcon className="text-accent" />
              Copied
            </>
          ) : (
            <>
              <CopyIcon />
              Copy link
            </>
          )}
        </Button>
      </div>
      <p
        id={statusId}
        aria-live="polite"
        className={cn("min-h-5 text-xs", status === "error" ? "text-danger" : "text-ink-subtle")}
      >
        {status === "copied" && "Link copied to your clipboard."}
        {status === "error" &&
          "Couldn't copy automatically. The link is selected. Press Ctrl+C (or ⌘C) to copy it."}
      </p>
    </div>
  );
}
