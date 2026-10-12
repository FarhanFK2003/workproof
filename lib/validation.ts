import { CATEGORIES, CURRENCIES, type Category, type Money } from "./types";

// Shared by the browser forms (instant feedback) and the server data layer (the
// trust boundary). Limits mirror the database constraints in
// supabase/migrations/20261012200000_work_records_and_confirmations.sql.

export type FieldErrors<K extends string> = Partial<Record<K, string>>;

export type ParseResult<T, K extends string> =
  | { ok: true; value: T }
  | { ok: false; errors: FieldErrors<K> };

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

/** Normalized, validated input for creating a work record. */
export interface WorkRecordInput {
  title: string;
  category: Category;
  summary: string;
  deliverables: string[];
  startDate: string;
  endDate: string;
  clientName: string;
  clientOrganization: string | null;
  clientEmail: string;
  amount: Money | null;
}

export const SUMMARY_MIN = 30;
export const SUMMARY_MAX = 1000;
const TITLE_MAX = 120;
const CLIENT_NAME_MAX = 120;
const CLIENT_ORGANIZATION_MAX = 160;
const EMAIL_MAX = 254;
const DELIVERABLES_MAX = 20;
const DELIVERABLE_LENGTH_MAX = 200;
const AMOUNT_MAX = 100_000_000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isOneOf<T extends string>(list: readonly T[], value: string): value is T {
  return (list as readonly string[]).includes(value);
}

/** True for a real calendar date in YYYY-MM-DD form. */
function isIsoDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** One deliverable per non-empty line. */
export function parseDeliverables(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
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

  const startValid = isIsoDate(values.startDate);
  const endValid = isIsoDate(values.endDate);
  if (!values.startDate) errors.startDate = "Enter the start date.";
  else if (!startValid) errors.startDate = "Enter a valid start date.";
  if (!values.endDate) errors.endDate = "Enter the end date.";
  else if (!endValid) errors.endDate = "Enter a valid end date.";
  else if (startValid && values.endDate < values.startDate)
    errors.endDate = "End date must be on or after the start date.";

  if (!summary) errors.summary = "Describe the work you delivered.";
  else if (summary.length < SUMMARY_MIN)
    errors.summary = `Add a little more detail (at least ${SUMMARY_MIN} characters).`;
  else if (summary.length > SUMMARY_MAX)
    errors.summary = `Keep the summary under ${SUMMARY_MAX} characters.`;

  const deliverables = parseDeliverables(values.deliverables);
  if (deliverables.length > DELIVERABLES_MAX)
    errors.deliverables = `List at most ${DELIVERABLES_MAX} deliverables.`;
  else if (deliverables.some((item) => item.length > DELIVERABLE_LENGTH_MAX))
    errors.deliverables = `Keep each deliverable under ${DELIVERABLE_LENGTH_MAX} characters.`;

  const clientName = values.clientName.trim();
  if (!clientName) errors.clientName = "Enter your client's name.";
  else if (clientName.length > CLIENT_NAME_MAX)
    errors.clientName = `Keep the name under ${CLIENT_NAME_MAX} characters.`;

  if (values.clientOrganization.trim().length > CLIENT_ORGANIZATION_MAX)
    errors.clientOrganization = `Keep the organization under ${CLIENT_ORGANIZATION_MAX} characters.`;

  const email = values.clientEmail.trim();
  if (!email) errors.clientEmail = "Enter your client's email address.";
  else if (email.length > EMAIL_MAX || !EMAIL_PATTERN.test(email))
    errors.clientEmail = "Enter an email address like name@company.com.";

  const amount = values.amount.trim();
  if (amount) {
    if (!AMOUNT_PATTERN.test(amount) || Number(amount) <= 0)
      errors.amount = "Enter an amount greater than zero (up to 2 decimals), or leave it blank.";
    else if (Number(amount) > AMOUNT_MAX)
      errors.amount = "Enter an amount of 100,000,000 or less.";
    else if (!isOneOf(CURRENCIES, values.currency))
      errors.currency = "Choose a currency.";
  }

  return errors;
}

/** Validates and normalizes a work record. Use on the server before any write. */
export function parseWorkRecord(
  values: WorkRecordFormValues,
): ParseResult<WorkRecordInput, keyof WorkRecordFormValues> {
  const errors = validateWorkRecord(values);
  // The guards repeat checks already in validateWorkRecord so TypeScript can narrow.
  if (
    hasErrors(errors) ||
    !isOneOf(CATEGORIES, values.category) ||
    (values.amount.trim() !== "" && !isOneOf(CURRENCIES, values.currency))
  ) {
    return { ok: false, errors };
  }

  const amount = values.amount.trim();
  const currency = values.currency;
  return {
    ok: true,
    value: {
      title: values.title.trim(),
      category: values.category,
      summary: values.summary.trim(),
      deliverables: parseDeliverables(values.deliverables),
      startDate: values.startDate,
      endDate: values.endDate,
      clientName: values.clientName.trim(),
      clientOrganization: values.clientOrganization.trim() || null,
      clientEmail: values.clientEmail.trim(),
      amount:
        amount && isOneOf(CURRENCIES, currency)
          ? { value: Number(amount), currency }
          : null,
    },
  };
}

export const RESPONDER_NAME_MAX = 120;
export const DISPUTE_REASON_MIN = 10;
export const DISPUTE_REASON_MAX = 1000;

export interface ClientResponseValues {
  kind: "confirmed" | "disputed";
  name: string;
  acknowledged: boolean;
  reason: string;
}

/** Normalized, validated client decision. */
export interface ClientDecisionInput {
  decision: "confirmed" | "disputed";
  decidedBy: string;
  note: string | null;
}

type ClientResponseField = "name" | "acknowledged" | "reason";

export function validateClientResponse(
  values: ClientResponseValues,
): FieldErrors<ClientResponseField> {
  const errors: FieldErrors<ClientResponseField> = {};
  const name = values.name.trim();
  const reason = values.reason.trim();

  if (!name) errors.name = "Enter your full name.";
  else if (name.length > RESPONDER_NAME_MAX)
    errors.name = `Keep your name under ${RESPONDER_NAME_MAX} characters.`;

  if (values.kind === "confirmed" && !values.acknowledged)
    errors.acknowledged = "Tick the box to confirm the statement above.";

  if (values.kind === "disputed") {
    if (reason.length < DISPUTE_REASON_MIN)
      errors.reason = `Briefly explain what doesn't match (at least ${DISPUTE_REASON_MIN} characters).`;
    else if (reason.length > DISPUTE_REASON_MAX)
      errors.reason = `Keep your explanation under ${DISPUTE_REASON_MAX} characters.`;
  }
  return errors;
}

/** Validates and normalizes a client decision. Use on the server before any write. */
export function parseClientResponse(
  values: ClientResponseValues,
): ParseResult<ClientDecisionInput, ClientResponseField> {
  const errors = validateClientResponse(values);
  if (hasErrors(errors)) return { ok: false, errors };
  return {
    ok: true,
    value: {
      decision: values.kind,
      decidedBy: values.name.trim(),
      // Only disputes carry a note; the confirmation UI has no note field.
      note: values.kind === "disputed" ? values.reason.trim() : null,
    },
  };
}

export function hasErrors(errors: Record<string, string | undefined>): boolean {
  return Object.values(errors).some(Boolean);
}
