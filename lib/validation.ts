import { CATEGORIES, CURRENCIES } from "./types";

export type FieldErrors<K extends string> = Partial<Record<K, string>>;

export interface WorkRecordFormValues {
  title: string;
  category: string;
  startDate: string;
  endDate: string;
  summary: string;
  deliverables: string;
  clientName: string;
  clientOrganization: string;
  clientEmail: string;
  amount: string;
  currency: string;
}

export const SUMMARY_MIN = 30;
export const SUMMARY_MAX = 1000;
const TITLE_MAX = 120;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isOneOf<T extends string>(list: readonly T[], value: string): value is T {
  return (list as readonly string[]).includes(value);
}

export function validateWorkRecord(
  values: WorkRecordFormValues,
): FieldErrors<keyof WorkRecordFormValues> {
  const errors: FieldErrors<keyof WorkRecordFormValues> = {};
  const title = values.title.trim();
  const summary = values.summary.trim();

  if (!title) errors.title = "Enter a project title.";
  else if (title.length > TITLE_MAX)
    errors.title = `Keep the title under ${TITLE_MAX} characters.`;

  if (!isOneOf(CATEGORIES, values.category))
    errors.category = "Choose a category.";

  if (!values.startDate) errors.startDate = "Enter the start date.";
  if (!values.endDate) errors.endDate = "Enter the end date.";
  else if (values.startDate && values.endDate < values.startDate)
    errors.endDate = "End date must be on or after the start date.";

  if (!summary) errors.summary = "Describe the work you delivered.";
  else if (summary.length < SUMMARY_MIN)
    errors.summary = `Add a little more detail (at least ${SUMMARY_MIN} characters).`;
  else if (summary.length > SUMMARY_MAX)
    errors.summary = `Keep the summary under ${SUMMARY_MAX} characters.`;

  if (!values.clientName.trim()) errors.clientName = "Enter your client's name.";

  const email = values.clientEmail.trim();
  if (!email) errors.clientEmail = "Enter your client's email address.";
  else if (!EMAIL_PATTERN.test(email))
    errors.clientEmail = "Enter an email address like name@company.com.";

  if (values.amount.trim()) {
    const amount = Number(values.amount);
    if (!Number.isFinite(amount) || amount <= 0)
      errors.amount = "Enter an amount greater than zero, or leave it blank.";
    else if (!isOneOf(CURRENCIES, values.currency))
      errors.currency = "Choose a currency.";
  }

  return errors;
}

export interface ClientResponseValues {
  kind: "confirmed" | "disputed";
  name: string;
  acknowledged: boolean;
  reason: string;
}

export function validateClientResponse(
  values: ClientResponseValues,
): FieldErrors<"name" | "acknowledged" | "reason"> {
  const errors: FieldErrors<"name" | "acknowledged" | "reason"> = {};
  if (!values.name.trim()) errors.name = "Enter your full name.";
  if (values.kind === "confirmed" && !values.acknowledged)
    errors.acknowledged = "Tick the box to confirm the statement above.";
  if (values.kind === "disputed" && values.reason.trim().length < 10)
    errors.reason = "Briefly explain what doesn't match (at least 10 characters).";
  return errors;
}

export function hasErrors(errors: Record<string, string | undefined>): boolean {
  return Object.values(errors).some(Boolean);
}
