"use client";

import Link from "next/link";
import {
  useRef,
  useState,
  useTransition,
  type ComponentProps,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  createRecordAction,
  type CreateRecordState,
} from "@/app/(main)/records/new/actions";
import { DemoTag } from "@/components/demo-notice";
import { AlertIcon, CheckIcon, ChevronDownIcon, LockIcon } from "@/components/icons";
import { Button, buttonStyles } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { controlStyles, Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/cn";
import { demoClientLinkPath, demoRecords } from "@/lib/demo-data";
import { CATEGORIES, CURRENCIES } from "@/lib/types";
import {
  hasErrors,
  SUMMARY_MAX,
  validateWorkRecord,
  type FieldErrors,
  type WorkRecordFormValues,
} from "@/lib/validation";

type FieldName = keyof WorkRecordFormValues;

const initialValues: WorkRecordFormValues = {
  title: "",
  category: "",
  startDate: "",
  endDate: "",
  summary: "",
  deliverables: "",
  clientName: "",
  clientOrganization: "",
  clientEmail: "",
  amount: "",
  currency: "USD",
};

/** Order used by the error summary, matching the visual order of the form. */
const fieldOrder: { name: FieldName; label: string }[] = [
  { name: "title", label: "Project title" },
  { name: "category", label: "Category" },
  { name: "startDate", label: "Start date" },
  { name: "endDate", label: "End date" },
  { name: "summary", label: "Summary of work" },
  { name: "deliverables", label: "Key deliverables" },
  { name: "clientName", label: "Client name" },
  { name: "clientOrganization", label: "Company or organization" },
  { name: "clientEmail", label: "Client email" },
  { name: "amount", label: "Amount" },
  { name: "currency", label: "Currency" },
];

const pendingSampleId = demoRecords.find((r) => r.status === "pending")?.id;

function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-5 border-b border-line px-5 py-7 last:border-b-0 sm:px-6 lg:grid-cols-[15rem_1fr] lg:gap-10">
      <div>
        <h2 className="text-[0.9375rem] font-semibold text-ink">{title}</h2>
        <p className="mt-1 text-sm leading-relaxed text-ink-subtle">{description}</p>
      </div>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

function Select({
  className,
  children,
  ...props
}: ComponentProps<"select">) {
  return (
    <div className="relative">
      <select className={cn(controlStyles, "h-10 appearance-none pr-9", className)} {...props}>
        {children}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-ink-subtle" />
    </div>
  );
}

export function NewRecordForm() {
  const [values, setValues] = useState<WorkRecordFormValues>(initialValues);
  const [errors, setErrors] = useState<FieldErrors<FieldName>>({});
  const [attempted, setAttempted] = useState(false);
  const [result, setResult] = useState<CreateRecordState>({ status: "idle" });
  const [requestFailed, setRequestFailed] = useState(false);
  const [submitting, startTransition] = useTransition();
  const summaryRef = useRef<HTMLDivElement>(null);
  const successRef = useRef<HTMLHeadingElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);

  function update(name: FieldName, value: string) {
    const next = { ...values, [name]: value };
    setValues(next);
    // After the first submit attempt, re-validate live so errors clear as they're fixed.
    if (attempted) setErrors(validateWorkRecord(next));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Client-side checks give instant feedback; the Server Action re-validates.
    const nextErrors = validateWorkRecord(values);
    setErrors(nextErrors);
    setAttempted(true);
    setRequestFailed(false);
    if (hasErrors(nextErrors)) {
      // Wait for the summary to render before moving focus to it.
      requestAnimationFrame(() => summaryRef.current?.focus());
      return;
    }

    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      let next: CreateRecordState;
      try {
        next = await createRecordAction({ status: "idle" }, formData);
      } catch {
        setRequestFailed(true);
        requestAnimationFrame(() => alertRef.current?.focus());
        return;
      }
      setResult(next);
      if (next.status === "invalid") {
        setErrors(next.errors);
        requestAnimationFrame(() => summaryRef.current?.focus());
      } else if (next.status === "unauthorized") {
        requestAnimationFrame(() => alertRef.current?.focus());
      } else if (next.status === "success") {
        requestAnimationFrame(() => successRef.current?.focus());
      }
    });
  }

  function reset() {
    setValues(initialValues);
    setErrors({});
    setAttempted(false);
    setRequestFailed(false);
    setResult({ status: "idle" });
  }

  if (result.status === "success") {
    const { preview } = result;
    return (
      <Card className="p-6 sm:p-8">
        <div className="flex items-start gap-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-strong">
            <CheckIcon className="size-5" />
          </span>
          <div className="min-w-0 space-y-1">
            <h2 ref={successRef} tabIndex={-1} className="text-lg font-semibold text-ink focus:outline-none">
              Record draft created (demo)
            </h2>
            <p className="text-sm leading-relaxed text-ink-muted">
              The server checked your session and validated the details, but nothing was saved
              and no link was sent. Saving records and generating real confirmation links arrive
              in the next milestone.
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-lg border border-line bg-canvas p-4 sm:ml-14">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status="draft" />
            <DemoTag />
          </div>
          <p className="mt-3 font-medium text-ink">{preview.title}</p>
          <p className="mt-0.5 text-sm text-ink-subtle">
            {preview.clientName}
            {preview.clientOrganization && ` · ${preview.clientOrganization}`}
          </p>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:ml-14 sm:flex-row">
          {pendingSampleId && (
            <Link href={`/records/${pendingSampleId}`} className={buttonStyles()}>
              View a sample pending record
            </Link>
          )}
          <Link href={demoClientLinkPath} className={buttonStyles({ variant: "secondary" })}>
            Preview the client view
          </Link>
          <Button variant="ghost" onClick={reset}>
            Create another
          </Button>
        </div>
      </Card>
    );
  }

  const summaryErrors = fieldOrder.filter(({ name }) => errors[name]);
  const sessionExpired = result.status === "unauthorized";

  return (
    <form onSubmit={handleSubmit} noValidate aria-describedby="form-required-note">
      {(sessionExpired || requestFailed) && (
        <div
          ref={alertRef}
          tabIndex={-1}
          role="alert"
          className="mb-6 flex gap-3 rounded-xl border border-danger/30 bg-danger-soft p-4 text-sm focus:outline-2 focus:outline-offset-2 focus:outline-danger sm:p-5"
        >
          <AlertIcon className="mt-0.5 text-danger" />
          {sessionExpired ? (
            <p className="text-ink">
              <span className="font-semibold text-danger">Your session has ended. </span>
              <Link
                href="/login?next=%2Frecords%2Fnew"
                className="font-medium text-danger underline underline-offset-2 hover:no-underline"
              >
                Sign in again
              </Link>{" "}
              to continue.
            </p>
          ) : (
            <p className="text-ink">
              <span className="font-semibold text-danger">Something went wrong. </span>
              Check your connection and try again.
            </p>
          )}
        </div>
      )}

      {summaryErrors.length > 0 && (
        <div
          ref={summaryRef}
          tabIndex={-1}
          role="alert"
          aria-labelledby="error-summary-title"
          className="mb-6 rounded-xl border border-danger/30 bg-danger-soft p-4 focus:outline-2 focus:outline-offset-2 focus:outline-danger sm:p-5"
        >
          <h2 id="error-summary-title" className="text-sm font-semibold text-danger">
            Fix {summaryErrors.length} {summaryErrors.length === 1 ? "field" : "fields"} to
            continue
          </h2>
          <ul className="mt-2 space-y-1 text-sm">
            {summaryErrors.map(({ name, label }) => (
              <li key={name}>
                <a
                  href={`#${name}`}
                  className="text-danger underline underline-offset-2 hover:no-underline"
                >
                  {label}: {errors[name]}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Card>
        <FormSection
          title="Project"
          description="What you delivered and when. This is what your client will be asked to confirm."
        >
          <Field id="title" label="Project title" required error={errors.title}>
            {(a11y) => (
              <Input
                {...a11y}
                name="title"
                value={values.title}
                onChange={(e) => update("title", e.target.value)}
                placeholder="e.g. Analytics dashboard for operations team"
                autoComplete="off"
              />
            )}
          </Field>

          <Field id="category" label="Category" required error={errors.category}>
            {(a11y) => (
              <Select
                {...a11y}
                name="category"
                value={values.category}
                onChange={(e) => update("category", e.target.value)}
              >
                <option value="" disabled>
                  Select a category
                </option>
                {CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field id="startDate" label="Start date" required error={errors.startDate}>
              {(a11y) => (
                <Input
                  {...a11y}
                  type="date"
                  name="startDate"
                  value={values.startDate}
                  onChange={(e) => update("startDate", e.target.value)}
                />
              )}
            </Field>
            <Field id="endDate" label="End date" required error={errors.endDate}>
              {(a11y) => (
                <Input
                  {...a11y}
                  type="date"
                  name="endDate"
                  min={values.startDate || undefined}
                  value={values.endDate}
                  onChange={(e) => update("endDate", e.target.value)}
                />
              )}
            </Field>
          </div>

          <Field
            id="summary"
            label="Summary of work"
            required
            error={errors.summary}
            hint={`Describe the outcome in plain language. ${values.summary.trim().length}/${SUMMARY_MAX} characters.`}
          >
            {(a11y) => (
              <Textarea
                {...a11y}
                name="summary"
                rows={5}
                value={values.summary}
                onChange={(e) => update("summary", e.target.value)}
              />
            )}
          </Field>

          <Field
            id="deliverables"
            label="Key deliverables"
            hint="One per line. Your client will see this list."
            error={errors.deliverables}
          >
            {(a11y) => (
              <Textarea
                {...a11y}
                name="deliverables"
                rows={3}
                value={values.deliverables}
                onChange={(e) => update("deliverables", e.target.value)}
                placeholder={"Responsive website\nDesign system in Figma"}
              />
            )}
          </Field>
        </FormSection>

        <FormSection
          title="Client"
          description="The person who will confirm this work. They don't need an account or wallet."
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <Field id="clientName" label="Client name" required error={errors.clientName}>
              {(a11y) => (
                <Input
                  {...a11y}
                  name="clientName"
                  autoComplete="off"
                  value={values.clientName}
                  onChange={(e) => update("clientName", e.target.value)}
                />
              )}
            </Field>
            <Field
              id="clientOrganization"
              label="Company or organization"
              error={errors.clientOrganization}
            >
              {(a11y) => (
                <Input
                  {...a11y}
                  name="clientOrganization"
                  autoComplete="off"
                  value={values.clientOrganization}
                  onChange={(e) => update("clientOrganization", e.target.value)}
                />
              )}
            </Field>
          </div>
          <Field
            id="clientEmail"
            label="Client email"
            required
            error={errors.clientEmail}
            hint={
              <span className="inline-flex items-start gap-1.5">
                <LockIcon className="mt-px size-3.5" />
                Private. Never shown publicly or written on-chain.
              </span>
            }
          >
            {(a11y) => (
              <Input
                {...a11y}
                type="email"
                name="clientEmail"
                inputMode="email"
                autoComplete="off"
                spellCheck={false}
                value={values.clientEmail}
                onChange={(e) => update("clientEmail", e.target.value)}
                placeholder="name@company.com"
              />
            )}
          </Field>
        </FormSection>

        <FormSection
          title="Payment"
          description="Optional. Shown only to your client during confirmation. Confirmation doesn't prove payment."
        >
          <div className="grid gap-5 sm:grid-cols-[1fr_9rem]">
            <Field id="amount" label="Amount" error={errors.amount}>
              {(a11y) => (
                <Input
                  {...a11y}
                  type="number"
                  name="amount"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  value={values.amount}
                  onChange={(e) => update("amount", e.target.value)}
                />
              )}
            </Field>
            <Field id="currency" label="Currency" required={values.amount.trim() !== ""} error={errors.currency}>
              {(a11y) => (
                <Select
                  {...a11y}
                  name="currency"
                  value={values.currency}
                  onChange={(e) => update("currency", e.target.value)}
                >
                  {CURRENCIES.map((currency) => (
                    <option key={currency} value={currency}>
                      {currency}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
        </FormSection>
      </Card>

      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p id="form-required-note" className="text-sm text-ink-subtle">
          Fields marked Optional can be left blank. Demo only: nothing is saved.
        </p>
        <div className="flex flex-col-reverse gap-3 sm:flex-row">
          <Link href="/dashboard" className={buttonStyles({ variant: "ghost" })}>
            Cancel
          </Link>
          <Button type="submit" loading={submitting} loadingText="Creating…">
            Create record
          </Button>
        </div>
      </div>
    </form>
  );
}
