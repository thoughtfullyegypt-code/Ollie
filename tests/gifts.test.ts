import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { pool } from "../lib/db";
import { migrate } from "../lib/db/migrate";
import {
  createOrder,
  handlePaymentEvent,
  findAvailable,
  getOrder,
  getOwnerData,
  getPublicGuest,
  getPublicSeats,
  moderate,
  updateProfile,
  createInvitation,
  requestAccountDeletion,
} from "../lib/domain";
import {
  createGift,
  getGift,
  listGifts,
  prepareGift,
  updateGift,
  issueGiftLink,
  revokeGift,
  readGift,
  thankGift,
  createGiftClaimIntent,
  claimGift,
  getGiftSharePreview,
} from "../lib/gifts";
import { giftBasicSchema, type GiftInput } from "../lib/gift-input";

const run = randomUUID().slice(0, 8);
const users: string[] = [];
const orders: string[] = [];
const gifts: string[] = [];
const blocked: number[] = [];
let sender = "",
  recipient = "",
  stranger = "",
  unverified = "",
  admin = "";
let near = 7601;
const customization = {
  base: "raccoon",
  accessory: "none",
  outfit: "suit",
  skin: "#bd805a",
  color: "#9aab91",
};
const suggestion = { ...customization, base: "plant", outfit: "bowtie" };
const privateMessage = `A private birthday letter ${run}.\n\nYou make ordinary days brighter. 🎂`;
const input: GiftInput = {
  occasion: "birthday",
  senderName: "A peculiar sender",
  recipientName: "A favorite weirdo",
  message: privateMessage,
  senderCustomization: customization,
  recipientCustomization: suggestion,
  dish: "cake",
  prop: "cake",
};
const publicProfile = {
  displayName: "Public gift fixture",
  message: "Here for the cake.",
  dish: "cake",
  customization,
};
const status = (expected: number) => (error: unknown) =>
  (error as { status?: number }).status === expected;
async function makeUser(role = "user", verified = true) {
  const id = `gift-test-${run}-${users.length}`;
  users.push(id);
  await pool.query(
    'INSERT INTO "user"(id,name,email,"emailVerified",role) VALUES($1,$2,$3,$4,$5)',
    [id, "Gift integration fixture", `${id}@example.invalid`, verified, role],
  );
  return id;
}
async function seats(count = 1) {
  const ids = await findAvailable(count, near);
  near = Math.max(...ids) + 20;
  return ids;
}
async function own(owner = sender, count = 1) {
  const ids = await seats(count);
  const order = await createOrder(owner, {
    packageId: count === 2 ? "two" : "one",
    seatIds: ids,
    profile: publicProfile,
    provider: "development",
  });
  orders.push(order.id);
  await pay(order);
  return order;
}
async function pay(order: { id: string; amount: number }) {
  return handlePaymentEvent({
    id: `gift-test-${run}-${randomUUID()}`,
    orderId: order.id,
    type: "paid",
    amount: order.amount,
    currency: "usd",
    provider: "development",
  });
}
async function draft(owner = sender, extra: Partial<GiftInput> = {}) {
  const gift = await createGift(owner, { ...input, ...extra });
  gifts.push(gift.id);
  return gift;
}
async function purchaseGift(giftId: string) {
  const quote = await prepareGift(sender, giftId, near);
  near = Math.max(...quote.seatIds) + 20;
  const order = await createOrder(sender, {
    giftId,
    packageId: quote.packageId!,
    seatIds: quote.seatIds,
    profile: publicProfile,
    provider: "development",
    expectedAmount: quote.amount,
  });
  if (!orders.includes(order.id)) orders.push(order.id);
  return { quote, order };
}
async function ready(extra: Partial<GiftInput> = {}) {
  const gift = await draft(sender, extra);
  const result = await purchaseGift(gift.id);
  await pay(result.order);
  const link = await issueGiftLink(sender, gift.id, {});
  return { ...result, ...link };
}
before(async () => {
  assert.equal(
    process.env.APP_MODE,
    "development",
    "Gift integration tests require an isolated development database.",
  );
  await migrate();
  sender = await makeUser();
  recipient = await makeUser();
  stranger = await makeUser();
  unverified = await makeUser("user", false);
  admin = await makeUser("admin");
});
after(async () => {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const actualOrders = (
      await c.query("SELECT id FROM orders WHERE user_id=ANY($1::text[])", [
        users,
      ])
    ).rows.map((r) => r.id);
    await c.query(
      "DELETE FROM gift_claim_intents WHERE gift_id IN (SELECT id FROM gifts WHERE sender_id=ANY($1::text[])) OR user_id=ANY($1::text[])",
      [users],
    );
    // The reverse link is deliberately nullable; clear it before deleting gifts.
    const giftColumn = await c.query(
      "SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='gift_id'",
    );
    if (giftColumn.rowCount)
      await c.query("UPDATE orders SET gift_id=NULL WHERE id=ANY($1::text[])", [
        actualOrders,
      ]);
    await c.query("DELETE FROM gifts WHERE sender_id=ANY($1::text[])", [users]);
    await c.query(
      "DELETE FROM moderation_decisions WHERE admin_id=ANY($1::text[])",
      [users],
    );
    await c.query(
      "DELETE FROM reactions WHERE seat_id IN (SELECT seat_id FROM order_items WHERE order_id=ANY($1::text[]))",
      [actualOrders],
    );
    await c.query(
      "DELETE FROM reports WHERE seat_id IN (SELECT seat_id FROM order_items WHERE order_id=ANY($1::text[]))",
      [actualOrders],
    );
    await c.query(
      "DELETE FROM profiles WHERE seat_id IN (SELECT seat_id FROM order_items WHERE order_id=ANY($1::text[]))",
      [actualOrders],
    );
    await c.query(
      "DELETE FROM invitations WHERE owner_id=ANY($1::text[]) OR claimed_by=ANY($1::text[])",
      [users],
    );
    await c.query(
      "UPDATE seats SET state='available',owner_id=NULL,order_id=NULL,reservation_id=NULL,hold_expires_at=NULL WHERE owner_id=ANY($1::text[]) OR order_id=ANY($2::text[])",
      [users, actualOrders],
    );
    await c.query(
      "UPDATE seats SET state='available' WHERE id=ANY($1::int[]) AND state='unavailable' AND owner_id IS NULL AND order_id IS NULL",
      [blocked],
    );
    await c.query(
      "DELETE FROM support_issues WHERE user_id=ANY($1::text[]) OR order_id=ANY($2::text[])",
      [users, actualOrders],
    );
    await c.query(
      "DELETE FROM audit_events WHERE actor_id=ANY($1::text[]) OR target=ANY($2::text[])",
      [users, [...gifts, ...actualOrders, ...users]],
    );
    await c.query("DELETE FROM payment_events WHERE order_id=ANY($1::text[])", [
      actualOrders,
    ]);
    await c.query("DELETE FROM reservations WHERE user_id=ANY($1::text[])", [
      users,
    ]);
    await c.query("DELETE FROM order_items WHERE order_id=ANY($1::text[])", [
      actualOrders,
    ]);
    await c.query("DELETE FROM orders WHERE id=ANY($1::text[])", [
      actualOrders,
    ]);
    await c.query('DELETE FROM "user" WHERE id=ANY($1::text[])', [users]);
    await c.query("DELETE FROM gift_rate_buckets WHERE key LIKE $1", [
      `%${run}%`,
    ]);
    await c.query("COMMIT");
  } catch (error) {
    await c.query("ROLLBACK");
    throw error;
  } finally {
    c.release();
    await pool.end();
  }
});

test("gift validation supports paragraphs and emoji but refuses oversized names, messages, unsafe artwork and unsolicited properties", async () => {
  assert.equal(giftBasicSchema.parse(input).message, privateMessage);
  for (const bad of [
    { senderName: "s".repeat(31) },
    { recipientName: "r".repeat(31) },
    { message: "m".repeat(1001) },
    { message: "" },
    { occasion: "unknown" },
    { recipientEmail: "not-needed@example.invalid" },
  ]) {
    assert.equal(
      giftBasicSchema.safeParse({ ...input, ...bad }).success,
      false,
    );
  }
  await assert.rejects(
    createGift(sender, {
      ...input,
      senderCustomization: { ...customization, base: "<script>" },
    }),
  );
  await assert.rejects(createGift(unverified, input));
});

test("pair gift prices come from the existing server package and repeated checkout cannot create duplicate charges", async () => {
  const gift = await draft();
  const { quote, order } = await purchaseGift(gift.id);
  assert.equal(quote.amount, 900);
  assert.equal(quote.packageId, "two");
  assert.equal(quote.seatIds.length, 2);
  assert.equal(quote.seatIds[1] - quote.seatIds[0], 2);
  assert.equal(order.amount, 900);
  const retry = await createOrder(sender, {
    giftId: gift.id,
    packageId: "two",
    seatIds: quote.seatIds,
    profile: publicProfile,
    provider: "development",
    expectedAmount: 900,
  });
  assert.equal(retry.id, order.id);
  assert.equal(
    (
      await pool.query("SELECT count(*)::int n FROM orders WHERE gift_id=$1", [
        gift.id,
      ])
    ).rows[0].n,
    1,
  );
  assert.equal((await getGift(sender, gift.id)).status, "awaiting_payment");
  await assert.rejects(issueGiftLink(sender, gift.id, {}));
  await pay(order);
  assert.equal((await getGift(sender, gift.id)).status, "ready");
  await pay(order);
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int n FROM order_items WHERE order_id=$1",
        [order.id],
      )
    ).rows[0].n,
    2,
  );
});

test("existing neighboring paid seats are reused at zero cost without a new order", async () => {
  const owned = await own(sender, 2);
  const beforeCount = (
    await pool.query("SELECT count(*)::int n FROM orders WHERE user_id=$1", [
      sender,
    ])
  ).rows[0].n;
  const gift = await draft(sender, { sourceSeatId: owned.seatIds[0] });
  const quote = await prepareGift(sender, gift.id);
  assert.equal(quote.requiresPayment, false);
  assert.equal(quote.amount, 0);
  assert.equal(quote.packageId, null);
  assert.equal(quote.gift.status, "ready");
  assert.equal(quote.sourceSeatId, owned.seatIds[0]);
  assert.equal(quote.recipientSeatId, owned.seatIds[1]);
  assert.equal(
    (
      await pool.query("SELECT count(*)::int n FROM orders WHERE user_id=$1", [
        sender,
      ])
    ).rows[0].n,
    beforeCount,
  );
});

test("an owner buys only the available adjacent single seat and blocked neighbors cause an accurately disclosed pair elsewhere", async () => {
  const owned = await own(sender, 1);
  const gift = await draft(sender, { sourceSeatId: owned.seatIds[0] });
  const quote = await prepareGift(sender, gift.id);
  assert.equal(quote.amount, 500);
  assert.equal(quote.packageId, "one");
  assert.equal(quote.seatIds.length, 1);
  assert.equal(quote.sourceSeatId, owned.seatIds[0]);
  assert.equal(Math.abs(quote.recipientSeatId! - owned.seatIds[0]), 2);
  const blockerSource = await own(sender, 1);
  for (const id of [
    blockerSource.seatIds[0] - 2,
    blockerSource.seatIds[0] + 2,
  ]) {
    const changed = await pool.query(
      "UPDATE seats SET state='unavailable' WHERE id=$1 AND state='available' RETURNING id",
      [id],
    );
    assert.equal(changed.rowCount, 1);
    blocked.push(id);
  }
  const fallback = await draft(sender, {
    sourceSeatId: blockerSource.seatIds[0],
  });
  const elsewhere = await prepareGift(sender, fallback.id, near);
  assert.equal(elsewhere.packageId, "two");
  assert.equal(elsewhere.amount, 900);
  assert.notEqual(elsewhere.sourceSeatId, blockerSource.seatIds[0]);
  assert.ok(elsewhere.explanation.length > 20);
  assert.equal(
    (
      await pool.query("SELECT owner_id FROM seats WHERE id=$1", [
        blockerSource.seatIds[0],
      ])
    ).rows[0].owner_id,
    sender,
  );
});

test("reading a valid bearer link needs no account and never consumes, reveals, or claims the seat", async () => {
  const gift = await ready();
  assert.match(gift.token, /^[A-Za-z0-9_-]{40,}$/);
  const stored = (
    await pool.query(
      "SELECT token_hash,first_read_at,claimed_at,private_message FROM gifts WHERE id=$1",
      [gift.gift.id],
    )
  ).rows[0];
  assert.equal(
    stored.token_hash,
    createHash("sha256").update(gift.token).digest("hex"),
  );
  assert.notEqual(stored.token_hash, gift.token);
  const first = await readGift(gift.token, `gift-read-${run}`);
  const again = await readGift(gift.token, `gift-read-${run}`);
  assert.equal(first.message, privateMessage);
  assert.equal(again.message, privateMessage);
  const afterRead = (
    await pool.query("SELECT first_read_at,claimed_at FROM gifts WHERE id=$1", [
      gift.gift.id,
    ])
  ).rows[0];
  assert.equal(afterRead.first_read_at, stored.first_read_at);
  assert.equal(afterRead.claimed_at, null);
  assert.equal(
    (
      await pool.query("SELECT owner_id FROM seats WHERE id=$1", [
        first.recipientSeatId,
      ])
    ).rows[0].owner_id,
    sender,
  );
  await assert.rejects(readGift("not-a-real-token", `gift-invalid-${run}`));
});

test("replacement and revocation invalidate old links while sender authorization is enforced", async () => {
  const result = await ready();
  await assert.rejects(getGift(stranger, result.gift.id));
  await assert.rejects(
    updateGift(stranger, result.gift.id, { message: "A forged edit" }),
  );
  await assert.rejects(
    issueGiftLink(stranger, result.gift.id, { replace: true }),
  );
  await assert.rejects(revokeGift(stranger, result.gift.id));
  const replacement = await issueGiftLink(sender, result.gift.id, {
    replace: true,
  });
  assert.notEqual(replacement.token, result.token);
  await assert.rejects(readGift(result.token, `gift-replaced-${run}`));
  assert.equal(
    (await readGift(replacement.token, `gift-new-${run}`)).id,
    result.gift.id,
  );
  await revokeGift(sender, result.gift.id);
  await assert.rejects(readGift(replacement.token, `gift-revoked-${run}`));
  assert.equal((await getGift(sender, result.gift.id)).status, "revoked");
});

test("private letters and recipient names stay out of public profiles, table/search, order drafts, analytics and image metadata", async () => {
  const result = await ready({ recipientName: `Private name ${run}` });
  await moderate(admin, result.quote.sourceSeatId!, "approve");
  await moderate(admin, result.quote.recipientSeatId!, "approve");
  const profile = await getPublicGuest(result.quote.sourceSeatId!);
  const publicData = await getPublicSeats({
    start: result.quote.sourceSeatId!,
    end: result.quote.recipientSeatId!,
  });
  const search = await getPublicSeats({ query: privateMessage });
  const order = (
    await pool.query(
      "SELECT profile_draft,attribution FROM orders WHERE id=$1",
      [result.order.id],
    )
  ).rows[0];
  const analytics = (
    await pool.query(
      "SELECT properties,attribution FROM analytics_events WHERE created_at>now()-interval '1 hour'",
    )
  ).rows;
  const preview = await getGiftSharePreview(result.gift.id);
  for (const payload of [
    profile,
    publicData,
    search,
    order,
    analytics,
    preview,
  ]) {
    const text = JSON.stringify(payload);
    assert.ok(
      !text.includes(privateMessage),
      "Private letter leaked into a public or measurement serialization",
    );
    assert.ok(
      !text.includes(`Private name ${run}`),
      "Recipient name leaked into public or social content",
    );
    assert.ok(
      !text.includes(result.token),
      "Raw gift token leaked outside private link delivery",
    );
  }
  assert.ok(preview);
  assert.equal(search.guests.length, 0);
});

test("verified explicit claims require a separate expiring user-bound credential and assign a guest exactly once", async () => {
  const result = await ready();
  await assert.rejects(createGiftClaimIntent(unverified, result.token));
  const intent = await createGiftClaimIntent(recipient, result.token);
  assert.ok(intent.claimToken);
  assert.ok(new Date(intent.expiresAt) > new Date());
  await assert.rejects(claimGift(stranger, result.token, intent.claimToken));
  await assert.rejects(
    claimGift(recipient, result.token, "invalid-claim-token"),
  );
  await claimGift(recipient, result.token, intent.claimToken);
  const owned = (
    await pool.query("SELECT owner_id FROM seats WHERE id=$1", [
      result.quote.recipientSeatId,
    ])
  ).rows[0];
  assert.equal(owned.owner_id, recipient);
  await assert.rejects(claimGift(stranger, result.token, intent.claimToken));
  const repeats = await Promise.allSettled([
    claimGift(recipient, result.token, intent.claimToken),
    createGiftClaimIntent(stranger, result.token),
  ]);
  assert.ok(repeats.every((x) => x.status === "rejected"));
  assert.equal((await getGift(sender, result.gift.id)).claimedBy, recipient);
  assert.equal(
    (
      await pool.query("SELECT count(*)::int n FROM orders WHERE user_id=$1", [
        recipient,
      ])
    ).rows[0].n,
    0,
    "A prepaid recipient must never create another purchase",
  );
});

test("claim credentials expire and concurrent recipients cannot overwrite each other", async () => {
  const result = await ready();
  const expired = await createGiftClaimIntent(recipient, result.token);
  await pool.query(
    "UPDATE gift_claim_intents SET expires_at=now()-interval '1 minute' WHERE token_hash=$1",
    [createHash("sha256").update(expired.claimToken).digest("hex")],
  );
  await assert.rejects(claimGift(recipient, result.token, expired.claimToken));
  const [a, b] = await Promise.all([
    createGiftClaimIntent(recipient, result.token),
    createGiftClaimIntent(stranger, result.token),
  ]);
  const outcomes = await Promise.allSettled([
    claimGift(recipient, result.token, a.claimToken),
    claimGift(stranger, result.token, b.claimToken),
  ]);
  assert.equal(outcomes.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(outcomes.filter((x) => x.status === "rejected").length, 1);
});

test("after claim the sender can revise their letter or revoke delivery but cannot edit or recover the recipient guest", async () => {
  const result = await ready();
  const intent = await createGiftClaimIntent(recipient, result.token);
  await claimGift(recipient, result.token, intent.claimToken);
  const recipientSeatId = result.quote.recipientSeatId!;
  await updateProfile(recipient, recipientSeatId, {
    ...publicProfile,
    displayName: "My chosen guest",
  });
  await assert.rejects(updateProfile(sender, recipientSeatId, publicProfile));
  await assert.rejects(createInvitation(sender, recipientSeatId, "paid"));
  const changed = `An updated private letter ${run}.\n\nYou are still wonderful.`;
  await updateGift(sender, result.gift.id, { message: changed });
  assert.equal(
    (await readGift(result.token, `gift-edited-${run}`)).message,
    changed,
  );
  await assert.rejects(
    updateGift(sender, result.gift.id, {
      recipientCustomization: customization,
    }),
  );
  await revokeGift(sender, result.gift.id);
  assert.equal(
    (
      await pool.query("SELECT owner_id FROM seats WHERE id=$1", [
        recipientSeatId,
      ])
    ).rows[0].owner_id,
    recipient,
  );
  assert.equal(
    (await getOwnerData(recipient)).seats.some(
      (s: { seatId: number }) => s.seatId === recipientSeatId,
    ),
    true,
  );
});

test("thank-you is predefined, account-free, idempotent and rate-limited rather than an open reply channel", async () => {
  const result = await ready();
  const actor = `gift-thanks-${run}`;
  await thankGift(result.token, actor);
  const first = (await getGift(sender, result.gift.id)).thankYouAt;
  assert.ok(first);
  await thankGift(result.token, actor);
  assert.equal((await getGift(sender, result.gift.id)).thankYouAt, first);
  assert.ok(
    (await listGifts(sender)).some(
      (g) => g.id === result.gift.id && g.thankYouAt === first,
    ),
  );
  const limited = `gift-thanks-limit-${run}`;
  const outcomes = [];
  for (let i = 0; i < 7; i++)
    outcomes.push(
      await thankGift(result.token, limited)
        .then(() => "ok")
        .catch((e: { status?: number }) => e.status),
    );
  assert.ok(
    outcomes.includes(429),
    "Anonymous response submission needs a durable rate limit even for retries",
  );
});

test("failed and expired payments never activate gifts and terminal attempts can be retried without releasing valid checkout inventory", async () => {
  for (const type of ["failed", "expired"]) {
    const gift = await draft();
    const { order } = await purchaseGift(gift.id);
    await handlePaymentEvent({
      id: `gift-${run}-${type}`,
      orderId: order.id,
      type,
      provider: "development",
    });
    assert.notEqual((await getGift(sender, gift.id)).status, "ready");
    await assert.rejects(issueGiftLink(sender, gift.id, {}));
    assert.equal((await getOrder(sender, order.id)).status, type);
    const retry = await purchaseGift(gift.id);
    assert.notEqual(retry.order.id, order.id);
    await pay(retry.order);
    assert.equal((await getGift(sender, gift.id)).status, "ready");
  }
});

test("qualifying refunds disable delivery, including gifts that reused an existing paid source seat", async () => {
  const result = await ready();
  await handlePaymentEvent({
    id: `gift-refund-${run}`,
    orderId: result.order.id,
    type: "refunded",
    provider: "development",
    amount: result.order.amount,
    currency: "usd",
  });
  assert.equal((await getGift(sender, result.gift.id)).status, "unavailable");
  await assert.rejects(readGift(result.token, `gift-refunded-${run}`));
  const existing = await own(sender, 2);
  const gift = await draft(sender, { sourceSeatId: existing.seatIds[0] });
  assert.equal((await prepareGift(sender, gift.id)).requiresPayment, false);
  const link = await issueGiftLink(sender, gift.id, {});
  await handlePaymentEvent({
    id: `gift-existing-refund-${run}`,
    orderId: existing.id,
    type: "refunded",
    provider: "development",
    amount: existing.amount,
    currency: "usd",
  });
  await assert.rejects(readGift(link.token, `gift-source-refund-${run}`));
});

test("sender deletion disables authored delivery while financial records remain available for retention review", async () => {
  const deletingSender = await makeUser();
  const owned = await own(deletingSender, 2);
  const gift = await draft(deletingSender, { sourceSeatId: owned.seatIds[0] });
  await prepareGift(deletingSender, gift.id);
  const link = await issueGiftLink(deletingSender, gift.id, {});
  await requestAccountDeletion(deletingSender);
  await assert.rejects(readGift(link.token, `gift-deletion-${run}`));
  assert.equal((await getOrder(deletingSender, owned.id)).status, "paid");
});

test("invalid gift lookups consume a persistent abuse budget even though content validation fails", async () => {
  const actor = `gift-invalid-budget-${run}`;
  for (let n = 0; n < 120; n++)
    await assert.rejects(readGift("invalid-private-link", actor), status(404));
  await assert.rejects(readGift("invalid-private-link", actor), status(429));
});

test("payment received after a related source-seat refund records one visible fulfillment issue and never substitutes seats", async () => {
  const source = await own(sender, 1);
  const gift = await draft(sender, { sourceSeatId: source.seatIds[0] });
  const quote = await prepareGift(sender, gift.id, near);
  assert.equal(quote.packageId, "one");
  const order = await createOrder(sender, {
    giftId: gift.id,
    packageId: "one",
    seatIds: quote.seatIds,
    expectedAmount: quote.amount,
    profile: publicProfile,
    provider: "development",
  });
  orders.push(order.id);
  await handlePaymentEvent({
    id: `gift-source-changed-${run}`,
    orderId: source.id,
    type: "refunded",
    provider: "development",
    amount: source.amount,
    currency: "usd",
  });
  assert.equal((await getGift(sender, gift.id)).status, "unavailable");
  await pay(order);
  await pay(order);
  const issues = await pool.query(
    "SELECT id,status FROM support_issues WHERE order_id=$1 AND kind='gift_fulfillment_issue'",
    [order.id],
  );
  assert.equal(issues.rowCount, 1);
  assert.equal(issues.rows[0].status, "open");
  const inventory = (
    await pool.query("SELECT id,owner_id,state FROM seats WHERE order_id=$1", [
      order.id,
    ])
  ).rows;
  assert.deepEqual(
    inventory.map((s) => s.id),
    quote.seatIds,
  );
  assert.ok(
    inventory.every((s) => s.owner_id === sender && s.state === "purchased"),
  );
  await assert.rejects(issueGiftLink(sender, gift.id, {}));
});
