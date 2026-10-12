import type { RecordStatus } from "./types";

export const STATUS_META: Record<
  RecordStatus,
  { label: string; description: string }
> = {
  draft: {
    label: "Draft",
    description: "Not yet sent to the client.",
  },
  pending: {
    label: "Awaiting client",
    description: "Confirmation link shared. Waiting for the client to respond.",
  },
  confirmed: {
    label: "Client-confirmed",
    description: "The client confirmed this work claim.",
  },
  disputed: {
    label: "Disputed",
    description: "The client raised an issue with this work claim.",
  },
  anchored: {
    label: "Anchored",
    description:
      "A fingerprint of the confirmed record is recorded on Monad for integrity checks.",
  },
};

/** Display order for filters and summaries. */
export const STATUS_ORDER: readonly RecordStatus[] = [
  "pending",
  "confirmed",
  "disputed",
  "draft",
  "anchored",
];
