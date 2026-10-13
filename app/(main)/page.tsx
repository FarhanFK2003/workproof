import Link from "next/link";
import { DemoTag } from "@/components/demo-notice";
import {
  ArrowRightIcon,
  CheckIcon,
  HashIcon,
  LinkIcon,
  LockIcon,
  ShieldCheckIcon,
  XIcon,
} from "@/components/icons";
import { Container } from "@/components/page-layout";
import { buttonStyles } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { getDemoRecord } from "@/lib/demo-data";
import { formatDate, formatDateRange } from "@/lib/format";

const steps = [
  {
    icon: <CheckIcon className="size-4.5" />,
    title: "Log the work",
    body: "Describe the project, the period, and what you delivered. Private details like your client's email and the amount stay private.",
  },
  {
    icon: <LinkIcon className="size-4.5" />,
    title: "Your client confirms",
    body: "Send a secure, single-use link. Your client reviews the claim and confirms or disputes it. No account or crypto wallet needed.",
  },
  {
    icon: <HashIcon className="size-4.5" />,
    title: "Anchor for integrity",
    body: "Record a fingerprint of the confirmed record on Monad so anyone can check it hasn't been changed since.",
    soon: true,
  },
];

const proves = [
  "Your client reviewed this specific claim and confirmed it, and when.",
  "Once anchored, that the record hasn't been altered since.",
];

const doesNotProve = [
  "That payment was made. Confirmation covers the work, not the money.",
  "That uploaded receipts are authentic. They're supporting evidence only.",
  "That the claim is true in every detail. Anchoring proves integrity, not truth.",
];

export default function HomePage() {
  const sample = getDemoRecord("demo-rec-1001");

  return (
    <>
      <section className="border-b border-line bg-surface">
        <Container className="grid gap-12 py-14 sm:py-20 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:gap-16">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-line bg-canvas px-3 py-1 text-xs font-medium text-ink-muted">
              <ShieldCheckIcon className="size-3.5 text-accent" />
              For independent freelancers
            </p>
            <h1 className="mt-5 text-4xl leading-[1.08] font-semibold tracking-tight text-balance text-ink sm:text-5xl">
              A work history your clients have actually confirmed.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-pretty text-ink-muted">
              Log a project, send your client a secure confirmation link, and build a portable
              record of your work you can share with anyone. No wallet, no platform lock-in.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/dashboard" className={buttonStyles({ size: "lg" })}>
                Open demo dashboard
                <ArrowRightIcon />
              </Link>
              <Link
                href="#how-heading"
                className={buttonStyles({ variant: "secondary", size: "lg" })}
              >
                How it works
              </Link>
            </div>
            <p className="mt-4 text-sm text-ink-subtle">
              The sample record shown here is demo data.
            </p>
          </div>

          {sample && (
            <Card className="p-5 sm:p-6" aria-label="Sample confirmed work record">
              <div className="flex items-center justify-between gap-3">
                <StatusBadge status={sample.status} />
                <DemoTag />
              </div>
              <h2 className="mt-4 text-lg font-semibold tracking-tight text-ink">
                {sample.title}
              </h2>
              <p className="mt-1 text-sm text-ink-subtle">
                {sample.client.organization} · {formatDateRange(sample.startDate, sample.endDate)}
              </p>
              <ul className="mt-5 space-y-2 border-t border-line pt-5">
                {sample.deliverables.map((item) => (
                  <li key={item} className="flex gap-2.5 text-sm text-ink-muted">
                    <CheckIcon className="mt-0.5 text-accent" />
                    {item}
                  </li>
                ))}
              </ul>
              {sample.response && (
                <div className="mt-5 rounded-lg bg-canvas p-4">
                  <p className="text-sm leading-relaxed text-ink">
                    &ldquo;{sample.response.note}&rdquo;
                  </p>
                  <p className="mt-2 text-xs text-ink-subtle">
                    Confirmed by {sample.response.respondedBy} on{" "}
                    {formatDate(sample.response.respondedAt)}
                  </p>
                </div>
              )}
              <p className="mt-4 flex items-center gap-2 text-xs text-ink-subtle">
                <LockIcon className="size-3.5" />
                Client email and amount are hidden from public view.
              </p>
            </Card>
          )}
        </Container>
      </section>

      <section aria-labelledby="how-heading" className="py-16 sm:py-20">
        <Container>
          <div className="max-w-2xl">
            <h2 id="how-heading" className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              How it works
            </h2>
            <p className="mt-3 text-ink-muted">
              Three steps from finished project to a record you can stand behind.
            </p>
          </div>
          <ol className="mt-10 grid gap-4 md:grid-cols-3">
            {steps.map((step, index) => (
              <li key={step.title}>
                <Card className="h-full p-6">
                  <div className="flex items-center justify-between">
                    <span className="grid size-9 place-items-center rounded-lg bg-accent-soft text-accent-strong">
                      {step.icon}
                    </span>
                    <span className="font-mono text-xs text-ink-subtle">0{index + 1}</span>
                  </div>
                  <h3 className="mt-5 flex flex-wrap items-center gap-2 font-semibold text-ink">
                    {step.title}
                    {step.soon && (
                      <span className="rounded-full bg-violet-soft px-2 py-0.5 text-xs font-medium text-violet">
                        Coming next
                      </span>
                    )}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-muted">{step.body}</p>
                </Card>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      <section aria-labelledby="trust-heading" className="border-y border-line bg-surface py-16 sm:py-20">
        <Container>
          <div className="max-w-2xl">
            <h2 id="trust-heading" className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              What a WorkProof record shows, and what it doesn&rsquo;t
            </h2>
            <p className="mt-3 text-ink-muted">
              Credibility depends on being precise about what&rsquo;s been verified.
            </p>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-line p-6">
              <h3 className="font-semibold text-ink">It shows</h3>
              <ul className="mt-4 space-y-3">
                {proves.map((item) => (
                  <li key={item} className="flex gap-3 text-sm leading-relaxed text-ink-muted">
                    <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-strong">
                      <CheckIcon className="size-3" />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-line p-6">
              <h3 className="font-semibold text-ink">It doesn&rsquo;t show</h3>
              <ul className="mt-4 space-y-3">
                {doesNotProve.map((item) => (
                  <li key={item} className="flex gap-3 text-sm leading-relaxed text-ink-muted">
                    <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-muted text-ink-subtle">
                      <XIcon className="size-3" />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <p className="mt-6 flex items-start gap-2.5 text-sm text-ink-muted">
            <LockIcon className="mt-0.5 text-accent" />
            Emails, amounts, and receipts are never written to a blockchain. Only a fingerprint
            of the confirmed record is.
          </p>
        </Container>
      </section>

      <section className="py-16 sm:py-20">
        <Container>
          <div className="flex flex-col items-start justify-between gap-6 rounded-2xl bg-ink p-8 sm:flex-row sm:items-center sm:p-10">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
                Walk through the full workflow
              </h2>
              <p className="mt-2 max-w-lg text-sm leading-relaxed text-white/75">
                Explore sample records, create one, copy a confirmation link, and respond as a
                client. All with demo data.
              </p>
            </div>
            <Link
              href="/dashboard"
              className={buttonStyles({ variant: "secondary", size: "lg" })}
            >
              Open demo dashboard
              <ArrowRightIcon />
            </Link>
          </div>
        </Container>
      </section>
    </>
  );
}
