import type { Money } from "./types";

// Fixed locale and time zone keep server and client output identical.
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
});

export function formatDate(iso: string): string {
  return dateFormatter.format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return `${dateTimeFormatter.format(new Date(iso))} UTC`;
}

const monthDayFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

/**
 * Built by hand rather than with `formatRange`, whose separator whitespace differs
 * between ICU versions (Node vs. browser) and causes hydration mismatches.
 */
export function formatDateRange(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (start.getUTCFullYear() !== end.getUTCFullYear()) {
    return `${dateFormatter.format(start)} – ${dateFormatter.format(end)}`;
  }
  return `${monthDayFormatter.format(start)} – ${monthDayFormatter.format(end)}, ${end.getUTCFullYear()}`;
}

export function formatMoney({ value, currency }: Money): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}
