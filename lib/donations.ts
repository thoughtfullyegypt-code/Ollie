import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import { pool, transaction } from "./db";

const RATE = 10;
const CONFIG_KEY = "donation_commitment_current";
// Receipt binaries are loaded only by the explicit attachment-download route.
const RECEIPT_FIELDS =
  "id,donated_at,amount_minor,currency,recipient_name,period_start,period_end,published,file_name,created_at,redacted_confirmed";
export const DONATION_CALCULATION =
  "10% of provider-confirmed settled seat-sales revenue, excluding collected sales taxes and refunded or disputed amounts, before payment-processing fees and operating expenses. USD only. The cumulative commitment is rounded to the nearest US cent, half up; quarter-to-quarter rounding is carried forward.";
export const DONATION_ADJUSTMENTS =
  "Refunds and disputes append adjustments; published reports are never rewritten. If the original quarter was published, the adjustment reduces the next open reporting period. A later adjustment does not reverse an actual donation or request money back from the recipient.";
const emptyConfig = {
  enabled: false,
  recipientName: "",
  recipientWebsite: "",
  cause: "",
  effectiveStart: "",
  firstPeriodStart: "",
  firstPeriodEnd: "",
  schedule: "quarterly" as const,
  approvedWording: "",
  recipientVerified: false,
  accountingConfirmed: false,
};
export type DonationConfig = typeof emptyConfig;
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (s) =>
      !Number.isNaN(Date.parse(s)) &&
      new Date(s).toISOString().slice(0, 10) === s,
    "Use an actual calendar date.",
  );
const configSchema = z.object({
  enabled: z.boolean().default(false),
  recipientName: z.string().trim().max(160).default(""),
  recipientWebsite: z.string().trim().max(500).default(""),
  cause: z.string().trim().max(240).default(""),
  effectiveStart: z.string().max(30).default(""),
  firstPeriodStart: z.string().max(10).default(""),
  firstPeriodEnd: z.string().max(10).default(""),
  schedule: z.literal("quarterly").default("quarterly"),
  approvedWording: z.string().trim().max(2000).default(""),
  recipientVerified: z.boolean().default(false),
  accountingConfirmed: z.boolean().default(false),
});
function error(message: string, status = 400): never {
  throw Object.assign(new Error(message), { status });
}
function dateOnly(value: unknown) {
  return value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value).slice(0, 10);
}
function timestamp(value: unknown) {
  return value instanceof Date
    ? value.toISOString()
    : new Date(String(value)).toISOString();
}
function monthPlus(date: string, months: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}
function quarterValid(start: string, end: string) {
  return (
    isoDate.safeParse(start).success &&
    isoDate.safeParse(end).success &&
    start.endsWith("-01") &&
    [0, 3, 6, 9].includes(new Date(start).getUTCMonth()) &&
    monthPlus(start, 3) === end
  );
}
export function donationSetupMissing(input: Partial<DonationConfig>) {
  const c = { ...emptyConfig, ...input };
  const missing: string[] = [];
  if (c.recipientName.length < 2) missing.push("Verified recipient name");
  try {
    const u = new URL(c.recipientWebsite);
    if (u.protocol !== "https:" || u.username || u.password) throw Error();
  } catch {
    missing.push("Official HTTPS recipient website");
  }
  if (c.cause.length < 3) missing.push("Supported cause");
  if (!isoDate.safeParse(c.effectiveStart).success)
    missing.push("Effective start date");
  if (
    !quarterValid(c.firstPeriodStart, c.firstPeriodEnd) ||
    c.effectiveStart.slice(0, 10) < c.firstPeriodStart ||
    c.effectiveStart.slice(0, 10) >= c.firstPeriodEnd
  )
    missing.push(
      "First calendar-quarter reporting period containing the effective start",
    );
  if (c.schedule !== "quarterly") missing.push("Quarterly donation schedule");
  if (c.approvedWording.length < 20)
    missing.push("Final approved commitment wording");
  if (!c.recipientVerified) missing.push("Recipient verification confirmation");
  if (!c.accountingConfirmed) missing.push("Accounting set-aside confirmation");
  return missing;
}
export function calculateEligibleMinor(input: {
  grossMinor: number;
  taxMinor?: number;
  refundedMinor?: number;
  refundedTaxMinor?: number;
  disputedMinor?: number;
  disputedTaxMinor?: number;
}) {
  for (const n of Object.values(input))
    if (n !== undefined && (!Number.isSafeInteger(n) || n < 0))
      error("Financial values must be non-negative integer minor units.");
  const {
    grossMinor,
    taxMinor = 0,
    refundedMinor = 0,
    refundedTaxMinor = 0,
    disputedMinor = 0,
    disputedTaxMinor = 0,
  } = input;
  if (
    taxMinor > grossMinor ||
    refundedMinor > grossMinor ||
    disputedMinor > grossMinor ||
    refundedTaxMinor > taxMinor ||
    disputedTaxMinor > taxMinor ||
    refundedTaxMinor > refundedMinor ||
    disputedTaxMinor > disputedMinor
  )
    error("Financial adjustment exceeds the confirmed order values.");
  return Math.max(
    0,
    grossMinor -
      taxMinor -
      (refundedMinor - refundedTaxMinor) -
      (disputedMinor - disputedTaxMinor),
  );
}
export function calculateDonationMinor(eligibleMinor: number) {
  if (!Number.isSafeInteger(eligibleMinor) || eligibleMinor < 0)
    error("Eligible revenue must be a non-negative integer.");
  return Number((BigInt(eligibleMinor) + 5n) / 10n);
}
async function requireAdminIn(c: PoolClient, userId: string) {
  const r = await c.query(
    'SELECT role,"emailVerified",deleted_at FROM "user" WHERE id=$1',
    [userId],
  );
  if (
    r.rows[0]?.role !== "admin" ||
    !r.rows[0]?.emailVerified ||
    r.rows[0]?.deleted_at
  )
    error("Administrator access required.", 403);
}
async function audit(
  c: PoolClient,
  actor: string,
  action: string,
  target: string,
  details: unknown,
) {
  await c.query(
    "INSERT INTO audit_events(id,actor_id,action,target,details) VALUES($1,$2,$3,$4,$5)",
    [randomUUID(), actor, action, target, JSON.stringify(details)],
  );
}
async function current(c: PoolClient) {
  const r = await c.query(
    "SELECT d.* FROM donation_commitments d JOIN settings s ON s.value->>'id'=d.id WHERE s.key=$1",
    [CONFIG_KEY],
  );
  return r.rows[0] as { id: string; config: DonationConfig } | undefined;
}
function periodFor(config: DonationConfig, date: string) {
  const first = new Date(config.firstPeriodStart);
  const when = new Date(date);
  const months =
    (when.getUTCFullYear() - first.getUTCFullYear()) * 12 +
    when.getUTCMonth() -
    first.getUTCMonth();
  const start = monthPlus(
    config.firstPeriodStart,
    Math.max(0, Math.floor(months / 3)) * 3,
  );
  return { start, end: monthPlus(start, 3) };
}
export type DonationFinancialEvent = {
  type: string;
  taxMinor?: number;
  refundedTotalMinor?: number;
  refundedTaxTotalMinor?: number;
  disputedTotalMinor?: number;
  disputedTaxTotalMinor?: number;
  settledAt?: string;
  occurredAt?: string;
  disputeResolved?: boolean;
};
/** Provider event occurrence time, rather than delivery order, controls disputes.
 * A terminal win wins ties because provider timestamps have second precision. */
export async function isStaleDonationDisputeEvent(
  c: PoolClient,
  orderId: string,
  event: { type: string; occurredAt?: string },
) {
  const type =
    event.type === "charge.dispute.created" ? "disputed" : event.type;
  if (type !== "disputed" && type !== "dispute_won") return false;
  const occurredAt = new Date(event.occurredAt || Date.now());
  if (
    !Number.isFinite(occurredAt.getTime()) ||
    occurredAt.getTime() > Date.now() + 300000
  )
    error("Invalid financial event timestamp.");
  const latest = await c.query(
    "SELECT event_type,COALESCE((snapshot->>'occurredAt')::timestamptz,created_at) occurred_at FROM donation_financial_events WHERE order_id=$1 AND event_type IN ('disputed','dispute_won') AND snapshot->>'ignoredDispute' IS DISTINCT FROM 'true' ORDER BY COALESCE((snapshot->>'occurredAt')::timestamptz,created_at) DESC,CASE WHEN event_type='dispute_won' THEN 1 ELSE 0 END DESC LIMIT 1",
    [orderId],
  );
  if (!latest.rowCount) return false;
  const previous = latest.rows[0],
    difference =
      occurredAt.getTime() - new Date(previous.occurred_at).getTime();
  return (
    difference < 0 ||
    (difference === 0 &&
      previous.event_type === "dispute_won" &&
      type !== "dispute_won")
  );
}
/** Must run inside the same transaction as verified payment-event processing. */
export async function syncDonationForOrder(
  c: PoolClient,
  orderId: string,
  eventId: string,
  event: DonationFinancialEvent = { type: "reconcile" },
) {
  await c.query("SELECT pg_advisory_xact_lock(890003)");
  const prior = await c.query(
    "SELECT order_id FROM donation_financial_events WHERE event_id=$1",
    [eventId],
  );
  if (prior.rowCount) {
    if (prior.rows[0].order_id !== orderId)
      error("Financial event identifier belongs to another order.", 409);
    return { duplicate: true };
  }
  const result = await c.query("SELECT * FROM orders WHERE id=$1 FOR UPDATE", [
    orderId,
  ]);
  const o = result.rows[0];
  if (!o) error("Order not found.", 404);
  const aliases: Record<string, string> = {
    "checkout.session.completed": "paid",
    "checkout.session.async_payment_succeeded": "paid",
    "charge.refunded": "refunded",
    "charge.dispute.created": "disputed",
  };
  const type = event.disputeResolved
    ? "dispute_won"
    : aliases[event.type] || event.type;
  const occurredAt = new Date(event.occurredAt || Date.now());
  if (
    !Number.isFinite(occurredAt.getTime()) ||
    occurredAt.getTime() > Date.now() + 300000
  )
    error("Invalid financial event timestamp.");
  const staleDispute = await isStaleDonationDisputeEvent(c, orderId, {
    type,
    occurredAt: occurredAt.toISOString(),
  });
  let tax = Number(o.tax_minor),
    refunded = Number(o.refunded_minor),
    refundedTax = Number(o.refunded_tax_minor),
    disputed = Number(o.disputed_minor),
    disputedTax = Number(o.disputed_tax_minor),
    settled = o.settled_at,
    review = o.financial_review_required,
    refundedTaxKnown = Boolean(o.refunded_tax_known),
    disputedTaxKnown = Boolean(o.disputed_tax_known);
  const integer = (n: number | undefined, label: string) => {
    if (n !== undefined && (!Number.isSafeInteger(n) || n < 0 || n > o.amount))
      error(`${label} must be a valid order minor-unit amount.`);
    return n;
  };
  if (event.taxMinor !== undefined) tax = integer(event.taxMinor, "Tax")!;
  if (type !== "refunded" && event.refundedTaxTotalMinor !== undefined) {
    refundedTax = integer(event.refundedTaxTotalMinor, "Refunded tax")!;
    refundedTaxKnown = true;
  }
  if (
    type !== "disputed" &&
    !staleDispute &&
    event.disputedTaxTotalMinor !== undefined
  ) {
    disputedTax = integer(event.disputedTaxTotalMinor, "Disputed tax")!;
    disputedTaxKnown = true;
  }
  if (
    type === "paid" &&
    ["paid", "refund_requested", "refunded", "disputed"].includes(o.status) &&
    !settled
  ) {
    const d = new Date(event.settledAt || event.occurredAt || Date.now());
    if (!Number.isFinite(d.getTime()) || d.getTime() > Date.now() + 300000)
      error("Invalid settlement timestamp.");
    settled = d;
  }
  if (type === "refunded") {
    const value = integer(event.refundedTotalMinor, "Refund");
    const previous = refunded;
    refunded = Math.max(
      refunded,
      value ?? (o.status === "refunded" ? o.amount : refunded),
    );
    if (refunded > previous && event.refundedTaxTotalMinor === undefined)
      refundedTaxKnown = false;
    // Older cumulative refund notifications must not lower an already verified
    // breakdown. A new larger total needs its own verified cumulative tax total.
    if (
      event.refundedTaxTotalMinor !== undefined &&
      (value === undefined || value >= previous)
    ) {
      refundedTaxKnown = true;
      refundedTax = Math.max(
        refundedTax,
        integer(event.refundedTaxTotalMinor, "Refunded tax")!,
      );
    } else if (refunded === o.amount) {
      refundedTax = tax;
      refundedTaxKnown = true;
    }
  }
  if (type === "disputed" && !staleDispute) {
    const previous = disputed;
    disputed = Math.max(
      disputed,
      integer(event.disputedTotalMinor, "Dispute") ?? o.amount,
    );
    if (disputed > previous && event.disputedTaxTotalMinor === undefined)
      disputedTaxKnown = false;
    if (event.disputedTaxTotalMinor !== undefined) {
      disputedTaxKnown = true;
      disputedTax = Math.max(
        disputedTax,
        integer(event.disputedTaxTotalMinor, "Disputed tax")!,
      );
    } else if (disputed === o.amount) {
      disputedTax = tax;
      disputedTaxKnown = true;
    }
  }
  if (type === "dispute_won" && !staleDispute) {
    disputed = 0;
    disputedTax = 0;
    disputedTaxKnown = true;
  }
  if (refunded === o.amount) refundedTax = tax;
  if (disputed === o.amount) disputedTax = tax;
  review =
    o.currency !== "usd" ||
    (tax > 0 && refunded > 0 && refunded < o.amount && !refundedTaxKnown) ||
    (tax > 0 && disputed > 0 && disputed < o.amount && !disputedTaxKnown);
  calculateEligibleMinor({
    grossMinor: o.amount,
    taxMinor: tax,
    refundedMinor: refunded,
    refundedTaxMinor: refundedTax,
    disputedMinor: disputed,
    disputedTaxMinor: disputedTax,
  });
  await c.query(
    "UPDATE orders SET tax_minor=$2,refunded_minor=$3,refunded_tax_minor=$4,disputed_minor=$5,disputed_tax_minor=$6,settled_at=$7,financial_review_required=$8,refunded_tax_known=$9,disputed_tax_known=$10 WHERE id=$1",
    [
      orderId,
      tax,
      refunded,
      refundedTax,
      disputed,
      disputedTax,
      settled,
      review,
      refundedTaxKnown,
      disputedTaxKnown,
    ],
  );
  await c.query(
    "INSERT INTO donation_financial_events(event_id,order_id,event_type,snapshot) VALUES($1,$2,$3,$4)",
    [
      eventId,
      orderId,
      type,
      JSON.stringify({
        taxMinor: tax,
        refundedMinor: refunded,
        refundedTaxMinor: refundedTax,
        disputedMinor: disputed,
        disputedTaxMinor: disputedTax,
        settledAt: settled ? timestamp(settled) : null,
        reviewRequired: review,
        occurredAt: occurredAt.toISOString(),
        ignoredDispute: staleDispute,
      }),
    ],
  );
  // No sample, complimentary, development or unconfirmed sale can fund a public claim.
  if (o.provider !== "stripe" || o.is_demo || o.currency !== "usd" || !settled)
    return { recorded: true, eligible: false };
  let commitment = (
    await c.query(
      "SELECT d.* FROM donation_order_assignments a JOIN donation_commitments d ON d.id=a.commitment_id WHERE a.order_id=$1",
      [orderId],
    )
  ).rows[0] as { id: string; config: DonationConfig } | undefined;
  if (!commitment) {
    commitment = await current(c);
    if (
      !commitment ||
      donationSetupMissing(commitment.config).length ||
      new Date(settled) < new Date(commitment.config.effectiveStart)
    )
      return { recorded: true, eligible: false };
    await c.query(
      "INSERT INTO donation_order_assignments(order_id,commitment_id) VALUES($1,$2)",
      [orderId, commitment.id],
    );
  }
  const target = review
    ? 0
    : calculateEligibleMinor({
        grossMinor: o.amount,
        taxMinor: tax,
        refundedMinor: refunded,
        refundedTaxMinor: refundedTax,
        disputedMinor: disputed,
        disputedTaxMinor: disputedTax,
      });
  const sums = await c.query(
    "SELECT COALESCE(sum(eligible_delta_minor),0)::text eligible FROM donation_ledger WHERE commitment_id=$1",
    [commitment.id],
  );
  const total = Number(sums.rows[0].eligible);
  const orderSum = await c.query(
    "SELECT COALESCE(sum(eligible_delta_minor),0)::text eligible FROM donation_ledger WHERE commitment_id=$1 AND order_id=$2",
    [commitment.id, orderId],
  );
  const before = Number(orderSum.rows[0].eligible),
    delta = target - before;
  if (!delta) return { recorded: true, eligibleMinor: target, deltaMinor: 0 };
  let period = periodFor(commitment.config, timestamp(settled));
  const published = await c.query(
    "SELECT 1 FROM donation_reports WHERE commitment_id=$1 AND period_start=$2",
    [commitment.id, period.start],
  );
  if (published.rowCount) {
    period = periodFor(commitment.config, new Date().toISOString());
    while (
      (
        await c.query(
          "SELECT 1 FROM donation_reports WHERE commitment_id=$1 AND period_start=$2",
          [commitment.id, period.start],
        )
      ).rowCount
    )
      period = { start: period.end, end: monthPlus(period.end, 3) };
  }
  const accrualDelta =
    calculateDonationMinor(total + delta) - calculateDonationMinor(total);
  await c.query(
    "INSERT INTO donation_ledger(id,event_id,order_id,commitment_id,event_type,currency,eligible_delta_minor,accrual_delta_minor,period_start,period_end,occurred_at) VALUES($1,$2,$3,$4,$5,'usd',$6,$7,$8,$9,$10)",
    [
      randomUUID(),
      eventId,
      orderId,
      commitment.id,
      type,
      delta,
      accrualDelta,
      period.start,
      period.end,
      occurredAt,
    ],
  );
  return {
    recorded: true,
    eligibleMinor: target,
    eligibleDeltaMinor: delta,
    accrualDeltaMinor: accrualDelta,
  };
}
export async function saveDonationConfig(adminId: string, input: unknown) {
  const config = configSchema.parse(input);
  const missing = donationSetupMissing(config);
  if (config.enabled && missing.length)
    error(
      `Complete the donation setup before publishing: ${missing.join("; ")}.`,
    );
  return transaction(async (c) => {
    await requireAdminIn(c, adminId);
    await c.query("SELECT pg_advisory_xact_lock(890002)");
    await c.query("SELECT pg_advisory_xact_lock(890003)");
    const existing = await current(c);
    let id = existing?.id || randomUUID();
    if (existing) {
      const history = await c.query(
        "SELECT EXISTS(SELECT 1 FROM donation_ledger WHERE commitment_id=$1) OR EXISTS(SELECT 1 FROM donation_receipts WHERE commitment_id=$1) OR EXISTS(SELECT 1 FROM donation_reports WHERE commitment_id=$1) history",
        [id],
      );
      const essential = [
        "recipientName",
        "recipientWebsite",
        "cause",
        "effectiveStart",
        "firstPeriodStart",
        "firstPeriodEnd",
        "schedule",
      ] as const;
      if (
        history.rows[0].history &&
        essential.some((k) => existing.config[k] !== config[k])
      )
        error(
          "This commitment has financial history. Its recipient, cause and reporting basis cannot be rewritten. Preserve its reports and establish a separately reviewed future commitment.",
          409,
        );
      await c.query(
        "UPDATE donation_commitments SET config=$2,updated_at=now() WHERE id=$1",
        [id, JSON.stringify(config)],
      );
    } else {
      await c.query(
        "INSERT INTO donation_commitments(id,config,created_by) VALUES($1,$2,$3)",
        [id, JSON.stringify(config), adminId],
      );
      await c.query(
        "INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()",
        [CONFIG_KEY, JSON.stringify({ id })],
      );
    }
    await audit(c, adminId, "donation.configured", id, {
      before: existing?.config || null,
      after: config,
    });
    // Only known provider-confirmed settlements can be reconciled; no created_at
    // or browser return is substituted for a missing settlement confirmation.
    if (!missing.length) {
      const orders = await c.query(
        "SELECT id FROM orders WHERE provider='stripe' AND NOT is_demo AND currency='usd' AND settled_at>=$1 ORDER BY id",
        [new Date(config.effectiveStart)],
      );
      for (const order of orders.rows)
        await syncDonationForOrder(
          c,
          order.id,
          `donation-config:${randomUUID()}:${order.id}`,
          { type: "reconcile" },
        );
    }
    return {
      config,
      active: config.enabled && !missing.length,
      setupMissing: missing,
    };
  });
}
function receipt(row: Record<string, any>) {
  return {
    id: row.id,
    donatedAt: dateOnly(row.donated_at),
    amountMinor: Number(row.amount_minor),
    currency: row.currency,
    recipientName: row.recipient_name,
    periodStart: dateOnly(row.period_start),
    periodEnd: dateOnly(row.period_end),
    published: row.published,
    fileName: row.file_name,
    url: `/api/donations/receipts/${row.id}`,
  };
}
async function totals(
  c: PoolClient,
  id: string,
  cutoff: string,
  publishedOnly: boolean,
) {
  const revenue = await c.query(
    "SELECT COALESCE(sum(eligible_delta_minor),0)::text eligible,COALESCE(sum(accrual_delta_minor),0)::text accrued FROM donation_ledger WHERE commitment_id=$1 AND created_at<=$2",
    [id, cutoff],
  );
  const donations = await c.query(
    `SELECT COALESCE(sum(amount_minor),0)::text donated FROM donation_receipts WHERE commitment_id=$1 AND created_at<=$2 ${publishedOnly ? "AND published AND redacted_confirmed" : ""}`,
    [id, cutoff],
  );
  const eligibleMinor = Number(revenue.rows[0].eligible),
    accruedMinor = Number(revenue.rows[0].accrued),
    donatedMinor = Number(donations.rows[0].donated);
  return {
    eligibleMinor,
    accruedMinor,
    donatedMinor,
    outstandingMinor: Math.max(0, accruedMinor - donatedMinor),
    excessDonatedMinor: Math.max(0, donatedMinor - accruedMinor),
    currency: "usd" as const,
  };
}
export async function publicDonationSummary() {
  return transaction(async (c) => {
    await c.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const record = await current(c);
    if (
      !record ||
      !record.config.enabled ||
      donationSetupMissing(record.config).length
    )
      return null;
    const unresolved = await c.query(
      "SELECT count(*)::int count FROM orders WHERE provider='stripe' AND NOT is_demo AND currency='usd' AND financial_review_required AND settled_at >= $1",
      [new Date(record.config.effectiveStart)],
    );
    if (unresolved.rows[0].count) return null;
    const cutoff = new Date().toISOString();
    const [publishedReceipts, reports] = [
      await c.query(
        `SELECT ${RECEIPT_FIELDS} FROM donation_receipts WHERE commitment_id=$1 AND published AND redacted_confirmed AND created_at<=$2 ORDER BY donated_at DESC,created_at DESC`,
        [record.id, cutoff],
      ),
      await c.query(
        "SELECT * FROM donation_reports WHERE commitment_id=$1 ORDER BY period_start DESC",
        [record.id],
      ),
    ];
    return {
      ...record.config,
      ratePercent: RATE,
      calculation: DONATION_CALCULATION,
      adjustmentExplanation: DONATION_ADJUSTMENTS,
      ...(await totals(c, record.id, cutoff, true)),
      reportingCutoff: cutoff,
      lastPublishedCutoff: reports.rows[0]
        ? timestamp(reports.rows[0].cutoff_at)
        : null,
      periods: reports.rows.map((r) => r.snapshot),
      receipts: publishedReceipts.rows.map(receipt),
    };
  });
}
export async function adminDonationData(adminId: string) {
  return transaction(async (c) => {
    await requireAdminIn(c, adminId);
    const record = await current(c),
      config = record?.config || emptyConfig,
      setupMissing = donationSetupMissing(config);
    if (!record)
      return {
        config,
        active: false,
        setupMissing,
        totals: {
          eligibleMinor: 0,
          accruedMinor: 0,
          donatedMinor: 0,
          outstandingMinor: 0,
          excessDonatedMinor: 0,
          currency: "usd",
        },
        ledger: [],
        receipts: [],
        periods: [],
        reviewRequiredOrders: [],
      };
    const ledger = await c.query(
      "SELECT * FROM donation_ledger WHERE commitment_id=$1 ORDER BY created_at DESC,id DESC LIMIT 100",
      [record.id],
    );
    const receipts = await c.query(
      `SELECT ${RECEIPT_FIELDS} FROM donation_receipts WHERE commitment_id=$1 ORDER BY created_at DESC LIMIT 100`,
      [record.id],
    );
    const reports = await c.query(
      "SELECT * FROM donation_reports WHERE commitment_id=$1 ORDER BY period_start DESC",
      [record.id],
    );
    const review = await c.query(
      "SELECT id,currency,amount,tax_minor,refunded_minor,disputed_minor FROM orders WHERE financial_review_required AND provider='stripe' AND NOT is_demo ORDER BY created_at DESC LIMIT 100",
    );
    return {
      config,
      active: config.enabled && !setupMissing.length && !review.rows.length,
      setupMissing: review.rows.length
        ? [
            ...setupMissing,
            "Financial adjustments require tax reconciliation before public claims or reports",
          ]
        : setupMissing,
      totals: await totals(c, record.id, new Date().toISOString(), false),
      ledger: ledger.rows.map((r) => ({
        id: r.id,
        eventId: r.event_id,
        orderId: r.order_id,
        type: r.event_type,
        currency: r.currency,
        eligibleDeltaMinor: Number(r.eligible_delta_minor),
        accrualDeltaMinor: Number(r.accrual_delta_minor),
        periodStart: dateOnly(r.period_start),
        periodEnd: dateOnly(r.period_end),
        occurredAt: timestamp(r.occurred_at),
        createdAt: timestamp(r.created_at),
      })),
      receipts: receipts.rows.map(receipt),
      periods: reports.rows.map((r) => r.snapshot),
      reviewRequiredOrders: review.rows.map((r) => ({
        orderId: r.id,
        currency: r.currency,
        grossMinor: r.amount,
        taxMinor: r.tax_minor,
        refundedMinor: r.refunded_minor,
        disputedMinor: r.disputed_minor,
      })),
    };
  });
}
export function validateDonationReceipt(
  file: { name: string; type: string; size: number },
  bytes: Buffer,
) {
  if (
    file.size !== bytes.byteLength ||
    bytes.length === 0 ||
    bytes.length > 5242880
  )
    error("Upload a redacted receipt of at most 5 MB.");
  const pdf = bytes.subarray(0, 5).toString("ascii") === "%PDF-",
    png =
      bytes.length > 24 &&
      bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
      bytes.subarray(12, 16).toString("ascii") === "IHDR",
    jpeg =
      bytes.length > 4 &&
      bytes[0] === 255 &&
      bytes[1] === 216 &&
      bytes[bytes.length - 2] === 255 &&
      bytes[bytes.length - 1] === 217;
  const mimeType = pdf
    ? "application/pdf"
    : png
      ? "image/png"
      : jpeg
        ? "image/jpeg"
        : null;
  if (!mimeType || file.type !== mimeType)
    error(
      "The receipt must be an actual PDF, PNG or JPEG matching its file type.",
    );
  if (png) {
    const width = bytes.readUInt32BE(16),
      height = bytes.readUInt32BE(20);
    if (!width || !height || width * height > 20000000)
      error("Receipt image dimensions are unsupported.");
  }
  const extension = pdf ? "pdf" : png ? "png" : "jpg";
  return { mimeType, fileName: `redacted-donation-receipt.${extension}` };
}
export async function recordDonationReceipt(
  adminId: string,
  input: unknown,
  file: {
    name: string;
    type: string;
    size: number;
    arrayBuffer: () => Promise<ArrayBuffer>;
  },
) {
  const value = z
    .object({
      amountMinor: z.coerce.number().int().positive().max(1000000000),
      currency: z.literal("usd"),
      recipientName: z.string().trim().min(2).max(160),
      donatedAt: isoDate,
      periodStart: isoDate,
      periodEnd: isoDate,
      redactedConfirmed: z.union([z.literal(true), z.literal("true")]),
    })
    .parse(input);
  if (!quarterValid(value.periodStart, value.periodEnd))
    error("Choose one complete calendar quarter.");
  if (new Date(value.donatedAt) > new Date())
    error("A donation cannot be recorded with a future payment date.");
  const bytes = Buffer.from(await file.arrayBuffer()),
    validated = validateDonationReceipt(file, bytes);
  return transaction(async (c) => {
    await requireAdminIn(c, adminId);
    await c.query("SELECT pg_advisory_xact_lock(890003)");
    const record = await current(c);
    if (!record || donationSetupMissing(record.config).length)
      error("Configure and approve the donation commitment first.");
    if (value.recipientName !== record.config.recipientName)
      error(
        "The receipt recipient must match the verified commitment recipient.",
      );
    if (value.periodStart < record.config.firstPeriodStart)
      error("This period precedes the commitment.");
    if (
      (
        await c.query(
          "SELECT id FROM donation_reports WHERE commitment_id=$1 AND period_start=$2",
          [record.id, value.periodStart],
        )
      ).rowCount
    )
      error(
        "This reporting period is already published. Record additional evidence through an auditable later-period adjustment; published receipts are not rewritten.",
        409,
      );
    const id = randomUUID();
    await c.query(
      "INSERT INTO donation_receipts(id,commitment_id,donated_at,amount_minor,currency,recipient_name,period_start,period_end,file_name,mime_type,file_bytes,redacted_confirmed,created_by) VALUES($1,$2,$3,$4,'usd',$5,$6,$7,$8,$9,$10,true,$11)",
      [
        id,
        record.id,
        value.donatedAt,
        value.amountMinor,
        value.recipientName,
        value.periodStart,
        value.periodEnd,
        validated.fileName,
        validated.mimeType,
        bytes,
        adminId,
      ],
    );
    await audit(c, adminId, "donation.receipt_recorded", id, {
      amountMinor: value.amountMinor,
      currency: "usd",
      recipientName: value.recipientName,
      donatedAt: value.donatedAt,
      periodStart: value.periodStart,
      periodEnd: value.periodEnd,
      redactedConfirmed: true,
    });
    return receipt(
      (
        await c.query(
          `SELECT ${RECEIPT_FIELDS} FROM donation_receipts WHERE id=$1`,
          [id],
        )
      ).rows[0],
    );
  });
}
export async function publishDonationPeriod(adminId: string, input: unknown) {
  const value = z
    .object({
      periodStart: isoDate,
      periodEnd: isoDate,
      cutoffAt: z.string().datetime(),
    })
    .parse(input);
  if (!quarterValid(value.periodStart, value.periodEnd))
    error("Choose a complete calendar quarter.");
  const cutoff = new Date(value.cutoffAt);
  if (cutoff > new Date() || cutoff < new Date(value.periodEnd))
    error(
      "Publish only a completed reporting quarter with a cutoff after its end and no later than now.",
    );
  return transaction(async (c) => {
    await requireAdminIn(c, adminId);
    await c.query("SELECT pg_advisory_xact_lock(890003)");
    const record = await current(c);
    if (!record || donationSetupMissing(record.config).length)
      error("Complete and approve the donation setup first.");
    if (value.periodStart < record.config.firstPeriodStart)
      error("This reporting period precedes the commitment.");
    const uncertain = await c.query(
      "SELECT 1 FROM orders WHERE provider='stripe' AND NOT is_demo AND currency='usd' AND financial_review_required AND settled_at >= $1 LIMIT 1",
      [new Date(record.config.effectiveStart)],
    );
    if (uncertain.rowCount)
      error(
        "Reconcile uncertain taxable refunds/disputes before publishing a financial report.",
        409,
      );
    const existing = await c.query(
      "SELECT snapshot FROM donation_reports WHERE commitment_id=$1 AND period_start=$2",
      [record.id, value.periodStart],
    );
    if (existing.rowCount)
      error(
        "This period was already published and cannot be overwritten.",
        409,
      );
    const amounts = await c.query(
      "SELECT COALESCE(sum(eligible_delta_minor),0)::text eligible,COALESCE(sum(accrual_delta_minor),0)::text accrued,COALESCE(sum(accrual_delta_minor) FILTER(WHERE eligible_delta_minor<0),0)::text adjusted FROM donation_ledger WHERE commitment_id=$1 AND period_start=$2 AND created_at<=$3",
      [record.id, value.periodStart, cutoff],
    );
    const receiptRows = await c.query(
      `SELECT ${RECEIPT_FIELDS} FROM donation_receipts WHERE commitment_id=$1 AND period_start=$2 AND redacted_confirmed AND created_at<=$3 ORDER BY donated_at,id`,
      [record.id, value.periodStart, cutoff],
    );
    const id = randomUUID(),
      snapshot = {
        id,
        periodStart: value.periodStart,
        periodEnd: value.periodEnd,
        cutoffAt: cutoff.toISOString(),
        eligibleMinor: Number(amounts.rows[0].eligible),
        accruedMinor: Number(amounts.rows[0].accrued),
        adjustmentMinor: Number(amounts.rows[0].adjusted),
        donatedMinor: receiptRows.rows.reduce(
          (sum, r) => sum + Number(r.amount_minor),
          0,
        ),
        currency: "usd",
        ratePercent: RATE,
        recipientName: record.config.recipientName,
        recipientWebsite: record.config.recipientWebsite,
        cause: record.config.cause,
        approvedWording: record.config.approvedWording,
        calculation: DONATION_CALCULATION,
        adjustmentExplanation: DONATION_ADJUSTMENTS,
        receipts: receiptRows.rows.map((r) => ({
          ...receipt(r),
          published: true,
        })),
      };
    await c.query(
      "INSERT INTO donation_reports(id,commitment_id,period_start,period_end,cutoff_at,snapshot,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [
        id,
        record.id,
        value.periodStart,
        value.periodEnd,
        cutoff,
        JSON.stringify(snapshot),
        adminId,
      ],
    );
    if (receiptRows.rows.length)
      await c.query(
        "UPDATE donation_receipts SET published=true WHERE id=ANY($1::text[])",
        [receiptRows.rows.map((r) => r.id)],
      );
    await audit(c, adminId, "donation.period_published", id, {
      periodStart: value.periodStart,
      periodEnd: value.periodEnd,
      cutoffAt: value.cutoffAt,
      eligibleMinor: snapshot.eligibleMinor,
      accruedMinor: snapshot.accruedMinor,
      donatedMinor: snapshot.donatedMinor,
    });
    return snapshot;
  });
}
export async function getPublishedDonationReceipt(id: string) {
  const r = await pool.query(
    "SELECT file_name,mime_type,file_bytes FROM donation_receipts WHERE id=$1 AND published AND redacted_confirmed",
    [id],
  );
  if (!r.rowCount) return null;
  return {
    fileName: r.rows[0].file_name as string,
    mimeType: r.rows[0].mime_type as string,
    bytes: r.rows[0].file_bytes as Buffer,
  };
}
export async function reconcileDonationTax(adminId: string, input: unknown) {
  const value = z
    .object({
      orderId: z.string().min(1).max(120),
      reason: z.string().trim().min(10).max(1000),
      confirmed: z.literal(true),
      taxMinor: z.number().int().nonnegative().optional(),
      refundedTaxTotalMinor: z.number().int().nonnegative().optional(),
      disputedTaxTotalMinor: z.number().int().nonnegative().optional(),
    })
    .parse(input);
  if (
    value.taxMinor === undefined &&
    value.refundedTaxTotalMinor === undefined &&
    value.disputedTaxTotalMinor === undefined
  )
    error("Provide a verified tax breakdown to reconcile.");
  return transaction(async (c) => {
    await requireAdminIn(c, adminId);
    await c.query("SELECT pg_advisory_xact_lock(890002)");
    const order = (
      await c.query("SELECT * FROM orders WHERE id=$1 FOR UPDATE", [
        value.orderId,
      ])
    ).rows[0];
    if (!order || order.provider !== "stripe" || order.is_demo)
      error("Choose a real provider order for accounting reconciliation.", 404);
    const id = `donation-tax:${randomUUID()}`;
    const result = await syncDonationForOrder(c, value.orderId, id, {
      type: "reconciled",
      taxMinor: value.taxMinor,
      refundedTaxTotalMinor: value.refundedTaxTotalMinor,
      disputedTaxTotalMinor: value.disputedTaxTotalMinor,
    });
    await audit(c, adminId, "donation.tax_reconciled", value.orderId, {
      reason: value.reason,
      verifiedTaxMinor: value.taxMinor,
      verifiedRefundedTaxMinor: value.refundedTaxTotalMinor,
      verifiedDisputedTaxMinor: value.disputedTaxTotalMinor,
      result,
    });
    return result;
  });
}
