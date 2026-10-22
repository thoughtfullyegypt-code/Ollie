import {
  pgTable,
  text,
  integer,
  bigint,
  boolean,
  timestamp,
  jsonb,
  primaryKey,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const users = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").notNull().default(false),
  image: text("image"),
  role: text("role").notNull().default("user"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("createdAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
export const sessions = pgTable("session", {
  id: text("id").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  createdAt: timestamp("createdAt", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updatedAt", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const accounts = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt", {
    withTimezone: true,
  }),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt", {
    withTimezone: true,
  }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("createdAt", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updatedAt", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const verifications = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updatedAt", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const neighborhoods = pgTable("neighborhoods", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  startSeat: integer("start_seat").notNull(),
  endSeat: integer("end_seat").notNull(),
  color: text("color").notNull(),
});
export const seats = pgTable(
  "seats",
  {
    id: integer("id").primaryKey(),
    neighborhoodId: text("neighborhood_id")
      .notNull()
      .references(() => neighborhoods.id),
    state: text("state").notNull().default("available"),
    ownerId: text("owner_id").references(() => users.id),
    orderId: text("order_id"),
    reservationId: text("reservation_id"),
    holdExpiresAt: timestamp("hold_expires_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("seats_neighborhood_idx").on(t.neighborhoodId),
    index("seats_state_idx").on(t.state),
  ],
);
export const orders = pgTable("orders", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  packageId: text("package_id").notNull(),
  amount: integer("amount").notNull(),
  currency: text("currency").notNull().default("usd"),
  status: text("status").notNull(),
  provider: text("provider").notNull(),
  checkoutSessionId: text("checkout_session_id").unique(),
  checkoutExpiresAt: timestamp("checkout_expires_at", { withTimezone: true }),
  paymentIntentId: text("payment_intent_id").unique(),
  profileDraft: jsonb("profile_draft").notNull(),
  attribution: jsonb("attribution").notNull().default({}),
  taxMinor: integer("tax_minor").notNull().default(0),
  refundedMinor: integer("refunded_minor").notNull().default(0),
  refundedTaxMinor: integer("refunded_tax_minor").notNull().default(0),
  disputedMinor: integer("disputed_minor").notNull().default(0),
  disputedTaxMinor: integer("disputed_tax_minor").notNull().default(0),
  refundedTaxKnown: boolean("refunded_tax_known").notNull().default(false),
  disputedTaxKnown: boolean("disputed_tax_known").notNull().default(false),
  settledAt: timestamp("settled_at", { withTimezone: true }),
  financialReviewRequired: boolean("financial_review_required")
    .notNull()
    .default(false),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const orderItems = pgTable(
  "order_items",
  {
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id),
    seatId: integer("seat_id")
      .notNull()
      .references(() => seats.id),
  },
  (t) => [primaryKey({ columns: [t.orderId, t.seatId] })],
);
export const reservations = pgTable("reservations", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  orderId: text("order_id").references(() => orders.id),
  kind: text("kind").notNull(),
  status: text("status").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const profiles = pgTable("profiles", {
  guestKind: text("guest_kind").notNull().default("purchased"),
  seatId: integer("seat_id")
    .primaryKey()
    .references(() => seats.id),
  displayName: text("display_name").notNull(),
  message: text("message").notNull(),
  dish: text("dish").notNull(),
  customization: jsonb("customization").notNull(),
  link: text("link"),
  visibility: text("visibility").notNull().default("pending"),
  reactionsEnabled: boolean("reactions_enabled").notNull().default(true),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const invitations = pgTable("invitations", {
  id: text("id").primaryKey(),
  tokenHash: text("token_hash").notNull().unique(),
  type: text("type").notNull(),
  sourceSeatId: integer("source_seat_id")
    .notNull()
    .references(() => seats.id),
  targetSeatId: integer("target_seat_id")
    .notNull()
    .references(() => seats.id),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id),
  status: text("status").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  claimedBy: text("claimed_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const reactions = pgTable(
  "reactions",
  {
    id: text("id").primaryKey(),
    seatId: integer("seat_id")
      .notNull()
      .references(() => seats.id),
    actorHash: text("actor_hash").notNull(),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("reactions_actor_idx").on(t.actorHash, t.createdAt)],
);
export const reports = pgTable("reports", {
  id: text("id").primaryKey(),
  seatId: integer("seat_id")
    .notNull()
    .references(() => seats.id),
  actorHash: text("actor_hash").notNull(),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const moderationDecisions = pgTable("moderation_decisions", {
  id: text("id").primaryKey(),
  seatId: integer("seat_id")
    .notNull()
    .references(() => seats.id),
  adminId: text("admin_id")
    .notNull()
    .references(() => users.id),
  action: text("action").notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const paymentEvents = pgTable("payment_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  orderId: text("order_id").references(() => orders.id),
  outcome: text("outcome").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const auditEvents = pgTable("audit_events", {
  id: text("id").primaryKey(),
  actorId: text("actor_id").references(() => users.id),
  action: text("action").notNull(),
  target: text("target").notNull(),
  details: jsonb("details").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const supportIssues = pgTable("support_issues", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id),
  orderId: text("order_id").references(() => orders.id),
  kind: text("kind").notNull(),
  message: text("message").notNull(),
  status: text("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Better Auth maintained database rate limiter: atomic cross-instance increments.
export const authRateLimits = pgTable(
  "rateLimit",
  {
    id: text("id").primaryKey(),
    key: text("key").notNull().unique(),
    count: integer("count").notNull(),
    lastRequest: bigint("lastRequest", { mode: "number" }).notNull(),
  },
  (t) => [index("auth_rate_limit_expiry_idx").on(t.lastRequest)],
);

export * from "./donation-schema";
export * from "./journey-schema";
