import {
  pgTable,
  text,
  boolean,
  jsonb,
  timestamp,
  index,
  integer,
} from "drizzle-orm/pg-core";
/** Analytics deliberately stores no identity or foreign key to a customer/order. */
export const analyticsEvents = pgTable(
  "analytics_events",
  {
    id: text("id").primaryKey(),
    eventKey: text("event_key").notNull().unique(),
    name: text("name").notNull(),
    source: text("source").notNull(),
    orderKey: text("order_key"),
    invitationKey: text("invitation_key"),
    properties: jsonb("properties").notNull().default({}),
    attribution: jsonb("attribution").notNull().default({}),
    isDevelopment: boolean("is_development").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("analytics_events_name_created_idx").on(t.name, t.createdAt),
    index("analytics_events_origin_created_idx").on(t.source, t.createdAt),
  ],
);
export const analyticsRateBuckets = pgTable("analytics_rate_buckets", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
