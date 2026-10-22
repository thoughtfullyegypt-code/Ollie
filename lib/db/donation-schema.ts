import {
  pgTable,
  text,
  jsonb,
  timestamp,
  date,
  bigint,
  boolean,
  customType,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
const bytea = customType<{ data: Buffer }>({
  dataType() {
    return "bytea";
  },
});
export const donationCommitments = pgTable("donation_commitments", {
  id: text("id").primaryKey(),
  config: jsonb("config").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const donationFinancialEvents = pgTable("donation_financial_events", {
  eventId: text("event_id").primaryKey(),
  orderId: text("order_id").notNull(),
  eventType: text("event_type").notNull(),
  snapshot: jsonb("snapshot").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const donationOrderAssignments = pgTable("donation_order_assignments", {
  orderId: text("order_id").primaryKey(),
  commitmentId: text("commitment_id").notNull(),
});
export const donationLedger = pgTable(
  "donation_ledger",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id").notNull(),
    orderId: text("order_id").notNull(),
    commitmentId: text("commitment_id").notNull(),
    eventType: text("event_type").notNull(),
    currency: text("currency").notNull(),
    eligibleDeltaMinor: bigint("eligible_delta_minor", {
      mode: "number",
    }).notNull(),
    accrualDeltaMinor: bigint("accrual_delta_minor", {
      mode: "number",
    }).notNull(),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("donation_ledger_event_idx").on(t.eventId, t.commitmentId),
    index("donation_ledger_commitment_idx").on(
      t.commitmentId,
      t.periodStart,
      t.createdAt,
    ),
  ],
);
export const donationReceipts = pgTable("donation_receipts", {
  id: text("id").primaryKey(),
  commitmentId: text("commitment_id").notNull(),
  donatedAt: date("donated_at").notNull(),
  amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
  currency: text("currency").notNull(),
  recipientName: text("recipient_name").notNull(),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type").notNull(),
  fileBytes: bytea("file_bytes").notNull(),
  redactedConfirmed: boolean("redacted_confirmed").notNull(),
  published: boolean("published").notNull().default(false),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const donationReports = pgTable(
  "donation_reports",
  {
    id: text("id").primaryKey(),
    commitmentId: text("commitment_id").notNull(),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    cutoffAt: timestamp("cutoff_at", { withTimezone: true }).notNull(),
    snapshot: jsonb("snapshot").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("donation_reports_period_idx").on(
      t.commitmentId,
      t.periodStart,
    ),
  ],
);
