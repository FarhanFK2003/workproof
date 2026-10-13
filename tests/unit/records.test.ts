import assert from "node:assert/strict";
import { test } from "node:test";
import { toRecordListItem } from "../../lib/record-list-item";
import { generateConfirmationToken, hashConfirmationToken, isWellFormedToken } from "../../lib/server/tokens";
import { countByStatus, deriveLinkStatus } from "../../lib/status";
import type { WorkRecord } from "../../lib/types";
import { parseClientResponse, parseWorkRecord, type WorkRecordFormValues } from "../../lib/validation";

const GOOD: WorkRecordFormValues = {
  title: " Brand site ",
  category: "Design",
  startDate: "2026-01-01",
  endDate: "2026-02-01",
  summary: "Designed and built a five page marketing site for the studio.",
  deliverables: " Logo \n\n Website \n",
  clientName: " Mariam ",
  clientOrganization: "  ",
  clientEmail: " m@x.example ",
  amount: "4800.50",
  currency: "EUR",
};

test("confirmation tokens: 256-bit, URL-safe, unique, stored only as SHA-256", () => {
  const a = generateConfirmationToken();
  const b = generateConfirmationToken();
  assert.match(a.token, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(a.token, b.token);
  assert.match(a.tokenHash, /^[0-9a-f]{64}$/);
  assert.equal(hashConfirmationToken(a.token), a.tokenHash);
  assert.notEqual(a.tokenHash, a.token);
  assert.ok(isWellFormedToken(a.token));
  for (const bad of ["", "demo-a7f3c9e2b5d14e08", `${a.token}x`, `${a.token.slice(1)}!`, `../${a.token.slice(3)}`]) {
    assert.equal(isWellFormedToken(bad), false, bad);
  }
});

test("work records are normalized on the server", () => {
  const parsed = parseWorkRecord(GOOD);
  assert.ok(parsed.ok);
  assert.deepEqual(parsed.value, {
    title: "Brand site",
    category: "Design",
    summary: GOOD.summary,
    deliverables: ["Logo", "Website"],
    startDate: "2026-01-01",
    endDate: "2026-02-01",
    clientName: "Mariam",
    clientOrganization: null,
    clientEmail: "m@x.example",
    amount: { value: 4800.5, currency: "EUR" },
  });
});

test("server validation rejects values the database would refuse", () => {
  const cases: Record<string, Partial<WorkRecordFormValues>> = {
    category: { category: "Hacking" },
    startDate: { startDate: "2026-02-30" },
    endDate: { endDate: "2025-12-31" },
    amount: { amount: "12.345" },
    currency: { currency: "BTC" },
    clientEmail: { clientEmail: "a@b" },
    deliverables: { deliverables: Array.from({ length: 21 }, (_, i) => `item ${i}`).join("\n") },
    clientOrganization: { clientOrganization: "x".repeat(161) },
    title: { title: "x".repeat(121) },
  };
  for (const [field, patch] of Object.entries(cases)) {
    const parsed = parseWorkRecord({ ...GOOD, ...patch });
    assert.ok(!parsed.ok, field);
    assert.ok(field in parsed.errors, `expected an error on ${field}`);
  }
  for (const amount of ["0", "-5", "1e3", "100000000.01", "abc"]) {
    assert.equal(parseWorkRecord({ ...GOOD, amount }).ok, false, amount);
  }
});

test("client decisions are validated and normalized", () => {
  assert.deepEqual(parseClientResponse({ kind: "confirmed", name: " Dan ", acknowledged: true, reason: "ignored" }), {
    ok: true,
    value: { decision: "confirmed", decidedBy: "Dan", note: null },
  });
  assert.equal(parseClientResponse({ kind: "confirmed", name: "Dan", acknowledged: false, reason: "" }).ok, false);
  assert.equal(parseClientResponse({ kind: "disputed", name: "Dan", acknowledged: false, reason: "too short" }).ok, false);
  assert.equal(parseClientResponse({ kind: "disputed", name: "Dan", acknowledged: false, reason: "x".repeat(1001) }).ok, false);
});

test("link status: used beats expiry; the expiry moment counts as expired", () => {
  const exp = "2026-10-20T12:00:00.000Z";
  const t = Date.parse(exp);
  assert.equal(deriveLinkStatus({ expiresAt: exp, consumedAt: null }, t - 1), "active");
  assert.equal(deriveLinkStatus({ expiresAt: exp, consumedAt: null }, t), "expired");
  assert.equal(deriveLinkStatus({ expiresAt: exp, consumedAt: "2026-10-19T00:00:00Z" }, t + 1e9), "used");
  assert.deepEqual(countByStatus([{ status: "pending" }, { status: "pending" }, { status: "draft" }]), {
    draft: 1, pending: 2, confirmed: 0, disputed: 0, anchored: 0,
  });
});

test("dashboard list items never carry private fields", () => {
  const record: WorkRecord = {
    id: "x", title: "T", category: "Design", summary: "s", deliverables: [], startDate: "2026-01-01",
    endDate: "2026-01-02", client: { name: "C", organization: "O", email: "private@example.com" },
    amount: { value: 5, currency: "USD" }, status: "pending", createdAt: "2026-01-03T00:00:00Z", isDemo: false,
  };
  const item = toRecordListItem(record);
  assert.deepEqual(Object.keys(item).sort(), ["client", "endDate", "id", "startDate", "status", "title"]);
  assert.ok(!JSON.stringify(item).includes("private@example.com"));
});
