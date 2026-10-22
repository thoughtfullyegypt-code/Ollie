import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { pool } from "../lib/db";
import { migrate } from "../lib/db/migrate";
import {
  createOrder,
  handlePaymentEvent,
  getOrder,
  createInvitation,
  resolveInvitation,
  claimInvitation,
  revokeInvitation,
  updateProfile,
  getPublicGuest,
  react,
  moderate,
  adminData,
  reportGuest,
  requestRefund,
  requestAccountDeletion,
  profileSchema,
  seatPosition,
  getStats,
  PACKAGES,
  attachCheckout,
  findAvailable,
  getPublicSeats,
} from "../lib/domain";

const run = randomUUID().slice(0, 8),
  users: string[] = [],
  orderIds: string[] = [];
let nextSeat = 9001,
  adminId: string;
const fixture = {
  displayName: "Test dinner guest",
  message: "A small plate and a good story.",
  dish: "soup",
  customization: {
    base: "human",
    accessory: "curls",
    outfit: "signature",
    skin: "#bd805a",
    color: "#9aab91",
  },
  reactionsEnabled: true,
};
const take = (count = 1) => {
  const ids = Array.from({ length: count }, (_, i) => nextSeat + i * 2);
  nextSeat += count * 2 + 2;
  return ids;
};
async function user(role = "user", verified = true) {
  const id = `domain-test-${run}-${users.length}`;
  users.push(id);
  await pool.query(
    'INSERT INTO "user"(id,name,email,"emailVerified",role) VALUES($1,$2,$3,$4,$5)',
    [id, "Integration test", `${id}@example.invalid`, verified, role],
  );
  return id;
}
async function draft(
  owner: string,
  ids: number[] = take(),
  packageId = "one",
  profile = fixture,
) {
  const o = await createOrder(owner, {
    packageId,
    seatIds: ids,
    profile,
    provider: "development",
  });
  orderIds.push(o.id);
  return o;
}
async function pay(o: { id: string; amount: number }, id = randomUUID()) {
  return handlePaymentEvent({
    id: `test-${run}-${id}`,
    orderId: o.id,
    type: "paid",
    amount: o.amount,
    currency: "usd",
    provider: "development",
    paymentIntentId: `pi-test-${o.id}`,
  });
}
async function published(owner: string) {
  const o = await draft(owner);
  await pay(o);
  await moderate(adminId, o.seatIds[0], "approve");
  return o;
}
function uuidEvent() {
  return `test-${run}-${randomUUID()}`;
}
before(async () => {
  assert.equal(
    process.env.APP_MODE,
    "development",
    "Integration tests require the isolated development database",
  );
  await migrate();
  adminId = await user("admin");
});
after(async () => {
  const c = await pool.connect();
  await c.query("BEGIN");
  try {
    await c.query(
      "DELETE FROM moderation_decisions WHERE admin_id=ANY($1::text[])",
      [users],
    );
    await c.query(
      "DELETE FROM reactions WHERE seat_id IN (SELECT seat_id FROM order_items WHERE order_id=ANY($1::text[]))",
      [orderIds],
    );
    await c.query(
      "DELETE FROM reports WHERE seat_id IN (SELECT seat_id FROM order_items WHERE order_id=ANY($1::text[]))",
      [orderIds],
    );
    await c.query(
      "DELETE FROM profiles WHERE seat_id IN (SELECT seat_id FROM order_items WHERE order_id=ANY($1::text[]))",
      [orderIds],
    );
    const inv = await c.query(
      "DELETE FROM invitations WHERE owner_id=ANY($1::text[]) OR claimed_by=ANY($1::text[]) RETURNING id,target_seat_id",
      [users],
    );
    for (const i of inv.rows)
      await c.query(
        "UPDATE seats SET state='available',owner_id=NULL,order_id=NULL,reservation_id=NULL,hold_expires_at=NULL WHERE id=$1 AND reservation_id=$2",
        [i.target_seat_id, i.id],
      );
    await c.query(
      "UPDATE seats SET state='available',owner_id=NULL,order_id=NULL,reservation_id=NULL,hold_expires_at=NULL WHERE owner_id=ANY($1::text[]) OR order_id=ANY($2::text[])",
      [users, orderIds],
    );
    await c.query(
      "DELETE FROM support_issues WHERE user_id=ANY($1::text[]) OR order_id=ANY($2::text[])",
      [users, orderIds],
    );
    await c.query(
      "DELETE FROM audit_events WHERE actor_id=ANY($1::text[]) OR target=ANY($2::text[])",
      [users, orderIds],
    );
    await c.query("DELETE FROM payment_events WHERE order_id=ANY($1::text[])", [
      orderIds,
    ]);
    await c.query("DELETE FROM order_items WHERE order_id=ANY($1::text[])", [
      orderIds,
    ]);
    await c.query(
      "DELETE FROM reservations WHERE user_id=ANY($1::text[]) OR order_id=ANY($2::text[])",
      [users, orderIds],
    );
    await c.query("DELETE FROM orders WHERE id=ANY($1::text[])", [orderIds]);
    await c.query('DELETE FROM "user" WHERE id=ANY($1::text[])', [users]);
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
    await pool.end();
  }
});

test("permanent seat mapping has stable edge and opposite neighbors", () => {
  assert.deepEqual(seatPosition(1), {
    column: 0,
    side: "far",
    neighbors: [3, 2],
  });
  assert.deepEqual(seatPosition(2), {
    column: 0,
    side: "near",
    neighbors: [4, 1],
  });
  assert.equal(seatPosition(10000).column, 4999);
  assert.throws(() => seatPosition(10001));
});
test("competing buyers cannot reserve the same seat", async () => {
  const [a, b] = await Promise.all([user(), user()]);
  const ids = take(),
    results = await Promise.allSettled([draft(a, ids), draft(b, ids)]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(results.filter((r) => r.status === "rejected").length, 1);
  assert.equal(
    (results.find((r) => r.status === "rejected") as PromiseRejectedResult)
      .reason.code,
    "SEAT_TAKEN",
  );
  assert.equal(
    (await pool.query("SELECT state FROM seats WHERE id=$1", [ids[0]])).rows[0]
      .state,
    "checkout_held",
  );
});
test("atomic six-seat reservation rejects all seats if one is unavailable", async () => {
  const [a, b] = await Promise.all([user(), user()]),
    ids = take(6);
  await draft(a, [ids[3]]);
  await assert.rejects(() => draft(b, ids, "six"), { code: "SEAT_TAKEN" });
  const rows = (
    await pool.query("SELECT id,state FROM seats WHERE id=ANY($1::int[])", [
      ids,
    ])
  ).rows;
  assert.equal(rows.filter((r) => r.state === "available").length, 5);
  assert.equal(rows.find((r) => r.id === ids[3]).state, "checkout_held");
});
test("prices and group counts are server-authoritative", async () => {
  const buyer = await user(),
    ids = take(2),
    o = await createOrder(buyer, {
      packageId: "two",
      seatIds: ids,
      profile: fixture,
      provider: "development",
      amount: 1,
    } as Parameters<typeof createOrder>[1]);
  orderIds.push(o.id);
  assert.equal(o.amount, 900);
  assert.equal(o.currency, "usd");
  await assert.rejects(() => draft(buyer, take(1), "six"), {
    code: "INVALID_SELECTION",
  });
  await assert.rejects(() => draft(buyer, take(1), "nonexistent"), {
    code: "INVALID_PACKAGE",
  });
  assert.deepEqual(
    PACKAGES.map((p) => p.amount),
    [500, 900, 2500, 4900],
  );
});
test("payment fulfills without a browser redirect and duplicate events are idempotent", async () => {
  const buyer = await user(),
    o = await draft(buyer),
    eventId = randomUUID();
  assert.equal((await pay(o, eventId)).outcome, "fulfilled");
  assert.equal((await pay(o, eventId)).duplicate, true);
  assert.equal((await getOrder(buyer, o.id)).status, "paid");
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM profiles WHERE seat_id=$1",
        [o.seatIds[0]],
      )
    ).rows[0].n,
    1,
  );
});
test("late failure and expiry cannot reverse a successful payment", async () => {
  const buyer = await user(),
    o = await draft(buyer);
  await pay(o);
  for (const type of ["failed", "expired"])
    await handlePaymentEvent({
      id: uuidEvent(),
      orderId: o.id,
      type,
      provider: "development",
    });
  assert.equal((await getOrder(buyer, o.id)).status, "paid");
  assert.equal(
    (await pool.query("SELECT state FROM seats WHERE id=$1", [o.seatIds[0]]))
      .rows[0].state,
    "purchased",
  );
});
test("provider-confirmed failed and abandoned checkout releases reservations", async () => {
  for (const type of ["failed", "expired"]) {
    const buyer = await user(),
      o = await draft(buyer);
    assert.equal(
      (
        await handlePaymentEvent({
          id: uuidEvent(),
          orderId: o.id,
          type,
          provider: "development",
        })
      ).outcome,
      "released",
    );
    assert.equal((await getOrder(buyer, o.id)).status, type);
    assert.equal(
      (await pool.query("SELECT state FROM seats WHERE id=$1", [o.seatIds[0]]))
        .rows[0].state,
      "available",
    );
  }
});
test("processing payment ignores out-of-order checkout expiration", async () => {
  const buyer = await user(),
    o = await draft(buyer);
  await handlePaymentEvent({
    id: uuidEvent(),
    orderId: o.id,
    type: "processing",
    provider: "development",
  });
  await handlePaymentEvent({
    id: uuidEvent(),
    orderId: o.id,
    type: "expired",
    provider: "development",
  });
  assert.equal((await getOrder(buyer, o.id)).status, "processing");
  assert.equal(
    (await pool.query("SELECT state FROM seats WHERE id=$1", [o.seatIds[0]]))
      .rows[0].state,
    "payment_processing",
  );
  await pay(o);
  assert.equal((await getOrder(buyer, o.id)).status, "paid");
});
test("refund webhook arriving before payment success remains terminal", async () => {
  const buyer = await user(),
    o = await draft(buyer);
  await handlePaymentEvent({
    id: uuidEvent(),
    orderId: o.id,
    type: "refunded",
    provider: "development",
  });
  assert.equal((await getOrder(buyer, o.id)).status, "refunded");
  await pay(o);
  assert.equal((await getOrder(buyer, o.id)).status, "refunded");
  assert.equal(
    (await pool.query("SELECT state FROM seats WHERE id=$1", [o.seatIds[0]]))
      .rows[0].state,
    "available",
  );
  assert.equal(await getPublicGuest(o.seatIds[0]), null);
});
test("payment amount mismatch creates a financial support issue and never publishes", async () => {
  const buyer = await user(),
    o = await draft(buyer);
  assert.equal(
    (
      await handlePaymentEvent({
        id: uuidEvent(),
        orderId: o.id,
        type: "paid",
        amount: 1,
        currency: "usd",
        provider: "development",
      })
    ).outcome,
    "amount_mismatch",
  );
  assert.equal((await getOrder(buyer, o.id)).status, "fulfillment_issue");
  assert.equal(await getPublicGuest(o.seatIds[0]), null);
  assert.equal(
    (
      await pool.query("SELECT kind FROM support_issues WHERE order_id=$1", [
        o.id,
      ])
    ).rows[0].kind,
    "payment_amount_mismatch",
  );
});
test("late paid allocation conflict records support and never silently substitutes a chair", async () => {
  const [a, b] = await Promise.all([user(), user()]),
    ids = take(),
    original = await draft(a, ids);
  await handlePaymentEvent({
    id: uuidEvent(),
    orderId: original.id,
    type: "expired",
    provider: "development",
  });
  const competing = await draft(b, ids);
  await pay(competing);
  assert.equal((await pay(original)).outcome, "fulfillment_issue");
  assert.equal((await getOrder(a, original.id)).status, "fulfillment_issue");
  assert.equal(
    (await pool.query("SELECT owner_id FROM seats WHERE id=$1", [ids[0]]))
      .rows[0].owner_id,
    b,
  );
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM support_issues WHERE order_id=$1",
        [original.id],
      )
    ).rows[0].n,
    1,
  );
  assert.equal(
    (
      await pool.query("SELECT payment_intent_id FROM orders WHERE id=$1", [
        original.id,
      ])
    ).rows[0].payment_intent_id,
    `pi-test-${original.id}`,
  );
});
test("manual moderation protects pending guests independently of payment status", async () => {
  const buyer = await user(),
    o = await draft(buyer);
  await pay(o);
  assert.equal(await getPublicGuest(o.seatIds[0]), null);
  await moderate(adminId, o.seatIds[0], "approve");
  assert.equal(
    (await getPublicGuest(o.seatIds[0]))?.displayName,
    fixture.displayName,
  );
  await moderate(adminId, o.seatIds[0], "hide", "Content report reviewed");
  assert.equal(await getPublicGuest(o.seatIds[0]), null);
  assert.equal((await getOrder(buyer, o.id)).status, "paid");
  await moderate(adminId, o.seatIds[0], "restore");
  assert.ok(await getPublicGuest(o.seatIds[0]));
});
test("other accounts cannot edit, inspect orders, or use administration", async () => {
  const [a, b] = await Promise.all([user(), user()]),
    o = await draft(a);
  await pay(o);
  await assert.rejects(() => updateProfile(b, o.seatIds[0], fixture), {
    code: "FORBIDDEN",
  });
  await assert.rejects(() => getOrder(b, o.id), { code: "NOT_FOUND" });
  await assert.rejects(() => adminData(b), { code: "FORBIDDEN" });
  await assert.rejects(() => moderate(b, o.seatIds[0], "approve"), {
    code: "FORBIDDEN",
  });
});
test("editing requires fresh moderation; unsafe links and invalid art fail validation; plain content is escaped", async () => {
  const buyer = await user(),
    o = await published(buyer);
  assert.equal(
    (
      await updateProfile(buyer, o.seatIds[0], {
        ...fixture,
        message: "A different dinner thought.",
      })
    ).visibility,
    "pending",
  );
  assert.equal(await getPublicGuest(o.seatIds[0]), null);
  for (const link of ["javascript:alert(1)", "https://name:secret@example.com"])
    assert.throws(() => profileSchema.parse({ ...fixture, link }));
  assert.throws(() =>
    profileSchema.parse({ ...fixture, displayName: "a".repeat(31) }),
  );
  assert.throws(() =>
    profileSchema.parse({ ...fixture, message: "b".repeat(141) }),
  );
  assert.throws(() =>
    profileSchema.parse({
      ...fixture,
      customization: { ...fixture.customization, base: "<script>" },
    }),
  );
  const output = renderToStaticMarkup(
    React.createElement("p", null, "<script>alert(1)</script>"),
  );
  assert.ok(!output.includes("<script>"));
  assert.ok(output.includes("&lt;script&gt;"));
});
test("courtesy holds are exclusive, revocable, and token-protected", async () => {
  const [buyer, friend] = await Promise.all([user(), user()]),
    o = await draft(buyer);
  await pay(o);
  const i = await createInvitation(buyer, o.seatIds[0], "courtesy");
  assert.equal(i.requiresPurchase, true);
  await assert.rejects(
    () => createInvitation(buyer, o.seatIds[0], "courtesy"),
    { code: "ACTIVE_INVITATION" },
  );
  await assert.rejects(() => draft(friend, [i.targetSeatId]), {
    code: "SEAT_TAKEN",
  });
  await revokeInvitation(buyer, i.id);
  await assert.rejects(() => resolveInvitation(i.token), {
    code: "INVITATION_REVOKED",
  });
  assert.equal(
    (await pool.query("SELECT state FROM seats WHERE id=$1", [i.targetSeatId]))
      .rows[0].state,
    "available",
  );
});
test("expired courtesy links remain useful and offer a nearest available chair", async () => {
  const buyer = await user(),
    o = await draft(buyer);
  await pay(o);
  const i = await createInvitation(buyer, o.seatIds[0], "courtesy");
  await pool.query(
    "UPDATE invitations SET expires_at=now()-interval '1 second' WHERE id=$1",
    [i.id],
  );
  const resolved = await resolveInvitation(i.token);
  assert.equal(resolved.expired, true);
  assert.equal(resolved.status, "expired");
  assert.ok(resolved.availableSeatId);
  assert.equal(
    (await pool.query("SELECT state FROM seats WHERE id=$1", [i.targetSeatId]))
      .rows[0].state,
    "available",
  );
});
test("valid courtesy token atomically converts a hold into checkout", async () => {
  const [buyer, friend] = await Promise.all([user(), user()]),
    o = await draft(buyer);
  await pay(o);
  const i = await createInvitation(buyer, o.seatIds[0], "courtesy");
  const invited = await createOrder(friend, {
    packageId: "one",
    seatIds: [i.targetSeatId],
    profile: fixture,
    provider: "development",
    invitationToken: i.token,
  });
  orderIds.push(invited.id);
  assert.equal(invited.seatIds[0], i.targetSeatId);
  assert.equal(
    (await pool.query("SELECT status FROM invitations WHERE id=$1", [i.id]))
      .rows[0].status,
    "claimed",
  );
  assert.equal(
    (await pool.query("SELECT status FROM reservations WHERE id=$1", [i.id]))
      .rows[0].status,
    "converted",
  );
});
test("paid invitation assigns once and requires verified account ownership", async () => {
  const [buyer, friend, unverified, other] = await Promise.all([
      user(),
      user(),
      user("user", false),
      user(),
    ]),
    o = await draft(buyer, take(2), "two");
  await pay(o);
  const i = await createInvitation(buyer, o.seatIds[1], "paid");
  assert.equal(i.requiresPurchase, false);
  await assert.rejects(() => claimInvitation(unverified, i.token), {
    code: "EMAIL_UNVERIFIED",
  });
  assert.equal((await claimInvitation(friend, i.token)).seatId, o.seatIds[1]);
  assert.equal(
    (await pool.query("SELECT owner_id FROM seats WHERE id=$1", [o.seatIds[1]]))
      .rows[0].owner_id,
    friend,
  );
  await assert.rejects(() => claimInvitation(other, i.token), {
    code: "INVITATION_UNAVAILABLE",
  });
  assert.equal((await claimInvitation(friend, i.token)).alreadyClaimed, true);
  await assert.rejects(() => updateProfile(buyer, o.seatIds[1], fixture), {
    code: "FORBIDDEN",
  });
  await updateProfile(friend, o.seatIds[1], {
    ...fixture,
    displayName: "Invited friend",
  });
});
test("expired and revoked paid invitations cannot be claimed", async () => {
  const [buyer, friend] = await Promise.all([user(), user()]),
    o = await draft(buyer, take(6), "six");
  await pay(o);
  const expired = await createInvitation(buyer, o.seatIds[1], "paid");
  await pool.query(
    "UPDATE invitations SET expires_at=now()-interval '1 day' WHERE id=$1",
    [expired.id],
  );
  await assert.rejects(() => claimInvitation(friend, expired.token), {
    code: "INVITATION_EXPIRED",
  });
  const revoked = await createInvitation(buyer, o.seatIds[2], "paid");
  await revokeInvitation(buyer, revoked.id);
  await assert.rejects(() => claimInvitation(friend, revoked.token), {
    code: "INVITATION_UNAVAILABLE",
  });
});
test("bread deduplicates, enforces daily and minute limits, and honors owner opt-out", async () => {
  const buyer = await user(),
    o = await published(buyer),
    seat = o.seatIds[0],
    actor = `actor-${run}`,
    key = uuidEvent();
  assert.equal((await react(seat, actor, key)).count, 1);
  const repeat = await react(seat, actor, key);
  assert.equal(repeat.count, 1);
  assert.equal(repeat.duplicate, true);
  await assert.rejects(() => react(seat, actor, uuidEvent()), {
    code: "BREAD_ALREADY_PASSED",
  });
  await updateProfile(buyer, seat, { ...fixture, reactionsEnabled: false });
  await assert.rejects(() => react(seat, "another-actor", uuidEvent()), {
    code: "REACTIONS_DISABLED",
  });
  const seats: number[] = [];
  for (let i = 0; i < 6; i++) {
    const u = await user();
    seats.push((await published(u)).seatIds[0]);
  }
  for (let i = 0; i < 5; i++)
    await react(seats[i], `limited-${run}`, uuidEvent());
  await assert.rejects(() => react(seats[5], `limited-${run}`, uuidEvent()), {
    code: "REACTION_LIMIT",
  });
});
test("admin hides reported content while financial records stay paid", async () => {
  const buyer = await user(),
    o = await published(buyer),
    r = await reportGuest(
      o.seatIds[0],
      `reporter-${run}`,
      "This message appears to impersonate someone.",
    );
  assert.equal(r.status, "open");
  await moderate(adminId, o.seatIds[0], "hide", "Report reviewed");
  assert.equal(
    (await pool.query("SELECT status FROM reports WHERE id=$1", [r.id])).rows[0]
      .status,
    "resolved",
  );
  assert.equal((await getOrder(buyer, o.id)).status, "paid");
});
test("audited refund revokes courtesy hold and keeps refunded chair unavailable", async () => {
  const buyer = await user(),
    o = await published(buyer),
    i = await createInvitation(buyer, o.seatIds[0], "courtesy");
  await requestRefund(adminId, o.id, "Customer requested refund");
  await handlePaymentEvent({
    id: uuidEvent(),
    orderId: o.id,
    type: "refunded",
    provider: "development",
  });
  assert.equal((await getOrder(buyer, o.id)).status, "refunded");
  assert.equal(
    (await pool.query("SELECT state FROM seats WHERE id=$1", [o.seatIds[0]]))
      .rows[0].state,
    "unavailable",
  );
  assert.equal(
    (await pool.query("SELECT state FROM seats WHERE id=$1", [i.targetSeatId]))
      .rows[0].state,
    "available",
  );
  assert.equal(await getPublicGuest(o.seatIds[0]), null);
  await pay(o);
  assert.equal((await getOrder(buyer, o.id)).status, "refunded");
});
test("deletion request hides public content but retains financial records for review", async () => {
  const buyer = await user(),
    o = await published(buyer);
  assert.equal((await requestAccountDeletion(buyer)).status, "requested");
  assert.equal(await getPublicGuest(o.seatIds[0]), null);
  assert.equal((await getOrder(buyer, o.id)).status, "paid");
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM support_issues WHERE user_id=$1 AND kind='account_deletion'",
        [buyer],
      )
    ).rows[0].n,
    1,
  );
});
test("production browsing excludes fictional development guests", async () => {
  const original = process.env.APP_MODE,
    development = await getStats();
  process.env.APP_MODE = "production";
  try {
    const production = await getStats();
    assert.equal(production.publishedGuests, 0);
    assert.ok(development.publishedGuests > 0);
    assert.equal(await getPublicGuest(1), null);
  } finally {
    process.env.APP_MODE = original;
  }
});

test("checkout reservation expiration tracks the provider session and is never freed just by a Stripe local clock", async () => {
  const buyer = await user(),
    ids = take();
  const o = await createOrder(buyer, {
    packageId: "one",
    seatIds: ids,
    profile: fixture,
    provider: "stripe",
  });
  orderIds.push(o.id);
  const expiry = new Date(Date.now() + 60 * 60 * 1000);
  await attachCheckout(o.id, `cs-test-${run}`, expiry);
  assert.equal(
    (await getOrder(buyer, o.id)).checkoutExpiresAt,
    expiry.toISOString(),
  );
  await pool.query(
    "UPDATE orders SET checkout_expires_at=now()-interval '1 minute' WHERE id=$1",
    [o.id],
  );
  await pool.query(
    "UPDATE seats SET hold_expires_at=now()-interval '1 minute' WHERE id=$1",
    [ids[0]],
  );
  const available = await findAvailable(1, ids[0]);
  assert.notEqual(available[0], ids[0]);
  assert.equal((await getOrder(buyer, o.id)).status, "checkout_pending");
  await handlePaymentEvent({
    id: uuidEvent(),
    orderId: o.id,
    type: "expired",
    provider: "stripe",
  });
  assert.equal(
    (await pool.query("SELECT state FROM seats WHERE id=$1", [ids[0]])).rows[0]
      .state,
    "available",
  );
});

test("abandoned local development checkout safely expires before later inventory selection", async () => {
  const buyer = await user(),
    o = await draft(buyer);
  await pool.query(
    "UPDATE orders SET checkout_expires_at=now()-interval '1 minute' WHERE id=$1",
    [o.id],
  );
  const found = await findAvailable(1, o.seatIds[0]);
  assert.equal(found[0], o.seatIds[0]);
  assert.equal((await getOrder(buyer, o.id)).status, "expired");
  assert.equal(
    (
      await pool.query("SELECT status FROM reservations WHERE order_id=$1", [
        o.id,
      ])
    ).rows[0].status,
    "released",
  );
});

test("all five secondary seats of a six-seat purchase can receive independent paid invitations", async () => {
  const buyer = await user(),
    o = await draft(buyer, take(6), "six");
  await pay(o);
  const invitations = [];
  for (const seat of o.seatIds.slice(1))
    invitations.push(await createInvitation(buyer, seat, "paid"));
  assert.equal(invitations.length, 5);
  assert.equal(new Set(invitations.map((i) => i.targetSeatId)).size, 5);
  await assert.rejects(() => createInvitation(buyer, o.seatIds[0], "paid"), {
    code: "PRIMARY_SEAT",
  });
});

test("dispute creates support record and ignores delayed paid events without reallocating seats", async () => {
  const buyer = await user(),
    o = await published(buyer);
  await handlePaymentEvent({
    id: uuidEvent(),
    orderId: o.id,
    type: "disputed",
    provider: "development",
  });
  assert.equal((await getOrder(buyer, o.id)).status, "disputed");
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM support_issues WHERE order_id=$1 AND kind='payment_dispute'",
        [o.id],
      )
    ).rows[0].n,
    1,
  );
  await pay(o);
  assert.equal((await getOrder(buyer, o.id)).status, "disputed");
});

test("public search matches chosen neighborhood labels as well as guest names and canonical seat IDs", async () => {
  const buyer = await user(),
    o = await published(buyer),
    seat = o.seatIds[0];
  for (const query of ["Quiet Corner", String(seat), "Test dinner guest"]) {
    const result = await getPublicSeats({ query, limit: 100 });
    assert.ok(
      result.guests.some((g) => g.seatId === seat),
      `Search should find canonical seat ${seat} by ${query}`,
    );
  }
  const guest = await getPublicGuest(seat);
  assert.equal(guest?.neighborhood, "The Quiet Corner");
  assert.equal(guest?.isDemo, true);
});
