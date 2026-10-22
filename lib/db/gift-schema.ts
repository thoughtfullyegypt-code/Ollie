import {
  pgTable,
  text,
  integer,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
export const gifts = pgTable(
  "gifts",
  {
    id: text("id").primaryKey(),
    senderId: text("sender_id").notNull(),
    orderId: text("order_id"),
    senderSeatId: integer("sender_seat_id"),
    recipientSeatId: integer("recipient_seat_id"),
    sourceSeatId: integer("source_seat_id"),
    occasion: text("occasion").notNull(),
    senderName: text("sender_name").notNull(),
    recipientName: text("recipient_name").notNull(),
    privateMessage: text("private_message").notNull(),
    senderCustomization: jsonb("sender_customization").notNull(),
    recipientCustomization: jsonb("recipient_customization").notNull(),
    dish: text("dish").notNull(),
    prop: text("prop").notNull(),
    status: text("status").notNull().default("draft"),
    packageId: text("package_id"),
    tokenHash: text("token_hash").unique(),
    linkCreatedAt: timestamp("link_created_at", { withTimezone: true }),
    thankYouAt: timestamp("thank_you_at", { withTimezone: true }),
    firstReadAt: timestamp("first_read_at", { withTimezone: true }),
    claimedBy: text("claimed_by"),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("gifts_sender_created_idx").on(t.senderId, t.createdAt),
    index("gifts_order_idx").on(t.orderId),
  ],
);
export const giftClaimIntents = pgTable("gift_claim_intents", {
  id: text("id").primaryKey(),
  giftId: text("gift_id").notNull(),
  userId: text("user_id").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const giftRateBuckets = pgTable("gift_rate_buckets", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
