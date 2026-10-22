import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import { pool, transaction } from "./db";
import {
  customizationSchema,
  DISH_IDS,
  findAvailable,
  PACKAGES,
} from "./domain";
import { config } from "./config";
import {
  giftBasicSchema,
  type GiftInput,
  type GiftRecord,
  type GiftPreparation,
  type RecipientGift,
} from "./gift-input";
import { syncGiftLifecycle, invalidate } from "./gift-lifecycle";

type Row = Record<string, any>;
const hash = (v: string) => createHash("sha256").update(v).digest("hex");
const iso = (v: unknown) => (v ? new Date(String(v)).toISOString() : null);
function fail(message: string, status = 400): never {
  throw Object.assign(new Error(message), { status });
}
async function verified(c: PoolClient, id: string) {
  const r = await c.query(
    'SELECT id,"emailVerified",deleted_at FROM "user" WHERE id=$1',
    [id],
  );
  if (!r.rowCount || r.rows[0].deleted_at)
    fail("Sign in to an active account.", 401);
  if (!r.rows[0].emailVerified)
    fail("Verify your account before managing or claiming a guest.", 403);
}
async function lock(c: PoolClient) {
  await c.query("SELECT pg_advisory_xact_lock(890002)");
}
async function audit(
  c: PoolClient,
  actor: string | null,
  action: string,
  id: string,
) {
  await c.query(
    "INSERT INTO audit_events(id,actor_id,action,target,details) VALUES($1,$2,$3,$4,$5)",
    [randomUUID(), actor, action, id, JSON.stringify({ resource: "gift" })],
  );
}
export async function giftRateLimit(
  c: PoolClient,
  actor: string,
  kind: string,
  limit: number,
  seconds = 60,
) {
  const bucket = Math.floor(Date.now() / (seconds * 1000));
  const key = hash(`gift:${kind}:${actor}:${bucket}`);
  const r = await c.query(
    "INSERT INTO gift_rate_buckets(key,count,expires_at) VALUES($1,1,$2) ON CONFLICT(key) DO UPDATE SET count=gift_rate_buckets.count+1 RETURNING count",
    [key, new Date((bucket + 1) * seconds * 1000)],
  );
  if (r.rows[0].count > limit)
    fail("Please wait before trying this gift again.", 429);
  await c.query("DELETE FROM gift_rate_buckets WHERE expires_at<now()");
}
async function publicRate(actor: string, kind: string, limit: number) {
  const c = await pool.connect();
  try {
    await giftRateLimit(c, actor, kind, limit);
  } finally {
    c.release();
  }
}
function input(value: unknown): GiftInput {
  const p = giftBasicSchema.parse(value);
  const senderCustomization = customizationSchema.parse(p.senderCustomization),
    recipientCustomization = customizationSchema.parse(
      p.recipientCustomization,
    );
  if (!DISH_IDS.includes(p.dish)) fail("Choose one of the illustrated dishes.");
  return { ...p, senderCustomization, recipientCustomization };
}
const baseSelect = `SELECT g.*,o.amount order_amount,o.is_demo order_demo,o.provider order_provider FROM gifts g LEFT JOIN orders o ON o.id=g.order_id`;
function serialize(g: Row): GiftRecord {
  return {
    id: g.id,
    occasion: g.occasion,
    senderName: g.sender_name,
    recipientName: g.recipient_name,
    message: g.private_message,
    senderCustomization: g.sender_customization,
    recipientCustomization: g.recipient_customization,
    dish: g.dish,
    prop: g.prop,
    sourceSeatId: g.source_seat_id || undefined,
    senderSeatId: g.sender_seat_id,
    recipientSeatId: g.recipient_seat_id,
    orderId: g.order_id,
    packageId: g.package_id,
    amount: Number(g.order_amount || 0),
    currency: "usd",
    status: g.status,
    createdAt: iso(g.created_at)!,
    updatedAt: iso(g.updated_at)!,
    thankYouAt: iso(g.thank_you_at),
    firstReadAt: iso(g.first_read_at),
    claimedAt: iso(g.claimed_at),
    claimedBy: g.claimed_by || null,
    linkCreatedAt: iso(g.link_created_at),
    isDemo:
      !!g.order_demo ||
      g.order_provider === "development" ||
      config.mode === "development",
    hasLink: !!g.token_hash,
  };
}
async function own(c: PoolClient, user: string, id: string) {
  await verified(c, user);
  const r = await c.query(
    `${baseSelect} WHERE g.id=$1 AND g.sender_id=$2 FOR UPDATE OF g`,
    [id, user],
  );
  if (!r.rowCount) fail("This gift does not belong to your account.", 404);
  return r.rows[0];
}
async function fetchGift(c: PoolClient, id: string) {
  return (await c.query(`${baseSelect} WHERE g.id=$1`, [id])).rows[0];
}
async function eligible(
  c: PoolClient,
  id: number,
  user: string,
  giftId: string,
  asSource = false,
) {
  const q = await c.query(
    "SELECT s.*,o.status order_status FROM seats s JOIN orders o ON o.id=s.order_id WHERE s.id=$1 FOR UPDATE OF s",
    [id],
  );
  const s = q.rows[0];
  if (
    !s ||
    s.state !== "purchased" ||
    s.owner_id !== user ||
    s.order_status !== "paid"
  )
    return false;
  const used = await c.query(
    "SELECT id FROM gifts WHERE id<>$2 AND status IN ('ready','awaiting_payment') AND (($4::boolean AND recipient_seat_id=$1 AND claimed_by IS DISTINCT FROM $3) OR (NOT $4::boolean AND (recipient_seat_id=$1 OR sender_seat_id=$1))) UNION ALL SELECT id FROM invitations WHERE target_seat_id=$1 AND (status='active' OR (NOT $4::boolean AND status='claimed'))",
    [id, giftId, user, asSource],
  );
  return !used.rowCount;
}
export async function createGift(
  sender: string,
  value: unknown,
): Promise<GiftRecord> {
  const p = input(value);
  return transaction(async (c) => {
    await lock(c);
    await verified(c, sender);
    await giftRateLimit(c, sender, "create", 40, 3600);
    const id = randomUUID();
    await c.query(
      "INSERT INTO gifts(id,sender_id,occasion,sender_name,recipient_name,private_message,sender_customization,recipient_customization,dish,prop,source_seat_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
      [
        id,
        sender,
        p.occasion,
        p.senderName,
        p.recipientName,
        p.message,
        JSON.stringify(p.senderCustomization),
        JSON.stringify(p.recipientCustomization),
        p.dish,
        p.prop,
        p.sourceSeatId || null,
      ],
    );
    await audit(c, sender, "gift.created", id);
    return serialize(await fetchGift(c, id));
  });
}
export async function getGift(sender: string, id: string): Promise<GiftRecord> {
  return transaction(async (c) => {
    await lock(c);
    let g = await own(c, sender, id);
    if (g.order_id) await syncGiftLifecycle(c, g.order_id);
    g = await own(c, sender, id);
    return serialize(g);
  });
}
export async function listGifts(sender: string): Promise<GiftRecord[]> {
  return transaction(async (c) => {
    await verified(c, sender);
    const r = await c.query(
      `${baseSelect} WHERE g.sender_id=$1 ORDER BY g.created_at DESC LIMIT 50`,
      [sender],
    );
    return r.rows.map(serialize);
  });
}
export async function updateGift(
  sender: string,
  id: string,
  value: unknown,
): Promise<GiftRecord> {
  const patch = giftBasicSchema.partial().parse(value);
  return transaction(async (c) => {
    await lock(c);
    const g = await own(c, sender, id);
    if (g.status === "revoked" || g.status === "unavailable")
      fail("This gift can no longer be edited.", 410);
    if (g.status === "awaiting_payment")
      fail(
        "Finish or cancel the current checkout before editing this gift.",
        409,
      );
    const existing = serialize(g);
    if (
      g.claimed_by &&
      ((patch.recipientName !== undefined &&
        patch.recipientName !== existing.recipientName) ||
        (patch.recipientCustomization !== undefined &&
          JSON.stringify(
            customizationSchema.parse(patch.recipientCustomization),
          ) !== JSON.stringify(existing.recipientCustomization)))
    )
      fail("Your friend controls their character after claiming it.", 403);
    if (
      g.status === "ready" &&
      patch.sourceSeatId !== undefined &&
      patch.sourceSeatId !== g.source_seat_id
    )
      fail("An active gift keeps its purchased seats.", 409);
    const base: GiftInput = {
      occasion: existing.occasion,
      senderName: existing.senderName,
      recipientName: existing.recipientName,
      message: existing.message,
      senderCustomization: existing.senderCustomization,
      recipientCustomization: existing.recipientCustomization,
      dish: existing.dish,
      prop: existing.prop,
      ...(existing.sourceSeatId ? { sourceSeatId: existing.sourceSeatId } : {}),
    };
    const p = input({ ...base, ...patch });
    await c.query(
      "UPDATE gifts SET occasion=$2,sender_name=$3,recipient_name=$4,private_message=$5,sender_customization=$6,recipient_customization=$7,dish=$8,prop=$9,source_seat_id=$10,updated_at=now() WHERE id=$1",
      [
        id,
        p.occasion,
        p.senderName,
        p.recipientName,
        p.message,
        JSON.stringify(p.senderCustomization),
        JSON.stringify(p.recipientCustomization),
        p.dish,
        p.prop,
        p.sourceSeatId || null,
      ],
    );
    if (
      g.status === "ready" &&
      !g.claimed_by &&
      (patch.recipientCustomization !== undefined || patch.dish !== undefined)
    )
      await c.query(
        "UPDATE profiles SET customization=$2,dish=$3,visibility='pending',updated_at=now() WHERE seat_id=$1 AND EXISTS(SELECT 1 FROM seats WHERE id=$1 AND owner_id=$4 AND state='purchased')",
        [
          g.recipient_seat_id,
          JSON.stringify(p.recipientCustomization),
          p.dish,
          sender,
        ],
      );
    await audit(c, sender, "gift.edited", id);
    return serialize(await fetchGift(c, id));
  });
}
export async function prepareGift(
  sender: string,
  id: string,
  near = 1,
): Promise<GiftPreparation> {
  if (!Number.isInteger(near) || near < 1 || near > 10000)
    fail("Choose a seat between 1 and 10,000.");
  // Expire only reservations the established inventory engine considers terminal.
  await findAvailable(2, near).catch(() => null);
  return transaction(async (c) => {
    await lock(c);
    let g = await own(c, sender, id);
    if (["revoked", "unavailable"].includes(g.status))
      fail("This gift is no longer available.", 410);
    if (g.order_id) {
      await syncGiftLifecycle(c, g.order_id);
      const fresh = await own(c, sender, id);
      g = fresh;
      if (fresh.status === "awaiting_payment" || fresh.status === "ready") {
        const seats =
          fresh.package_id === "one"
            ? [fresh.recipient_seat_id]
            : [fresh.sender_seat_id, fresh.recipient_seat_id]
                .filter(Boolean)
                .sort((a, b) => a - b);
        return {
          gift: serialize(fresh),
          packageId: fresh.status === "ready" ? null : fresh.package_id,
          seatIds: fresh.status === "ready" ? [] : seats,
          amount: fresh.status === "ready" ? 0 : Number(fresh.order_amount),
          sourceSeatId: fresh.sender_seat_id,
          recipientSeatId: fresh.recipient_seat_id,
          explanation:
            fresh.status === "ready"
              ? "Both places are already paid. No new charge."
              : "Resume the exact seats reserved by your existing gift checkout.",
          requiresPayment: fresh.status !== "ready",
        };
      }
    }
    if (g.status === "ready")
      return {
        gift: serialize(g),
        packageId: null,
        seatIds: [],
        amount: 0,
        sourceSeatId: g.sender_seat_id,
        recipientSeatId: g.recipient_seat_id,
        explanation: "Both places are already paid. No new charge.",
        requiresPayment: false,
      };
    let senderSeat: number | null = null,
      recipientSeat: number | null = null,
      pack: "one" | "two" | null = "two",
      explanation =
        "Two neighboring seats, two guests, and your private surprise. A one-time pair purchase.";
    if (g.source_seat_id) {
      if (!(await eligible(c, g.source_seat_id, sender, id, true)))
        fail(
          "Choose an active seat you own that is not already assigned by another invitation or gift.",
          409,
        );
      senderSeat = g.source_seat_id;
      const adjacent = [senderSeat! - 2, senderSeat! + 2].filter(
        (n) => n >= 1 && n <= 10000,
      );
      for (const n of adjacent)
        if (await eligible(c, n, sender, id)) {
          recipientSeat = n;
          pack = null;
          explanation =
            "You already own both neighboring places. The gift has no additional charge.";
          break;
        }
      if (!recipientSeat) {
        const available = (
          await c.query(
            "SELECT id FROM seats WHERE id=ANY($1::int[]) AND state='available' ORDER BY abs(id-$2),id LIMIT 1",
            [adjacent, senderSeat],
          )
        ).rows[0];
        if (available) {
          recipientSeat = available.id;
          pack = "one";
          explanation =
            "Keep your existing seat. Buy only the available neighboring seat for your friend; your seat is not charged again.";
        }
      }
      if (!recipientSeat) {
        senderSeat = null;
        explanation =
          "The chairs beside your existing guest are not available. Your original seat stays in place. This purchase creates a separate neighboring pair elsewhere; no one will be moved.";
      }
    }
    if (!recipientSeat) {
      const pair = (
        await c.query(
          "SELECT s.id FROM seats s JOIN seats n ON n.id=s.id+2 WHERE s.state='available' AND n.state='available' ORDER BY abs(s.id-$1::int),s.id LIMIT 1",
          [near],
        )
      ).rows[0];
      if (!pair)
        fail(
          "No adjacent pair is currently available. Your existing seat has not moved.",
          409,
        );
      senderSeat = pair.id;
      recipientSeat = pair.id + 2;
      pack = "two";
    }
    const prices = (
      await c.query("SELECT value FROM settings WHERE key='packages'")
    ).rows[0]?.value;
    const selected = pack
      ? (Array.isArray(prices) ? prices : PACKAGES).find(
          (p: Row) => p.id === pack,
        )
      : null;
    if (
      pack &&
      (!selected ||
        selected.count !== (pack === "one" ? 1 : 2) ||
        !Number.isSafeInteger(selected.amount))
    )
      fail("Configured gift pricing is temporarily unavailable.", 503);
    const amount = selected ? Number(selected.amount) : 0;
    await c.query(
      "UPDATE gifts SET sender_seat_id=$2,recipient_seat_id=$3,package_id=$4,order_id=NULL,status=$5,updated_at=now() WHERE id=$1",
      [id, senderSeat, recipientSeat, pack, pack ? "draft" : "ready"],
    );
    if (!pack)
      await c.query(
        "UPDATE profiles SET customization=$2,dish=$3,visibility='pending',updated_at=now() WHERE seat_id=$1",
        [recipientSeat, JSON.stringify(g.recipient_customization), g.dish],
      );
    const gift = serialize(await fetchGift(c, id));
    gift.amount = amount;
    gift.explanation = explanation;
    await audit(
      c,
      sender,
      pack ? "gift.seating_prepared" : "gift.ready_owned",
      id,
    );
    return {
      gift,
      packageId: pack,
      seatIds:
        pack === "two"
          ? [senderSeat!, recipientSeat!].sort((a, b) => a - b)
          : pack === "one"
            ? [recipientSeat!]
            : [],
      amount,
      sourceSeatId: senderSeat,
      recipientSeatId: recipientSeat,
      explanation,
      requiresPayment: !!pack,
    };
  });
}
async function active(c: PoolClient, g: Row) {
  if (!g || g.status !== "ready")
    fail(
      "This surprise is no longer available. It may have been revoked, refunded, or cancelled.",
      410,
    );
  const sender = (
    await c.query('SELECT deleted_at FROM "user" WHERE id=$1', [g.sender_id])
  ).rows[0];
  const seats = await c.query(
    "SELECT s.id,s.owner_id,s.state,o.status order_status FROM seats s JOIN orders o ON o.id=s.order_id WHERE s.id=ANY($1::int[])",
    [[g.sender_seat_id, g.recipient_seat_id]],
  );
  if (
    !sender ||
    sender.deleted_at ||
    seats.rowCount !== 2 ||
    seats.rows.some(
      (s: Row) => s.state !== "purchased" || s.order_status !== "paid",
    ) ||
    seats.rows.find((s: Row) => s.id === g.sender_seat_id)?.owner_id !==
      g.sender_id ||
    seats.rows.find((s: Row) => s.id === g.recipient_seat_id)?.owner_id !==
      (g.claimed_by || g.sender_id)
  )
    fail(
      "This surprise is unavailable following an account or seat change.",
      410,
    );
}
async function tokenGift(
  c: PoolClient,
  token: string,
  actor = "shared-private-read",
) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token))
    fail("This gift link is invalid.", 404);
  const g = (
    await c.query(`${baseSelect} WHERE g.token_hash=$1 FOR UPDATE OF g`, [
      hash(token),
    ])
  ).rows[0];
  if (!g) fail("This gift link is invalid or has been replaced.", 404);
  await active(c, g);
  return g;
}
export async function readGift(
  token: string,
  actor?: string,
): Promise<RecipientGift> {
  await publicRate(actor || "shared-private-read", "lookup", 120);
  return transaction(async (c) => {
    await lock(c);
    const g = await tokenGift(c, token, actor);
    const result = serialize(g);
    if (g.claimed_by) {
      const p = (
        await c.query(
          "SELECT customization,dish FROM profiles WHERE seat_id=$1",
          [g.recipient_seat_id],
        )
      ).rows[0];
      if (p) {
        result.recipientCustomization = p.customization;
        result.dish = p.dish;
      }
    }
    const { claimedBy, ...safe } = result;
    return { ...safe, claimed: !!g.claimed_by };
  });
}
export const resolveGift = readGift;
export async function issueGiftLink(
  sender: string,
  id: string,
  options: { replace?: boolean } = {},
) {
  return transaction(async (c) => {
    await lock(c);
    const g = await own(c, sender, id);
    if (g.status === "revoked" && options.replace) {
      if (
        (
          await c.query(
            "SELECT 1 FROM gifts WHERE id<>$1 AND recipient_seat_id=$2 AND status IN ('ready','awaiting_payment')",
            [g.id, g.recipient_seat_id],
          )
        ).rowCount
      )
        fail("This chair is now part of another gift.", 409);
      g.status = "ready";
      await active(c, g);
      await c.query("UPDATE gifts SET status='ready' WHERE id=$1", [g.id]);
    } else await active(c, g);
    if (g.token_hash && !options.replace)
      fail(
        "The gift already has a private link. Use your saved copy, or generate a replacement.",
        409,
      );
    await giftRateLimit(c, sender, "link", 20, 3600);
    const token = randomBytes(32).toString("base64url");
    await c.query(
      "UPDATE gifts SET token_hash=$2,link_created_at=now(),updated_at=now() WHERE id=$1",
      [id, hash(token)],
    );
    await c.query("DELETE FROM gift_claim_intents WHERE gift_id=$1", [id]);
    await audit(
      c,
      sender,
      options.replace ? "gift.link_replaced" : "gift.link_created",
      id,
    );
    return {
      gift: serialize(await fetchGift(c, id)),
      token,
      url: `${config.url}/gift/${token}`,
    };
  });
}
export async function revokeGift(sender: string, id: string) {
  return transaction(async (c) => {
    await lock(c);
    await own(c, sender, id);
    await c.query(
      "UPDATE gifts SET status='revoked',token_hash=NULL,updated_at=now() WHERE id=$1",
      [id],
    );
    await c.query("DELETE FROM gift_claim_intents WHERE gift_id=$1", [id]);
    await audit(c, sender, "gift.revoked", id);
    return serialize(await fetchGift(c, id));
  });
}
export async function thankGift(token: string, actor: string) {
  await publicRate(actor, "lookup", 120);
  await publicRate(actor, "thank-you", 6);
  return transaction(async (c) => {
    await lock(c);
    const g = await tokenGift(c, token, actor);
    if (g.thank_you_at)
      return { thankYouAt: iso(g.thank_you_at), duplicate: true };
    const r = await c.query(
      "UPDATE gifts SET thank_you_at=now() WHERE id=$1 RETURNING thank_you_at",
      [g.id],
    );
    return { thankYouAt: iso(r.rows[0].thank_you_at), duplicate: false };
  });
}
export async function createGiftClaimIntent(user: string, token: string) {
  await publicRate(`claim:${user}`, "lookup", 120);
  await publicRate(user, "claim", 10);
  return transaction(async (c) => {
    await lock(c);
    await verified(c, user);
    const g = await tokenGift(c, token, `claim:${user}`);
    if (g.sender_id === user)
      fail(
        "This seat is already yours. Send the surprise to your friend.",
        409,
      );
    if (g.claimed_by) fail("This guest has already been claimed.", 409);
    const claimToken = randomBytes(32).toString("base64url"),
      expiresAt = new Date(Date.now() + 5 * 60000);
    await c.query(
      "DELETE FROM gift_claim_intents WHERE gift_id=$1 AND user_id=$2",
      [g.id, user],
    );
    await c.query(
      "INSERT INTO gift_claim_intents(id,gift_id,user_id,token_hash,expires_at) VALUES($1,$2,$3,$4,$5)",
      [randomUUID(), g.id, user, hash(claimToken), expiresAt],
    );
    return { claimToken, expiresAt: expiresAt.toISOString() };
  });
}
export async function claimGift(
  user: string,
  token: string,
  claimToken: string,
) {
  await publicRate(`claim:${user}`, "lookup", 120);
  await publicRate(user, "claim-final", 10);
  return transaction(async (c) => {
    await lock(c);
    await verified(c, user);
    const g = await tokenGift(c, token, `claim:${user}`);
    if (g.claimed_by)
      fail("This guest has already been claimed by someone else.", 409);
    if (g.sender_id === user)
      fail(
        "This seat is already yours. Send the surprise to your friend.",
        409,
      );
    const intent = (
      await c.query(
        "SELECT * FROM gift_claim_intents WHERE gift_id=$1 AND user_id=$2 AND token_hash=$3 AND consumed_at IS NULL AND expires_at>now() FOR UPDATE",
        [g.id, user, hash(claimToken)],
      )
    ).rows[0];
    if (!intent)
      fail(
        "Start a fresh, explicit guest claim from this verified account.",
        403,
      );
    const s = (
      await c.query("SELECT * FROM seats WHERE id=$1 FOR UPDATE", [
        g.recipient_seat_id,
      ])
    ).rows[0];
    if (s.owner_id !== g.sender_id || s.state !== "purchased")
      fail("This guest cannot be assigned. Please contact support.", 409);
    await c.query("UPDATE seats SET owner_id=$2,updated_at=now() WHERE id=$1", [
      g.recipient_seat_id,
      user,
    ]);
    await c.query(
      "UPDATE profiles SET display_name=$2,customization=$3,dish=$4,message=$5,visibility='pending',updated_at=now() WHERE seat_id=$1",
      [
        g.recipient_seat_id,
        g.recipient_name,
        JSON.stringify(g.recipient_customization),
        g.dish,
        "A little place at the table.",
      ],
    );
    await c.query(
      "UPDATE gifts SET claimed_by=$2,claimed_at=now(),updated_at=now() WHERE id=$1",
      [g.id, user],
    );
    await c.query(
      "UPDATE gift_claim_intents SET consumed_at=now() WHERE id=$1",
      [intent.id],
    );
    await c.query(
      "UPDATE invitations SET status='revoked' WHERE target_seat_id=$1 AND status='active'",
      [g.recipient_seat_id],
    );
    await audit(c, user, "gift.guest_claimed", g.id);
    return { seatId: g.recipient_seat_id, alreadyClaimed: false };
  });
}
export async function getGiftSharePreview(id: string) {
  if (!z.string().uuid().safeParse(id).success) return null;
  return transaction(async (c) => {
    const g = await fetchGift(c, id);
    if (!g) return null;
    try {
      await active(c, g);
    } catch {
      return null;
    }
    return {
      senderCustomization: customizationSchema.parse(g.sender_customization),
      recipientCustomization: customizationSchema.parse(
        g.recipient_customization,
      ),
      dish: g.dish,
      prop: g.prop,
      occasion: g.occasion,
      isDemo: serialize(g).isDemo,
    };
  });
}
