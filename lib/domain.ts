import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import { pool, transaction } from "./db";
import { attributionSchema, recordJourneyEvent } from "./analytics";
import {
  isStaleDonationDisputeEvent,
  syncDonationForOrder,
} from "./donations";
import { NEIGHBORHOODS } from "./db/migrate";

export const PACKAGES = [
  { id: "one", label: "A seat for you", count: 1, amount: 500 },
  { id: "two", label: "Better together", count: 2, amount: 900 },
  { id: "six", label: "The dinner party", count: 6, amount: 2500 },
  { id: "celebration", label: "Make an occasion", count: 6, amount: 4900 },
] as const;
export const BASE_IDS = [
  "human",
  "astronaut",
  "grandma",
  "raccoon",
  "vampire",
  "plant",
  "detective",
  "ghost",
  "mushroom",
  "cat",
  "robot",
  "frog",
];
export const ACCESSORY_IDS = [
  "none",
  "curls",
  "bob",
  "bun",
  "beret",
  "party-hat",
  "flower",
  "crown",
  "beanie",
  "sunglasses",
  "bow",
  "headphones",
  "halo",
];
export const OUTFIT_IDS = [
  "signature",
  "stripes",
  "suit",
  "overalls",
  "knit",
  "turtleneck",
  "bowtie",
  "cardigan",
  "party",
  "chef",
];
export const DISH_IDS = [
  "spaghetti",
  "soup",
  "garlic-bread",
  "cake",
  "fries",
  "dumplings",
  "pie",
  "salad",
  "sushi",
  "pancakes",
  "olives",
  "mystery-jelly",
];
export class DomainError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
    this.name = "DomainError";
  }
}
const fail = (code: string, message: string, status = 400): never => {
  throw new DomainError(code, message, status);
};
const uuid = () => randomUUID();
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const dev = () => process.env.APP_MODE === "development";
const asDate = (d: unknown) =>
  d instanceof Date ? d.toISOString() : d ? String(d) : null;
const parseSeat = (n: unknown) => {
  const id = Number(n);
  if (!Number.isInteger(id) || id < 1 || id > 10000)
    fail("INVALID_SEAT", "Choose a seat between 1 and 10,000.");
  return id;
};
const safeLink = z
  .string()
  .max(500)
  .refine((s) => {
    if (!s) return true;
    try {
      const u = new URL(s);
      return (
        ["http:", "https:"].includes(u.protocol) && !u.username && !u.password
      );
    } catch {
      return false;
    }
  }, "Use a valid HTTP or HTTPS link without credentials.")
  .transform((s) => (s ? new URL(s).href : ""));
const choice = (values: string[]) =>
  z
    .string()
    .refine(
      (s) => values.includes(s),
      "Choose one of the illustrated options.",
    );
export const customizationSchema = z.object({
  base: choice(BASE_IDS).default("human"),
  accessory: choice(ACCESSORY_IDS).default("none"),
  outfit: choice(OUTFIT_IDS).default("signature"),
  skin: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#dfb28c"),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#9aab91"),
});
export const profileSchema = z.object({
  displayName: z.string().trim().min(1).max(30),
  message: z.string().trim().max(140).default(""),
  dish: choice(DISH_IDS).default("soup"),
  customization: customizationSchema.default({
    base: "human",
    accessory: "none",
    outfit: "signature",
    skin: "#dfb28c",
    color: "#9aab91",
  }),
  link: safeLink.nullish(),
  reactionsEnabled: z.boolean().default(true),
  visibility: z.enum(["pending", "private", "published", "hidden"]).optional(),
});
export type ProfileInput = z.input<typeof profileSchema>;
export type Customization = z.infer<typeof customizationSchema>;
export type PublicGuest = {
  seatId: number;
  displayName: string;
  message: string;
  dish: string;
  customization: Customization;
  link: string | null;
  neighborhood: string;
  neighborhoodId: string;
  reactionCount: number;
  joinedAt: string;
  isDemo: boolean;
  visibility: string;
  reactionsEnabled: boolean;
  celebration: boolean;
  kind: "purchased" | "complimentary" | "demo";
};
type Row = Record<string, any>;
export type InvitationRecord = {
  id: string;
  type: "courtesy" | "paid";
  sourceSeatId: number;
  targetSeatId: number;
  status: string;
  expiresAt: string;
  createdAt: string;
};
export type InvitationResolution = InvitationRecord & {
  expired: boolean;
  availableSeatId: number | null;
  requiresPurchase: boolean;
  sourceGuest: PublicGuest | null;
};
function guest(r: Row): PublicGuest {
  return {
    seatId: r.seat_id,
    displayName: r.display_name,
    message: r.message,
    dish: r.dish,
    customization: r.customization,
    link: r.link || null,
    neighborhood: r.neighborhood || r.neighborhood_name || "",
    neighborhoodId: r.neighborhood_id,
    reactionCount: Number(r.reaction_count || 0),
    joinedAt: asDate(r.created_at)!,
    isDemo: r.is_demo || r.order_is_demo,
    kind: r.public_kind || (r.is_demo ? "demo" : r.guest_kind || "purchased"),
    visibility: r.visibility,
    reactionsEnabled: r.reactions_enabled,
    celebration: !!r.celebration,
  };
}
function order(r: Row): Row {
  return {
    id: r.id,
    userId: r.user_id,
    packageId: r.package_id,
    amount: r.amount,
    currency: r.currency,
    status: r.status,
    provider: r.provider,
    seatIds: (r.seat_ids || []).map(Number),
    createdAt: asDate(r.created_at),
    checkoutSessionId: r.checkout_session_id,
    checkoutExpiresAt: asDate(r.checkout_expires_at),
    isDemo: r.is_demo,
    taxMinor: Number(r.tax_minor || 0),
    settledAt: asDate(r.settled_at),
  };
}
function invitation(r: Row): InvitationRecord {
  return {
    id: r.id,
    type: r.type,
    sourceSeatId: r.source_seat_id,
    targetSeatId: r.target_seat_id,
    status: r.status,
    expiresAt: asDate(r.expires_at)!,
    createdAt: asDate(r.created_at)!,
  };
}
async function verified(c: PoolClient, userId: string) {
  const r = await c.query(
    'SELECT * FROM "user" WHERE id=$1 AND deleted_at IS NULL',
    [userId],
  );
  if (!r.rowCount) fail("UNAUTHORIZED", "Please sign in.", 401);
  if (!r.rows[0].emailVerified)
    fail(
      "EMAIL_UNVERIFIED",
      "Verify your email before claiming or purchasing a seat.",
      403,
    );
  return r.rows[0];
}
async function admin(c: PoolClient, userId: string) {
  const u = await verified(c, userId);
  if (u.role !== "admin")
    fail("FORBIDDEN", "Administrator access required.", 403);
  return u;
}
async function readSequential(
  queries: Array<() => Promise<import("pg").QueryResult<any>>>,
) {
  const results = [];
  for (const query of queries) results.push(await query());
  return results;
}
async function inventoryLock(c: PoolClient) {
  await c.query("SELECT pg_advisory_xact_lock(890002)");
}
async function expireCourtesy(c: PoolClient) {
  // Only the local development provider can be expired by our own clock. Stripe
  // reservations remain allocated until an authenticated provider terminal event.
  const abandoned = await c.query(
    "UPDATE orders SET status='expired',updated_at=now() WHERE provider='development' AND status='checkout_pending' AND checkout_expires_at<=now() RETURNING id",
  );
  for (const o of abandoned.rows) {
    await c.query(
      "UPDATE seats SET state='available',order_id=NULL,reservation_id=NULL,hold_expires_at=NULL WHERE order_id=$1 AND state='checkout_held'",
      [o.id],
    );
    await c.query(
      "UPDATE reservations SET status='released' WHERE order_id=$1 AND status='active'",
      [o.id],
    );
    await c.query(
      "INSERT INTO payment_events(id,type,order_id,outcome) VALUES($1,'development.expired',$2,'released') ON CONFLICT(id) DO NOTHING",
      [`development-expired:${o.id}`, o.id],
    );
  }
  const expired = await c.query(
    "UPDATE invitations SET status='expired' WHERE type='courtesy' AND status='active' AND expires_at<=now() RETURNING id,target_seat_id",
  );
  for (const i of expired.rows) {
    await c.query(
      "UPDATE seats SET state='available',reservation_id=NULL,hold_expires_at=NULL,updated_at=now() WHERE id=$1 AND state='invitation_held' AND reservation_id=$2",
      [i.target_seat_id, i.id],
    );
    await c.query("UPDATE reservations SET status='released' WHERE id=$1", [
      i.id,
    ]);
  }
}
async function audit(
  c: PoolClient,
  actorId: string | null,
  action: string,
  target: string,
  details: Row = {},
) {
  await c.query(
    "INSERT INTO audit_events(id,actor_id,action,target,details) VALUES($1,$2,$3,$4,$5)",
    [uuid(), actorId, action, target, JSON.stringify(details)],
  );
}
async function support(c: PoolClient, o: Row, kind: string, message: string) {
  await c.query(
    "INSERT INTO support_issues(id,user_id,order_id,kind,message) VALUES($1,$2,$3,$4,$5)",
    [uuid(), o.user_id, o.id, kind, message],
  );
}
async function selectedPackage(c: PoolClient, id: string) {
  const override = await c.query(
    "SELECT value FROM settings WHERE key='packages'",
  );
  const packages = override.rows[0]?.value || PACKAGES;
  const p = packages.find((x: Row) => x.id === id);
  if (!p) fail("INVALID_PACKAGE", "Choose a valid seat package.");
  return p as { id: string; count: number; amount: number; label: string };
}
export async function getPackages() {
  const r = await pool.query("SELECT value FROM settings WHERE key='packages'");
  return r.rows[0]?.value || PACKAGES;
}
export async function getNeighborhoods() {
  return (
    await pool.query(
      'SELECT id,name,start_seat AS "startSeat",end_seat AS "endSeat",color FROM neighborhoods ORDER BY start_seat',
    )
  ).rows;
}
export async function getStats() {
  const r = await pool.query(
    `SELECT count(*)::int AS count,count(*) FILTER(WHERE NOT p.is_demo AND NOT o.is_demo AND o.provider='stripe' AND p.guest_kind='purchased')::int AS purchased,count(*) FILTER(WHERE NOT p.is_demo AND NOT o.is_demo AND (p.guest_kind='complimentary' OR o.provider='seed'))::int AS complimentary,count(*) FILTER(WHERE p.is_demo OR o.is_demo OR o.provider='development')::int AS demos FROM profiles p JOIN seats s ON s.id=p.seat_id JOIN orders o ON o.id=s.order_id WHERE p.visibility='published' AND s.state='purchased' AND ($1::boolean OR (NOT p.is_demo AND NOT o.is_demo AND o.provider<>'development'))`,
    [dev()],
  );
  return {
    publishedGuests: r.rows[0].count,
    totalSeats: 10000,
    isDevelopment: dev(),
    purchasedGuests: r.rows[0].purchased,
    complimentaryGuests: r.rows[0].complimentary,
    demoGuests: r.rows[0].demos,
  };
}
const publicSelect = `SELECT p.*,s.neighborhood_id,n.name AS neighborhood,o.is_demo AS order_is_demo,CASE WHEN p.is_demo OR o.is_demo OR o.provider='development' THEN 'demo' WHEN p.guest_kind='complimentary' OR o.provider='seed' THEN 'complimentary' ELSE 'purchased' END AS public_kind,(o.package_id='celebration') AS celebration,(SELECT count(*) FROM reactions r WHERE r.seat_id=p.seat_id) AS reaction_count FROM profiles p JOIN seats s ON s.id=p.seat_id JOIN orders o ON o.id=s.order_id JOIN neighborhoods n ON n.id=s.neighborhood_id`;
export async function getCuriousGuest(): Promise<PublicGuest | null> {
  const r = await pool.query(
    `${publicSelect} WHERE p.visibility='published' AND s.state='purchased' AND ($1::boolean OR (NOT p.is_demo AND NOT o.is_demo AND o.provider<>'development')) ORDER BY random() LIMIT 1`,
    [dev()],
  );
  return r.rowCount ? guest(r.rows[0]) : null;
}
export async function getPublicGuest(
  seatId: number,
): Promise<PublicGuest | null> {
  const r = await pool.query(
    `${publicSelect} WHERE p.seat_id=$1 AND p.visibility='published' AND s.state='purchased' AND ($2::boolean OR (NOT p.is_demo AND NOT o.is_demo AND o.provider<>'development'))`,
    [parseSeat(seatId), dev()],
  );
  return r.rowCount ? guest(r.rows[0]) : null;
}
export async function getPublicSeats(
  input: {
    start?: number;
    end?: number;
    query?: string;
    neighborhood?: string;
    page?: number;
    limit?: number;
  } = {},
) {
  const page = Math.max(1, Math.floor(Number(input.page) || 1)),
    limit = Math.min(100, Math.max(1, Math.floor(Number(input.limit) || 50)));
  const start = Math.max(1, Math.min(10000, Number(input.start) || 1)),
    end = Math.max(start, Math.min(10000, Number(input.end) || 10000));
  const values = [
    start,
    end,
    (input.query || "").trim().slice(0, 100),
    input.neighborhood || "",
    dev(),
  ];
  const where =
    "WHERE s.id BETWEEN $1 AND $2 AND ($3='' OR p.display_name ILIKE '%'||$3||'%' OR p.message ILIKE '%'||$3||'%' OR s.id::text=$3 OR s.neighborhood_id IN (SELECT id FROM neighborhoods WHERE name ILIKE '%'||$3||'%')) AND ($4='' OR s.neighborhood_id=$4) AND p.visibility='published' AND s.state='purchased' AND ($5::boolean OR (NOT p.is_demo AND NOT o.is_demo AND o.provider<>'development'))";
  const [r, total, inventory] = await Promise.all([
    pool.query(
      `${publicSelect} ${where} ORDER BY p.seat_id LIMIT $6 OFFSET $7`,
      [...values, limit, (page - 1) * limit],
    ),
    pool.query(
      `SELECT count(*)::int AS count FROM profiles p JOIN seats s ON s.id=p.seat_id JOIN orders o ON o.id=s.order_id ${where}`,
      values,
    ),
    pool.query(
      'SELECT id AS "seatId",state,neighborhood_id AS "neighborhoodId" FROM seats WHERE id BETWEEN $1 AND $2 ORDER BY id LIMIT 200',
      [start, end],
    ),
  ]);
  return {
    guests: r.rows.map(guest),
    seats: inventory.rows,
    total: total.rows[0].count,
    page,
  };
}
async function findAvailableIn(c: PoolClient, count: number, near: number = 1) {
  if (![1, 2, 6].includes(count))
    fail("INVALID_COUNT", "Choose a supported package.");
  // Consecutive chairs on the same long edge have IDs two apart.
  const r = await c.query(
    `SELECT s.id FROM seats s WHERE s.state='available' AND s.id + ($1::int-1)*2 <=10000 AND NOT EXISTS (SELECT 1 FROM generate_series(0,$1::int-1) k LEFT JOIN seats x ON x.id=s.id+k*2 WHERE x.state IS DISTINCT FROM 'available') ORDER BY abs(s.id-$2::int),s.id LIMIT 1`,
    [count, near],
  );
  if (!r.rowCount)
    fail(
      "SOLD_OUT",
      "No matching seats are available. Try a smaller group.",
      409,
    );
  return Array.from({ length: count }, (_, i) => r.rows[0].id + i * 2);
}
export async function findAvailable(count: number = 1, near: number = 1) {
  return transaction(async (c) => {
    await inventoryLock(c);
    await expireCourtesy(c);
    return findAvailableIn(c, count, parseSeat(near));
  });
}
export function seatPosition(seatId: number) {
  const id = parseSeat(seatId);
  return {
    column: Math.floor((id - 1) / 2),
    side: id % 2 ? "far" : "near",
    neighbors: [id - 2, id + 2, id % 2 ? id + 1 : id - 1].filter(
      (n) => n >= 1 && n <= 10000,
    ),
  };
}
export async function createOrder(
  userId: string,
  input: {
    packageId: string;
    seatIds: number[];
    profile: ProfileInput;
    invitationToken?: string;
    provider?: "stripe" | "development";
    expectedAmount?: number;
    attribution?: unknown;
  },
) {
  const profile = profileSchema.parse(input.profile);
  const attribution = attributionSchema.parse(input.attribution || {});
  return transaction(async (c) => {
    await inventoryLock(c);
    await verified(c, userId);
    await expireCourtesy(c);
    const p = await selectedPackage(c, input.packageId);
    if (input.expectedAmount !== undefined && input.expectedAmount !== p.amount)
      fail(
        "PRICE_CHANGED",
        "The configured price changed. Review the updated total before continuing.",
        409,
      );
    const ids = [...new Set(input.seatIds.map(parseSeat))].sort(
      (a, b) => a - b,
    );
    if (ids.length !== p.count || input.seatIds.length !== p.count)
      fail(
        "INVALID_SELECTION",
        `Select exactly ${p.count} seat${p.count > 1 ? "s" : ""}.`,
      );
    if (ids.length > 1 && !ids.every((n, i) => n === ids[0] + i * 2))
      fail(
        "NOT_ADJACENT",
        "Group seats must be consecutive chairs along the same edge of the table.",
      );
    const rows = await c.query(
      "SELECT * FROM seats WHERE id=ANY($1::int[]) ORDER BY id FOR UPDATE",
      [ids],
    );
    let courtesy: Row | undefined;
    if (input.invitationToken) {
      const r = await c.query(
        "SELECT * FROM invitations WHERE token_hash=$1 AND type='courtesy' AND status='active' AND expires_at>now()",
        [sha(input.invitationToken)],
      );
      courtesy = r.rows[0];
    }
    if (
      rows.rows.some(
        (s) =>
          s.state !== "available" &&
          !(
            s.state === "invitation_held" &&
            courtesy?.target_seat_id === s.id &&
            s.reservation_id === courtesy?.id
          ),
      )
    )
      fail(
        "SEAT_TAKEN",
        "One of these chairs has just been reserved. Please choose another.",
        409,
      );
    const active = await c.query(
      "SELECT count(*)::int AS count FROM orders WHERE user_id=$1 AND status IN ('checkout_pending','processing')",
      [userId],
    );
    if (active.rows[0].count >= 3)
      fail(
        "TOO_MANY_CHECKOUTS",
        "Finish an existing checkout before starting another.",
        429,
      );
    const id = uuid(),
      rid = uuid();
    const provider =
      input.provider ||
      (process.env.APP_MODE === "development" &&
      process.env.ENABLE_DEV_TOOLS === "true"
        ? "development"
        : "stripe");
    if (
      provider === "development" &&
      !(
        process.env.APP_MODE === "development" &&
        process.env.ENABLE_DEV_TOOLS === "true"
      )
    )
      fail("DEV_DISABLED", "Development checkout is disabled.", 403);
    const isDemo =
      provider === "development" ||
      dev() ||
      process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_") === true ||
      process.env.STRIPE_MODE === "test";
    const expiry = new Date(Date.now() + 35 * 60 * 1000);
    await c.query(
      "INSERT INTO orders(id,user_id,package_id,amount,currency,status,provider,profile_draft,is_demo,checkout_expires_at) VALUES($1,$2,$3,$4,'usd','checkout_pending',$5,$6,$7,$8)",
      [
        id,
        userId,
        p.id,
        p.amount,
        provider,
        JSON.stringify(profile),
        isDemo,
        expiry,
      ],
    );
    await c.query("UPDATE orders SET attribution=$2 WHERE id=$1", [
      id,
      JSON.stringify(attribution),
    ]);
    await c.query(
      "INSERT INTO reservations(id,user_id,order_id,kind,status,expires_at) VALUES($1,$2,$3,'checkout','active',$4)",
      [rid, userId, id, expiry],
    );
    for (const seatId of ids) {
      await c.query("INSERT INTO order_items(order_id,seat_id) VALUES($1,$2)", [
        id,
        seatId,
      ]);
    }
    await c.query(
      "UPDATE seats SET state='checkout_held',reservation_id=$1,order_id=$2,hold_expires_at=$3,updated_at=now() WHERE id=ANY($4::int[])",
      [rid, id, expiry, ids],
    );
    if (courtesy && ids.includes(courtesy.target_seat_id)) {
      await c.query(
        "UPDATE invitations SET status='claimed',claimed_by=$2 WHERE id=$1",
        [courtesy.id, userId],
      );
      await c.query("UPDATE reservations SET status='converted' WHERE id=$1", [
        courtesy.id,
      ]);
    }
    await audit(c, userId, "checkout.started", id, {
      seatIds: ids,
      amount: p.amount,
      provider,
    });
    return {
      id,
      userId,
      packageId: p.id,
      amount: p.amount,
      currency: "usd",
      status: "checkout_pending",
      provider,
      seatIds: ids,
      checkoutExpiresAt: expiry.toISOString(),
      isDemo,
    };
  });
}
export async function attachCheckout(
  orderId: string,
  sessionId: string,
  expiresAt: number | string | Date,
) {
  const expiry =
    expiresAt instanceof Date
      ? expiresAt
      : new Date(
          typeof expiresAt === "number"
            ? expiresAt < 1e12
              ? expiresAt * 1000
              : expiresAt
            : expiresAt,
        );
  if (!Number.isFinite(expiry.getTime()) || expiry.getTime() < Date.now())
    fail("INVALID_EXPIRY", "Checkout expiry must be in the future.");
  return transaction(async (c) => {
    await inventoryLock(c);
    const r = await c.query("SELECT * FROM orders WHERE id=$1 FOR UPDATE", [
      orderId,
    ]);
    if (!r.rowCount) fail("NOT_FOUND", "Order not found.", 404);
    if (r.rows[0].status !== "checkout_pending")
      fail("INVALID_ORDER", "This order is no longer awaiting checkout.", 409);
    await c.query(
      "UPDATE orders SET checkout_session_id=$2,checkout_expires_at=$3,updated_at=now() WHERE id=$1",
      [orderId, sessionId, expiry],
    );
    await c.query("UPDATE reservations SET expires_at=$2 WHERE order_id=$1", [
      orderId,
      expiry,
    ]);
    await c.query(
      "UPDATE seats SET hold_expires_at=$2 WHERE order_id=$1 AND state='checkout_held'",
      [orderId, expiry],
    );
    return {
      id: orderId,
      checkoutSessionId: sessionId,
      checkoutExpiresAt: expiry.toISOString(),
    };
  });
}
export async function handlePaymentEvent(event: {
  id: string;
  type: string;
  orderId: string;
  amount?: number;
  currency?: string;
  provider?: string;
  paymentIntentId?: string;
  taxMinor?: number;
  refundedTaxTotalMinor?: number;
  disputedTotalMinor?: number;
  disputedTaxTotalMinor?: number;
  occurredAt?: string;
}) {
  const aliases: Record<string, string> = {
    "checkout.session.completed": "paid",
    "checkout.session.async_payment_succeeded": "paid",
    "payment_intent.succeeded": "paid",
    "checkout.session.async_payment_failed": "failed",
    "payment_intent.payment_failed": "failed",
    "checkout.session.expired": "expired",
    "charge.refunded": "refunded",
    "charge.dispute.created": "disputed",
  };
  const type = aliases[event.type] || event.type;
  return transaction(async (c) => {
    await inventoryLock(c);
    const duplicate = await c.query(
      "SELECT outcome FROM payment_events WHERE id=$1",
      [event.id],
    );
    if (duplicate.rowCount)
      return { duplicate: true, outcome: duplicate.rows[0].outcome };
    const result = await c.query(
      "SELECT * FROM orders WHERE id=$1 FOR UPDATE",
      [event.orderId],
    );
    if (!result.rowCount)
      fail("ORDER_NOT_FOUND", "Payment refers to an unknown order.", 404);
    const o = result.rows[0];
    if (event.provider && event.provider !== o.provider)
      fail(
        "PROVIDER_MISMATCH",
        "Payment provider does not match this order.",
        409,
      );
    const items = (
      await c.query(
        "SELECT seat_id FROM order_items WHERE order_id=$1 ORDER BY seat_id",
        [o.id],
      )
    ).rows.map((r) => r.seat_id);
    const locked = (
      await c.query(
        "SELECT * FROM seats WHERE id=ANY($1::int[]) ORDER BY id FOR UPDATE",
        [items],
      )
    ).rows;
    let outcome = "ignored";
    if (type === "paid") {
      if (event.paymentIntentId)
        await c.query(
          "UPDATE orders SET payment_intent_id=COALESCE(payment_intent_id,$2) WHERE id=$1",
          [o.id, event.paymentIntentId],
        );
      if (
        ["paid", "refunded", "refund_requested", "disputed"].includes(o.status)
      ) {
        outcome = "already_processed";
      } else if (
        event.amount !== o.amount ||
        event.currency?.toLowerCase() !== o.currency
      ) {
        await support(
          c,
          o,
          "payment_amount_mismatch",
          "The provider reported a paid amount or currency different from the confirmed order. Fulfillment is paused; review and refund if required.",
        );
        await c.query(
          "UPDATE orders SET status='fulfillment_issue',updated_at=now() WHERE id=$1",
          [o.id],
        );
        outcome = "amount_mismatch";
      } else if (
        [
          "paid",
          "refunded",
          "refund_requested",
          "disputed",
          "fulfillment_issue",
        ].includes(o.status)
      ) {
        outcome = "already_processed";
      } else if (
        locked.length !== items.length ||
        locked.some(
          (s) =>
            (s.order_id !== o.id && s.state !== "available") ||
            (s.state === "purchased" && s.order_id !== o.id),
        )
      ) {
        await c.query(
          "UPDATE orders SET status='fulfillment_issue',updated_at=now() WHERE id=$1",
          [o.id],
        );
        await support(
          c,
          o,
          "paid_allocation_conflict",
          "Payment received but the exact purchased seats cannot safely be fulfilled. Do not substitute seats. Refund or obtain explicit customer approval for replacement.",
        );
        outcome = "fulfillment_issue";
      } else {
        await c.query(
          "UPDATE orders SET status='paid',payment_intent_id=COALESCE($2,payment_intent_id),updated_at=now() WHERE id=$1",
          [o.id, event.paymentIntentId || null],
        );
        await c.query(
          "UPDATE seats SET state='purchased',owner_id=$2,order_id=$1,reservation_id=NULL,hold_expires_at=NULL,updated_at=now() WHERE id=ANY($3::int[])",
          [o.id, o.user_id, items],
        );
        const p = o.profile_draft;
        for (let i = 0; i < items.length; i++) {
          await c.query(
            "INSERT INTO profiles(seat_id,display_name,message,dish,customization,link,visibility,reactions_enabled,is_demo,guest_kind) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(seat_id) DO NOTHING",
            [
              items[i],
              i === 0 ? p.displayName : "A friend’s place",
              i === 0 ? p.message : "A place saved at the table.",
              p.dish,
              JSON.stringify(p.customization),
              i === 0 ? p.link || null : null,
              "pending",
              p.reactionsEnabled !== false,
              o.is_demo,
              o.is_demo ? "demo" : "purchased",
            ],
          );
        }
        await c.query(
          "UPDATE reservations SET status='converted' WHERE order_id=$1",
          [o.id],
        );
        outcome = "fulfilled";
        await audit(c, o.user_id, "order.fulfilled", o.id, {
          seatIds: items,
          amount: o.amount,
        });
      }
    } else if (type === "processing") {
      if (o.status === "checkout_pending") {
        await c.query(
          "UPDATE orders SET status='processing',updated_at=now() WHERE id=$1",
          [o.id],
        );
        await c.query(
          "UPDATE seats SET state='payment_processing',hold_expires_at=NULL WHERE order_id=$1 AND state='checkout_held'",
          [o.id],
        );
        outcome = "processing";
      }
    } else if (type === "failed" || type === "expired") {
      if (
        o.status === "checkout_pending" ||
        (type === "failed" && o.status === "processing")
      ) {
        // A failed asynchronous payment and a provider-confirmed expired session are terminal.
        await c.query(
          "UPDATE orders SET status=$2,updated_at=now() WHERE id=$1",
          [o.id, type],
        );
        await c.query(
          "UPDATE seats SET state='available',order_id=NULL,reservation_id=NULL,owner_id=NULL,hold_expires_at=NULL,updated_at=now() WHERE order_id=$1 AND state IN ('checkout_held','payment_processing')",
          [o.id],
        );
        await c.query(
          "UPDATE reservations SET status='released' WHERE order_id=$1",
          [o.id],
        );
        outcome = "released";
      }
    } else if (type === "refunded") {
      if (event.amount !== undefined && event.amount !== o.amount) {
        await support(
          c,
          o,
          "partial_refund",
          "A partial refund was reported. Seat allocation remains unchanged pending support review.",
        );
        outcome = "partial_refund";
      } else if (o.status !== "refunded") {
        await c.query(
          "UPDATE orders SET status='refunded',updated_at=now() WHERE id=$1",
          [o.id],
        );
        await c.query(
          "UPDATE seats SET state='unavailable',updated_at=now() WHERE order_id=$1 AND state='purchased'",
          [o.id],
        );
        await c.query(
          "UPDATE seats SET state='available',order_id=NULL,reservation_id=NULL,hold_expires_at=NULL WHERE order_id=$1 AND state IN ('checkout_held','payment_processing')",
          [o.id],
        );
        await c.query(
          "UPDATE reservations SET status='released' WHERE order_id=$1 AND status='active'",
          [o.id],
        );
        const revoked = await c.query(
          "UPDATE invitations SET status='revoked' WHERE owner_id=$1 AND source_seat_id=ANY($2::int[]) AND status='active' RETURNING id,target_seat_id,type",
          [o.user_id, items],
        );
        for (const i of revoked.rows)
          if (i.type === "courtesy") {
            await c.query(
              "UPDATE seats SET state='available',reservation_id=NULL,hold_expires_at=NULL WHERE id=$1 AND state='invitation_held' AND reservation_id=$2",
              [i.target_seat_id, i.id],
            );
            await c.query(
              "UPDATE reservations SET status='released' WHERE id=$1",
              [i.id],
            );
          }
        outcome = "refunded";
        await audit(c, null, "order.refunded", o.id, {
          amount: event.amount || o.amount,
        });
      }
    } else if (
      (type === "disputed" || type === "dispute_won") &&
      (await isStaleDonationDisputeEvent(c, o.id, {
        type,
        occurredAt: event.occurredAt,
      }))
    ) {
      outcome = "stale_dispute_ignored";
    } else if (type === "disputed") {
      if (o.status !== "refunded") {
        await c.query(
          "UPDATE orders SET status='disputed',updated_at=now() WHERE id=$1",
          [o.id],
        );
        await support(
          c,
          o,
          "payment_dispute",
          "A provider dispute was opened. Review evidence and respond through the payment provider.",
        );
        outcome = "disputed";
      }
    } else if (type === "dispute_won") {
      if (o.status === "disputed" && o.settled_at) {
        await c.query(
          "UPDATE orders SET status='paid',updated_at=now() WHERE id=$1",
          [o.id],
        );
        outcome = "dispute_resolved";
      } else outcome = "dispute_closed_requires_reconciliation";
    } else fail("UNSUPPORTED_EVENT", "Unsupported payment event.");
    if (
      (type === "paid" &&
        event.amount === o.amount &&
        event.currency?.toLowerCase() === o.currency) ||
      ["refunded", "disputed", "dispute_won"].includes(type)
    )
      await syncDonationForOrder(c, o.id, event.id, {
        type,
        taxMinor: event.taxMinor,
        refundedTotalMinor:
          type === "refunded" ? (event.amount ?? o.amount) : undefined,
        refundedTaxTotalMinor: event.refundedTaxTotalMinor,
        disputedTotalMinor:
          type === "disputed"
            ? (event.disputedTotalMinor ?? o.amount)
            : undefined,
        disputedTaxTotalMinor: event.disputedTaxTotalMinor,
        settledAt:
          type === "paid"
            ? event.occurredAt || new Date().toISOString()
            : undefined,
        occurredAt: event.occurredAt,
      });
    if (type === "paid" && outcome === "fulfilled")
      await recordJourneyEvent(c, {
        name: "order_fulfilled",
        orderId: o.id,
        properties: { packageId: o.package_id, count: items.length },
      });

    await c.query(
      "INSERT INTO payment_events(id,type,order_id,outcome) VALUES($1,$2,$3,$4)",
      [event.id, event.type, o.id, outcome],
    );
    return { duplicate: false, outcome, orderId: o.id };
  });
}
export async function getOrder(userId: string, id: string) {
  const r = await pool.query(
    "SELECT o.*,array_agg(i.seat_id ORDER BY i.seat_id) AS seat_ids FROM orders o JOIN order_items i ON i.order_id=o.id WHERE o.id=$1 AND o.user_id=$2 GROUP BY o.id",
    [id, userId],
  );
  if (!r.rowCount) fail("NOT_FOUND", "Order not found.", 404);
  return order(r.rows[0]);
}
export async function updateProfile(
  userId: string,
  seatId: number,
  input: ProfileInput,
) {
  const p = profileSchema.parse(input);
  return transaction(async (c) => {
    await verified(c, userId);
    const s = await c.query("SELECT * FROM seats WHERE id=$1 FOR UPDATE", [
      parseSeat(seatId),
    ]);
    if (!s.rowCount || s.rows[0].owner_id !== userId)
      fail("FORBIDDEN", "You can only edit your own guest.", 403);
    if (s.rows[0].state !== "purchased")
      fail("INACTIVE_SEAT", "This seat is not active.", 409);
    const old = await c.query("SELECT * FROM profiles WHERE seat_id=$1", [
      seatId,
    ]);
    const previous = old.rows[0];
    const changed =
      !previous ||
      previous.display_name !== p.displayName ||
      previous.message !== p.message ||
      previous.dish !== p.dish ||
      Object.entries(p.customization).some(
        ([k, v]) => previous.customization?.[k] !== v,
      ) ||
      (previous.link || "") !== (p.link || "");
    const visibility =
      p.visibility === "private"
        ? "private"
        : changed
          ? "pending"
          : previous.visibility === "private"
            ? "pending"
            : previous.visibility;
    await c.query(
      "UPDATE profiles SET display_name=$2,message=$3,dish=$4,customization=$5,link=$6,visibility=$7,reactions_enabled=$8,updated_at=now() WHERE seat_id=$1",
      [
        seatId,
        p.displayName,
        p.message,
        p.dish,
        JSON.stringify(p.customization),
        p.link || null,
        visibility,
        p.reactionsEnabled,
      ],
    );
    await audit(c, userId, "profile.updated", String(seatId), { visibility });
    return { seatId, visibility };
  });
}
export async function getOwnerData(userId: string) {
  return transaction(async (c) => {
    await verified(c, userId);
    const [s, o, i, supportRows] = await readSequential([
      () =>
        c.query(
          `SELECT s.id,s.state,owner_order.package_id,owner_order.user_id AS buyer_id,(SELECT min(seat_id) FROM order_items WHERE order_id=s.order_id) AS primary_seat_id,n.name AS neighborhood,p.*,s.neighborhood_id,(SELECT package_id='celebration' FROM orders o WHERE o.id=s.order_id) AS celebration,(SELECT count(*) FROM reactions r WHERE r.seat_id=s.id) AS reaction_count FROM seats s JOIN orders owner_order ON owner_order.id=s.order_id JOIN neighborhoods n ON n.id=s.neighborhood_id LEFT JOIN profiles p ON p.seat_id=s.id WHERE s.owner_id=$1 ORDER BY s.id`,
          [userId],
        ),
      () =>
        c.query(
          "SELECT o.*,array_agg(i.seat_id ORDER BY i.seat_id) AS seat_ids FROM orders o JOIN order_items i ON i.order_id=o.id WHERE o.user_id=$1 GROUP BY o.id ORDER BY o.created_at DESC LIMIT 100",
          [userId],
        ),
      () =>
        c.query(
          "SELECT * FROM invitations WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 100",
          [userId],
        ),
      () =>
        c.query(
          'SELECT id,kind,message,status,created_at AS "createdAt" FROM support_issues WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100',
          [userId],
        ),
    ]);
    return {
      seats: s.rows.map((r) => ({
        seatId: r.id,
        state: r.state,
        packageId: r.package_id,
        canInviteCourtesy: r.package_id === "one",
        canInvitePaid:
          r.package_id !== "one" &&
          r.buyer_id === userId &&
          r.id !== Number(r.primary_seat_id),
        neighborhood: r.neighborhood,
        profile: r.seat_id ? guest(r) : null,
      })),
      orders: o.rows.map(order),
      invitations: i.rows.map(invitation),
      support: supportRows.rows,
    };
  });
}
export async function createInvitation(
  userId: string,
  seatId: number,
  type: "courtesy" | "paid",
) {
  if (!["courtesy", "paid"].includes(type))
    fail("INVALID_INVITATION", "Choose the invitation type.");
  return transaction(async (c) => {
    await inventoryLock(c);
    await verified(c, userId);
    await expireCourtesy(c);
    await c.query(
      "UPDATE invitations SET status='expired' WHERE type='paid' AND status='active' AND expires_at<=now()",
    );
    const result = await c.query(
      "SELECT s.*,o.package_id FROM seats s JOIN orders o ON o.id=s.order_id WHERE s.id=$1 FOR UPDATE",
      [parseSeat(seatId)],
    );
    const s = result.rows[0];
    if (!s || s.owner_id !== userId || s.state !== "purchased")
      fail(
        "FORBIDDEN",
        "Only the owner of an active seat can invite a friend.",
        403,
      );
    const recent = await c.query(
      "SELECT count(*)::int AS count FROM invitations WHERE owner_id=$1 AND created_at>now()-interval '24 hours'",
      [userId],
    );
    if (recent.rows[0].count >= 12)
      fail(
        "INVITATION_LIMIT",
        "You have reached today’s invitation limit. Please try again tomorrow.",
        429,
      );
    let target = seatId,
      source = seatId;
    if (type === "courtesy") {
      if (s.package_id !== "one")
        fail(
          "PAID_INVITATION_REQUIRED",
          "Group seats are already paid. Use a paid-seat invitation instead.",
        );
      const active = await c.query(
        "SELECT id FROM invitations WHERE source_seat_id=$1 AND type='courtesy' AND status='active'",
        [seatId],
      );
      if (active.rowCount)
        fail(
          "ACTIVE_INVITATION",
          "This seat already has an active courtesy invitation.",
          409,
        );
      target = (
        await findAvailableIn(
          c,
          1,
          seatId + 2 <= 10000 ? seatId + 2 : seatId - 2,
        )
      )[0];
    } else {
      if (s.package_id === "one")
        fail(
          "NOT_A_GROUP_SEAT",
          "This is a single-seat purchase. Invite a friend to purchase a nearby chair.",
        );
      const primary = await c.query(
        "SELECT min(seat_id) AS id FROM order_items WHERE order_id=$1",
        [s.order_id],
      );
      source = primary.rows[0].id;
      if (target === source)
        fail(
          "PRIMARY_SEAT",
          "Keep your primary seat and invite a friend into another paid chair.",
        );
      const primaryOwner = await c.query(
        "SELECT owner_id FROM seats WHERE id=$1",
        [source],
      );
      if (primaryOwner.rows[0]?.owner_id !== userId)
        fail(
          "FORBIDDEN",
          "Only the group buyer can assign this paid seat.",
          403,
        );
      const claimed = await c.query(
        "SELECT id FROM invitations WHERE target_seat_id=$1 AND status IN ('active','claimed')",
        [target],
      );
      if (claimed.rowCount)
        fail(
          "ALREADY_INVITED",
          "This chair is already invited or assigned.",
          409,
        );
    }
    const id = uuid(),
      token = randomBytes(32).toString("base64url"),
      expiresAt = new Date(
        Date.now() +
          (type === "courtesy" ? 15 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000),
      );
    await c.query(
      "INSERT INTO invitations(id,token_hash,type,source_seat_id,target_seat_id,owner_id,status,expires_at) VALUES($1,$2,$3,$4,$5,$6,'active',$7)",
      [id, sha(token), type, source, target, userId, expiresAt],
    );
    if (type === "courtesy") {
      await c.query(
        "INSERT INTO reservations(id,user_id,kind,status,expires_at) VALUES($1,$2,'invitation','active',$3)",
        [id, userId, expiresAt],
      );
      await c.query(
        "UPDATE seats SET state='invitation_held',reservation_id=$2,hold_expires_at=$3,updated_at=now() WHERE id=$1 AND state='available'",
        [target, id, expiresAt],
      );
    }
    await audit(c, userId, "invitation.created", id, {
      type,
      sourceSeatId: source,
      targetSeatId: target,
      expiresAt: expiresAt.toISOString(),
    });
    await recordJourneyEvent(c, {
      name: "invitation_created",
      invitationId: id,
      properties: { seatId: source, invitationType: type },
    });
    return {
      id,
      token,
      type,
      sourceSeatId: source,
      targetSeatId: target,
      status: "active",
      expiresAt: expiresAt.toISOString(),
      requiresPurchase: type === "courtesy",
    };
  });
}
export async function resolveInvitation(
  token: string,
): Promise<InvitationResolution> {
  if (!token || token.length > 200)
    fail("INVALID_INVITATION", "This invitation is invalid.", 404);
  const result = await transaction(async (c) => {
    await inventoryLock(c);
    await expireCourtesy(c);
    const r = await c.query("SELECT * FROM invitations WHERE token_hash=$1", [
      sha(token),
    ]);
    if (!r.rowCount)
      fail("INVALID_INVITATION", "This invitation is invalid.", 404);
    let i = r.rows[0];
    if (i.status === "revoked")
      fail("INVITATION_REVOKED", "This invitation has been revoked.", 410);
    if (
      i.status === "active" &&
      new Date(i.expires_at).getTime() <= Date.now()
    ) {
      await c.query("UPDATE invitations SET status='expired' WHERE id=$1", [
        i.id,
      ]);
      i = { ...i, status: "expired" };
    }
    let availableSeatId: number | null = i.target_seat_id;
    if (i.type === "courtesy" && i.status === "expired") {
      try {
        availableSeatId = (await findAvailableIn(c, 1, i.target_seat_id))[0];
      } catch {
        availableSeatId = null;
      }
    }
    return {
      ...invitation(i),
      expired: i.status === "expired",
      availableSeatId,
      requiresPurchase: i.type === "courtesy",
    };
  });
  return { ...result, sourceGuest: await getPublicGuest(result.sourceSeatId) };
}
export async function getInvitationPreview(id: string) {
  const r = await pool.query(
    "SELECT id,type,source_seat_id FROM invitations WHERE id=$1 AND status IN ('active','expired','claimed')",
    [id],
  );
  if (!r.rowCount) return null;
  return {
    id: r.rows[0].id,
    type: r.rows[0].type,
    sourceSeatId: r.rows[0].source_seat_id,
    sourceGuest: await getPublicGuest(r.rows[0].source_seat_id),
  };
}
export async function claimInvitation(userId: string, token: string) {
  return transaction(async (c) => {
    await inventoryLock(c);
    await verified(c, userId);
    await expireCourtesy(c);
    const r = await c.query(
      "SELECT * FROM invitations WHERE token_hash=$1 FOR UPDATE",
      [sha(token)],
    );
    if (!r.rowCount)
      fail("INVALID_INVITATION", "This invitation is invalid.", 404);
    const i = r.rows[0];
    if (i.type !== "paid")
      fail(
        "SEPARATE_PURCHASE",
        "This invitation is for a nearby seat that requires its own purchase.",
      );
    if (i.status === "claimed" && i.claimed_by === userId)
      return { seatId: i.target_seat_id, alreadyClaimed: true };
    if (i.status !== "active")
      fail(
        "INVITATION_UNAVAILABLE",
        `This invitation is ${i.status}. Ask the buyer for a new invitation.`,
        410,
      );
    if (new Date(i.expires_at).getTime() <= Date.now())
      fail(
        "INVITATION_EXPIRED",
        "This invitation has expired. Ask the buyer for a new invitation.",
        410,
      );
    if (i.owner_id === userId)
      fail(
        "INVITE_A_FRIEND",
        "This chair already belongs to you. Send the invitation to your friend.",
      );
    const seat = await c.query("SELECT * FROM seats WHERE id=$1 FOR UPDATE", [
      i.target_seat_id,
    ]);
    if (
      seat.rows[0]?.state !== "purchased" ||
      seat.rows[0]?.owner_id !== i.owner_id
    )
      fail(
        "SEAT_UNAVAILABLE",
        "This paid chair cannot be assigned. Please contact support.",
        409,
      );
    await c.query("UPDATE seats SET owner_id=$2,updated_at=now() WHERE id=$1", [
      i.target_seat_id,
      userId,
    ]);
    await c.query(
      "UPDATE invitations SET status='claimed',claimed_by=$2 WHERE id=$1",
      [i.id, userId],
    );
    await c.query(
      "UPDATE profiles SET visibility='pending',updated_at=now() WHERE seat_id=$1",
      [i.target_seat_id],
    );
    await audit(c, userId, "invitation.claimed", i.id, {
      seatId: i.target_seat_id,
    });
    await recordJourneyEvent(c, {
      name: "paid_group_seat_claimed",
      invitationId: i.id,
      properties: { seatId: i.target_seat_id, invitationType: "paid" },
    });
    return { seatId: i.target_seat_id, alreadyClaimed: false };
  });
}
export async function revokeInvitation(userId: string, id: string) {
  return transaction(async (c) => {
    await inventoryLock(c);
    await verified(c, userId);
    const r = await c.query(
      "SELECT * FROM invitations WHERE id=$1 FOR UPDATE",
      [id],
    );
    const i = r.rows[0];
    if (!i || i.owner_id !== userId)
      fail("FORBIDDEN", "Only the invitation’s owner can revoke it.", 403);
    if (i.status === "claimed")
      fail(
        "ALREADY_CLAIMED",
        "A claimed chair belongs to its recipient and cannot be revoked.",
        409,
      );
    await c.query("UPDATE invitations SET status='revoked' WHERE id=$1", [id]);
    if (i.type === "courtesy") {
      await c.query(
        "UPDATE seats SET state='available',reservation_id=NULL,hold_expires_at=NULL WHERE id=$1 AND state='invitation_held' AND reservation_id=$2",
        [i.target_seat_id, id],
      );
      await c.query("UPDATE reservations SET status='released' WHERE id=$1", [
        id,
      ]);
    }
    await audit(c, userId, "invitation.revoked", id);
    return { id, status: "revoked" };
  });
}
export async function react(
  seatId: number,
  actorHash: string,
  idempotencyKey: string,
) {
  if (!actorHash || !idempotencyKey || idempotencyKey.length > 150)
    fail("INVALID_REACTION", "A reaction identifier is required.");
  return transaction(async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      `reaction:${actorHash}`,
    ]);
    const r = await c.query(
      "SELECT p.* FROM profiles p JOIN seats s ON s.id=p.seat_id JOIN orders o ON o.id=s.order_id WHERE seat_id=$1 AND visibility='published' AND s.state='purchased' AND ($2::boolean OR (NOT p.is_demo AND NOT o.is_demo AND o.provider<>'development'))",
      [parseSeat(seatId), dev()],
    );
    if (!r.rowCount) fail("NOT_FOUND", "This guest is not public.", 404);
    if (!r.rows[0].reactions_enabled)
      fail(
        "REACTIONS_DISABLED",
        "This guest has turned bread passing off.",
        403,
      );
    const duplicate = await c.query(
      "SELECT seat_id,actor_hash FROM reactions WHERE idempotency_key=$1",
      [idempotencyKey],
    );
    if (duplicate.rowCount) {
      if (
        duplicate.rows[0].seat_id !== seatId ||
        duplicate.rows[0].actor_hash !== actorHash
      )
        fail(
          "IDEMPOTENCY_CONFLICT",
          "This reaction identifier was already used.",
          409,
        );
      return {
        duplicate: true,
        count: Number(
          (
            await c.query("SELECT count(*) FROM reactions WHERE seat_id=$1", [
              seatId,
            ])
          ).rows[0].count,
        ),
      };
    }
    const same = await c.query(
      "SELECT id FROM reactions WHERE seat_id=$1 AND actor_hash=$2 AND created_at>now()-interval '24 hours'",
      [seatId, actorHash],
    );
    if (same.rowCount)
      fail(
        "BREAD_ALREADY_PASSED",
        "You’ve passed this guest the bread today. Come back tomorrow.",
        429,
      );
    const rate = await c.query(
      "SELECT count(*)::int AS count FROM reactions WHERE actor_hash=$1 AND created_at>now()-interval '1 minute'",
      [actorHash],
    );
    if (rate.rows[0].count >= 5)
      fail(
        "REACTION_LIMIT",
        "Let the bread make its way around. Try again in a minute.",
        429,
      );
    await c.query(
      "INSERT INTO reactions(id,seat_id,actor_hash,idempotency_key) VALUES($1,$2,$3,$4)",
      [uuid(), seatId, actorHash, idempotencyKey],
    );
    return {
      duplicate: false,
      count: Number(
        (
          await c.query("SELECT count(*) FROM reactions WHERE seat_id=$1", [
            seatId,
          ])
        ).rows[0].count,
      ),
    };
  });
}
export async function reportGuest(
  seatId: number,
  actorHash: string,
  reason: string,
) {
  const cleaned = z.string().trim().min(3).max(1000).parse(reason);
  return transaction(async (c) => {
    const p = await c.query(
      "SELECT seat_id FROM profiles WHERE seat_id=$1 AND visibility='published'",
      [parseSeat(seatId)],
    );
    if (!p.rowCount) fail("NOT_FOUND", "Guest not found.", 404);
    await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      `report:${actorHash}`,
    ]);
    const recent = await c.query(
      "SELECT count(*)::int AS count FROM reports WHERE actor_hash=$1 AND created_at>now()-interval '1 hour'",
      [actorHash],
    );
    if (recent.rows[0].count >= 10)
      fail("REPORT_LIMIT", "Too many reports. Please try again later.", 429);
    const id = uuid();
    await c.query(
      "INSERT INTO reports(id,seat_id,actor_hash,reason) VALUES($1,$2,$3,$4)",
      [id, seatId, actorHash, cleaned],
    );
    return { id, status: "open" };
  });
}
export async function adminData(
  adminId: string,
  query: string = "",
  page: number = 1,
) {
  return transaction(async (c) => {
    await admin(c, adminId);
    const term = query.trim().slice(0, 100),
      offset = (Math.max(1, Math.floor(page) || 1) - 1) * 30;
    const [s, o, r, p, a, i, issues, n, packages, total] = await readSequential(
      [
        () =>
          c.query(
            `SELECT s.id,s.state,s.neighborhood_id,n.name AS neighborhood,u.email AS owner_email,p.*,(SELECT package_id='celebration' FROM orders o WHERE o.id=s.order_id) AS celebration FROM seats s JOIN neighborhoods n ON n.id=s.neighborhood_id LEFT JOIN "user" u ON u.id=s.owner_id LEFT JOIN profiles p ON p.seat_id=s.id WHERE s.state<>'available' AND ($1='' OR s.id::text=$1 OR p.display_name ILIKE '%'||$1||'%' OR u.email ILIKE '%'||$1||'%') ORDER BY s.id LIMIT 30 OFFSET $2`,
            [term, offset],
          ),
        () =>
          c.query(
            `SELECT o.*,array_agg(i.seat_id ORDER BY i.seat_id) AS seat_ids FROM orders o JOIN order_items i ON i.order_id=o.id JOIN "user" u ON u.id=o.user_id WHERE ($1='' OR o.id::text=$1 OR u.email ILIKE '%'||$1||'%' OR i.seat_id::text=$1) GROUP BY o.id ORDER BY o.created_at DESC LIMIT 30 OFFSET $2`,
            [term, offset],
          ),
        () =>
          c.query(
            `SELECT r.id,r.seat_id AS "seatId",r.reason,r.status,r.created_at AS "createdAt",p.display_name AS "displayName" FROM reports r LEFT JOIN profiles p ON p.seat_id=r.seat_id WHERE r.status='open' ORDER BY r.created_at DESC LIMIT 30`,
          ),
        () =>
          c.query(
            `${publicSelect} WHERE p.visibility='pending' AND s.state='purchased' ORDER BY p.updated_at LIMIT 30`,
          ),
        () =>
          c.query(
            'SELECT id,actor_id AS "actorId",action,target,details,created_at AS "createdAt" FROM audit_events ORDER BY created_at DESC LIMIT 50 OFFSET $1',
            [offset],
          ),
        () =>
          c.query(
            'SELECT id,type,source_seat_id AS "sourceSeatId",target_seat_id AS "targetSeatId",owner_id AS "ownerId",status,expires_at AS "expiresAt",created_at AS "createdAt" FROM invitations ORDER BY created_at DESC LIMIT 30 OFFSET $1',
            [offset],
          ),
        () =>
          c.query(
            'SELECT id,user_id AS "userId",order_id AS "orderId",kind,message,status,created_at AS "createdAt" FROM support_issues ORDER BY created_at DESC LIMIT 30 OFFSET $1',
            [offset],
          ),
        () =>
          c.query(
            'SELECT id,name,start_seat AS "startSeat",end_seat AS "endSeat",color FROM neighborhoods ORDER BY start_seat',
          ),
        () => c.query("SELECT value FROM settings WHERE key='packages'"),
        () =>
          c.query(
            "SELECT count(*)::int AS count FROM seats WHERE state<>'available'",
          ),
      ],
    );
    return {
      seats: s.rows.map((row) => ({
        seatId: row.id,
        state: row.state,
        ownerEmail: row.owner_email,
        profile: row.seat_id ? guest(row) : null,
      })),
      orders: o.rows.map(order),
      reports: r.rows,
      pending: p.rows.map(guest),
      audit: a.rows,
      invitations: i.rows,
      support: issues.rows,
      neighborhoods: n.rows,
      packages: packages.rows[0]?.value || PACKAGES,
      page: Math.max(1, page),
      total: total.rows[0].count,
    };
  });
}
export async function moderate(
  adminId: string,
  seatId: number,
  action: "approve" | "hide" | "restore" | "disable_link" | "private",
  reason: string = "",
) {
  if (
    !["approve", "hide", "restore", "disable_link", "private"].includes(action)
  )
    fail("INVALID_ACTION", "Choose a moderation action.");
  return transaction(async (c) => {
    await admin(c, adminId);
    const r = await c.query(
      "SELECT p.* FROM profiles p JOIN seats s ON s.id=p.seat_id JOIN orders o ON o.id=s.order_id WHERE seat_id=$1 AND s.state='purchased' FOR UPDATE OF p",
      [parseSeat(seatId)],
    );
    if (!r.rowCount) fail("NOT_FOUND", "Active guest not found.", 404);
    if (action === "disable_link")
      await c.query(
        "UPDATE profiles SET link=NULL,updated_at=now() WHERE seat_id=$1",
        [seatId],
      );
    else
      await c.query(
        "UPDATE profiles SET visibility=$2,updated_at=now() WHERE seat_id=$1",
        [
          seatId,
          action === "hide"
            ? "hidden"
            : action === "private"
              ? "private"
              : "published",
        ],
      );
    await c.query(
      "INSERT INTO moderation_decisions(id,seat_id,admin_id,action,reason) VALUES($1,$2,$3,$4,$5)",
      [uuid(), seatId, adminId, action, reason.slice(0, 1000)],
    );
    if (action === "hide" || action === "disable_link")
      await c.query(
        "UPDATE reports SET status='resolved' WHERE seat_id=$1 AND status='open'",
        [seatId],
      );
    await audit(c, adminId, `moderation.${action}`, String(seatId), {
      reason: reason.slice(0, 1000),
    });
    return {
      seatId,
      action,
      visibility:
        action === "disable_link"
          ? r.rows[0].visibility
          : action === "hide"
            ? "hidden"
            : action === "private"
              ? "private"
              : "published",
    };
  });
}
export async function requestRefund(
  adminId: string,
  orderId: string,
  reason: string,
) {
  return transaction(async (c) => {
    await admin(c, adminId);
    const r = await c.query("SELECT * FROM orders WHERE id=$1 FOR UPDATE", [
      orderId,
    ]);
    const o = r.rows[0];
    if (!o) fail("NOT_FOUND", "Order not found.", 404);
    if (
      !["paid", "fulfillment_issue", "disputed", "refund_requested"].includes(
        o.status,
      )
    )
      fail(
        "NOT_REFUNDABLE",
        "This order cannot be refunded in its current state.",
        409,
      );
    if (o.provider === "seed")
      fail("SEED_ORDER", "Sample orders cannot be refunded.");
    await c.query(
      "UPDATE orders SET status='refund_requested',updated_at=now() WHERE id=$1",
      [orderId],
    );
    if (o.status !== "refund_requested")
      await support(
        c,
        o,
        "refund_requested",
        reason.trim().slice(0, 1000) ||
          "Administrator requested a full refund.",
      );
    await audit(c, adminId, "refund.requested", orderId, {
      reason: reason.slice(0, 1000),
    });
    return {
      ...order(o),
      status: "refund_requested",
      paymentIntentId: o.payment_intent_id,
    };
  });
}
export async function updateSettings(
  adminId: string,
  input: {
    packages?: { id: string; label: string; count: number; amount: number }[];
    neighborhoods?: { id: string; name: string }[];
  },
) {
  return transaction(async (c) => {
    await admin(c, adminId);
    if (input.packages) {
      if (input.packages.length !== 4)
        fail("INVALID_PRICING", "All four package prices are required.");
      for (const p of PACKAGES) {
        const value = input.packages.find((x) => x.id === p.id);
        if (
          !value ||
          value.count !== p.count ||
          !Number.isInteger(value.amount) ||
          value.amount < 100 ||
          value.amount > 100000 ||
          !value.label?.trim() ||
          value.label.length > 70
        )
          fail(
            "INVALID_PRICING",
            "Keep package IDs and seat counts fixed; use prices from $1 to $1,000.",
          );
      }
      await c.query(
        "INSERT INTO settings(key,value) VALUES('packages',$1) ON CONFLICT(key) DO UPDATE SET value=$1,updated_at=now()",
        [JSON.stringify(input.packages)],
      );
    }
    if (input.neighborhoods) {
      for (const n of input.neighborhoods) {
        if (
          !NEIGHBORHOODS.some((x) => x.id === n.id) ||
          !n.name?.trim() ||
          n.name.length > 60
        )
          fail(
            "INVALID_NEIGHBORHOOD",
            "Choose a known neighborhood with a name under 60 characters.",
          );
        await c.query("UPDATE neighborhoods SET name=$2 WHERE id=$1", [
          n.id,
          n.name.trim(),
        ]);
      }
    }
    await audit(c, adminId, "settings.updated", "environment", {
      packages: input.packages,
      neighborhoods: input.neighborhoods,
    });
    return { saved: true };
  });
}
export async function supportRequest(
  userId: string,
  message: string,
  orderId?: string,
) {
  const content = z.string().trim().min(10).max(2000).parse(message);
  return transaction(async (c) => {
    await verified(c, userId);
    if (orderId) {
      const o = await c.query(
        "SELECT id FROM orders WHERE id=$1 AND user_id=$2",
        [orderId, userId],
      );
      if (!o.rowCount)
        fail("FORBIDDEN", "Order does not belong to this account.", 403);
    }
    const count = await c.query(
      "SELECT count(*)::int AS count FROM support_issues WHERE user_id=$1 AND created_at>now()-interval '1 hour'",
      [userId],
    );
    if (count.rows[0].count >= 5)
      fail(
        "SUPPORT_LIMIT",
        "You have reached the hourly support request limit.",
        429,
      );
    const id = uuid();
    await c.query(
      "INSERT INTO support_issues(id,user_id,order_id,kind,message) VALUES($1,$2,$3,'customer_request',$4)",
      [id, userId, orderId || null, content],
    );
    return { id, status: "open" };
  });
}
export async function requestAccountDeletion(userId: string) {
  return transaction(async (c) => {
    await inventoryLock(c);
    await verified(c, userId);
    const id = uuid();
    await c.query(
      "INSERT INTO support_issues(id,user_id,kind,message) VALUES($1,$2,'account_deletion','Account deletion requested. Public guests hidden and invitations revoked immediately. Operator must review paid seats and statutory transaction retention before completing deletion.')",
      [id, userId],
    );
    await c.query(
      "UPDATE profiles SET visibility='private',link=NULL,updated_at=now() WHERE seat_id IN (SELECT id FROM seats WHERE owner_id=$1)",
      [userId],
    );
    const invites = await c.query(
      "UPDATE invitations SET status='revoked' WHERE owner_id=$1 AND status='active' RETURNING id,target_seat_id,type",
      [userId],
    );
    for (const i of invites.rows)
      if (i.type === "courtesy") {
        await c.query(
          "UPDATE seats SET state='available',reservation_id=NULL,hold_expires_at=NULL WHERE id=$1 AND state='invitation_held' AND reservation_id=$2",
          [i.target_seat_id, i.id],
        );
        await c.query("UPDATE reservations SET status='released' WHERE id=$1", [
          i.id,
        ]);
      }
    await audit(c, userId, "account.deletion_requested", userId);
    return {
      id,
      status: "requested",
      message:
        "Your public guests are now private and unclaimed invitations are revoked. Support will review your paid seats and explain required financial record retention before completing deletion.",
    };
  });
}
export async function reconciliationCandidates(adminId: string) {
  return transaction(async (c) => {
    await admin(c, adminId);
    return (
      await c.query(
        "SELECT id,status,checkout_session_id AS \"checkoutSessionId\",payment_intent_id AS \"paymentIntentId\",checkout_expires_at AS \"checkoutExpiresAt\" FROM orders WHERE provider='stripe' AND status IN ('checkout_pending','processing','fulfillment_issue','refund_requested') ORDER BY created_at LIMIT 100",
      )
    ).rows;
  });
}
