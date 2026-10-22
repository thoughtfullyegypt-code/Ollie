import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import { pool, transaction } from "./db";

export const CLIENT_EVENTS = [
  "main_cta_clicked",
  "builder_opened",
  "customization_completed",
  "seat_selected",
  "package_selected",
  "checkout_started",
  "invitation_link_opened",
  "share_action_invoked",
] as const;
export const SERVER_EVENTS = [
  "order_fulfilled",
  "invitation_created",
  "paid_group_seat_claimed",
  "referred_purchase_fulfilled",
] as const;
export type JourneyEventName =
  (typeof CLIENT_EVENTS)[number] | (typeof SERVER_EVENTS)[number];
const campaignId = z
  .string()
  .regex(
    /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/,
    "Use a nonpersonal campaign identifier.",
  );
export const attributionSchema = z
  .object({
    source: campaignId.optional(),
    medium: campaignId.optional(),
    campaign: campaignId.optional(),
    content: campaignId.optional(),
    referralId: z.string().uuid().optional(),
    capturedAt: z.string().datetime().optional(),
  })
  .strict();
export type Attribution = z.infer<typeof attributionSchema>;
export const eventPropertiesSchema = z
  .object({
    seatId: z.number().int().min(1).max(10000).optional(),
    packageId: z.enum(["one", "two", "six", "celebration"]).optional(),
    count: z.number().int().min(1).max(6).optional(),
    stage: z.number().int().min(0).max(10).optional(),
    method: z.enum(["native", "copy", "download", "recording"]).optional(),
    placement: z
      .enum([
        "header",
        "hero",
        "mobile",
        "table",
        "footer",
        "profile",
        "invitation",
        "builder",
        "account",
      ])
      .optional(),
    invitationType: z.enum(["courtesy", "paid"]).optional(),
  })
  .strict();
export type EventProperties = z.infer<typeof eventPropertiesSchema>;
export const clientEventSchema = z
  .object({
    name: z.enum(CLIENT_EVENTS),
    eventId: z.string().uuid(),
    properties: eventPropertiesSchema.default({}),
    attribution: attributionSchema.optional(),
    consent: z.boolean().optional(),
  })
  .strict();
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const development = () => process.env.APP_MODE === "development";
export function publicAnalyticsConfig() {
  const dev = development();
  return {
    enabled:
      dev ||
      (process.env.ANALYTICS_ENABLED === "true" &&
        process.env.ANALYTICS_PRIVACY_APPROVED === "true"),
    adapter: dev ? "development" : "first-party",
    productionConfigured:
      !dev &&
      process.env.ANALYTICS_ENABLED === "true" &&
      process.env.ANALYTICS_PRIVACY_APPROVED === "true",
    consentRequired: !dev,
    attributionWindowDays: 30,
    clientRetentionDays: 90,
    respectsPrivacySignals: true,
    thirdPartyRequests: false,
  };
}
export function sanitizeAttribution(
  input: unknown,
  referenceAt: number | Date = Date.now(),
): Attribution {
  const parsed = attributionSchema.safeParse(input);
  if (!parsed.success) return {};
  const a = parsed.data;
  if (a.capturedAt) {
    const age = Number(referenceAt) - new Date(a.capturedAt).getTime();
    if (age > 30 * 86400000 || age < -300000) return {};
  }
  return a;
}
function sanitizeProperties(input: unknown): EventProperties {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const clean: Record<string, unknown> = {};
  for (const key of [
    "seatId",
    "packageId",
    "count",
    "stage",
    "method",
    "placement",
    "invitationType",
  ])
    if (Object.hasOwn(input, key))
      clean[key] = (input as Record<string, unknown>)[key];
  const value = eventPropertiesSchema.safeParse(clean);
  return value.success ? value.data : {};
}
export type RecordJourneyInput = {
  name: JourneyEventName;
  eventKey?: string;
  orderId?: string;
  invitationId?: string;
  attribution?: unknown;
  properties?: unknown;
};
async function insert(
  c: PoolClient,
  input: {
    name: JourneyEventName;
    key: string;
    source: "client" | "server";
    orderKey?: string;
    invitationKey?: string;
    properties: EventProperties;
    attribution: Attribution;
    isDevelopment: boolean;
  },
) {
  const r = await c.query(
    "INSERT INTO analytics_events(id,event_key,name,source,order_key,invitation_key,properties,attribution,is_development) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(event_key) DO NOTHING RETURNING id",
    [
      randomUUID(),
      input.key,
      input.name,
      input.source,
      input.orderKey || null,
      input.invitationKey || null,
      JSON.stringify(input.properties),
      JSON.stringify(input.attribution),
      input.isDevelopment,
    ],
  );
  return { recorded: !!r.rowCount, duplicate: !r.rowCount };
}
/** Call inside the same transaction as the authoritative domain outcome. */
export async function recordJourneyEvent(
  c: PoolClient,
  input: RecordJourneyInput,
): Promise<{ recorded: boolean; duplicate?: boolean; skipped?: string }> {
  if (!SERVER_EVENTS.includes(input.name as (typeof SERVER_EVENTS)[number]))
    return { recorded: false, skipped: "Server event required." };
  let isDev = development(),
    attribution = sanitizeAttribution(input.attribution),
    properties = sanitizeProperties(input.properties);
  if (
    input.name === "order_fulfilled" ||
    input.name === "referred_purchase_fulfilled"
  ) {
    if (!input.orderId) return { recorded: false, skipped: "Order required." };
    const r = await c.query(
      "SELECT status,provider,is_demo,package_id,user_id,created_at,attribution FROM orders WHERE id=$1",
      [input.orderId],
    );
    const order = r.rows[0];
    if (!order || order.status !== "paid" || order.provider === "seed")
      return { recorded: false, skipped: "No confirmed paid order." };
    const orderKey = hash(`order:${input.orderId}`);
    isDev = isDev || order.is_demo || order.provider === "development";
    // A delayed webhook keeps the attribution that was valid when checkout
    // began, rather than starting a second attribution window at fulfillment.
    attribution = sanitizeAttribution(order.attribution, order.created_at);
    properties = sanitizeProperties({
      ...properties,
      packageId: order.package_id,
    });
    let referred = false;
    if (attribution.referralId) {
      const ref = await c.query(
        "SELECT id FROM invitations WHERE id=$1 AND status<>'revoked' AND owner_id<>$2 AND created_at<=$3",
        [attribution.referralId, order.user_id, order.created_at],
      );
      referred = !!ref.rowCount;
    }
    if (input.name === "referred_purchase_fulfilled" && !referred)
      return { recorded: false, skipped: "No eligible referral." };
    const result = await insert(c, {
      name: input.name,
      key: `${input.name}:${orderKey}`,
      source: "server",
      orderKey,
      properties,
      attribution,
      isDevelopment: isDev,
    });
    if (input.name === "order_fulfilled" && referred)
      await insert(c, {
        name: "referred_purchase_fulfilled",
        key: `referred_purchase_fulfilled:${orderKey}`,
        source: "server",
        orderKey,
        properties,
        attribution,
        isDevelopment: isDev,
      });
    return result;
  }
  if (!input.invitationId)
    return { recorded: false, skipped: "Invitation required." };
  const r = await c.query(
    "SELECT i.type,i.status,o.is_demo,o.provider FROM invitations i JOIN seats s ON s.id=i.source_seat_id JOIN orders o ON o.id=s.order_id WHERE i.id=$1",
    [input.invitationId],
  );
  const invitation = r.rows[0];
  if (!invitation) return { recorded: false, skipped: "No invitation." };
  if (
    input.name === "paid_group_seat_claimed" &&
    (invitation.type !== "paid" || invitation.status !== "claimed")
  )
    return { recorded: false, skipped: "No confirmed paid claim." };
  isDev =
    isDev ||
    invitation.is_demo ||
    invitation.provider === "development" ||
    invitation.provider === "seed";
  const invitationKey = hash(`invitation:${input.invitationId}`);
  properties = sanitizeProperties({
    ...properties,
    invitationType: invitation.type,
  });
  return insert(c, {
    name: input.name,
    key: `${input.name}:${invitationKey}`,
    source: "server",
    invitationKey,
    properties,
    attribution,
    isDevelopment: isDev,
  });
}
/** Anonymous ingestion has no persistent visitor identifier. Abuse buckets are
 * purpose-separated hashes, expire after two minutes, and are never joined to events. */
export async function ingestClientEvent(
  raw: unknown,
  options: { abuseKey: string; privacySignal?: boolean },
): Promise<{ recorded: boolean; duplicate?: boolean; disabled?: boolean }> {
  const input = clientEventSchema.parse(raw),
    settings = publicAnalyticsConfig();
  if (
    options.privacySignal ||
    !settings.enabled ||
    (settings.consentRequired && !input.consent)
  )
    return { recorded: false, disabled: true };
  return transaction(async (c) => {
    const minute = Math.floor(Date.now() / 60000);
    const key = hash(`journey-rate:${minute}:${options.abuseKey}`);
    const limit = development() ? 400 : 120;
    const rate = await c.query(
      "INSERT INTO analytics_rate_buckets(key,count,expires_at) VALUES($1,1,now()+interval '2 minutes') ON CONFLICT(key) DO UPDATE SET count=analytics_rate_buckets.count+1 WHERE analytics_rate_buckets.count<$2 RETURNING count",
      [key, limit],
    );
    if (!rate.rowCount)
      throw Object.assign(
        new Error("Please wait before sending another event."),
        { status: 429 },
      );
    await c.query("DELETE FROM analytics_rate_buckets WHERE expires_at<now()");
    await c.query(
      "DELETE FROM analytics_events WHERE source='client' AND created_at<now()-interval '90 days'",
    );
    return insert(c, {
      name: input.name,
      key: `client:${input.eventId}`,
      source: "client",
      properties: input.properties,
      attribution: sanitizeAttribution(input.attribution),
      isDevelopment: development(),
    });
  });
}
export async function getJourneySummary(adminId: string) {
  const user = await pool.query(
    'SELECT role,"emailVerified",deleted_at FROM "user" WHERE id=$1',
    [adminId],
  );
  if (
    user.rows[0]?.role !== "admin" ||
    !user.rows[0]?.emailVerified ||
    user.rows[0]?.deleted_at
  )
    throw Object.assign(new Error("Administrator access required."), {
      status: 403,
    });
  const counts = await pool.query(
    'SELECT name,is_development AS "isDevelopment",source,count(*)::int AS count FROM analytics_events GROUP BY name,is_development,source ORDER BY name,is_development',
  );
  return {
    ...publicAnalyticsConfig(),
    counts: counts.rows,
    cutoffAt: new Date().toISOString(),
    attributionRule:
      "First nonsecret campaign or referral touch; retained for 30 days. Later campaign links do not overwrite it. Browser privacy signals disable browser collection.",
    serverOperationalEvents: true,
  };
}
