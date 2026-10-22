import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pool, transaction } from "../lib/db";
import { migrate } from "../lib/db/migrate";
import { handlePaymentEvent } from "../lib/domain";
import {
  adminDonationData,
  calculateDonationMinor,
  calculateEligibleMinor,
  donationSetupMissing,
  getPublishedDonationReceipt,
  publicDonationSummary,
  publishDonationPeriod,
  reconcileDonationTax,
  recordDonationReceipt,
  saveDonationConfig,
  syncDonationForOrder,
  validateDonationReceipt,
} from "../lib/donations";
import { GET as receiptRoute } from "../app/api/donations/receipts/[id]/route";

// Synthetic financial fixtures exercise the provider-event boundary without
// contacting Stripe, charging a card, or making a donation. Run serially against
// the development database; the original public configuration is restored.
const run = randomUUID(),
  admin = `donation-test-${run}-admin`,
  member = `donation-test-${run}-member`,
  commitmentId = randomUUID(),
  settingKey = "donation_commitment_current",
  year = new Date().getUTCFullYear() - 1,
  periodStart = `${year}-01-01`,
  periodEnd = `${year}-04-01`,
  settledAt = `${year}-02-01T12:00:00.000Z`;
const fixtureConfig = {
  enabled: false,
  recipientName: "Automated test recipient — not a real charity",
  recipientWebsite: "https://example.test/test-recipient",
  cause: "An explicitly synthetic accounting test",
  effectiveStart: periodStart,
  firstPeriodStart: periodStart,
  firstPeriodEnd: periodEnd,
  schedule: "quarterly" as const,
  approvedWording:
    "Synthetic test commitment, never an operator donation claim.",
  recipientVerified: true,
  accountingConfirmed: true,
};
const orderIds: string[] = [];
let priorSetting: unknown,
  settingSaved = false,
  snapshot: Record<string, any>,
  reportReceiptId: string,
  adjustmentOrderId: string;
function when(day: number) {
  return `${year}-02-${String(day).padStart(2, "0")}T12:00:00.000Z`;
}
async function order(
  amount = 1055,
  overrides: { provider?: string; demo?: boolean; currency?: string } = {},
) {
  const id = randomUUID();
  orderIds.push(id);
  await pool.query(
    "INSERT INTO orders(id,user_id,package_id,amount,currency,status,provider,profile_draft,is_demo) VALUES($1,$2,'one',$3,$4,'paid',$5,'{}',$6)",
    [
      id,
      member,
      amount,
      overrides.currency || "usd",
      overrides.provider || "stripe",
      overrides.demo || false,
    ],
  );
  await pool.query(
    "INSERT INTO donation_order_assignments(order_id,commitment_id) VALUES($1,$2)",
    [id, commitmentId],
  );
  return id;
}
async function financial(
  id: string,
  event: Parameters<typeof syncDonationForOrder>[3],
  eventId = `donation-test-${randomUUID()}`,
) {
  return transaction((c) => syncDonationForOrder(c, id, eventId, event));
}
async function amounts(id: string) {
  return (
    await pool.query(
      "SELECT COALESCE(sum(eligible_delta_minor),0)::int eligible,COALESCE(sum(accrual_delta_minor),0)::int accrued,count(*)::int entries FROM donation_ledger WHERE order_id=$1",
      [id],
    )
  ).rows[0];
}
async function paid(id: string, taxMinor = 55) {
  return financial(id, {
    type: "paid",
    taxMinor,
    settledAt,
    occurredAt: settledAt,
  });
}
const pdfBytes = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n",
);
const pdf = () => ({
  name: "private-name-with-address.pdf",
  type: "application/pdf",
  size: pdfBytes.length,
  arrayBuffer: async () => Uint8Array.from(pdfBytes).buffer,
});
const receiptInput = () => ({
  amountMinor: 100,
  currency: "usd",
  recipientName: fixtureConfig.recipientName,
  donatedAt: `${year}-04-15`,
  periodStart,
  periodEnd,
  redactedConfirmed: true,
});

before(async () => {
  assert.equal(
    process.env.APP_MODE,
    "development",
    "Never run synthetic accounting tests against production.",
  );
  await migrate();
  const realOrders = await pool.query(
    "SELECT 1 FROM orders WHERE provider='stripe' AND NOT is_demo LIMIT 1",
  );
  assert.equal(
    realOrders.rowCount,
    0,
    "Use an isolated development database with no real Stripe orders.",
  );
  for (const [id, role] of [
    [admin, "admin"],
    [member, "user"],
  ])
    await pool.query(
      'INSERT INTO "user"(id,name,email,"emailVerified",role) VALUES($1,$2,$3,true,$4)',
      [id, "Accounting test fixture", `${id}@example.test`, role],
    );
  const existing = await pool.query("SELECT value FROM settings WHERE key=$1", [
    settingKey,
  ]);
  priorSetting = existing.rows[0]?.value;
  settingSaved = true;
  await pool.query(
    "INSERT INTO donation_commitments(id,config,created_by) VALUES($1,$2,$3)",
    [commitmentId, JSON.stringify(fixtureConfig), admin],
  );
  await pool.query(
    "INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value",
    [settingKey, JSON.stringify({ id: commitmentId })],
  );
});
after(async () => {
  if (settingSaved) {
    if (priorSetting === undefined)
      await pool.query("DELETE FROM settings WHERE key=$1", [settingKey]);
    else
      await pool.query("UPDATE settings SET value=$2 WHERE key=$1", [
        settingKey,
        JSON.stringify(priorSetting),
      ]);
  }
  for (const table of [
    "donation_reports",
    "donation_receipts",
    "donation_ledger",
    "donation_order_assignments",
  ])
    await pool.query(`DELETE FROM ${table} WHERE commitment_id=$1`, [
      commitmentId,
    ]);
  await pool.query("DELETE FROM donation_commitments WHERE id=$1", [
    commitmentId,
  ]);
  for (const table of ["support_issues", "payment_events"])
    await pool.query(`DELETE FROM ${table} WHERE order_id=ANY($1::text[])`, [
      orderIds,
    ]);
  await pool.query("DELETE FROM audit_events WHERE actor_id=ANY($1::text[])", [
    [admin, member],
  ]);
  await pool.query("DELETE FROM orders WHERE id=ANY($1::text[])", [orderIds]);
  await pool.query('DELETE FROM "user" WHERE id=ANY($1::text[])', [
    [admin, member],
  ]);
  await pool.end();
});

test("donation calculation excludes taxes, refunds and disputes and rounds cumulative cents half up", () => {
  assert.equal(
    calculateEligibleMinor({
      grossMinor: 1055,
      taxMinor: 55,
      refundedMinor: 211,
      refundedTaxMinor: 11,
      disputedMinor: 105,
      disputedTaxMinor: 5,
    }),
    700,
  );
  for (const [eligible, donation] of [
    [0, 0],
    [4, 0],
    [5, 1],
    [14, 1],
    [15, 2],
    [500, 50],
    [900, 90],
  ])
    assert.equal(calculateDonationMinor(eligible), donation);
  assert.equal(
    calculateEligibleMinor({
      grossMinor: 500,
      refundedMinor: 500,
      disputedMinor: 500,
    }),
    0,
  );
  assert.equal(
    calculateEligibleMinor({ grossMinor: 500, taxMinor: undefined }),
    500,
  );
  assert.throws(() =>
    calculateEligibleMinor({ grossMinor: 500, taxMinor: 501 }),
  );
  assert.throws(() => calculateEligibleMinor({ grossMinor: 5.5 }));
  assert.throws(() => calculateDonationMinor(-1));
});

test("public donation claims remain hidden until complete approved setup is enabled by an administrator", async () => {
  assert.equal(await publicDonationSummary(), null);
  assert.ok(donationSetupMissing({}).length >= 8);
  assert.ok(
    donationSetupMissing({
      ...fixtureConfig,
      recipientWebsite: "javascript:alert(1)",
    }).length > 0,
  );
  assert.ok(
    donationSetupMissing({
      ...fixtureConfig,
      effectiveStart: `${periodStart}Tnot-a-time`,
    }).includes("Effective start date"),
  );
  await assert.rejects(
    () => saveDonationConfig(admin, { enabled: true }),
    /Complete the donation setup/,
  );
  await assert.rejects(() => saveDonationConfig(member, fixtureConfig), {
    status: 403,
  });
  const enabled = await saveDonationConfig(admin, {
    ...fixtureConfig,
    enabled: true,
  });
  assert.equal(enabled.active, true);
  const publicView = await publicDonationSummary();
  assert.equal(publicView?.recipientName, fixtureConfig.recipientName);
  assert.equal(publicView?.accruedMinor, 0);
  assert.equal(publicView?.donatedMinor, 0);
});

test("verified settlements are idempotent and demo, complimentary and unsupported currencies cannot fund public claims", async () => {
  const id = await order(),
    eventId = `donation-test-${randomUUID()}`;
  const first = await financial(
    id,
    { type: "paid", taxMinor: 55, settledAt, occurredAt: settledAt },
    eventId,
  );
  assert.equal("eligibleMinor" in first && first.eligibleMinor, 1000);
  assert.equal(
    (await financial(id, { type: "paid", taxMinor: 55 }, eventId)).duplicate,
    true,
  );
  await financial(id, { type: "reconcile" });
  assert.deepEqual(await amounts(id), {
    eligible: 1000,
    accrued: 100,
    entries: 1,
  });
  for (const overrides of [
    { provider: "development", demo: true },
    { provider: "seed" },
    { currency: "eur" },
  ]) {
    const excluded = await order(1055, overrides);
    await paid(excluded);
    assert.equal((await amounts(excluded)).entries, 0);
  }
});

test("rounding is carried across settlements rather than over-accruing each small order", async () => {
  const before = await adminDonationData(admin);
  const a = await order(5),
    b = await order(5);
  await paid(a, 0);
  await paid(b, 0);
  const after = await adminDonationData(admin);
  assert.equal(after.totals.eligibleMinor - before.totals.eligibleMinor, 10);
  assert.equal(after.totals.accruedMinor - before.totals.accruedMinor, 1);
  assert.equal((await amounts(a)).accrued + (await amounts(b)).accrued, 1);
});

test("full refunds append reversing adjustments and duplicate events cannot reverse twice", async () => {
  const id = await order();
  await paid(id);
  const eventId = `donation-test-${randomUUID()}`;
  await financial(
    id,
    { type: "refunded", refundedTotalMinor: 1055, occurredAt: when(3) },
    eventId,
  );
  await financial(
    id,
    { type: "refunded", refundedTotalMinor: 1055, occurredAt: when(3) },
    eventId,
  );
  assert.deepEqual(await amounts(id), { eligible: 0, accrued: 0, entries: 2 });
  const state = (
    await pool.query(
      "SELECT refunded_tax_minor,refunded_tax_known,financial_review_required FROM orders WHERE id=$1",
      [id],
    )
  ).rows[0];
  assert.deepEqual(state, {
    refunded_tax_minor: 55,
    refunded_tax_known: true,
    financial_review_required: false,
  });
});

test("uncertain partial taxable refunds hide claims and block reports until an authorized tax reconciliation", async () => {
  const id = await order();
  await paid(id);
  await financial(id, {
    type: "refunded",
    refundedTotalMinor: 211,
    occurredAt: when(3),
  });
  assert.equal(await publicDonationSummary(), null);
  assert.equal((await amounts(id)).eligible, 0);
  await assert.rejects(
    () =>
      publishDonationPeriod(admin, {
        periodStart,
        periodEnd,
        cutoffAt: new Date().toISOString(),
      }),
    { status: 409 },
  );
  const reconciliation = {
    orderId: id,
    reason: "Verified cumulative tax breakdown from provider",
    confirmed: true,
    refundedTaxTotalMinor: 11,
  };
  await assert.rejects(() => reconcileDonationTax(member, reconciliation), {
    status: 403,
  });
  await reconcileDonationTax(admin, reconciliation);
  assert.equal((await amounts(id)).eligible, 800);
  assert.ok(await publicDonationSummary());
  await financial(id, {
    type: "refunded",
    refundedTotalMinor: 422,
    occurredAt: when(4),
  });
  assert.equal(
    await publicDonationSummary(),
    null,
    "A larger refund cannot reuse an earlier partial tax breakdown.",
  );
  await financial(id, {
    type: "refunded",
    refundedTotalMinor: 211,
    refundedTaxTotalMinor: 11,
    occurredAt: when(3),
  });
  assert.equal(
    await publicDonationSummary(),
    null,
    "An older cumulative refund cannot clear required review.",
  );
  await reconcileDonationTax(admin, {
    ...reconciliation,
    refundedTaxTotalMinor: 22,
  });
  assert.equal((await amounts(id)).eligible, 600);
  await financial(id, {
    type: "refunded",
    refundedTotalMinor: 1055,
    occurredAt: when(5),
  });
  assert.equal((await amounts(id)).eligible, 0);
  assert.ok(await publicDonationSummary());
});

test("dispute resolution restores eligibility and delayed older dispute notifications cannot reopen financial or order state", async () => {
  const id = await order();
  await paid(id);
  await financial(id, {
    type: "disputed",
    disputedTotalMinor: 211,
    occurredAt: when(3),
  });
  assert.equal(await publicDonationSummary(), null);
  await reconcileDonationTax(admin, {
    orderId: id,
    reason: "Verified dispute tax from provider accounting",
    confirmed: true,
    disputedTaxTotalMinor: 11,
  });
  assert.equal((await amounts(id)).eligible, 800);
  await financial(id, {
    type: "disputed",
    disputedTotalMinor: 422,
    occurredAt: when(4),
  });
  assert.equal(await publicDonationSummary(), null);
  await financial(id, { type: "dispute_won", occurredAt: when(6) });
  assert.equal((await amounts(id)).eligible, 1000);
  const result = await handlePaymentEvent({
    id: `donation-test-${randomUUID()}`,
    orderId: id,
    type: "disputed",
    provider: "stripe",
    disputedTotalMinor: 1055,
    occurredAt: when(5),
  });
  assert.equal(result.outcome, "stale_dispute_ignored");
  assert.equal(
    (await pool.query("SELECT status FROM orders WHERE id=$1", [id])).rows[0]
      .status,
    "paid",
  );
  assert.equal((await amounts(id)).eligible, 1000);
  const ignored = await pool.query(
    "SELECT snapshot FROM donation_financial_events WHERE order_id=$1 AND snapshot->>'ignoredDispute'='true'",
    [id],
  );
  assert.equal(ignored.rowCount, 1);
  // A genuinely newer dispute can still open; its later resolution closes it.
  await handlePaymentEvent({
    id: `donation-test-${randomUUID()}`,
    orderId: id,
    type: "disputed",
    provider: "stripe",
    disputedTotalMinor: 1055,
    occurredAt: when(7),
  });
  assert.equal((await amounts(id)).eligible, 0);
  await handlePaymentEvent({
    id: `donation-test-${randomUUID()}`,
    orderId: id,
    type: "dispute_won",
    provider: "stripe",
    occurredAt: when(8),
  });
  assert.equal((await amounts(id)).eligible, 1000);
});

test("a dispute win delivered before settlement remains authoritative when the older dispute arrives later", async () => {
  const id = await order();
  await financial(id, { type: "dispute_won", occurredAt: when(6) });
  assert.equal((await amounts(id)).eligible, 0);
  await paid(id);
  await financial(id, {
    type: "disputed",
    disputedTotalMinor: 1055,
    occurredAt: when(3),
  });
  assert.equal((await amounts(id)).eligible, 1000);
  // A terminal resolution wins ties at the provider's second precision.
  await financial(id, {
    type: "disputed",
    disputedTotalMinor: 1055,
    occurredAt: when(6),
  });
  assert.equal((await amounts(id)).eligible, 1000);
});

test("receipt validation rejects active formats, forged types, unredacted uploads, unrelated recipients and unauthorized owners", async () => {
  const svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
  );
  assert.throws(() =>
    validateDonationReceipt(
      { name: "receipt.svg", type: "image/svg+xml", size: svg.length },
      svg,
    ),
  );
  assert.throws(() =>
    validateDonationReceipt(
      { name: "receipt.png", type: "image/png", size: pdfBytes.length },
      pdfBytes,
    ),
  );
  assert.throws(() =>
    validateDonationReceipt(
      { name: "receipt.pdf", type: "application/pdf", size: 5242881 },
      pdfBytes,
    ),
  );
  assert.equal(
    validateDonationReceipt(pdf(), pdfBytes).fileName,
    "redacted-donation-receipt.pdf",
  );
  await assert.rejects(
    () => recordDonationReceipt(member, receiptInput(), pdf()),
    { status: 403 },
  );
  await assert.rejects(() =>
    recordDonationReceipt(
      admin,
      { ...receiptInput(), redactedConfirmed: false },
      pdf(),
    ),
  );
  await assert.rejects(
    () =>
      recordDonationReceipt(
        admin,
        { ...receiptInput(), recipientName: "An unrelated recipient" },
        pdf(),
      ),
    /match the verified/,
  );
  await assert.rejects(() =>
    recordDonationReceipt(admin, { ...receiptInput(), currency: "eur" }, pdf()),
  );
  const result = await recordDonationReceipt(admin, receiptInput(), pdf());
  reportReceiptId = result.id;
  assert.equal(result.published, false);
  assert.equal(result.fileName.includes("private-name"), false);
  assert.equal(await getPublishedDonationReceipt(result.id), null);
});

test("publishing records actual donations separately from accrual and seals the original quarterly history", async () => {
  adjustmentOrderId = await order();
  await paid(adjustmentOrderId);
  snapshot = await publishDonationPeriod(admin, {
    periodStart,
    periodEnd,
    cutoffAt: new Date().toISOString(),
  });
  assert.equal(snapshot.donatedMinor, 100);
  assert.ok(snapshot.accruedMinor > snapshot.donatedMinor);
  assert.equal(snapshot.receipts.length, 1);
  assert.equal(snapshot.receipts[0].id, reportReceiptId);
  assert.ok(await getPublishedDonationReceipt(reportReceiptId));
  await assert.rejects(
    () =>
      publishDonationPeriod(admin, {
        periodStart,
        periodEnd,
        cutoffAt: new Date().toISOString(),
      }),
    { status: 409 },
  );
  await assert.rejects(
    () => recordDonationReceipt(admin, receiptInput(), pdf()),
    { status: 409 },
  );
  await assert.rejects(
    () =>
      saveDonationConfig(admin, {
        ...fixtureConfig,
        enabled: true,
        recipientName: "A replacement would rewrite the original basis",
      }),
    { status: 409 },
  );
});

test("later refunds append the next open period without changing published totals or actual donated money", async () => {
  const before = (
    await pool.query("SELECT snapshot FROM donation_reports WHERE id=$1", [
      snapshot.id,
    ])
  ).rows[0].snapshot;
  await financial(adjustmentOrderId, {
    type: "refunded",
    refundedTotalMinor: 1055,
    occurredAt: new Date().toISOString(),
  });
  const after = (
    await pool.query("SELECT snapshot FROM donation_reports WHERE id=$1", [
      snapshot.id,
    ])
  ).rows[0].snapshot;
  assert.deepEqual(after, before);
  const adjustment = (
    await pool.query(
      "SELECT period_start,eligible_delta_minor,accrual_delta_minor FROM donation_ledger WHERE order_id=$1 AND eligible_delta_minor<0",
      [adjustmentOrderId],
    )
  ).rows[0];
  const now = new Date(),
    openQuarter = new Date(
      Date.UTC(now.getUTCFullYear(), Math.floor(now.getUTCMonth() / 3) * 3, 1),
    );
  assert.equal(
    new Date(adjustment.period_start).toISOString().slice(0, 10),
    openQuarter.toISOString().slice(0, 10),
  );
  assert.equal(Number(adjustment.eligible_delta_minor), -1000);
  assert.equal(Number(adjustment.accrual_delta_minor), -100);
  const publicView = await publicDonationSummary();
  assert.equal(publicView?.donatedMinor, 100);
  assert.deepEqual(publicView?.periods[0], before);
});

test("published receipt downloads disclose no original filename and use attachment, sandbox and nosniff headers", async () => {
  const response = await receiptRoute(
    new Request("http://localhost:3000/receipt"),
    { params: Promise.resolve({ id: reportReceiptId }) },
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/pdf");
  assert.equal(
    response.headers.get("content-disposition"),
    'attachment; filename="redacted-donation-receipt.pdf"',
  );
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.match(
    response.headers.get("content-security-policy") || "",
    /sandbox/,
  );
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  const missing = await receiptRoute(
    new Request("http://localhost:3000/receipt"),
    { params: Promise.resolve({ id: randomUUID() }) },
  );
  assert.equal(missing.status, 404);
});
