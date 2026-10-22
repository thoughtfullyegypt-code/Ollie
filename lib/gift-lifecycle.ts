import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";

type Row = Record<string, any>;
function fail(message: string, status = 409): never {
  throw Object.assign(new Error(message), { status });
}
export async function giftCheckoutExisting(
  c: PoolClient,
  userId: string,
  giftId: string,
  packageId: string,
  seatIds: number[],
  expectedAmount?: number,
) {
  const r = await c.query("SELECT * FROM gifts WHERE id=$1 FOR UPDATE", [
    giftId,
  ]);
  const g = r.rows[0];
  if (!g || g.sender_id !== userId)
    fail("This gift does not belong to your account.", 403);
  if (g.status === "revoked" || g.status === "unavailable")
    fail("This gift is no longer available.", 410);
  if (g.status === "ready")
    fail(
      "This gift is already paid. Create its gift link instead of paying again.",
    );
  if (!g.order_id) return null;
  const q = await c.query("SELECT * FROM orders WHERE id=$1 FOR UPDATE", [
    g.order_id,
  ]);
  const o = q.rows[0];
  if (!o) return null;
  if (!o.seat_ids)
    o.seat_ids = (
      await c.query(
        "SELECT seat_id FROM order_items WHERE order_id=$1 ORDER BY seat_id",
        [o.id],
      )
    ).rows.map((r) => r.seat_id);
  if (["checkout_pending", "processing"].includes(o.status)) {
    const ids = [...seatIds].sort((a, b) => a - b);
    if (packageId !== o.package_id || ids.join(",") !== o.seat_ids.join(","))
      fail(
        "Resume the original gift checkout; its exact seats are still reserved.",
      );
    if (expectedAmount !== undefined && expectedAmount !== o.amount)
      fail("Review the original gift order total before resuming.");
    return o;
  }
  if (o.status === "paid")
    fail(
      "This gift payment is confirmed. Refresh its gift status instead of paying again.",
    );
  if (!["failed", "expired"].includes(o.status))
    fail("This gift order requires financial review before another purchase.");
  await c.query(
    "UPDATE gifts SET order_id=NULL,status='draft',updated_at=now() WHERE id=$1",
    [g.id],
  );
  return null;
}
export async function validateGiftCheckout(
  c: PoolClient,
  userId: string,
  giftId: string,
  packageId: string,
  seatIds: number[],
) {
  const g = (
    await c.query("SELECT * FROM gifts WHERE id=$1 FOR UPDATE", [giftId])
  ).rows[0];
  if (!g || g.sender_id !== userId)
    fail("Only the sender can check out this gift.", 403);
  if (
    g.status !== "draft" ||
    !g.sender_seat_id ||
    !g.recipient_seat_id ||
    g.package_id !== packageId
  )
    fail("Review and prepare the gift seating before checkout.");
  const expected =
    g.package_id === "two"
      ? [g.sender_seat_id, g.recipient_seat_id].sort(
          (a: number, b: number) => a - b,
        )
      : [g.recipient_seat_id];
  if (expected.join(",") !== [...seatIds].sort((a, b) => a - b).join(","))
    fail("The checkout seats must match the exact gift preview.");
  if (Math.abs(g.sender_seat_id - g.recipient_seat_id) !== 2)
    fail("The gift needs two neighboring chairs on the same table edge.");
  if (g.package_id === "one") {
    const source = (
      await c.query(
        "SELECT s.*,o.status order_status FROM seats s JOIN orders o ON o.id=s.order_id WHERE s.id=$1 FOR UPDATE OF s",
        [g.sender_seat_id],
      )
    ).rows[0];
    if (
      !source ||
      source.owner_id !== userId ||
      source.state !== "purchased" ||
      source.order_status !== "paid"
    )
      fail("The original owned seat is no longer active.");
  }
  const conflicts = await c.query(
    "SELECT id FROM gifts WHERE recipient_seat_id=$1 AND id<>$2 AND status IN ('ready','awaiting_payment')",
    [g.recipient_seat_id, g.id],
  );
  if (conflicts.rowCount) fail("This chair is already part of another gift.");
  return {
    profile: {
      displayName: g.sender_name,
      message: "A place saved for someone.",
      dish: g.dish,
      customization: g.sender_customization,
      link: null,
      reactionsEnabled: true,
    },
  };
}
export async function attachGiftOrder(
  c: PoolClient,
  giftId: string,
  userId: string,
  orderId: string,
) {
  const r = await c.query(
    "UPDATE gifts SET order_id=$3,status='awaiting_payment',token_hash=NULL,link_created_at=NULL,updated_at=now() WHERE id=$1 AND sender_id=$2 AND status='draft' RETURNING id",
    [giftId, userId, orderId],
  );
  if (!r.rowCount)
    fail(
      "The gift changed while checkout was prepared. Please review it again.",
    );
  await c.query("UPDATE orders SET gift_id=$2 WHERE id=$1", [orderId, giftId]);
}
export async function syncGiftLifecycle(
  c: PoolClient,
  orderId?: string,
  options: { paymentConfirmed?: boolean } = {},
) {
  const gifts = await c.query(
    `SELECT g.* FROM gifts g WHERE g.status IN ('draft','awaiting_payment','ready') ${orderId ? "AND (g.order_id=$1 OR g.sender_seat_id IN(SELECT id FROM seats WHERE order_id=$1) OR g.recipient_seat_id IN(SELECT id FROM seats WHERE order_id=$1))" : ""} FOR UPDATE`,
    orderId ? [orderId] : [],
  );
  for (const g of gifts.rows) {
    const sender = (
      await c.query('SELECT deleted_at FROM "user" WHERE id=$1', [g.sender_id])
    ).rows[0];
    const o = g.order_id
      ? (await c.query("SELECT status FROM orders WHERE id=$1", [g.order_id]))
          .rows[0]
      : null;
    if (sender?.deleted_at) {
      await invalidate(c, g.id);
      continue;
    }
    if (
      g.status === "awaiting_payment" &&
      o &&
      ["failed", "expired"].includes(o.status)
    ) {
      await c.query(
        "UPDATE gifts SET status='draft',order_id=NULL,updated_at=now() WHERE id=$1",
        [g.id],
      );
      continue;
    }
    if (!g.sender_seat_id || !g.recipient_seat_id) continue;
    const seats = await c.query(
      "SELECT s.*,o.status order_status FROM seats s JOIN orders o ON o.id=s.order_id WHERE s.id=ANY($1::int[])",
      [[g.sender_seat_id, g.recipient_seat_id]],
    );
    if (
      seats.rows.some(
        (s: Row) =>
          ["refunded", "fulfillment_issue"].includes(s.order_status) ||
          s.state === "unavailable",
      )
    ) {
      await invalidate(c, g.id);
      continue;
    }
    if (g.status === "awaiting_payment" && o?.status === "paid") {
      if (
        seats.rowCount !== 2 ||
        seats.rows.some(
          (s: Row) =>
            s.state !== "purchased" ||
            s.owner_id !== g.sender_id ||
            s.order_status !== "paid",
        )
      ) {
        await invalidate(c, g.id);
        continue;
      }
      await c.query(
        "UPDATE profiles SET display_name='A friend’s place',customization=$2,dish=$3,visibility='pending',updated_at=now() WHERE seat_id=$1",
        [
          g.recipient_seat_id,
          JSON.stringify(g.recipient_customization),
          g.dish,
        ],
      );
      await c.query(
        "UPDATE gifts SET status='ready',updated_at=now() WHERE id=$1",
        [g.id],
      );
    }
  }
  if (orderId && options.paymentConfirmed) {
    // A separately paid source seat can be refunded or reassigned while the
    // recipient's valid provider checkout is still open. Preserve the exact
    // purchased inventory and put the failed gift delivery into support review.
    const unresolved = await c.query(
      "SELECT g.id,o.user_id FROM gifts g JOIN orders o ON o.id=g.order_id WHERE o.id=$1 AND o.status='paid' AND g.status IN ('unavailable','revoked')",
      [orderId],
    );
    for (const gift of unresolved.rows) {
      const issue = await c.query(
        "INSERT INTO support_issues(id,user_id,order_id,kind,message) VALUES($1,$2,$3,'gift_fulfillment_issue',$4) ON CONFLICT(id) DO NOTHING RETURNING id",
        [
          `gift-fulfillment:${gift.id}`,
          gift.user_id,
          orderId,
          "Payment was confirmed for the exact gift seats, but the gift could not become available following a related seat, account, or cancellation change. Do not substitute or charge again. Review a refund or obtain the customer's explicit approval for a replacement.",
        ],
      );
      if (issue.rowCount)
        await c.query(
          "INSERT INTO audit_events(id,actor_id,action,target,details) VALUES($1,NULL,'gift.fulfillment_review',$2,$3)",
          [
            randomUUID(),
            gift.id,
            JSON.stringify({ orderId, issueId: issue.rows[0].id }),
          ],
        );
    }
  }
}
export async function invalidate(c: PoolClient, id: string) {
  await c.query(
    "UPDATE gifts SET status='unavailable',token_hash=NULL,updated_at=now() WHERE id=$1 AND status<>'revoked'",
    [id],
  );
  await c.query("DELETE FROM gift_claim_intents WHERE gift_id=$1", [id]);
}
export async function invalidateSenderGifts(c: PoolClient, userId: string) {
  await c.query(
    "UPDATE gifts SET status='unavailable',token_hash=NULL,updated_at=now() WHERE sender_id=$1 AND status<>'revoked'",
    [userId],
  );
  await c.query(
    "DELETE FROM gift_claim_intents WHERE gift_id IN(SELECT id FROM gifts WHERE sender_id=$1)",
    [userId],
  );
}
