/**
 * DEMO DATA — fictional freelancer, clients, and records for the Milestone 1 UI.
 * Nothing here is persisted, and no record has been written to Monad.
 * Client emails use the reserved `.example` domain.
 */
import type { Freelancer, RecordStatus, WorkRecord } from "./types";

export const demoFreelancer: Freelancer = {
  name: "Sara Malik",
  headline: "Independent product designer & front-end developer",
  isDemo: true,
};

export const demoRecords: readonly WorkRecord[] = [
  {
    id: "demo-rec-1002",
    title: "Operations analytics dashboard",
    category: "Development",
    summary:
      "Designed and built an internal dashboard that brings shipment volumes, on-time rates, and carrier costs into one view, replacing a set of weekly spreadsheets.",
    deliverables: [
      "Next.js dashboard with role-based views",
      "Data model and import pipeline for carrier CSV exports",
      "Handover documentation and a recorded walkthrough",
    ],
    startDate: "2026-08-04",
    endDate: "2026-09-26",
    client: {
      name: "Daniel Osei",
      organization: "Atlas Freight Co.",
      email: "daniel.osei@atlasfreight.example",
    },
    amount: { value: 7200, currency: "USD" },
    status: "pending",
    createdAt: "2026-09-29T09:40:00Z",
    linkSharedAt: "2026-09-29T09:46:00Z",
    linkExpiresAt: "2026-10-27T09:46:00Z",
    confirmationToken: "demo-a7f3c9e2b5d14e08",
    isDemo: true,
  },
  {
    id: "demo-rec-1001",
    title: "Brand identity & marketing site",
    category: "Design",
    summary:
      "Created a new visual identity and a five-page marketing site for a boutique architecture studio, including a reusable component library for future pages.",
    deliverables: [
      "Logo suite, colour palette, and typography guidelines",
      "Five-page responsive marketing website",
      "Figma component library",
    ],
    startDate: "2026-06-02",
    endDate: "2026-07-18",
    client: {
      name: "Mariam Qureshi",
      organization: "Harbor & Pine Studio",
      email: "mariam@harborandpine.example",
    },
    amount: { value: 4800, currency: "USD" },
    status: "confirmed",
    createdAt: "2026-07-20T10:12:00Z",
    linkSharedAt: "2026-07-20T10:15:00Z",
    linkExpiresAt: "2026-08-17T10:15:00Z",
    confirmationToken: "demo-3c81d0f69a2b7e45",
    response: {
      kind: "confirmed",
      respondedBy: "Mariam Qureshi",
      respondedAt: "2026-07-22T14:03:00Z",
      note: "Delivered on schedule. The design system is already in use across our team.",
    },
    isDemo: true,
  },
  {
    id: "demo-rec-1003",
    title: "Payment reconciliation API",
    category: "Development",
    summary:
      "Built a service that matches incoming bank transfers to open invoices and flags mismatches for manual review.",
    deliverables: [
      "Reconciliation service with matching rules",
      "Webhook retry handling",
      "Admin review queue",
    ],
    startDate: "2026-04-06",
    endDate: "2026-05-15",
    client: {
      name: "Lena Fischer",
      organization: "Kestrel Payments GmbH",
      email: "lena.fischer@kestrel.example",
    },
    amount: { value: 6500, currency: "EUR" },
    status: "disputed",
    createdAt: "2026-05-18T08:20:00Z",
    linkSharedAt: "2026-05-18T08:24:00Z",
    linkExpiresAt: "2026-06-15T08:24:00Z",
    confirmationToken: "demo-9be27f41c0d8a336",
    response: {
      kind: "disputed",
      respondedBy: "Lena Fischer",
      respondedAt: "2026-05-21T16:48:00Z",
      note: "Webhook retry handling listed in the deliverables wasn't completed. Happy to confirm once it ships.",
    },
    isDemo: true,
  },
  {
    id: "demo-rec-1004",
    title: "Website accessibility audit",
    category: "Consulting",
    summary:
      "Audited the patient-facing website against WCAG 2.2 AA and delivered a prioritised remediation plan.",
    deliverables: [
      "Audit report with 42 findings",
      "Prioritised remediation roadmap",
    ],
    startDate: "2026-09-14",
    endDate: "2026-10-03",
    client: {
      name: "Priya Nair",
      organization: "Lumen Community Health",
      email: "priya.nair@lumenhealth.example",
    },
    status: "draft",
    createdAt: "2026-10-05T12:30:00Z",
    isDemo: true,
  },
  {
    id: "demo-rec-1005",
    title: "Product launch copy & email sequence",
    category: "Writing & content",
    summary:
      "Wrote launch messaging, product page copy, and a five-email onboarding sequence for a new subscription offering.",
    deliverables: [
      "Product page copy",
      "Five-email onboarding sequence",
      "Messaging guide",
    ],
    startDate: "2026-02-10",
    endDate: "2026-03-06",
    client: {
      name: "Tomás Rivera",
      organization: "Fieldnote Coffee Roasters",
      email: "tomas@fieldnote.example",
    },
    amount: { value: 1900, currency: "USD" },
    status: "confirmed",
    createdAt: "2026-03-09T11:05:00Z",
    linkSharedAt: "2026-03-09T11:07:00Z",
    linkExpiresAt: "2026-04-06T11:07:00Z",
    confirmationToken: "demo-e4a90b7c2f6d1853",
    response: {
      kind: "confirmed",
      respondedBy: "Tomás Rivera",
      respondedAt: "2026-03-10T09:31:00Z",
    },
    isDemo: true,
  },
];

export function getDemoRecord(id: string): WorkRecord | undefined {
  return demoRecords.find((record) => record.id === id);
}

export function getDemoRecordByToken(token: string): WorkRecord | undefined {
  return demoRecords.find((record) => record.confirmationToken === token);
}

export function countByStatus(
  records: readonly WorkRecord[],
): Record<RecordStatus, number> {
  const counts: Record<RecordStatus, number> = {
    draft: 0,
    pending: 0,
    confirmed: 0,
    disputed: 0,
    anchored: 0,
  };
  for (const record of records) counts[record.status] += 1;
  return counts;
}

/** Path of the demo record that is still awaiting a client response. */
export const demoClientLinkPath = `/confirm/${demoRecords[0].confirmationToken}`;
