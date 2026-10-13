export type RecordStatus =
  | "draft"
  | "pending"
  | "confirmed"
  | "disputed"
  | "anchored";

export const CURRENCIES = ["USD", "EUR", "GBP"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const CATEGORIES = [
  "Design",
  "Development",
  "Writing & content",
  "Marketing",
  "Consulting",
  "Other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export interface Money {
  value: number;
  currency: Currency;
}

export interface ClientContact {
  name: string;
  organization?: string;
  /** Private. Never shown publicly or written on-chain. */
  email: string;
}

/** State of a record's most recent confirmation link. */
export type LinkStatus = "active" | "expired" | "used";

export interface ClientResponse {
  kind: "confirmed" | "disputed";
  respondedBy: string;
  respondedAt: string;
  note?: string;
}

export interface WorkRecord {
  id: string;
  title: string;
  category: Category;
  summary: string;
  deliverables: string[];
  /** ISO dates (YYYY-MM-DD). */
  startDate: string;
  endDate: string;
  client: ClientContact;
  /** Private. Shared with the confirming client only. */
  amount?: Money;
  status: RecordStatus;
  createdAt: string;
  linkSharedAt?: string;
  linkExpiresAt?: string;
  /** Present when a confirmation link has been issued. */
  linkStatus?: LinkStatus;
  /** Demo data only. Real tokens are never stored or read back. */
  confirmationToken?: string;
  response?: ClientResponse;
  /** True for fictional sample data; false for records stored in Supabase. */
  isDemo: boolean;
}

/**
 * What the client sees on the confirmation page. Deliberately excludes the
 * client email, record ID, and link metadata.
 */
export interface ConfirmationView {
  /** "used" means the link was already consumed by a confirmation or dispute. */
  state: "open" | "expired" | "used";
  record: Pick<
    WorkRecord,
    "title" | "category" | "summary" | "deliverables" | "startDate" | "endDate" | "amount" | "status" | "response"
  > & { client: Omit<ClientContact, "email"> };
}
