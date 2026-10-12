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

export interface ClientResponse {
  kind: "confirmed" | "disputed";
  respondedBy: string;
  respondedAt: string;
  note?: string;
}

export interface Freelancer {
  name: string;
  headline: string;
  isDemo: true;
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
  confirmationToken?: string;
  response?: ClientResponse;
  isDemo: true;
}
