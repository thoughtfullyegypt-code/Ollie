import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pool } from "../lib/db";
import { migrate } from "../lib/db/migrate";
import {
  createOrder,
  handlePaymentEvent,
  getPublicGuest,
  getPublicSeats,
  getStats,
  getCuriousGuest,
  moderate,
} from "../lib/domain";

const run = randomUUID();
const owner = `refinement-${run}`;
const admin = `refinement-admin-${run}`;
const orders: string[] = [];
const fixture = {
  displayName: "A curious guest",
  message: "One small plate.",
  dish: "soup",
  customization: {
    base: "raccoon",
    accessory: "none",
    outfit: "suit",
    skin: "#bd805a",
    color: "#9aab91",
  },
};
let seats: number[] = [];
before(async () => {
  assert.equal(process.env.APP_MODE, "development");
  await migrate();
  await pool.query(
    "INSERT INTO \"user\"(id,name,email,\"emailVerified\",role) VALUES($1,$2,$3,true,'user'),($4,$2,$5,true,'admin')",
    [
      owner,
      "Refinement fixture",
      `${owner}@example.invalid`,
      admin,
      `${admin}@example.invalid`,
    ],
  );
  seats = (
    await pool.query(
      "SELECT id FROM seats WHERE state='available' AND id BETWEEN 8800 AND 8899 ORDER BY id LIMIT 4",
    )
  ).rows.map((r) => r.id);
  assert.equal(seats.length, 4);
});
after(async () => {
  await pool.query("DELETE FROM moderation_decisions WHERE admin_id=$1", [
    admin,
  ]);
  await pool.query("DELETE FROM profiles WHERE seat_id=ANY($1::int[])", [
    seats,
  ]);
  await pool.query(
    "UPDATE seats SET state='available',owner_id=NULL,order_id=NULL,reservation_id=NULL,hold_expires_at=NULL WHERE order_id=ANY($1::text[])",
    [orders],
  );
  await pool.query(
    "DELETE FROM audit_events WHERE actor_id=ANY($1::text[]) OR target=ANY($2::text[])",
    [[owner, admin], orders],
  );
  await pool.query(
    "DELETE FROM payment_events WHERE order_id=ANY($1::text[])",
    [orders],
  );
  await pool.query("DELETE FROM order_items WHERE order_id=ANY($1::text[])", [
    orders,
  ]);
  await pool.query("DELETE FROM reservations WHERE user_id=$1", [owner]);
  await pool.query("DELETE FROM orders WHERE id=ANY($1::text[])", [orders]);
  await pool.query('DELETE FROM "user" WHERE id=ANY($1::text[])', [
    [owner, admin],
  ]);
  await pool.end();
});
test("stale client prices reject before reserving inventory, while configured single and pair totals remain exact", async () => {
  await assert.rejects(
    createOrder(owner, {
      packageId: "one",
      seatIds: [seats[0]],
      profile: fixture,
      provider: "development",
      expectedAmount: 1,
    }),
    (e) => (e as { code: string }).code === "PRICE_CHANGED",
  );
  assert.equal(
    (await pool.query("SELECT state FROM seats WHERE id=$1", [seats[0]]))
      .rows[0].state,
    "available",
  );
  const one = await createOrder(owner, {
    packageId: "one",
    seatIds: [seats[0]],
    profile: fixture,
    provider: "development",
    expectedAmount: 500,
  });
  orders.push(one.id);
  assert.equal(one.amount, 500);
  await handlePaymentEvent({
    id: `ref-price-${run}`,
    orderId: one.id,
    type: "failed",
    provider: "development",
  });
  await assert.rejects(
    createOrder(owner, {
      packageId: "two",
      seatIds: [seats[0], seats[0] + 2],
      profile: fixture,
      provider: "development",
      expectedAmount: 500,
    }),
    (e) => (e as { code: string }).code === "PRICE_CHANGED",
  );
  const pair = await createOrder(owner, {
    packageId: "two",
    seatIds: [seats[0], seats[0] + 2],
    profile: fixture,
    provider: "development",
    expectedAmount: 900,
  });
  orders.push(pair.id);
  assert.equal(pair.amount, 900);
  await handlePaymentEvent({
    id: `ref-pair-${run}`,
    orderId: pair.id,
    type: "failed",
    provider: "development",
  });
});
test("public profiles distinguish demonstrations, complimentary founders, and purchases without counting samples as customers", async () => {
  for (let i = 0; i < 3; i++) {
    const o = await createOrder(owner, {
      packageId: "one",
      seatIds: [seats[i]],
      profile: fixture,
      provider: "development",
    });
    orders.push(o.id);
    await handlePaymentEvent({
      id: `ref-kind-${run}-${i}`,
      orderId: o.id,
      type: "paid",
      provider: "development",
      amount: o.amount,
      currency: "usd",
    });
    if (i > 0) {
      // Transient production-like classification fixtures; no real transaction.
      await pool.query(
        "UPDATE orders SET is_demo=false,provider=$2 WHERE id=$1",
        [o.id, i === 1 ? "seed" : "stripe"],
      );
      await pool.query(
        "UPDATE profiles SET is_demo=false,guest_kind=$2 WHERE seat_id=$1",
        [seats[i], i === 1 ? "complimentary" : "purchased"],
      );
    }
    await moderate(admin, seats[i], "approve");
  }
  assert.equal((await getPublicGuest(seats[0]))?.kind, "demo");
  assert.equal((await getPublicGuest(seats[1]))?.kind, "complimentary");
  assert.equal((await getPublicGuest(seats[2]))?.kind, "purchased");
  const previous = process.env.APP_MODE;
  try {
    process.env.APP_MODE = "production";
    assert.equal(await getPublicGuest(seats[0]), null);
    assert.equal((await getPublicGuest(seats[1]))?.kind, "complimentary");
    const publicList = await getPublicSeats({ query: "A curious guest" });
    assert.ok(!publicList.guests.some((g) => g.seatId === seats[0]));
    const stats = await getStats();
    assert.equal(stats.demoGuests, 0);
    assert.ok(stats.purchasedGuests >= 1);
    assert.ok(stats.complimentaryGuests >= 1);
    const curious = await getCuriousGuest();
    assert.ok(!curious || curious.kind !== "demo");
  } finally {
    process.env.APP_MODE = previous;
  }
});

test("inclusive hosted tax rate must match the exact tax shown before payment", async () => {
  const previous = {
    key: process.env.STRIPE_SECRET_KEY,
    policy: process.env.TAX_POLICY,
    bps: process.env.SALES_TAX_BPS,
    rate: process.env.STRIPE_TAX_RATE_ID,
  };
  process.env.STRIPE_SECRET_KEY = "sk_test_refinement_no_network";
  process.env.TAX_POLICY = "inclusive";
  process.env.SALES_TAX_BPS = "1000";
  process.env.STRIPE_TAX_RATE_ID = "txr_refinement";
  const { getStripe, createHostedCheckout } = await import("../lib/payments");
  const { taxDetails } = await import("../lib/checkout-info");
  const stripe = getStripe(),
    original = stripe.taxRates.retrieve;
  try {
    assert.equal(taxDetails(500).taxMinor, 45);
    stripe.taxRates.retrieve = (async () => ({
      active: true,
      inclusive: true,
      percentage: 20,
    })) as unknown as typeof original;
    await assert.rejects(
      createHostedCheckout(
        {
          id: "nonexistent-tax-fixture",
          amount: 500,
          currency: "usd",
          packageId: "one",
          seatIds: [seats[3]],
        },
        "fixture@example.invalid",
      ),
      /does not match the displayed inclusive tax/,
    );
    stripe.taxRates.retrieve = (async () => ({
      active: true,
      inclusive: false,
      percentage: 10,
    })) as unknown as typeof original;
    await assert.rejects(
      createHostedCheckout(
        {
          id: "nonexistent-tax-fixture",
          amount: 500,
          currency: "usd",
          packageId: "one",
          seatIds: [seats[3]],
        },
        "fixture@example.invalid",
      ),
      /does not match the displayed inclusive tax/,
    );
  } finally {
    stripe.taxRates.retrieve = original;
    for (const [key, value] of Object.entries({
      STRIPE_SECRET_KEY: previous.key,
      TAX_POLICY: previous.policy,
      SALES_TAX_BPS: previous.bps,
      STRIPE_TAX_RATE_ID: previous.rate,
    }))
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
  }
});
